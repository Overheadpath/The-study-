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

local RANGE = 28 -- studs: how close you must be to be greeted (the whole circle)

local ShopLocator = require(ReplicatedStorage:WaitForChild("FishingSystem"):WaitForChild("ShopLocator"))

-- never walks, falls or ragdolls: scenery that happens to breathe
local function settle(rig)
	local humanoid = rig:FindFirstChildOfClass("Humanoid")
	local root = rig:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root then return end
	root.Anchored = true
	humanoid.WalkSpeed = 0
	humanoid.JumpPower = 0
	humanoid.AutoRotate = false
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	for _, state in ipairs({
		Enum.HumanoidStateType.FallingDown, Enum.HumanoidStateType.Ragdoll, Enum.HumanoidStateType.GettingUp,
		Enum.HumanoidStateType.Freefall, Enum.HumanoidStateType.Jumping, Enum.HumanoidStateType.Climbing, Enum.HumanoidStateType.Swimming,
	}) do
		pcall(function() humanoid:SetStateEnabled(state, false) end)
	end
end

-- the map can still be loading (or being rearranged) when this runs: keep
-- looking for a little while rather than giving up on the first pass
local anchors = {}
local SHOP_NAMES = { "RodShop", "BoatShop", "FishShop" }
local function scan()
	for _, name in ipairs(SHOP_NAMES) do
		if not anchors[name] then
			local shop = ShopLocator.Find(name)
			if shop then settle(shop.rig); anchors[name] = shop.prompt end
		end
	end
end
task.spawn(function()
	for _ = 1, 60 do
		scan()
		if anchors.RodShop and anchors.BoatShop and anchors.FishShop then return end
		task.wait(1)
	end
	for _, name in ipairs(SHOP_NAMES) do
		if not anchors[name] then warn("[RodShopKeeper] " .. name .. " was never found") end
	end
end)

local remote = ReplicatedStorage:FindFirstChild("RodShopEvent")
if not remote then
	remote = Instance.new("RemoteEvent")
	remote.Name = "RodShopEvent"
	remote.Parent = ReplicatedStorage
end

local lastCall = {}
remote.OnServerEvent:Connect(function(player, action, shopName)
	-- anything we do not know about is ignored rather than trusted
	if action ~= "interact" then return end
	local anchor = anchors[typeof(shopName) == "string" and shopName or "RodShop"]
	if not anchor then return end
	local now = os.clock()
	if lastCall[player] and now < lastCall[player] + 0.5 then return end
	lastCall[player] = now

	local character = player.Character
	local from = character and character:FindFirstChild("HumanoidRootPart")
	if not from or (from.Position - anchor.Position).Magnitude > RANGE then return end

	-- everyone nearby sees the keeper wave at this customer
	remote:FireAllClients("greet", player, shopName)
end)

Players.PlayerRemoving:Connect(function(player)
	lastCall[player] = nil
end)
