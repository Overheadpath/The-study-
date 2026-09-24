-- RodShop (client)
-- The interaction at the rod stall in the village: a small sign over the
-- counter that appears when you walk up, and E (or a click/tap on the sign)
-- to talk to the owner. It is built from BubbleTheme so it speaks the same
-- visual language as the rest of the game's UI.
--
-- The shop window itself is not built yet. Everything the window will need
-- goes through one door, openRodShop() below, and the server already answers
-- on ReplicatedStorage.RodShopEvent, so adding the window later is a matter of
-- filling that function in - nothing else here has to change.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")

local Theme = require(ReplicatedStorage:WaitForChild("FishingSystem"):WaitForChild("BubbleTheme"))

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local NEAR = 13          -- studs: the sign appears
local FAR = 16           -- studs: and disappears again (hysteresis, so it cannot flicker)
local COOLDOWN = 0.65    -- seconds between interactions

-- Tags replicate late, and so does the map on a slow join: sweep until the
-- stall turns up rather than giving up on the first look.
local shop, anchor
do
	local deadline = os.clock() + 30
	repeat
		local village = workspace:FindFirstChild("maap")
		village = village and village:FindFirstChild("Hub")
		village = village and village:FindFirstChild("Village")
		shop = village and village:FindFirstChild("RodShop")
		anchor = shop and shop:FindFirstChild("PromptPart")
		if not anchor then task.wait(0.5) end
	until anchor or os.clock() > deadline
end
if not anchor then return end

-- the event the server listens on; the future window will talk over it too
local remote = ReplicatedStorage:WaitForChild("RodShopEvent", 20)

-- Sized in studs, like the stall's own title board, so the sign stays in
-- proportion with the stall as you walk up to it. AlwaysOnTop is off because
-- billboards with it set do not draw at all in this place.
local gui = Theme.New("BillboardGui", "RodShopSign", playerGui, {
	Adornee = anchor,
	Size = UDim2.fromScale(5.4, 1.45),
	StudsOffset = Vector3.new(0, 0.9, 0),
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

-- The door the rod shop window will come through. The server has already been
-- told the player wants to shop by the time this runs, so the window can be
-- built here (or opened from a module) with whatever it sends back.
local noticeUntil = 0
local function openRodShop()
	caption.Text = "Rods coming soon"
	noticeUntil = os.clock() + 2.4
end

local lastInteract = 0
local function interact()
	if not shown or os.clock() < lastInteract + COOLDOWN then return end
	lastInteract = os.clock()
	if remote then remote:FireServer("interact") end
	openRodShop()
end

plate.Activated:Connect(interact)

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode == Enum.KeyCode.E then interact() end
end)

RunService.Heartbeat:Connect(function()
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		setShown(false)
		return
	end
	local distance = (root.Position - anchor.Position).Magnitude
	if shown then
		if distance > FAR then setShown(false) end
	elseif distance <= NEAR then
		setShown(true)
	end
	if noticeUntil > 0 and os.clock() > noticeUntil then
		noticeUntil = 0
		caption.Text = "Browse rods"
	end
end)
