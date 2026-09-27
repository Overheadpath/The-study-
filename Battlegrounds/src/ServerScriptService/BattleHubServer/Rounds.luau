--!strict
--[[
	The match loop: wait for fighters -> intermission -> map vote -> match -> results.

	Players join the next match with the PLAY button or the portal in the ARENA
	hall. The voted map is copied from ServerStorage.BattleArenas into Workspace
	for the match and removed afterwards.

	KOs: when a fighter dies, whoever last hit them gets the KO. Your combat
	script only has to mark the victim's Humanoid in one of the two usual ways:
	  * an ObjectValue named "creator" whose Value is the attacking Player, or
	  * humanoid:SetAttribute("LastHitBy", attacker.UserId)
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local Context = require(script.Parent:WaitForChild("Context"))

type Entry = { Alive: boolean, KOs: number, Connection: RBXScriptConnection? }

local Rounds = {}

local phase = "Intermission"
local options: { string } = {}
local votes: { [Player]: number } = {}
local participants: { [Player]: Entry } = {}
local currentMap: Model? = nil

local function now(): number
	return Workspace:GetServerTimeNow()
end

function Rounds.phase(): string
	return phase
end

function Rounds.minPlayers(): number
	if RunService:IsStudio() and Config.Rounds.SoloInStudio then
		return 1
	end
	return math.max(1, Config.Rounds.MinPlayers)
end

local function queued(): { Player }
	local list = {}
	for _, player in Players:GetPlayers() do
		if player:GetAttribute("Queued") == true and PlayerData.get(player) then
			table.insert(list, player)
		end
	end
	return list
end

local function aliveCount(): number
	local n = 0
	for _, entry in participants do
		if entry.Alive then
			n += 1
		end
	end
	return n
end

local function publishQueue()
	Context.setState({ Queued = #queued() })
end

local function publishVotes()
	local counts = { 0, 0, 0 }
	for player, choice in votes do
		if player.Parent and counts[choice] then
			counts[choice] += 1
		end
	end
	Context.setState({ Votes1 = counts[1], Votes2 = counts[2], Votes3 = counts[3] })
end

-- Waits `seconds` while showing a countdown. Stops early when `stop()` says so.
local function countdown(seconds: number, stop: (() -> boolean)?)
	local endsAt = now() + seconds
	Context.setState({ EndsAt = endsAt })
	while now() < endsAt do
		publishQueue()
		if stop and stop() then
			return
		end
		task.wait(0.5)
	end
end

local function shuffle<T>(list: { T }): { T }
	local copy = table.clone(list)
	for i = #copy, 2, -1 do
		local j = math.random(1, i)
		copy[i], copy[j] = copy[j], copy[i]
	end
	return copy
end

----------------------------------------------------------------------------------
-- Queue and votes (called by Actions)
----------------------------------------------------------------------------------

-- Joins or leaves the queue. `want` nil = toggle. Returns the new state.
function Rounds.setQueued(player: Player, want: boolean?): boolean
	local value = if want == nil then player:GetAttribute("Queued") ~= true else want
	player:SetAttribute("Queued", value)
	publishQueue()
	return value
end

function Rounds.vote(player: Player, choice: number): (boolean, string?)
	if phase ~= "Vote" then
		return false, "Voting isn't open right now."
	end
	if choice ~= math.floor(choice) or choice < 1 or choice > #options then
		return false, "That map isn't an option."
	end
	votes[player] = choice
	publishVotes()
	return true, nil
end

function Rounds.inMatch(player: Player): boolean
	local entry = participants[player]
	return entry ~= nil and entry.Alive
end

----------------------------------------------------------------------------------
-- Knockouts
----------------------------------------------------------------------------------

local function killerOf(humanoid: Humanoid?): Player?
	if not humanoid then
		return nil
	end
	local tag = humanoid:FindFirstChild("creator")
	if tag and tag:IsA("ObjectValue") then
		local value = tag.Value
		if value and value:IsA("Player") then
			return value
		end
	end
	local id = humanoid:GetAttribute("LastHitBy")
	if type(id) ~= "number" and humanoid.Parent then
		id = humanoid.Parent:GetAttribute("LastHitBy")
	end
	if type(id) == "number" then
		return Players:GetPlayerByUserId(id)
	end
	return nil
end

local function eliminate(player: Player, humanoid: Humanoid?)
	local entry = participants[player]
	if not entry or not entry.Alive then
		return
	end
	entry.Alive = false
	if entry.Connection then
		entry.Connection:Disconnect()
		entry.Connection = nil
	end
	player:SetAttribute("InMatch", false)
	local profile = PlayerData.get(player)
	if profile then
		profile.Stats.Deaths += 1
		PlayerData.changed(player)
	end
	local killer = killerOf(humanoid)
	if killer and killer ~= player and killer.Parent then
		local killerEntry = participants[killer]
		if killerEntry then
			killerEntry.KOs += 1
		end
		local killerProfile = PlayerData.get(killer)
		if killerProfile then
			killerProfile.Stats.KOs += 1
			Context.give(killer, Config.Rewards.KO)
			Context.notify(killer, `K.O.! You knocked out {player.DisplayName} +${Config.Rewards.KO.Cash}`, "Reward")
		end
		if player.Parent then
			Context.notify(player, `{killer.DisplayName} knocked you out!`, "Bad")
		end
	elseif player.Parent then
		Context.notify(player, "You're out! Back to the lobby.", "Bad")
	end
	Context.setState({ Alive = aliveCount(), Detail = `{aliveCount()} FIGHTERS LEFT` })
end

local function cleanup()
	for player, entry in participants do
		if entry.Connection then
			entry.Connection:Disconnect()
		end
		if player.Parent then
			player:SetAttribute("InMatch", false)
		end
	end
	participants = {}
	if currentMap then
		currentMap:Destroy()
		currentMap = nil
	end
	Context.setState({ Alive = 0, Arena = "" })
end

----------------------------------------------------------------------------------
-- The match itself
----------------------------------------------------------------------------------

local function pickOptions(): { string }
	local ids = {}
	local maps = Context.Maps
	for _, arena in Config.Arenas do
		if maps and maps:FindFirstChild(arena.Id) then
			table.insert(ids, arena.Id)
		end
	end
	ids = shuffle(ids)
	while #ids > 3 do
		table.remove(ids)
	end
	return ids
end

local function tally(): string
	local counts: { [number]: number } = {}
	for player, choice in votes do
		if player.Parent then
			counts[choice] = (counts[choice] or 0) + 1
		end
	end
	local best: { number } = {}
	local bestCount = -1
	for i = 1, #options do
		local c = counts[i] or 0
		if c > bestCount then
			best, bestCount = { i }, c
		elseif c == bestCount then
			table.insert(best, i)
		end
	end
	return options[best[math.random(1, #best)]]
end

local function runMatch(arenaId: string, fighters: { Player })
	local maps = Context.Maps
	local source = maps and maps:FindFirstChild(arenaId)
	if not source or not source:IsA("Model") then
		warn(`[BattleHub] Map "{arenaId}" is missing from ServerStorage.BattleArenas`)
		return
	end
	local map = source:Clone()
	map.Name = "BattleArena"
	map:SetAttribute("ArenaId", arenaId)
	map.Parent = Workspace
	currentMap = map

	local spawnFolder = map:FindFirstChild("Spawns")
	local spawns = if spawnFolder then shuffle(spawnFolder:GetChildren()) else {}
	local killY = map:GetAttribute("KillY")
	local killHeight: number = if type(killY) == "number" then killY else -math.huge
	local arena = Util.find(Config.Arenas, arenaId)
	local arenaName = if arena then arena.Name else arenaId

	participants = {}
	local startedWith = 0
	for i, player in fighters do
		local character = player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local spot = spawns[(i - 1) % math.max(1, #spawns) + 1]
		if character and humanoid and humanoid.Health > 0 and spot and spot:IsA("BasePart") then
			local entry: Entry = { Alive = true, KOs = 0 }
			participants[player] = entry
			entry.Connection = humanoid.Died:Connect(function()
				eliminate(player, humanoid)
			end)
			player:SetAttribute("InMatch", true)
			player:SetAttribute("Queued", false)
			Context.teleport(player, spot.CFrame + Vector3.new(0, 3, 0))
			Context.notify(player, `{arenaName}: last fighter standing wins!`, "Info")
			startedWith += 1
		end
	end
	if startedWith == 0 then
		cleanup()
		return
	end

	phase = "Match"
	local endsAt = now() + Config.Rounds.MatchTime
	Context.setState({
		Phase = phase,
		Status = "MATCH STARTED!",
		Detail = `{startedWith} FIGHTERS • {arenaName}`,
		Arena = arenaId,
		Alive = startedWith,
		EndsAt = endsAt,
	})

	local announcedFight = false
	while true do
		task.wait(0.25)
		for player, entry in participants do
			if entry.Alive then
				local character = player.Character
				local humanoid = character and character:FindFirstChildOfClass("Humanoid")
				local root = character and character:FindFirstChild("HumanoidRootPart")
				if player.Parent == nil or not humanoid or not root or humanoid.Health <= 0 then
					eliminate(player, humanoid)
				elseif root:IsA("BasePart") and root.Position.Y < killHeight then
					humanoid.Health = 0 -- fell off the map; Died hands out the KO
				end
			end
		end
		local alive = aliveCount()
		if not announcedFight and now() > endsAt - Config.Rounds.MatchTime + 3 then
			announcedFight = true
			Context.setState({ Status = "FIGHT!", Detail = `{alive} FIGHTERS LEFT` })
		end
		if alive == 0 or (startedWith >= 2 and alive <= 1) or now() >= endsAt then
			break
		end
	end

	-- Results.
	phase = "Results"
	local survivors: { Player } = {}
	for player, entry in participants do
		if entry.Alive and player.Parent then
			table.insert(survivors, player)
		end
	end
	local winner: Player? = if startedWith >= 2 and #survivors == 1 then survivors[1] else nil
	local status = if winner
		then `{string.upper(winner.DisplayName)} WINS!`
		elseif #survivors > 0 then "TIME'S UP!"
		else "NO WINNER"
	Context.setState({
		Phase = phase,
		Status = status,
		Detail = if winner then "LAST FIGHTER STANDING" else `{#survivors} SURVIVED`,
		Winner = if winner then winner.Name else "",
		EndsAt = now() + Config.Rounds.ResultsTime,
	})
	for player, entry in participants do
		if player.Parent and PlayerData.get(player) then
			local profile = PlayerData.get(player) :: PlayerData.Profile
			profile.Stats.Matches += 1
			Context.give(player, Config.Rewards.Played)
			if player == winner then
				profile.Stats.Wins += 1
				Context.give(player, Config.Rewards.Win)
				Context.notify(player, `YOU WIN! +${Config.Rewards.Win.Cash} +{Config.Rewards.Win.XP} XP`, "Reward")
			elseif entry.Alive then
				local half = { Cash = Config.Rewards.Win.Cash // 2, XP = Config.Rewards.Win.XP // 2 }
				Context.give(player, half)
				Context.notify(player, `You survived! +${half.Cash} +{half.XP} XP`, "Reward")
			else
				Context.notify(
					player,
					`Match over: +${Config.Rewards.Played.Cash} +{Config.Rewards.Played.XP} XP`,
					"Info"
				)
			end
		end
	end
	task.wait(Config.Rounds.ResultsTime)
	for _, player in survivors do
		if player.Parent then
			player:SetAttribute("InMatch", false)
			Context.teleport(player, Context.lobbyCFrame())
		end
	end
	cleanup()
end

-- One full round. Returns early (and the loop starts over) if players leave.
function Rounds.cycle()
	local need = Rounds.minPlayers()
	if #queued() < need then
		phase = "Waiting"
		Context.setState({ Phase = phase, Status = "WAITING FOR FIGHTERS", EndsAt = 0 })
		while #queued() < Rounds.minPlayers() do
			Context.setState({ Detail = `PRESS PLAY TO JOIN ({#queued()}/{Rounds.minPlayers()})` })
			publishQueue()
			task.wait(1)
		end
	end

	phase = "Intermission"
	Context.setState({ Phase = phase, Status = "INTERMISSION", Detail = "NEXT BATTLE STARTING SOON" })
	countdown(Config.Rounds.IntermissionTime, function()
		return #queued() < Rounds.minPlayers()
	end)
	if #queued() < Rounds.minPlayers() then
		return
	end

	options = pickOptions()
	if #options == 0 then
		warn("[BattleHub] No maps found in ServerStorage.BattleArenas")
		task.wait(10)
		return
	end
	votes = {}
	phase = "Vote"
	Context.setState({
		Phase = phase,
		Status = "MAP VOTE",
		Detail = "VOTE FOR THE NEXT MAP",
		Options = table.concat(options, ","),
		Votes1 = 0,
		Votes2 = 0,
		Votes3 = 0,
	})
	countdown(Config.Rounds.VoteTime)
	local arenaId = tally()
	local fighters = queued()
	Context.setState({ Options = "" })
	if #fighters < Rounds.minPlayers() then
		return
	end
	runMatch(arenaId, fighters)
end

function Rounds.start()
	Context.setState({
		Phase = "Intermission",
		Status = "INTERMISSION",
		Detail = "",
		EndsAt = 0,
		Options = "",
		Votes1 = 0,
		Votes2 = 0,
		Votes3 = 0,
		Arena = "",
		Queued = 0,
		Alive = 0,
		Winner = "",
	})
	Players.PlayerRemoving:Connect(function(player)
		votes[player] = nil
		if participants[player] then
			eliminate(player, nil)
		end
		task.defer(publishQueue)
	end)
	task.spawn(function()
		while true do
			local ok, err = pcall(Rounds.cycle :: any)
			if not ok then
				warn(`[BattleHub] Round loop error: {err}`)
				pcall(cleanup)
				task.wait(3)
			end
		end
	end)
end

return Rounds
