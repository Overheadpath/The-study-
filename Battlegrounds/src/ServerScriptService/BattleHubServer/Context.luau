--!strict
-- References shared by the server modules (filled in by the main script) and
-- a few helpers they all use: notifications, rewards and teleporting.

local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

-- A table with any of Cash / XP / Spins / LuckySpins (numbers).
export type Reward = any

local Context = {
	Hub = nil :: Model?,
	Maps = nil :: Folder?,
	Training = nil :: Model?,
	State = nil :: Configuration?,
	Remotes = nil :: Folder?,
}

-- Kind decides how the client shows it: "Info", "Good", "Bad", "LevelUp", "Reward".
function Context.notify(player: Player, text: string, kind: string?)
	local remotes = Context.Remotes
	local event = remotes and remotes:FindFirstChild("Notify")
	if event and event:IsA("RemoteEvent") then
		event:FireClient(player, { Text = text, Kind = kind or "Info" })
	end
end

function Context.notifyAll(text: string, kind: string?)
	local remotes = Context.Remotes
	local event = remotes and remotes:FindFirstChild("Notify")
	if event and event:IsA("RemoteEvent") then
		event:FireAllClients({ Text = text, Kind = kind or "Info" })
	end
end

-- Gives cash / XP / spins and announces level ups.
function Context.give(player: Player, reward: Reward)
	local cash: number? = reward.Cash
	local spins: number? = reward.Spins
	local lucky: number? = reward.LuckySpins
	local xp: number? = reward.XP
	if cash and cash ~= 0 then
		PlayerData.addCash(player, cash)
	end
	if spins and spins ~= 0 then
		PlayerData.addSpins(player, spins)
	end
	if lucky and lucky ~= 0 then
		PlayerData.addLuckySpins(player, lucky)
	end
	if xp and xp > 0 then
		for _, up in PlayerData.addXP(player, xp) do
			Context.notify(player, `LEVEL {up.Level}! +${up.Cash} +{up.Spins} SPIN`, "LevelUp")
			for _, title in up.Titles do
				Context.notify(player, `New title unlocked: {title}`, "Good")
			end
		end
	end
end

function Context.lobbyCFrame(): CFrame
	local hub = Context.Hub
	local spawn = hub and hub:FindFirstChild("Spawn")
	if spawn and spawn:IsA("BasePart") then
		return spawn.CFrame + Vector3.new(0, 3.5, 0)
	end
	return CFrame.new(Config.HubOrigin + Vector3.new(0, 4, 0))
end

function Context.teleport(player: Player, cf: CFrame)
	local character = player.Character
	if not character then
		return
	end
	if Workspace.StreamingEnabled then
		pcall(function()
			player:RequestStreamAroundAsync(cf.Position)
		end)
	end
	character:PivotTo(cf)
end

function Context.setState(values: { [string]: any })
	local state = Context.State
	if state then
		for key, value in values do
			state:SetAttribute(key, value)
		end
	end
end

return Context
