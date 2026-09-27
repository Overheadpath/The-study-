--[[
	BattleHub server.

	Builds the lobby and battle maps if they aren't in the place yet, then runs
	everything behind the hub: saving, the match loop and map vote, the shop,
	rolls, the Lucky Wheel, codes, AFK rewards and the leaderboards.

	Settings (prices, rewards, timers, names) are in
	ReplicatedStorage > BattleHub > Config. Codes are in the Codes module
	next to this script.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))

local HubBuilder = require(script:WaitForChild("HubBuilder"))
local ArenaBuilder = require(script:WaitForChild("ArenaBuilder"))
local PlayerData = require(script:WaitForChild("PlayerData"))
local Context = require(script:WaitForChild("Context"))
local Cosmetics = require(script:WaitForChild("Cosmetics"))
local Rounds = require(script:WaitForChild("Rounds"))
local Actions = require(script:WaitForChild("Actions"))
local Leaderboards = require(script:WaitForChild("Leaderboards"))
local Afk = require(script:WaitForChild("Afk"))
local Training = require(script:WaitForChild("Training"))

-- Remotes and shared match state go first so clients can find them straight away.
local function child(parent: Instance, className: string, name: string): Instance
	local existing = parent:FindFirstChild(name)
	if existing and existing.ClassName == className then
		return existing
	elseif existing then
		existing:Destroy()
	end
	local instance = Instance.new(className)
	instance.Name = name
	instance.Parent = parent
	return instance
end

local remotes = child(Shared, "Folder", "Remotes") :: Folder
local request = child(remotes, "RemoteFunction", "Request") :: RemoteFunction
local profileEvent = child(remotes, "RemoteEvent", "Profile") :: RemoteEvent
child(remotes, "RemoteEvent", "Notify")
local state = child(Shared, "Configuration", "State") :: Configuration

-- The lobby, maps and training grounds (built from code only if missing, so
-- your own edits in Studio are kept).
local existingHub = Workspace:FindFirstChild("BattleHub")
local hub: Model = if existingHub and existingHub:IsA("Model") then existingHub else HubBuilder.build(Workspace)
local maps = ArenaBuilder.build(ServerStorage, Workspace)
local training = Workspace:FindFirstChild("TrainingGrounds")

Context.Hub = hub
Context.Maps = maps
Context.Training = if training and training:IsA("Model") then training else nil
Context.State = state
Context.Remotes = remotes

PlayerData.onChanged(function(player)
	profileEvent:FireClient(player, PlayerData.snapshot(player))
end)

local function onPlayerAdded(player: Player)
	local spawn = hub:FindFirstChild("Spawn")
	if spawn and spawn:IsA("SpawnLocation") then
		player.RespawnLocation = spawn
	end
	player:SetAttribute("Queued", false)
	player:SetAttribute("InMatch", false)
	local profile = PlayerData.load(player)
	if not profile or not player.Parent then
		return
	end
	local reason = PlayerData.savingOffReason(player)
	if reason then
		Context.notify(player, reason, "Bad")
	end
	Cosmetics.publish(player)
	Cosmetics.refresh(player)
end

PlayerData.start()
Cosmetics.start(hub)
Leaderboards.start(hub)
Rounds.start()
Actions.start(request)
local afkRoom = hub:FindFirstChild("AfkChamber")
local afkZone = afkRoom and afkRoom:FindFirstChild("AfkZone")
Afk.start(if afkZone and afkZone:IsA("BasePart") then afkZone else nil)
Training.start(training)

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end

-- Anyone who falls out of the lobby or the training grounds is put back.
task.spawn(function()
	local floor = Config.HubOrigin.Y - 60
	while true do
		task.wait(1)
		for _, player in Players:GetPlayers() do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if root and root:IsA("BasePart") and root.Position.Y < floor and not Rounds.inMatch(player) then
				Context.teleport(player, Context.lobbyCFrame())
			end
		end
	end
end)
