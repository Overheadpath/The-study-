-- RodShop (client)
-- The shop circles. Walk into the rod stall's circle (or the red sell stall's)
-- and its window pops open straight away; walk back out and it closes. The edge
-- has a margin (in at the ring, out only a few studs past it, after a moment),
-- so shuffling about on the edge never flickers it. At every shop a small sign
-- over the counter and E (or a click/tap on the sign or the keeper) open the
-- window as well.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")

local system = ReplicatedStorage:WaitForChild("FishingSystem")
local Theme = require(system:WaitForChild("BubbleTheme"))
local ShopWindow = require(system:WaitForChild("ShopWindow"))
local ShopLocator = require(system:WaitForChild("ShopLocator"))

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local COOLDOWN = 0.65    -- seconds between interactions

local SHOPS = {
	{ name = "RodShop",  caption = "Browse rods",    mode = "Rods" },
	{ name = "BoatShop", caption = "Boats & berths", mode = "Boats" },
	{ name = "FishShop", caption = "Sell fish",      mode = "Fish" },
}

-- the shop whose circle the player is standing in right now
local current

local remote = ReplicatedStorage:WaitForChild("RodShopEvent", 20)
-- the Radio is sold in the Robux Shop now; RobuxShop shows its own messages

-- Sized in studs, like the stall's own title board, so the sign stays in
-- proportion with the stall as you walk up to it. AlwaysOnTop is off because
-- billboards with it set do not draw at all in this place.
local gui = Theme.New("BillboardGui", "RodShopSign", playerGui, {
	-- small, and parked at counter height rather than over the keeper: the
	-- customer should be looking at him, not at a plate covering his chest
	Size = UDim2.fromScale(3.6, 0.95),
	StudsOffset = Vector3.new(0, -0.55, 0.6),
	AlwaysOnTop = false,  -- an always-on-top billboard does not draw in this place
	Enabled = false,
})

local plate = Theme.New("TextButton", "Plate", gui, {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Theme.Ink,
	BackgroundTransparency = 0.06,
	AutoButtonColor = false,
	Text = "",
	BorderSizePixel = 0,
})
-- everything inside the plate is laid out in fractions, so it holds together
-- at whatever pixel size the billboard ends up being drawn at
Theme.Corner(plate, 14).CornerRadius = UDim.new(0.22, 0)
Theme.Border(plate, 2.5, Theme.Cream).Transparency = 0.25

local scale = Instance.new("UIScale")
scale.Scale = 0.85
scale.Parent = plate

local cap = Theme.New("Frame", "Key", plate, {
	Position = UDim2.fromScale(0.05, 0.19),
	Size = UDim2.fromScale(0.15, 0.62),
	BackgroundColor3 = Theme.Cream,
	BorderSizePixel = 0,
})
Theme.Corner(cap, 9).CornerRadius = UDim.new(0.25, 0)
local square = Instance.new("UIAspectRatioConstraint")
square.AspectRatio = 1
square.DominantAxis = Enum.DominantAxis.Height
square.Parent = cap

local capText = Theme.New("TextLabel", "Letter", cap, {
	Position = UDim2.fromScale(0.13, 0.13),
	Size = UDim2.fromScale(0.74, 0.74),
	BackgroundTransparency = 1,
	Text = "E",
	Font = Theme.Font,
	TextColor3 = Theme.Ink,
	TextScaled = true,
})

local caption = Theme.New("TextLabel", "Caption", plate, {
	Position = UDim2.fromScale(0.25, 0.2),
	Size = UDim2.fromScale(0.68, 0.6),
	BackgroundTransparency = 1,
	Text = "Browse rods",
	TextXAlignment = Enum.TextXAlignment.Left,
})
Theme.Text(caption, 19)
caption.TextScaled = true

-- On touch there is no E to press, so the sign says so instead.
if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
	cap.Visible = false
	caption.Position = UDim2.fromScale(0.08, 0.2)
	caption.Size = UDim2.fromScale(0.84, 0.6)
	caption.TextXAlignment = Enum.TextXAlignment.Center
end

local shown = false
local function setShown(visible)
	if visible == shown then return end
	shown = visible
	if visible then
		gui.Enabled = true
		scale.Scale = 0.85
		plate.BackgroundTransparency = 0.5
		TweenService:Create(scale, TweenInfo.new(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
		TweenService:Create(plate, TweenInfo.new(0.18), { BackgroundTransparency = 0.06 }):Play()
	else
		local out = TweenService:Create(scale, TweenInfo.new(0.14), { Scale = 0.85 })
		TweenService:Create(plate, TweenInfo.new(0.14), { BackgroundTransparency = 1 }):Play()
		out.Completed:Once(function()
			if not shown then gui.Enabled = false end
		end)
		out:Play()
	end
end

local lastInteract = 0
-- the window opens at once from what the client already knows; the server's
-- answer (TradeUpdate / Stock, relayed by TradingController and BoatController)
-- then only refreshes it
local function openShop(s)
	lastInteract = os.clock()
	ShopWindow.Open(s.mode, { message = "" }, "zone:" .. s.name)
	if remote then remote:FireServer("interact", s.name) end
	if s.mode == "Rods" then
		system.TradeAction:FireServer("OpenRods")
	elseif s.mode == "Fish" then
		-- the server answers with its quote (TradingController refreshes the market)
		system.Action:FireServer("Shop")
	else
		system.BoatEvent:FireServer("Open")
	end
end
local function interact()
	if not shown or not current or os.clock() < lastInteract + COOLDOWN then return end
	openShop(current)
end

plate.Activated:Connect(interact)

-- clicking or tapping the keeper himself opens the shop as well
local hooked = setmetatable({}, { __mode = "k" })
local function hookClicks(rig)
	if not rig or hooked[rig] then return end
	hooked[rig] = true
	for _, d in ipairs(rig:GetDescendants()) do
		if d:IsA("ClickDetector") then d.MouseClick:Connect(interact) end
	end
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode == Enum.KeyCode.E then interact() end
end)

-- walking into the rod shop's or the sell stall's circle opens that shop by
-- itself (the main shops on Nature's Island); it opens once per visit, so
-- closing it while still in the circle leaves it closed until you walk out and
-- back in. Walking in while something else is on screen (the intro, the
-- backpack) keeps it waiting: it opens as soon as that is gone, if you are
-- still inside.
local AUTO_OPEN = { RodShop = true, FishShop = true }
local function busy(mode)
	-- another shop is on screen: wait for it
	if ShopWindow.IsOpen() and ShopWindow.Mode() ~= mode then return true end
	local cinematic = playerGui:FindFirstChild("IntroCinematic")
	if cinematic and cinematic.Enabled then return true end
	local state = player:GetAttribute("IntroState")
	if state == "Playing" or player:GetAttribute("IntroParked") then return true end
	local inventory = playerGui:FindFirstChild("BubbleInventory")
	if inventory and inventory:GetAttribute("BackpackOpen") then return true end
	for _, n in ipairs({ "AtlanticTravelUI" }) do
		local g = playerGui:FindFirstChild(n)
		if g and g:GetAttribute("Open") == true then return true end
	end
	local robux = playerGui:FindFirstChild("RobuxShop")
	return robux and robux:GetAttribute("Open") == true
end
local inside, outSince, armed = {}, {}, {}

-- every frame: two distances, so the window reacts the moment you cross the ring
RunService.Heartbeat:Connect(function()
	local c = player.Character
	local r = c and c:FindFirstChild("HumanoidRootPart")
	local now = os.clock()
	current = nil
	for _, s in ipairs(SHOPS) do
		-- (a shop that is not streamed in or not found leaves its state alone)
		local shop = ShopLocator.Find(s.name)
		if shop then
			local isIn = r ~= nil and ShopLocator.Inside(shop, r.Position, inside[s.name]) or false
			if isIn then
				outSince[s.name] = nil
				if not inside[s.name] then
					inside[s.name] = true
					armed[s.name] = AUTO_OPEN[s.name]
				end
			elseif inside[s.name] then
				outSince[s.name] = outSince[s.name] or now
				if not r or now - outSince[s.name] >= ShopLocator.EXIT_DWELL then
					inside[s.name], outSince[s.name], armed[s.name] = nil, nil, nil
					-- the circle's own window, or this stall's window opened by a server prompt
					if ShopWindow.Source() == "zone:" .. s.name or (ShopWindow.Mode() == s.mode and ShopWindow.Source() == "remote") then
						ShopWindow.Close()
					end
				end
			end
			if inside[s.name] and not current then
				current = { name = s.name, caption = s.caption, mode = s.mode, anchor = shop.prompt }
			end
		end
	end
	if current and armed[current.name] and not busy(current.mode) then
		armed[current.name] = nil
		if ShopWindow.Mode() ~= current.mode then openShop(current) end
	end
	if current then
		local shop = ShopLocator.Find(current.name)
		if shop then hookClicks(shop.rig) end
		if gui.Adornee ~= current.anchor then gui.Adornee = current.anchor; caption.Text = current.caption end
		setShown(not ShopWindow.IsOpen())
	else
		setShown(false)
	end
end)
