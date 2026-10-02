-- BubbleInventoryController
-- The HUD and its windows, in the ClassicTheme kit shared with Fate's RNG:
-- a plate-less icon column on the left (Backpack, Shop = the Robux shop, Index),
-- Sell and Settings in the top-right corner, the coins in the bottom-left corner
-- (the one place the player's money is shown), a six-slot hotbar, and windowed
-- charcoal menus for the backpack, the fish index, settings, the developer
-- tools and the market guide. The world stays visible behind everything.

local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")
local UIS = game:GetService("UserInputService")
local GuiService = game:GetService("GuiService")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local TextService = game:GetService("TextService")
local CollectionService = game:GetService("CollectionService")
local TextChatService = game:GetService("TextChatService")

local player = Players.LocalPlayer
local pg = player:WaitForChild("PlayerGui")
local system = game.ReplicatedStorage:WaitForChild("FishingSystem")
local Theme = require(system:WaitForChild("ClassicTheme"))
local Items = require(system:WaitForChild("ItemPresentation"))
local Config = require(system:WaitForChild("Config"))
local RobuxShop = require(system:WaitForChild("RobuxShop"))
local ShopWindow = require(system:WaitForChild("ShopWindow"))
local C = Theme.Classic

local gui = Instance.new("ScreenGui")
gui.Name = "BubbleInventory"
gui.ResetOnSpawn = false
gui.DisplayOrder = 34 -- above the stamina bar and boat HUD (31), below the market and shops
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = pg
pg:SetAttribute("CustomInventoryActive", true)
if pg:GetAttribute("CatchNotices") == nil then pg:SetAttribute("CatchNotices", true) end

local function reduceMotion() return pg:GetAttribute("ReduceMotion") == true end

---------------------------------------------------------------- the HUD
local hud = Instance.new("Frame")
hud.Name = "MainHUD"
hud.Size = UDim2.fromScale(1, 1)
hud.BackgroundTransparency = 1
hud.Parent = gui
local hudScale = Instance.new("UIScale")
hudScale.Name = "HudScale"
hudScale.Parent = hud

-- the side column, top to bottom: Backpack, Shop (the Robux shop, under the
-- shop sign), Index. Sell and Settings sit in the top-right corner.
local side = Instance.new("Frame")
side.Name = "SideColumn"
side.AnchorPoint = Vector2.new(0, 0.5)
side.Position = UDim2.new(0, 14, 0.5, -10)
side.Size = UDim2.fromOffset(96, 3 * 92 - 4)
side.BackgroundTransparency = 1
side.Parent = hud

-- the wallet: the coin and an outlined number, nothing behind them, low in the
-- bottom-left corner. It is the only place the player's money is shown.
local WALLET_PAD, WALLET_H = 16, 48
local coinRow = Instance.new("Frame")
coinRow.Name = "Wallet"
coinRow.AnchorPoint = Vector2.new(0, 1)
coinRow.Position = UDim2.new(0, WALLET_PAD, 1, -WALLET_PAD)
coinRow.Size = UDim2.fromOffset(0, WALLET_H)
coinRow.AutomaticSize = Enum.AutomaticSize.X
coinRow.BackgroundTransparency = 1
coinRow.Parent = hud
local walletLayout = Instance.new("UIListLayout")
walletLayout.FillDirection = Enum.FillDirection.Horizontal
walletLayout.VerticalAlignment = Enum.VerticalAlignment.Center
walletLayout.SortOrder = Enum.SortOrder.LayoutOrder
walletLayout.Padding = UDim.new(0, 8)
walletLayout.Parent = coinRow
local coinHost = Instance.new("Frame")
coinHost.Name = "Coin"
coinHost.BackgroundTransparency = 1
coinHost.Size = UDim2.fromOffset(44, 44)
coinHost.LayoutOrder = 1
coinHost.Parent = coinRow
Theme.icon(coinHost, "Coin", 44, 3)
local money = Theme.hudText(coinRow, "$0", 32, Enum.TextXAlignment.Left)
money.Name = "Money"
money.AutomaticSize = Enum.AutomaticSize.X
money.Size = UDim2.fromOffset(0, 44)
money.LayoutOrder = 2

local NAV = {
	{ "Backpack", "Backpack", "Backpack" },
	{ "Shop", "Shop", "Shop" }, -- opens the Robux shop
	{ "Index", "Index", "Index" },
	{ "Sell", "CoinStack", "Sell", corner = 0 },       -- the top-right corner
	{ "Settings", "Settings", "Settings", corner = 1 }, -- directly under Sell
	{ "Admin", "Lock", "Admin", corner = 0, column = 1 }, -- left of Sell, admins only
}
local nav = {}
for i, spec in ipairs(NAV) do
	local b = Instance.new("TextButton")
	b.Name = spec[1]
	if spec.corner then
		b.AnchorPoint = Vector2.new(1, 0)
		b.Position = UDim2.new(1, -14 - (spec.column or 0) * 104, 0, 10 + spec.corner * 96)
	else
		b.Position = UDim2.fromOffset(0, (i - 1) * 92)
	end
	b.Size = UDim2.fromOffset(96, 88)
	b.BackgroundTransparency = 1
	b.Text = ""
	b.AutoButtonColor = false
	b.Parent = spec.corner and hud or side
	local scale = Instance.new("UIScale")
	scale.Parent = b
	local iconHost = Instance.new("Frame")
	iconHost.BackgroundTransparency = 1
	iconHost.AnchorPoint = Vector2.new(0.5, 0)
	iconHost.Position = UDim2.new(0.5, 0, 0, 2)
	iconHost.Size = UDim2.fromOffset(56, 56)
	iconHost.Parent = b
	Theme.icon(iconHost, spec[2], 56, 4)
	local label = Theme.hudText(b, spec[3], 15)
	label.Size = UDim2.new(1, 0, 0, 22)
	label.Position = UDim2.fromOffset(0, 62)
	local function hover(on)
		if reduceMotion() then return end
		TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Back), { Scale = on and 1.08 or 1 }):Play()
	end
	b.MouseEnter:Connect(function() hover(true) end)
	b.MouseLeave:Connect(function() hover(false) end)
	b.SelectionGained:Connect(function() hover(true) end)
	b.SelectionLost:Connect(function() hover(false) end)
	nav[spec[1]] = b
end
nav.Admin.Visible = false -- until the server says this player is an admin

-- the hotbar
local hotbar = Instance.new("Frame")
hotbar.Name = "Hotbar"
hotbar.AnchorPoint = Vector2.new(0.5, 1)
hotbar.Position = UDim2.new(0.5, 0, 1, -12)
hotbar.Size = UDim2.fromOffset(548, 72)
hotbar.BackgroundTransparency = 1
hotbar.Parent = gui
local hotScale = Instance.new("UIScale")
hotScale.Parent = hotbar
local bag = Theme.classicButton(hotbar, {
	name = "OpenBackpack", size = UDim2.fromOffset(74, 70), position = UDim2.fromOffset(474, 0),
	color = C.Purple, colorDark = C.PurpleDark, text = "BAG", textSize = 18, lip = 6, radius = 10,
})
local bagHint = Theme.hudText(bag.Face, "B", 11, Enum.TextXAlignment.Left)
bagHint.Position = UDim2.fromOffset(7, 3)
bagHint.Size = UDim2.fromOffset(20, 14)
bagHint.ZIndex = bag.Face.ZIndex + 3

---------------------------------------------------------------- notices
local notice = Instance.new("Frame")
notice.Name = "Notice"
notice.AnchorPoint = Vector2.new(0.5, 0)
notice.Position = UDim2.new(0.5, 0, 0, 18)
notice.Size = UDim2.fromOffset(380, 48)
notice.BackgroundColor3 = C.Panel
notice.BorderSizePixel = 0
notice.Visible = false
notice.ZIndex = 50
notice.Parent = gui
Theme.corner(notice, 10)
Theme.stroke(notice, C.Ink, 3)
local noticeText = Theme.hudText(notice, "", 16)
noticeText.Size = UDim2.new(1, -20, 1, -8)
noticeText.Position = UDim2.fromOffset(10, 4)
noticeText.TextWrapped = true
noticeText.ZIndex = 51
local noticeToken = 0
local announceCard -- (the admin announcement card, set below: notices sit under it while it is up)
local function notify(text)
	noticeToken += 1
	local token = noticeToken
	noticeText.Text = text
	notice.Visible = true
	local y = 18
	if announceCard and announceCard.Visible then y = 18 + announceCard.AbsoluteSize.Y + 6 end
	if not reduceMotion() then
		notice.Position = UDim2.new(0.5, 0, 0, y - 10)
		TweenService:Create(notice, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Position = UDim2.new(0.5, 0, 0, y) }):Play()
	else
		notice.Position = UDim2.new(0.5, 0, 0, y)
	end
	task.delay(3.5, function() if token == noticeToken then notice.Visible = false end end)
end

---------------------------------------------------------------- windows
-- closing a window by its X must clear the modal flag too (defined with the state below)
local syncModal
local function onWindowClose() if syncModal then syncModal() end end
local collection = Theme.window(gui, { title = "BACKPACK", icon = "Backpack", accent = C.Purple, size = Vector2.new(760, 540), onClose = onWindowClose })
local settings = Theme.window(gui, { title = "SETTINGS", icon = "Settings", accent = C.Blue, size = Vector2.new(520, 380), onClose = onWindowClose })
local developer = Theme.window(gui, { title = "ANGLER LAB", icon = "Index", accent = C.Yellow, size = Vector2.new(600, 560), onClose = onWindowClose })
local guide = Theme.window(gui, { title = "FISH MARKET", icon = "Shop", accent = C.Green, size = Vector2.new(520, 300), onClose = onWindowClose })
local adminWindow = Theme.window(gui, { title = "ADMIN", icon = "Lock", accent = C.Purple, size = Vector2.new(620, 460), onClose = onWindowClose })
local windows = { collection, settings, developer, guide, adminWindow }

-- a text box in the kit
local function textBox(parent, name, placeholder, position, size)
	local box = Instance.new("TextBox")
	box.Name = name
	box.Position = position
	box.Size = size
	box.Text = ""
	box.PlaceholderText = placeholder
	box.ClearTextOnFocus = false
	box.Font = Theme.Font
	box.TextSize = 16
	box.TextColor3 = C.Text
	box.PlaceholderColor3 = C.TextMuted
	box.BackgroundColor3 = C.CardDark
	box.BorderSizePixel = 0
	box.TextXAlignment = Enum.TextXAlignment.Left
	box.ZIndex = parent.ZIndex + 1
	box.Parent = parent
	Theme.corner(box, 8)
	Theme.stroke(box, C.Ink, 2)
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 10)
	pad.PaddingRight = UDim.new(0, 8)
	pad.Parent = box
	return box
end

-- the backpack / index toolbar sits above the scrolling list
local well = collection.well
local toolbar = Instance.new("Frame")
toolbar.Name = "Toolbar"
toolbar.Size = UDim2.new(1, -16, 0, 44)
toolbar.Position = UDim2.fromOffset(8, 8)
toolbar.BackgroundTransparency = 1
toolbar.ZIndex = 24
toolbar.Parent = well
local list = collection.content
list.Position = UDim2.fromOffset(8, 60)
list.Size = UDim2.new(1, -16, 1, -96)
local listLayout = Instance.new("UIListLayout")
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Padding = UDim.new(0, 6)
listLayout.Parent = list
local footer = Theme.hudText(well, "", 14, Enum.TextXAlignment.Left)
footer.Name = "Footer"
footer.Position = UDim2.new(0, 12, 1, -32)
footer.Size = UDim2.new(1, -24, 0, 26)
footer.TextColor3 = C.TextMuted
footer.TextTruncate = Enum.TextTruncate.AtEnd
footer.ZIndex = 24

-- the category tabs share the toolbar left of the sort button (the backpack is 760
-- wide, so its well is 740 and the toolbar 724; the sort button takes 150 of that)
local tabs = {}
local TAB_GAP = 6
local TAB_W = math.min(92, math.floor((724 - 150 - 12 - (#Items.Categories - 1) * TAB_GAP) / #Items.Categories))
for i, name in ipairs(Items.Categories) do
	local b, _, tabLabel = Theme.classicButton(toolbar, {
		name = name, size = UDim2.fromOffset(TAB_W, 34), position = UDim2.fromOffset((i - 1) * (TAB_W + TAB_GAP), 4),
		color = C.Grey, colorDark = C.GreyDark, text = name, textSize = 15, lip = 4, zIndex = 25,
	})
	-- (a long name like Accessories gets a smaller size, so it fits its tab at any scale)
	local textSize = 15
	while textSize > 9 and TextService:GetTextSize(name, textSize, Theme.Font, Vector2.new(1000, 100)).X > TAB_W - 12 do textSize -= 1 end
	tabLabel.TextSize = textSize
	tabs[name] = b
end
local search = textBox(toolbar, "Search", "Search...", UDim2.fromOffset(0, 4), UDim2.fromOffset(250, 34))
search.Visible = false
local sortButton = Theme.classicButton(toolbar, {
	name = "Sort", size = UDim2.fromOffset(150, 34), anchor = Vector2.new(1, 0), position = UDim2.new(1, 0, 0, 4),
	color = C.Blue, colorDark = C.BlueDark, text = "Sort: newest", textSize = 15, lip = 4, zIndex = 25,
})
local indexFilter = Theme.classicButton(toolbar, {
	name = "IndexFilter", size = UDim2.fromOffset(150, 34), anchor = Vector2.new(1, 0), position = UDim2.new(1, 0, 0, 4),
	color = C.Blue, colorDark = C.BlueDark, text = "All fish", textSize = 15, lip = 4, zIndex = 25,
})
indexFilter.Visible = false
local progress = Theme.hudText(toolbar, "", 16, Enum.TextXAlignment.Left)
progress.Position = UDim2.fromOffset(262, 4)
progress.Size = UDim2.fromOffset(240, 34)
progress.Visible = false

-- one row for every list of things: a preview, a name, a line in the rarity's
-- colour, a figure on the right and one action. 62 tall.
--   opts: name, order, preview (tool or fish id), silhouette, title, subtitle,
--         subtitleColor, right, buttonText, buttonColor, buttonColorDark, onClick,
--         plateText, selected, equipped, onSelect
local function buildRow(parent, opts)
	local row = Instance.new("TextButton")
	row.Name = opts.name
	row.LayoutOrder = opts.order or 0
	row.Size = UDim2.new(1, -18, 0, 62)
	row.BackgroundColor3 = opts.dim and C.CardDark or C.Card
	row.BorderSizePixel = 0
	row.Text = ""
	row.AutoButtonColor = false
	row.ZIndex = 25
	row.Parent = parent
	Theme.corner(row, C.Radius.Card)
	Theme.stroke(row, (opts.equipped and C.Green) or (opts.selected and C.Yellow) or C.Ink, 2.5)
	Theme.lip(row, 0.08)
	local x0 = opts.noPreview and 14 or 100
	if not opts.noPreview then
		local view = Instance.new("ViewportFrame")
		view.Name = "Preview"
		view.Size = UDim2.fromOffset(78, 48)
		view.Position = UDim2.fromOffset(10, 6)
		view.BackgroundColor3 = C.PanelDark
		view.BackgroundTransparency = 0.2
		view.BorderSizePixel = 0
		view.ZIndex = 26
		view.Parent = row
		Theme.corner(view, 8)
		if opts.preview then Items.Preview(view, opts.preview, opts.silhouette == true) end
	end
	local hasLane = opts.buttonText ~= nil or opts.plateText ~= nil
	local reserve = hasLane and (opts.noPreview and 130 or 260) or 150
	local title = Theme.hudText(row, opts.title, 18, Enum.TextXAlignment.Left)
	title.Size = UDim2.new(1, -(x0 + reserve), 0, 24)
	title.Position = UDim2.fromOffset(x0, 6)
	title.TextTruncate = Enum.TextTruncate.AtEnd
	title.TextColor3 = opts.dim and C.TextMuted or C.Text
	title.ZIndex = 26
	local sub = Theme.hudText(row, opts.subtitle or "", 14, Enum.TextXAlignment.Left)
	sub.Size = UDim2.new(1, -(x0 + reserve), 0, 18)
	sub.Position = UDim2.fromOffset(x0, 32)
	sub.TextTruncate = Enum.TextTruncate.AtEnd
	sub.TextColor3 = opts.subtitleColor or C.TextMuted
	sub.ZIndex = 26
	local right = Theme.hudText(row, opts.right or "", 15, Enum.TextXAlignment.Right)
	right.AnchorPoint = Vector2.new(1, 0.5)
	right.Size = UDim2.fromOffset(140, 22)
	right.Position = UDim2.new(1, hasLane and -126 or -14, 0, 29)
	right.TextColor3 = Color3.fromRGB(226, 232, 246)
	right.ZIndex = 26
	if opts.buttonText then
		Theme.classicButton(row, {
			name = "Action", size = UDim2.fromOffset(104, 38), anchor = Vector2.new(1, 0.5), position = UDim2.new(1, -10, 0, 29),
			color = opts.buttonColor or C.Blue, colorDark = opts.buttonColorDark or C.BlueDark, text = opts.buttonText, textSize = 16, lip = 4, zIndex = 27,
			onClick = opts.onClick,
		})
	elseif opts.plateText then
		local plate = Instance.new("Frame")
		plate.Name = "Plate"
		plate.AnchorPoint = Vector2.new(1, 0.5)
		plate.Size = UDim2.fromOffset(104, 34)
		plate.Position = UDim2.new(1, -10, 0, 29)
		plate.BackgroundColor3 = C.PanelDark
		plate.BorderSizePixel = 0
		plate.ZIndex = 26
		plate.Parent = row
		Theme.corner(plate, C.Radius.Button)
		Theme.stroke(plate, C.Ink, 2)
		local pt = Theme.hudText(plate, opts.plateText, 14)
		pt.Size = UDim2.fromScale(1, 1)
		pt.TextColor3 = C.TextMuted
		pt.ZIndex = 27
	end
	if opts.onSelect then row.Activated:Connect(opts.onSelect) end
	return row
end

-- settings: three toggles and the developer door
local settingsButtons = {}
do
	local content = settings.content
	local specs = {
		{ "Motion", "Menu motion", "Soft transitions and button movement" },
		{ "Ambience", "Ambient sound", "Wind and background ambience" },
		{ "Notices", "Catch popups", "Show a card when you land a fish" },
	}
	for i, spec in ipairs(specs) do
		local y = 8 + (i - 1) * 62
		local l = Theme.hudText(content, spec[2], 18, Enum.TextXAlignment.Left)
		l.Position = UDim2.fromOffset(12, y)
		l.Size = UDim2.fromOffset(300, 24)
		l.ZIndex = 25
		local h = Theme.hudText(content, spec[3], 13, Enum.TextXAlignment.Left)
		h.Position = UDim2.fromOffset(12, y + 26)
		h.Size = UDim2.fromOffset(320, 18)
		h.TextColor3 = C.TextMuted
		h.ZIndex = 25
		settingsButtons[spec[1]] = Theme.classicButton(content, {
			name = spec[1], size = UDim2.fromOffset(104, 38), anchor = Vector2.new(1, 0), position = UDim2.new(1, -16, 0, y + 4),
			color = C.Green, colorDark = C.GreenDark, text = "ON", textSize = 16, lip = 4, zIndex = 25,
		})
	end
	content.CanvasSize = UDim2.new(0, 0, 0, 8 + 3 * 62 + 12)
end
local devOpen = Theme.classicButton(settings.content, {
	name = "DeveloperTools", size = UDim2.new(1, -32, 0, 40), position = UDim2.fromOffset(12, 8 + 3 * 62 + 4),
	color = C.Purple, colorDark = C.PurpleDark, text = "DEVELOPER TOOLS", textSize = 16, lip = 4, zIndex = 25,
})
devOpen.Visible = false
local adminOpen = Theme.classicButton(settings.content, {
	name = "AdminCommands", size = UDim2.new(1, -32, 0, 40), position = UDim2.fromOffset(12, 8 + 3 * 62 + 52),
	color = C.Purple, colorDark = C.PurpleDark, text = "ADMIN COMMANDS", textSize = 16, lip = 4, zIndex = 25,
})
adminOpen.Visible = false
-- the admin door takes the developer door's place for admins who are not developers,
-- and the list is only as long as the doors shown
local function placeDoors()
	adminOpen.Position = UDim2.fromOffset(12, 8 + 3 * 62 + (devOpen.Visible and 52 or 4))
	local doors = (devOpen.Visible and 1 or 0) + (adminOpen.Visible and 1 or 0)
	settings.content.CanvasSize = UDim2.new(0, 0, 0, 8 + 3 * 62 + 12 + 48 * doors)
end

-- the developer lab: spawn any fish, equip any rod, infinite money
local devMode = "Fish"
local devList = developer.content
devList.Position = UDim2.fromOffset(8, 56)
devList.Size = UDim2.new(1, -16, 1, -128)
local devLayout = Instance.new("UIListLayout")
devLayout.SortOrder = Enum.SortOrder.LayoutOrder
devLayout.Padding = UDim.new(0, 6)
devLayout.Parent = devList
local devFish = Theme.classicButton(developer.well, {
	name = "FishTab", size = UDim2.fromOffset(160, 36), position = UDim2.fromOffset(10, 10),
	color = C.Yellow, colorDark = C.YellowDark, text = "SPAWN FISH", textSize = 15, lip = 4, zIndex = 25,
})
local devRods = Theme.classicButton(developer.well, {
	name = "RodsTab", size = UDim2.fromOffset(160, 36), position = UDim2.fromOffset(178, 10),
	color = C.Grey, colorDark = C.GreyDark, text = "SELECT ROD", textSize = 15, lip = 4, zIndex = 25,
})
local devStatus = Theme.hudText(developer.well, "", 13, Enum.TextXAlignment.Left)
devStatus.Position = UDim2.new(0, 12, 1, -66)
devStatus.Size = UDim2.new(1, -24, 0, 18)
devStatus.TextColor3 = C.TextMuted
devStatus.ZIndex = 25
local devMoney = Theme.classicButton(developer.well, {
	name = "InfiniteMoney", size = UDim2.new(1, -20, 0, 38), position = UDim2.new(0, 10, 1, -46),
	color = C.Yellow, colorDark = C.YellowDark, text = "INFINITE MONEY: OFF", textSize = 16, lip = 4, zIndex = 25,
})
local function syncInfiniteMoney()
	local enabled = player:GetAttribute("InfiniteFishingMoney") == true
	devMoney.Face.Label.Text = enabled and "INFINITE MONEY: ON" or "INFINITE MONEY: OFF"
	Theme.classicButtonColor(devMoney, enabled and C.Green or C.Yellow, enabled and C.GreenDark or C.YellowDark)
end
player:GetAttributeChangedSignal("InfiniteFishingMoney"):Connect(syncInfiniteMoney)
syncInfiniteMoney()
devMoney.Activated:Connect(function()
	if player:GetAttribute("CanUseFishingDevTools") ~= true then return end
	system.DevAction:FireServer("InfiniteMoney", player:GetAttribute("InfiniteFishingMoney") and "Off" or "On")
end)

-- the admin panel: a command line at the top (clear of a phone's keyboard), the
-- answer under it, and every command this player's rank may use, with its syntax.
-- The server sends the list only to admins and checks every command again itself.
local adminWell = adminWindow.well
local adminBar = Instance.new("Frame")
adminBar.Name = "CommandBar"
adminBar.Size = UDim2.new(1, -16, 0, 40)
adminBar.Position = UDim2.fromOffset(8, 8)
adminBar.BackgroundTransparency = 1
adminBar.ZIndex = 24
adminBar.Parent = adminWell
local adminBox = textBox(adminBar, "Command", "Type a command, e.g. /freeze Player", UDim2.fromOffset(0, 0), UDim2.new(1, -120, 0, 40))
local adminRun = Theme.classicButton(adminBar, {
	name = "Run", size = UDim2.fromOffset(110, 40), anchor = Vector2.new(1, 0), position = UDim2.new(1, 0, 0, 0),
	color = C.Green, colorDark = C.GreenDark, text = "RUN", textSize = 17, lip = 4, zIndex = 25,
})
local adminStatus = Theme.hudText(adminWell, "", 15, Enum.TextXAlignment.Left)
adminStatus.Position = UDim2.fromOffset(12, 54)
adminStatus.Size = UDim2.new(1, -24, 0, 38)
adminStatus.TextWrapped = true
adminStatus.TextTruncate = Enum.TextTruncate.AtEnd
adminStatus.TextYAlignment = Enum.TextYAlignment.Top
adminStatus.ZIndex = 25
local adminInfo = Theme.hudText(adminWell, "", 14, Enum.TextXAlignment.Left)
adminInfo.Position = UDim2.fromOffset(12, 94)
adminInfo.Size = UDim2.new(1, -24, 0, 18)
adminInfo.TextColor3 = C.TextMuted
adminInfo.ZIndex = 25
local adminList = adminWindow.content
adminList.Position = UDim2.fromOffset(8, 118)
adminList.Size = UDim2.new(1, -16, 1, -126)
local adminLayout = Instance.new("UIListLayout")
adminLayout.SortOrder = Enum.SortOrder.LayoutOrder
adminLayout.Padding = UDim.new(0, 6)
adminLayout.Parent = adminList
local adminCommands = nil -- the list from the server (nil for everyone who is not an admin)

-- the market guide
local guideContent = guide.content
do
	local a = Theme.hudText(guideContent, "A good catch deserves a fair price.", 17, Enum.TextXAlignment.Left)
	a.Position = UDim2.fromOffset(12, 8)
	a.Size = UDim2.new(1, -24, 0, 24)
	a.ZIndex = 25
	local b = Theme.hudText(guideContent, "Finn buys fish at his market stall. Walk up to him to sell one fish or your whole basket.", 15, Enum.TextXAlignment.Left)
	b.Position = UDim2.fromOffset(12, 40)
	b.Size = UDim2.new(1, -24, 0, 48)
	b.TextWrapped = true
	b.TextYAlignment = Enum.TextYAlignment.Top
	b.TextColor3 = C.TextMuted
	b.ZIndex = 25
end
local distanceLabel = Theme.hudText(guideContent, "", 15, Enum.TextXAlignment.Left)
distanceLabel.Position = UDim2.fromOffset(12, 96)
distanceLabel.Size = UDim2.new(1, -24, 0, 22)
distanceLabel.ZIndex = 25
local trackButton = Theme.classicButton(guideContent, {
	name = "Track", size = UDim2.new(1, -32, 0, 44), position = UDim2.fromOffset(12, 130),
	color = C.Green, colorDark = C.GreenDark, text = "SHOW ME THE WAY", textSize = 18, lip = 5, zIndex = 25,
})
local waypoint

---------------------------------------------------------------- state
local tools, slots, toolSignals = {}, {}, {}
local characterConnections, backpackConnections = {}, {}
local mode = "Backpack"
local category = Items.Categories[1] or "Fish"
local sortMode = 1
local sortNames = { "newest", "value", "name" }
local indexMode = 1
local indexNames = { "All fish", "Discovered", "Undiscovered" }
local selectedTool, selectedFish
local scheduled = false
local refresh

local function menuOpen()
	local m = pg:FindFirstChild("FishingMenu")
	return m and m.Enabled
end
local function fishingHUD() return pg:FindFirstChild("FishingHUD") end
local function anyOpen()
	for _, w in ipairs(windows) do if w.isOpen() then return true end end
	return false
end
syncModal = function()
	local f = fishingHUD()
	local open = anyOpen()
	gui:SetAttribute("BackpackOpen", open)
	if f and open then f.ReelPanel.Visible = false f.CatchCard.Visible = false end
end
local function dismissAll()
	for _, w in ipairs(windows) do if w.isOpen() then w.close() end end
	local f = fishingHUD()
	if f then f.FishMarket.Visible = false end
	gui:SetAttribute("BackpackOpen", false)
	if GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(gui) then GuiService.SelectedObject = nil end
end
local function schedule()
	if scheduled then return end
	scheduled = true
	task.defer(function() scheduled = false if refresh then refresh() end end)
end
local function openWindow(w)
	if menuOpen() or not gui.Enabled then return end
	dismissAll()
	ShopWindow.Close()
	RobuxShop.Close()
	w.open()
	syncModal()
	system.Action:FireServer("Cancel")
	if UIS.GamepadEnabled then GuiService.SelectedObject = w.header:FindFirstChild("CloseButton") end
end
local function openCollection(which)
	mode = which
	search.Text = ""
	if mode == "Index" and not selectedFish then selectedFish = Config.Fish[1].Id end
	collection.setTitle(mode == "Index" and "FISH INDEX" or "BACKPACK")
	openWindow(collection)
	schedule()
end
local function getRecord(id)
	local folder = player:FindFirstChild("FishDiscoveries")
	return folder and folder:FindFirstChild(id)
end
local function equip(tool)
	if menuOpen() or not tool or not tool.Parent then return end
	local c = player.Character
	local h = c and c:FindFirstChildOfClass("Humanoid")
	if not h or h.Health <= 0 then return end
	if tool.Parent == c then h:UnequipTools() else h:EquipTool(tool) end
	local f = fishingHUD()
	if f and f.FishMarket.Visible then task.delay(0.2, function() system.Action:FireServer("Shop") end) end
end

---------------------------------------------------------------- accessories
-- Accessories are worn, not held, so they are not tools: every one listed in
-- Items.Accessories gets a row. Putting one on or taking it off goes through the
-- server (FishingSystem.AccessoryAction), which checks the player may wear it;
-- an admin-only one shows ADMIN ONLY instead of EQUIP for everyone else.
local selectedAccessory = nil
local accessoryAction = nil
local accessoryWait = 0
local function canWear(acc)
	if acc.AdminOnly then return player:GetAttribute(acc.PermissionAttribute) == true end
	return true
end
local function wearing(acc)
	local c = player.Character
	local worn = c and c:FindFirstChild(acc.Id)
	return worn ~= nil and worn:IsA("Accessory")
end
local function toggleAccessory(acc)
	if menuOpen() or not canWear(acc) or os.clock() < accessoryWait then return end
	accessoryAction = accessoryAction or system:FindFirstChild("AccessoryAction")
	if not accessoryAction then notify("Accessories are still loading. Try again in a moment.") return end
	accessoryWait = os.clock() + 0.5
	accessoryAction:FireServer(wearing(acc) and "Remove" or "Wear", acc.Id)
end
local function renderAccessories(q)
	local count = 0
	local previews = system:FindFirstChild("AccessoryPreviews")
	for i, acc in ipairs(Items.Accessories) do
		if q == "" or acc.Name:lower():find(q, 1, true) then
			count += 1
			local worn = wearing(acc)
			local allowed = canWear(acc)
			local row = buildRow(list, {
				name = "Accessory" .. i, order = count, preview = previews and previews:FindFirstChild(acc.Id),
				title = acc.Name,
				subtitle = (acc.AdminOnly and "Admin only" or "Accessory") .. (worn and "  ·  Wearing" or ""),
				subtitleColor = acc.AdminOnly and C.Purple or C.TextMuted,
				right = acc.Slot or "",
				buttonText = allowed and (worn and "UNEQUIP" or "EQUIP") or nil,
				buttonColor = worn and C.Yellow or C.Blue, buttonColorDark = worn and C.YellowDark or C.BlueDark,
				onClick = function() toggleAccessory(acc) end,
				plateText = (not allowed) and "ADMIN ONLY" or nil,
				dim = not allowed,
				equipped = worn, selected = selectedAccessory == acc.Id,
				onSelect = function() selectedAccessory = acc.Id schedule() end,
			})
			-- (a light backdrop for the picture: a dark accessory would vanish into the usual dark one)
			local view = row:FindFirstChild("Preview")
			if view then
				view.BackgroundColor3 = C.Grey
				view.BackgroundTransparency = 0
			end
		end
	end
	local acc = selectedAccessory and Items.Accessory(selectedAccessory)
	if acc then
		footer.Text = acc.Description .. ((acc.AdminOnly and not canWear(acc)) and "  ·  Only admins can wear it." or "")
	else
		footer.Text = string.format("%d accessor%s  ·  Click a row to read about it", count, count == 1 and "y" or "ies")
	end
	return count
end

---------------------------------------------------------------- the lists
local function renderCollection()
	local savedScroll = list.CanvasPosition
	task.defer(function() if list.Parent then list.CanvasPosition = savedScroll end end)
	for _, v in ipairs(list:GetChildren()) do if v:IsA("GuiObject") then v:Destroy() end end
	if not collection.isOpen() then return end
	local isIndex = mode == "Index"
	for _, v in pairs(tabs) do v.Visible = not isIndex end
	indexFilter.Visible = isIndex
	progress.Visible = isIndex
	sortButton.Visible = not isIndex and category ~= "Accessories"
	search.Visible = isIndex
	search.PlaceholderText = "Search discovered fish..."
	local q = search.Text:lower()
	local count = 0
	if isIndex then
		local discovered = 0
		for _, fish in ipairs(Config.Fish) do if getRecord(fish.Id) then discovered += 1 end end
		progress.Text = string.format("%d of %d discovered", discovered, #Config.Fish)
		for i, fish in ipairs(Config.Fish) do
			local known = getRecord(fish.Id) ~= nil
			if (indexMode == 1 or indexMode == 2 and known or indexMode == 3 and not known) and (q == "" or known and fish.Name:lower():find(q, 1, true)) then
				count += 1
				local record = getRecord(fish.Id)
				buildRow(list, {
					name = "Fish" .. i, order = count, preview = fish.Id, silhouette = not known, dim = not known,
					title = known and fish.Name or "???",
					subtitle = known and fish.Rarity or "Undiscovered",
					subtitleColor = known and (Items.Colors[fish.Rarity] or C.TextMuted) or C.TextMuted,
					right = known and record and string.format("best %.2f kg  ·  x%d", record:GetAttribute("BestWeight") or 0, record:GetAttribute("CatchCount") or 1) or "",
					plateText = known and "FOUND" or "?",
					selected = selectedFish == fish.Id,
					onSelect = function() selectedFish = fish.Id renderCollection() end,
				})
			end
		end
		local fish = selectedFish and Items.Fish(selectedFish)
		if fish and getRecord(selectedFish) then
			footer.Text = fish.Name .. "  ·  " .. fish.Habitat .. "  ·  " .. fish.Description
		elseif fish then
			footer.Text = "Catch this fish to reveal its name, habitat and field notes."
		else
			footer.Text = "Discoveries stay in your index after selling."
		end
	else
		for name, b in pairs(tabs) do
			Theme.classicButtonColor(b, name == category and C.Blue or C.Grey, name == category and C.BlueDark or C.GreyDark)
		end
		if category == "Accessories" then
			count = renderAccessories(q)
		else
			local filtered = {}
			for _, tool in ipairs(tools) do
				if Items.Category(tool) == category and Items.Name(tool):lower():find(q, 1, true) then table.insert(filtered, tool) end
			end
			table.sort(filtered, function(a, b)
				if sortMode == 2 then
					local av, bv = a:GetAttribute("SellValue") or 0, b:GetAttribute("SellValue") or 0
					if av ~= bv then return av > bv end
				elseif sortMode == 3 then
					local an, bn = Items.Name(a), Items.Name(b)
					if an ~= bn then return an < bn end
				end
				return (table.find(tools, a) or 0) > (table.find(tools, b) or 0)
			end)
			for i, tool in ipairs(filtered) do
				count += 1
				local data = Items.Data(tool)
				local equipped = player.Character and tool.Parent == player.Character
				local right = data.Value and ("$" .. data.Value .. "  ·  " .. string.format("%.2f kg", data.Weight or 0)) or ("x" .. data.Quantity)
				if data.Category == "Rods" then
					local rod = Config.GetRod(tool:GetAttribute("RodId"))
					if rod then right = "Tier " .. rod.Tier .. "  ·  " .. #Config.CatchPool(rod.Id) .. " fish" end
				end
				buildRow(list, {
					name = "Item" .. i, order = i, preview = tool,
					title = data.Name .. (data.Quantity > 1 and ("  x" .. data.Quantity) or ""),
					subtitle = data.Rarity .. (equipped and "  ·  Equipped" or ""),
					subtitleColor = Items.Colors[data.Rarity] or C.TextMuted,
					right = right,
					buttonText = equipped and "UNEQUIP" or "EQUIP",
					buttonColor = equipped and C.Yellow or C.Blue, buttonColorDark = equipped and C.YellowDark or C.BlueDark,
					onClick = function() equip(tool) end,
					equipped = equipped, selected = selectedTool == tool,
					onSelect = function() selectedTool = tool renderCollection() end,
				})
			end
			local data = selectedTool and table.find(tools, selectedTool) and Items.Data(selectedTool)
			if data then
				footer.Text = data.Description ~= "" and data.Description or "Ready for your next fishing trip."
			else
				footer.Text = string.format("%d %s item%s  ·  Click a row to read about it", count, category:lower(), count == 1 and "" or "s")
			end
		end
	end
	if count == 0 then
		local messages = {
			Fish = "Your next catch belongs here. Equip your rod and head to the water.",
			Pets = "No companions in your collection yet.",
			Rods = "No rods match this search.",
			Bait = "No bait in your collection yet.",
			Equipment = "No equipment in your collection yet.",
			Accessories = "No accessories yet.",
		}
		local empty = Theme.hudText(list, isIndex and "No entries match this view." or (q ~= "" and "No matching items." or messages[category] or "Nothing here yet."), 17)
		empty.Size = UDim2.new(1, -18, 0, 80)
		empty.TextWrapped = true
		empty.TextColor3 = C.TextMuted
		empty.ZIndex = 25
	end
	list.CanvasSize = UDim2.new(0, 0, 0, math.max(count * 68 + 6, 90))
end

local function renderHotbar()
	for _, v in pairs(slots) do v:Destroy() end
	slots = {}
	for i = 1, 6 do
		local tool = tools[i]
		local equipped = tool and player.Character and tool.Parent == player.Character
		local b = Instance.new("TextButton")
		b.Name = "Slot" .. i
		b.Position = UDim2.fromOffset((i - 1) * 78, 0)
		b.Size = UDim2.fromOffset(70, 70)
		b.BackgroundColor3 = tool and C.Card or C.CardDark
		b.BackgroundTransparency = tool and 0 or 0.25
		b.BorderSizePixel = 0
		b.Text = ""
		b.AutoButtonColor = false
		b.Parent = hotbar
		Theme.corner(b, 10)
		Theme.stroke(b, equipped and C.Green or C.Ink, equipped and 3 or 2.5)
		if tool then Theme.lip(b, 0.09) end
		local key = Theme.hudText(b, tostring(i), 11, Enum.TextXAlignment.Left)
		key.Position = UDim2.fromOffset(6, 2)
		key.Size = UDim2.fromOffset(20, 14)
		key.ZIndex = 3
		if tool then
			local data = Items.Data(tool)
			local view = Instance.new("ViewportFrame")
			view.Position = UDim2.fromOffset(7, 8)
			view.Size = UDim2.fromOffset(56, 36)
			view.BackgroundTransparency = 1
			view.ZIndex = 2
			view.Parent = b
			Items.Preview(view, tool, false)
			local name = Theme.hudText(b, data.Category == "Rods" and data.Name:gsub(" Rod$", "") or data.Name, 10)
			name.Position = UDim2.fromOffset(3, 44)
			name.Size = UDim2.fromOffset(64, 14)
			name.TextScaled = true
			name.ZIndex = 3
			local limit = Instance.new("UITextSizeConstraint")
			limit.MinTextSize = 8
			limit.MaxTextSize = 10
			limit.Parent = name
			if data.Value then
				local value = Theme.hudText(b, "$" .. data.Value, 10)
				value.Position = UDim2.fromOffset(3, 56)
				value.Size = UDim2.fromOffset(64, 12)
				value.TextColor3 = C.Yellow
				value.ZIndex = 3
			end
			b.Activated:Connect(function() equip(tool) end)
		end
		slots[i] = b
	end
end

refresh = function()
	local found = {}
	local bp = player:FindFirstChildOfClass("Backpack")
	for _, parent in ipairs({ bp, player.Character }) do
		if parent then for _, t in ipairs(parent:GetChildren()) do if t:IsA("Tool") then found[t] = true end end end
	end
	for i = #tools, 1, -1 do
		if not found[tools[i]] then
			local t = tools[i]
			if toolSignals[t] then toolSignals[t]:Disconnect() toolSignals[t] = nil end
			if selectedTool == t then selectedTool = nil end
			table.remove(tools, i)
		end
	end
	for t in pairs(found) do
		if not table.find(tools, t) then
			if Items.Category(t) == "Rods" then table.insert(tools, 1, t) else table.insert(tools, t) end
			toolSignals[t] = t.AttributeChanged:Connect(schedule)
		end
	end
	renderHotbar()
	renderCollection()
end

local function connectContainer(parent, connections)
	for _, c in ipairs(connections) do c:Disconnect() end
	table.clear(connections)
	if parent then
		table.insert(connections, parent.ChildAdded:Connect(schedule))
		table.insert(connections, parent.ChildRemoved:Connect(schedule))
	end
	schedule()
end
player.CharacterAdded:Connect(function(c) connectContainer(c, characterConnections) dismissAll() end)
player.ChildAdded:Connect(function(c) if c:IsA("Backpack") then connectContainer(c, backpackConnections) end end)
connectContainer(player.Character, characterConnections)
connectContainer(player:FindFirstChildOfClass("Backpack"), backpackConnections)
local function discoveries(folder)
	for _, v in ipairs(folder:GetChildren()) do v.AttributeChanged:Connect(schedule) end
	folder.ChildAdded:Connect(function(v) v.AttributeChanged:Connect(schedule) schedule() end)
	folder.ChildRemoved:Connect(schedule)
	schedule()
end
if player:FindFirstChild("FishDiscoveries") then discoveries(player.FishDiscoveries) end
for _, acc in ipairs(Items.Accessories) do
	if acc.PermissionAttribute then player:GetAttributeChangedSignal(acc.PermissionAttribute):Connect(schedule) end
end
task.spawn(function()
	local previews = system:WaitForChild("AccessoryPreviews", 120)
	if previews then
		previews.ChildAdded:Connect(schedule)
		schedule()
	end
end)
player.ChildAdded:Connect(function(v) if v.Name == "FishDiscoveries" then discoveries(v) end end)

local function formatCoins(n)
	return (tostring(math.floor(n)):reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", ""))
end
-- money coming in counts up to the new total; spending (and the first read) just sets it
local shownCoins, countToken = nil, 0
local walletFinalW = nil -- the wallet's width at the final value (the layout never follows the count-up)
local resizeHud
local function updateMoney()
	countToken += 1
	local final = player:GetAttribute("InfiniteFishingMoney") and "$∞" or "$" .. formatCoins(player:GetAttribute("FishingCoins") or 0)
	walletFinalW = 44 + 8 + TextService:GetTextSize(final, 32, Theme.Font, Vector2.new(2000, 100)).X + 8
	if resizeHud then resizeHud() end
	if player:GetAttribute("InfiniteFishingMoney") then money.Text = "$∞" shownCoins = nil return end
	local n = math.floor(player:GetAttribute("FishingCoins") or 0)
	if shownCoins == nil or n <= shownCoins or reduceMotion() then
		shownCoins = n
		money.Text = "$" .. formatCoins(n)
		return
	end
	local mine, from, started = countToken, shownCoins, os.clock()
	shownCoins = n
	task.spawn(function()
		while countToken == mine do
			local a = math.min(1, (os.clock() - started) / 0.45)
			money.Text = "$" .. formatCoins(from + (n - from) * (1 - (1 - a) ^ 3))
			if a >= 1 then break end
			RunService.RenderStepped:Wait()
		end
	end)
end
updateMoney()
player:GetAttributeChangedSignal("FishingCoins"):Connect(updateMoney)
player:GetAttributeChangedSignal("InfiniteFishingMoney"):Connect(updateMoney)

for name, b in pairs(tabs) do
	b.Activated:Connect(function() category = name selectedTool = nil search.Text = "" schedule() end)
end
sortButton.Activated:Connect(function() sortMode = sortMode % 3 + 1 sortButton.Face.Label.Text = "Sort: " .. sortNames[sortMode] schedule() end)
indexFilter.Activated:Connect(function() indexMode = indexMode % 3 + 1 indexFilter.Face.Label.Text = indexNames[indexMode] schedule() end)
search:GetPropertyChangedSignal("Text"):Connect(schedule)
bag.Activated:Connect(function() if collection.isOpen() and mode == "Backpack" then dismissAll() else openCollection("Backpack") end end)
nav.Backpack.Activated:Connect(function() if collection.isOpen() and mode == "Backpack" then dismissAll() else openCollection("Backpack") end end)
nav.Index.Activated:Connect(function() if collection.isOpen() and mode == "Index" then dismissAll() else openCollection("Index") end end)
nav.Settings.Activated:Connect(function() if settings.isOpen() then dismissAll() else openWindow(settings) end end)
nav.Shop.Activated:Connect(function()
	if menuOpen() or not gui.Enabled then return end
	if RobuxShop.IsOpen() then RobuxShop.Close() return end
	dismissAll()
	ShopWindow.Close()
	RobuxShop.Open()
end)

---------------------------------------------------------------- the developer lab
local function renderDev()
	for _, v in ipairs(devList:GetChildren()) do if v:IsA("GuiObject") then v:Destroy() end end
	local fishMode = devMode == "Fish"
	Theme.classicButtonColor(devFish, fishMode and C.Yellow or C.Grey, fishMode and C.YellowDark or C.GreyDark)
	Theme.classicButtonColor(devRods, fishMode and C.Grey or C.Yellow, fishMode and C.GreyDark or C.YellowDark)
	local n = 0
	for i, d in ipairs(fishMode and Config.Fish or Config.Rods) do
		n += 1
		local id = d.Id
		buildRow(devList, {
			name = id, order = i, preview = fishMode and id or system.RodPreviews:FindFirstChild(id),
			title = d.Name, subtitle = fishMode and (d.Rarity .. "  ·  ~$" .. d.BaseValue) or ("Tier " .. d.Tier .. "  ·  " .. #Config.CatchPool(id) .. " fish"),
			subtitleColor = fishMode and (Items.Colors[d.Rarity] or C.TextMuted) or C.TextMuted,
			right = "Tier " .. d.Tier,
			buttonText = fishMode and "SPAWN" or "EQUIP", buttonColor = C.Green, buttonColorDark = C.GreenDark,
			onClick = function()
				if player:GetAttribute("CanUseFishingDevTools") ~= true then return end
				system.DevAction:FireServer(fishMode and "SpawnFish" or "EquipRod", id)
			end,
		})
	end
	devList.CanvasSize = UDim2.new(0, 0, 0, n * 68 + 6)
end
local function syncDevAccess()
	local allowed = player:GetAttribute("CanUseFishingDevTools") == true
	devOpen.Visible = allowed
	placeDoors()
	if not allowed and developer.isOpen() then developer.close() syncModal() end
end
player:GetAttributeChangedSignal("CanUseFishingDevTools"):Connect(syncDevAccess)
syncDevAccess()
devOpen.Activated:Connect(function()
	if player:GetAttribute("CanUseFishingDevTools") ~= true then return end
	openWindow(developer)
	devStatus.Text = ""
	renderDev()
end)
devFish.Activated:Connect(function() devMode = "Fish" devStatus.Text = "" renderDev() end)
devRods.Activated:Connect(function() devMode = "Rods" devStatus.Text = "" renderDev() end)
system.DevResult.OnClientEvent:Connect(function(ok, message)
	devStatus.Text = message
	devStatus.TextColor3 = ok and C.Green or C.Red
	schedule()
end)

---------------------------------------------------------------- admin
-- a private line in chat (like the intro's developer messages)
local function chatLine(text, colour)
	local shown = pcall(function()
		local channels = TextChatService:FindFirstChild("TextChannels")
		local channel = channels and (channels:FindFirstChild("RBXSystem") or channels:FindFirstChild("RBXGeneral"))
		local safe = text:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;")
		channel:DisplaySystemMessage(colour and ('<font color="#' .. colour:ToHex() .. '">' .. safe .. "</font>") or safe)
	end)
	if not shown then pcall(function() StarterGui:SetCore("ChatMakeSystemMessage", { Text = text, Color = colour }) end) end
end
local adminEvent, adminRemote
local function renderAdmin()
	for _, c in ipairs(adminList:GetChildren()) do if c:IsA("GuiObject") then c:Destroy() end end
	if not adminCommands then return end
	local n = #adminCommands.commands
	adminInfo.Text = ("You can use %d commands as %s."):format(n, adminCommands.levelName or "Admin")
	for i, cmd in ipairs(adminCommands.commands) do
		buildRow(adminList, {
			name = cmd.name, order = i, noPreview = true, title = cmd.usage, subtitle = cmd.desc,
			buttonText = "USE", buttonColor = C.Blue, buttonColorDark = C.BlueDark,
			onClick = function()
				adminBox.Text = "/" .. cmd.name .. " "
				adminBox:CaptureFocus()
				adminBox.CursorPosition = #adminBox.Text + 1
			end,
		})
	end
	adminList.CanvasSize = UDim2.new(0, 0, 0, n * 68 + 6)
end
local function syncAdminAccess()
	local isAdmin = adminCommands ~= nil
	nav.Admin.Visible = isAdmin
	adminOpen.Visible = isAdmin
	placeDoors()
	if not isAdmin and adminWindow.isOpen() then adminWindow.close() syncModal() end
	if resizeHud then resizeHud() end
end
local function openAdmin()
	if not adminCommands then return end
	openWindow(adminWindow)
	adminStatus.Text = ""
	renderAdmin()
end
-- kicks and bans (and "all" for the harsher commands) ask for a second press
local confirmUntil, confirmLine = 0, nil
local running = false
local function needsConfirm(line)
	local l = line:lower()
	local who = l:match("^/?%a+%s+(%S+)")
	return l:match("^/?kick%s") or l:match("^/?ban%s") or ((l:match("^/?kill%s") or l:match("^/?respawn%s")) and (who == "all" or who == "everyone" or who == "others"))
end
local function setRun(text, colour, dark)
	adminRun.Face.Label.Text = text
	Theme.classicButtonColor(adminRun, colour, dark)
end
local function runAdminLine()
	local line = adminBox.Text:gsub("^%s+", ""):gsub("%s+$", "")
	if line == "" or running or not adminRemote then return end
	if needsConfirm(line) and not (confirmLine == line and os.clock() < confirmUntil) then
		confirmLine, confirmUntil = line, os.clock() + 3
		setRun("CONFIRM", C.Red, C.RedDark)
		adminStatus.Text = "Press again to confirm."
		adminStatus.TextColor3 = C.Yellow
		task.delay(3.05, function()
			if os.clock() >= confirmUntil and not running then
				setRun("RUN", C.Green, C.GreenDark)
				if adminStatus.Text == "Press again to confirm." then adminStatus.Text = "" end
			end
		end)
		return
	end
	confirmLine, confirmUntil = nil, 0
	running = true
	setRun("RUNNING...", C.Grey, C.GreyDark)
	adminRemote:FireServer(line)
	task.delay(0.9, function()
		running = false
		setRun("RUN", C.Green, C.GreenDark)
	end)
end
adminRun.Activated:Connect(runAdminLine)
adminBox.FocusLost:Connect(function(enterPressed) if enterPressed then runAdminLine() end end)
nav.Admin.Activated:Connect(function() if adminWindow.isOpen() then dismissAll() else openAdmin() end end)
adminOpen.Activated:Connect(openAdmin)

-- server announcements: one dark card at the top, one at a time, never over the
-- loading screen or the cutscene; and a line in chat
local announceGui = Instance.new("ScreenGui")
announceGui.Name = "Announcements"
announceGui.ResetOnSpawn = false
announceGui.DisplayOrder = 60 -- above the shops, below the welcome, the intro and loading
announceGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
announceGui.Parent = pg
local card = Instance.new("CanvasGroup")
card.Name = "Announcement"
card.AnchorPoint = Vector2.new(0.5, 0)
card.Position = UDim2.new(0.5, 0, 0, 18)
card.Size = UDim2.fromOffset(520, 84)
card.BackgroundTransparency = 1
card.GroupTransparency = 1
card.Visible = false
card.Parent = announceGui
announceCard = card
local cardScale = Instance.new("UIScale")
cardScale.Parent = card
local cardPanel = Instance.new("Frame")
cardPanel.Name = "Panel"
cardPanel.Position = UDim2.fromOffset(4, 4)
cardPanel.Size = UDim2.new(1, -8, 1, -8)
cardPanel.BackgroundColor3 = C.Panel
cardPanel.BorderSizePixel = 0
cardPanel.Parent = card
Theme.corner(cardPanel, C.Radius.Panel)
Theme.stroke(cardPanel, C.Ink, 3)
local cardHead = Theme.hudText(cardPanel, "", 15, Enum.TextXAlignment.Left)
cardHead.Position = UDim2.fromOffset(16, 10)
cardHead.Size = UDim2.new(1, -32, 0, 20)
cardHead.TextColor3 = C.Yellow
cardHead.TextTruncate = Enum.TextTruncate.AtEnd
local cardText = Theme.hudText(cardPanel, "", 17, Enum.TextXAlignment.Left)
cardText.Position = UDim2.fromOffset(16, 34)
cardText.Size = UDim2.new(1, -32, 1, -44)
cardText.TextWrapped = true
cardText.TextYAlignment = Enum.TextYAlignment.Top
local queue, showing = {}, false
local function worldOnScreen()
	local s = pg:GetAttribute("IntroScreen")
	return (s == nil or s == "World") and pg:GetAttribute("LoadingScreen") ~= "Showing"
end
local function clearToShow()
	return worldOnScreen() and not pg:FindFirstChild("WelcomeMessage")
end
local function showNext()
	if showing or #queue == 0 then return end
	showing = true
	task.spawn(function()
		if not clearToShow() then
			-- (the welcome message follows the world by a moment: let it come and go first)
			repeat
				while not clearToShow() do task.wait(0.5) end
				task.wait(1)
			until clearToShow()
		end
		local item = table.remove(queue, 1)
		local width = math.min(520, (gui.AbsoluteSize.X > 0 and gui.AbsoluteSize.X or 800) - 2 * (14 + 96 + 104) * hudScale.Scale - 24)
		width = math.max(260, width / hudScale.Scale)
		cardScale.Scale = hudScale.Scale
		cardHead.Text = "Announcement from " .. item.from
		cardText.Text = item.text
		local h = TextService:GetTextSize(item.text, 17, Theme.Font, Vector2.new(width - 40, 400)).Y
		card.Size = UDim2.fromOffset(width, math.max(84, h + 56))
		card.Visible = true
		-- (a notice already showing moves down out from under the card)
		if notice.Visible then
			task.defer(function()
				if notice.Visible and card.Visible then notice.Position = UDim2.new(0.5, 0, 0, 18 + card.AbsoluteSize.Y + 6) end
			end)
		end
		if reduceMotion() then
			card.Position = UDim2.new(0.5, 0, 0, 18)
			card.GroupTransparency = 0
		else
			card.Position = UDim2.new(0.5, 0, 0, 8)
			TweenService:Create(card, TweenInfo.new(0.2), { GroupTransparency = 0 }):Play()
			TweenService:Create(card, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Position = UDim2.new(0.5, 0, 0, 18) }):Play()
		end
		task.wait(math.clamp(5 + #item.text * 0.05, 5, 12))
		local out = TweenService:Create(card, TweenInfo.new(reduceMotion() and 0.01 or 1, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { GroupTransparency = 1 })
		out:Play()
		out.Completed:Wait()
		card.Visible = false
		showing = false
		showNext()
	end)
end

task.spawn(function()
	adminEvent = system:WaitForChild("AdminEvent", 120)
	adminRemote = system:WaitForChild("AdminCommand", 120)
	if not adminEvent then return end
	adminEvent.OnClientEvent:Connect(function(kind, data, flag)
		if kind == "Commands" and type(data) == "table" and type(data.commands) == "table" then
			adminCommands = data
			syncAdminAccess()
			if adminWindow.isOpen() then renderAdmin() end
			if flag == true then openAdmin() end
		elseif kind == "Result" and type(data) == "table" and type(data.text) == "string" then
			if adminWindow.isOpen() then
				adminStatus.Text = data.text
				adminStatus.TextColor3 = data.ok and C.Green or C.Red
			else
				notify(data.text)
			end
			if data.chat then chatLine("[Admin] " .. data.text, if data.ok then nil else C.Red) end
		elseif kind == "Announce" and type(data) == "table" and type(data.text) == "string" then
			local from = type(data.from) == "string" and data.from or "an admin"
			chatLine("[Announcement] " .. from .. ": " .. data.text, C.Yellow)
			table.insert(queue, { text = data.text, from = from })
			showNext()
		end
	end)
	adminEvent:FireServer("GetCommands")
end)
-- Roblox's own /help: admins also get their panel
task.spawn(function()
	local folder = TextChatService:WaitForChild("TextChatCommands", 60)
	local help = folder and folder:WaitForChild("RBXHelpCommand", 30)
	if help then help.Triggered:Connect(function() if adminCommands then openAdmin() end end) end
end)
-- when an admin holds or releases this player
player:GetAttributeChangedSignal("AdminFrozen"):Connect(function()
	notify(player:GetAttribute("AdminFrozen") and "An admin has frozen you." or "You can move again.")
end)

---------------------------------------------------------------- the shops
local function merchantDistance()
	local c = player.Character
	local r = c and c:FindFirstChild("HumanoidRootPart")
	local marker, distance = nil, math.huge
	if r then
		for _, v in ipairs(CollectionService:GetTagged("FishMerchant")) do
			if v:IsA("BasePart") and v:IsDescendantOf(workspace) then
				local d = (r.Position - v.Position).Magnitude
				if d < distance then marker = v distance = d end
			end
		end
	end
	return marker, distance
end
-- the rod stall opens itself when you walk into its circle (RodShop.local),
-- so the HUD's Shop button is the Robux shop
trackButton.Activated:Connect(function()
	local marker, distance = merchantDistance()
	if not marker then notify("The market is currently unavailable.") return end
	if distance <= 15 then dismissAll() system.Action:FireServer("Shop") return end
	if waypoint then waypoint:Destroy() waypoint = nil trackButton.Face.Label.Text = "SHOW ME THE WAY" return end
	waypoint = Instance.new("BillboardGui")
	waypoint.Name = "MarketWaypoint"
	waypoint.Adornee = marker
	waypoint.Size = UDim2.fromOffset(160, 50)
	waypoint.StudsOffset = Vector3.new(0, 4, 0)
	waypoint.AlwaysOnTop = false -- (an always-on-top billboard does not draw in this place)
	waypoint.LightInfluence = 0
	waypoint.ResetOnSpawn = false -- (a respawn must not take the marker away under the updater below)
	waypoint.Parent = pg
	local t = Theme.hudText(waypoint, "FISH MARKET", 16)
	t.Name = "Label"
	t.Size = UDim2.fromScale(1, 1)
	t.TextColor3 = C.Yellow
	notify("Market marked. Follow the sign above the stall.")
	dismissAll()
end)
-- Sell (top-right): at Finn's stall it opens the market; anywhere else it opens
-- the market guide, with the distance and a marker to follow
nav.Sell.Activated:Connect(function()
	if menuOpen() or not gui.Enabled then return end
	if ShopWindow.Mode() == "Fish" then ShopWindow.Close() return end
	if guide.isOpen() then dismissAll() return end
	local marker, distance = merchantDistance()
	if marker and distance <= 15 then
		dismissAll()
		RobuxShop.Close()
		system.Action:FireServer("Shop") -- the server answers with its quote and the market opens
	else
		openWindow(guide)
	end
end)
-- the shops close the HUD windows when they open
local function watchShop(g)
	if g:IsA("ScreenGui") and (g.Name == "ShopWindow" or g.Name == "RobuxShop" or g.Name == "TradingUI" or g.Name == "AtlanticTravelUI") then
		g:GetAttributeChangedSignal("Open"):Connect(function()
			if g:GetAttribute("Open") then dismissAll() end
		end)
	end
end
for _, g in ipairs(pg:GetChildren()) do watchShop(g) end
pg.ChildAdded:Connect(watchShop)

---------------------------------------------------------------- sound settings
local ambience = Instance.new("SoundGroup")
ambience.Name = "FishingAmbienceMix"
ambience.Parent = SoundService
local function mix(sound)
	if sound:IsA("Sound") and (sound.Name:lower():find("wind") or sound.Name:lower():find("ambien")) then sound.SoundGroup = ambience end
end
for _, v in ipairs(SoundService:GetDescendants()) do mix(v) end
SoundService.DescendantAdded:Connect(mix)
local function setToggle(btn, on)
	btn.Face.Label.Text = on and "ON" or "OFF"
	Theme.classicButtonColor(btn, on and C.Green or C.Grey, on and C.GreenDark or C.GreyDark)
end
settingsButtons.Motion.Activated:Connect(function()
	local reduce = not pg:GetAttribute("ReduceMotion")
	pg:SetAttribute("ReduceMotion", reduce)
	setToggle(settingsButtons.Motion, not reduce)
end)
settingsButtons.Ambience.Activated:Connect(function()
	ambience.Volume = ambience.Volume == 0 and 1 or 0
	setToggle(settingsButtons.Ambience, ambience.Volume > 0)
end)
settingsButtons.Notices.Activated:Connect(function()
	local enabled = not pg:GetAttribute("CatchNotices")
	pg:SetAttribute("CatchNotices", enabled)
	setToggle(settingsButtons.Notices, enabled)
end)

---------------------------------------------------------------- keys
local keys = { Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three, Enum.KeyCode.Four, Enum.KeyCode.Five, Enum.KeyCode.Six }
UIS.InputBegan:Connect(function(input, processed)
	if processed or UIS:GetFocusedTextBox() or menuOpen() or not gui.Enabled then return end
	if input.KeyCode == Enum.KeyCode.B or input.KeyCode == Enum.KeyCode.Backquote or input.KeyCode == Enum.KeyCode.ButtonY then
		if collection.isOpen() and mode == "Backpack" then dismissAll() else openCollection("Backpack") end
	elseif input.KeyCode == Enum.KeyCode.I then
		openCollection("Index")
	else
		local n = table.find(keys, input.KeyCode)
		if n then equip(tools[n]) end
	end
end)

---------------------------------------------------------------- the rest of the game
-- Roblox's own backpack (the hotbar replaces it) and its player list: the game
-- has no leaderboard stats, and the list sat over the Sell and Settings buttons
local function hideDefault()
	pcall(function()
		StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
		StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)
	end)
end
-- the intro turns core GUI back on as it was when it ends: hide them again then
pg:GetAttributeChangedSignal("IntroScreen"):Connect(function()
	if pg:GetAttribute("IntroScreen") == "World" then task.defer(hideDefault) end
end)
local function syncMenu()
	local open = menuOpen()
	hud.Visible = not open
	hotbar.Visible = not open
	notice.Visible = false
	if open then dismissAll() else hideDefault() end
end
local function attachMenu(m)
	if m.Name == "FishingMenu" and m:IsA("ScreenGui") then
		m:GetPropertyChangedSignal("Enabled"):Connect(syncMenu)
		syncMenu()
	end
end
pg.ChildAdded:Connect(attachMenu)
if pg:FindFirstChild("FishingMenu") then attachMenu(pg.FishingMenu) end
hideDefault()
local function attachFishing(f)
	if f.Name ~= "FishingHUD" then return end
	task.spawn(function()
		local market = f:WaitForChild("FishMarket", 10)
		if market then
			market:GetPropertyChangedSignal("Visible"):Connect(function()
				if market.Visible then
					for _, w in ipairs(windows) do if w.isOpen() then w.close() end end
					syncModal()
				end
			end)
		end
	end)
end
pg.ChildAdded:Connect(attachFishing)
if fishingHUD() then attachFishing(fishingHUD()) end
system.Update.OnClientEvent:Connect(function(kind, data)
	if kind == "Caught" then
		schedule()
		if data.newDiscovery then notify("New discovery! Your fish index has a new entry.") end
	elseif kind == "Sold" and data.count > 0 and ShopWindow.Mode() ~= "Fish" then
		-- (the market window says it itself when it is open)
		notify(string.format("Sold %d fish  ·  +$%d", data.count, data.value))
	end
end)

local function resize()
	local size = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
	local s = 1
	if size.X < 650 then s = 0.78 end
	if size.Y < 500 then s = 0.7 end
	hudScale.Scale = s
	hud.Size = UDim2.fromScale(1 / s, 1 / s)
	-- on touch screens leave room on the right for the jump button
	local reserve = UIS.TouchEnabled and 220 or 20
	hotScale.Scale = math.min(1, (size.X - reserve) / 548)
	local guiX = gui.AbsoluteSize.X > 0 and gui.AbsoluteSize.X or size.X
	local guiY = gui.AbsoluteSize.Y > 0 and gui.AbsoluteSize.Y or size.Y
	local hotTop = guiY - 12 - 72 * hotScale.Scale
	local hotLeft = (guiX - 548 * hotScale.Scale) / 2
	-- the wallet sits in the bottom-left corner; on screens too narrow for it to
	-- sit beside the hotbar it rises to just above the hotbar instead
	local walletW = (walletFinalW or 190) * s
	local walletBottom = WALLET_PAD * s
	if WALLET_PAD * s + walletW > hotLeft - 10 then walletBottom = (guiY - hotTop) + 8 end
	coinRow.Position = UDim2.new(0, WALLET_PAD, 1, -walletBottom / s)
	local walletTop = guiY - walletBottom - WALLET_H * s
	-- the shop windows keep clear of a raised wallet (ClassicTheme.shopShell reads this)
	pg:SetAttribute("HudWalletTop", walletBottom > WALLET_PAD * s + 1 and walletTop or nil)
	-- keep the side column clear of the wallet and the hotbar on short screens
	local colBottom = 0.5 * guiY + (136 - 10) * s
	local lift = math.max(0, colBottom - (math.min(walletTop, hotTop) - 8))
	side.Position = UDim2.new(0, 14, 0.5, -10 - lift / s)
	-- (on narrow screens the notice stays clear of the Sell and Settings corner)
	local corner = 14 + 96 + (nav.Admin.Visible and 104 or 0)
	notice.Size = UDim2.fromOffset(math.max(160, math.min(380, size.X - 2 * corner * s - 12)), 48)
end
resizeHud = resize
resize()
if workspace.CurrentCamera then workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(resize) end
gui:GetPropertyChangedSignal("AbsoluteSize"):Connect(resize)

local step = 0
RunService.Heartbeat:Connect(function(dt)
	step += dt
	if step < 0.25 then return end
	step = 0
	if guide.isOpen() or waypoint then
		local marker, distance = merchantDistance()
		distanceLabel.Text = marker and distance < math.huge and string.format("Market distance  ·  %d studs", math.floor(distance)) or "The market is currently unavailable."
		trackButton.Face.Label.Text = distance <= 15 and "OPEN MARKET" or waypoint and "CLEAR MARKET MARKER" or "SHOW ME THE WAY"
		if waypoint then
			if not marker or distance == math.huge or distance < 12 or not waypoint.Parent or not waypoint:FindFirstChild("Label") then
				waypoint:Destroy()
				waypoint = nil
			else
				waypoint.Label.Text = "FISH MARKET\n" .. math.floor(distance) .. " studs"
			end
		end
	end
end)
schedule()
