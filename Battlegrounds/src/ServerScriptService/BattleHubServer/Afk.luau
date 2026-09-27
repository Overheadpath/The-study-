--!strict
-- Free Lucky Spins: one for every Config.FreeLuckySpinEvery seconds played, and
-- a much faster rate (plus a little cash) while standing in the AFK Chamber.
-- Also counts play time for the STATS menu.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local Context = require(script.Parent:WaitForChild("Context"))

local Afk = {}

local chamberTime: { [Player]: number } = {}

local function isInside(zone: BasePart, position: Vector3): boolean
	local rel = zone.CFrame:PointToObjectSpace(position)
	local half = zone.Size / 2
	return math.abs(rel.X) <= half.X and math.abs(rel.Y) <= half.Y and math.abs(rel.Z) <= half.Z
end

-- One second of play for one player.
function Afk.tick(player: Player, zone: BasePart?)
	local profile = PlayerData.get(player)
	if not profile then
		return
	end
	profile.Stats.PlayTime += 1
	profile.FreeSpinClock += 1
	if profile.FreeSpinClock >= Config.FreeLuckySpinEvery then
		profile.FreeSpinClock = 0
		PlayerData.addLuckySpins(player, 1)
		Context.notify(player, "FREE LUCKY SPIN for playing! Go spin the wheel.", "Reward")
	end

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local inside = zone ~= nil and root ~= nil and root:IsA("BasePart") and isInside(zone, root.Position)
	if inside then
		local t = (chamberTime[player] or 0) + 1
		chamberTime[player] = t
		if t % Config.Afk.CashEvery == 0 then
			PlayerData.addCash(player, Config.Afk.CashAmount)
		end
		if t % Config.Afk.LuckySpinEvery == 0 then
			PlayerData.addLuckySpins(player, 1)
			Context.notify(player, "AFK reward: +1 Lucky Spin!", "Reward")
		end
		player:SetAttribute("AfkSpinIn", Config.Afk.LuckySpinEvery - t % Config.Afk.LuckySpinEvery)
	end
	if player:GetAttribute("InAfkChamber") ~= inside then
		player:SetAttribute("InAfkChamber", inside)
	end
end

function Afk.start(zone: BasePart?)
	Players.PlayerRemoving:Connect(function(player)
		chamberTime[player] = nil
	end)
	task.spawn(function()
		while true do
			task.wait(1)
			for _, player in Players:GetPlayers() do
				Afk.tick(player, zone)
			end
		end
	end)
end

return Afk
