-- RodShopKeeper
-- The owner behind the corner rod shop in the village. Their avatar is built into
-- the place as a Motor6D rig, and every joint carries its standing rest pose in
-- a RestC0 attribute. All of the keeper's movement - lying bored across the counter,
-- lifting their head when you walk up, standing up to wave - is played on each
-- player's own client (RodShop.local.luau), so it is smooth and costs the
-- server nothing. This script only keeps the keeper in place and relays greetings.
--
-- ReplicatedStorage.RodShopEvent is also the channel the rod shop window will
-- use when it is built.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local SHOP_PATH = { "maap", "Hub", "Village", "RodShop" }
local RANGE = 18 -- studs: how close you must be to be greeted

local function findShop()
	local node = workspace
	for _, name in ipairs(SHOP_PATH) do
		node = node and node:FindFirstChild(name)
	end
	return node
end

local shop = findShop()
if not shop then
	warn("[RodShopKeeper] RodShop model not found; the keeper is not running")
	return
end

local rig = shop:WaitForChild("ShopKeeper", 10)
local anchor = shop:WaitForChild("PromptPart", 10)
if not rig or not anchor then
	warn("[RodShopKeeper] ShopKeeper or PromptPart missing")
	return
end

local humanoid = rig:FindFirstChildOfClass("Humanoid")
local root = rig:FindFirstChild("HumanoidRootPart")
if not humanoid or not root then
	warn("[RodShopKeeper] the rig has no Humanoid or HumanoidRootPart")
	return
end

-- never walks, falls or ragdolls: scenery that happens to breathe
root.Anchored = true
humanoid.WalkSpeed = 0
humanoid.JumpPower = 0
humanoid.AutoRotate = false
humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
for _, state in ipairs({
	Enum.HumanoidStateType.FallingDown,
	Enum.HumanoidStateType.Ragdoll,
	Enum.HumanoidStateType.GettingUp,
	Enum.HumanoidStateType.Freefall,
	Enum.HumanoidStateType.Jumping,
	Enum.HumanoidStateType.Climbing,
	Enum.HumanoidStateType.Swimming,
}) do
	pcall(function() humanoid:SetStateEnabled(state, false) end)
end

local remote = ReplicatedStorage:FindFirstChild("RodShopEvent")
if not remote then
	remote = Instance.new("RemoteEvent")
	remote.Name = "RodShopEvent"
	remote.Parent = ReplicatedStorage
end

local WAVE_SECONDS = 3.2 -- how long one wave lasts on the clients

local lastCall = {}
local greeted = {} -- players already greeted on this visit to the counter
local lastWave = 0

local function distanceToCounter(player)
	local character = player.Character
	local from = character and character:FindFirstChild("HumanoidRootPart")
	return from and (from.Position - anchor.Position).Magnitude or math.huge
end

remote.OnServerEvent:Connect(function(player, action)
	-- the window will send other actions through here later; anything we do not
	-- know about is ignored rather than trusted
	if action ~= "interact" then return end
	local now = os.clock()
	if lastCall[player] and now < lastCall[player] + 0.5 then return end
	lastCall[player] = now
	if distanceToCounter(player) > RANGE then return end

	-- The rod window asks for a greeting on every update: when it opens, and
	-- again after each buy or equip click. Greet each customer once per visit,
	-- and never start a new wave while one is still playing.
	if greeted[player] or now < lastWave + WAVE_SECONDS then return end
	greeted[player] = true
	lastWave = now

	-- everyone nearby sees the keeper wave at this customer
	remote:FireAllClients("greet", player)
end)

-- a customer who walks away is greeted again the next time they come back
task.spawn(function()
	while true do
		task.wait(1)
		for player in pairs(greeted) do
			if not player.Parent or distanceToCounter(player) > RANGE + 4 then
				greeted[player] = nil
			end
		end
	end
end)

Players.PlayerRemoving:Connect(function(player)
	lastCall[player] = nil
	greeted[player] = nil
end)
