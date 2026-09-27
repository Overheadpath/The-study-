--!strict
-- The pop-up menus behind the hexagon buttons: STYLES, AWAKEN, LOCKER, SHOP,
-- STATS, CODES and EXTRA. Every action is a request to the server, which
-- checks it and answers with { ok, msg, ... }.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local UI = require(script.Parent:WaitForChild("UI"))

local rgb = Color3.fromRGB

export type Result = { [string]: any }
export type Deps = {
	request: (action: string, arg: any) -> Result,
	profile: () -> { [string]: any }?,
	toast: (text: string, kind: string?) -> (),
	hold: (on: boolean) -> (), -- pause HUD updates while an animation plays
	big: (title: string, subtitle: string, color: Color3) -> (),
}
export type Panels = {
	Gui: ScreenGui,
	open: (name: string, focus: string?) -> (),
	close: () -> (),
	current: () -> string?,
	refresh: () -> (),
	setScale: (scale: number) -> (),
}

local ACCENTS: { [string]: Color3 } = {
	Styles = rgb(242, 193, 46),
	Awaken = rgb(232, 63, 210),
	Locker = rgb(242, 138, 46),
	Shop = rgb(232, 50, 60),
	Stats = rgb(46, 139, 242),
	Codes = rgb(155, 77, 242),
	Extra = rgb(60, 190, 60),
}

local TITLES: { [string]: string } = {
	Styles = "🥊 FIGHTING STYLES",
	Awaken = "⚡ AWAKENINGS",
	Locker = "🎒 LOCKER",
	Shop = "🛒 SHOP",
	Stats = "📊 YOUR STATS",
	Codes = "🎁 CODES",
	Extra = "✨ EXTRA",
}

local Panels = {}

function Panels.new(playerGui: PlayerGui, deps: Deps): Panels
	local gui = UI.new("ScreenGui", {
		Name = "BattleHubMenus",
		ResetOnSpawn = false,
		IgnoreGuiInset = true,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = 10,
		Enabled = false,
		Parent = playerGui,
	})
	local backdrop = UI.new("TextButton", {
		Name = "Backdrop",
		Text = "",
		AutoButtonColor = false,
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		Size = UDim2.fromScale(1, 1),
		Parent = gui,
	})
	local window = UI.new("Frame", {
		Name = "Window",
		Size = UDim2.fromOffset(880, 580),
		Position = UDim2.fromScale(0.5, 0.5),
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundColor3 = UI.Colors.Panel,
		Parent = gui,
	})
	local windowScale = UI.new("UIScale", { Parent = window })
	UI.corner(window, 18)
	local windowStroke = UI.stroke(window, ACCENTS.Styles, 4, true)
	local header = UI.new("Frame", {
		Name = "Header",
		Size = UDim2.new(1, 0, 0, 72),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = window,
	})
	UI.corner(header, 18)
	local headerGradient = UI.gradient(header, { ACCENTS.Styles, UI.darken(ACCENTS.Styles, 0.35) }, 90)
	-- square off the header's bottom corners
	local headerFoot = UI.new("Frame", {
		Name = "Foot",
		Size = UDim2.new(1, 0, 0, 18),
		Position = UDim2.new(0, 0, 1, -18),
		BackgroundColor3 = Color3.new(1, 1, 1),
		BorderSizePixel = 0,
		Parent = header,
	})
	local footGradient =
		UI.gradient(headerFoot, { UI.darken(ACCENTS.Styles, 0.3), UI.darken(ACCENTS.Styles, 0.35) }, 90)
	local titleLabel = UI.text(header, "", {
		Name = "Title",
		Size = UDim2.new(1, -120, 0, 52),
		Position = UDim2.fromOffset(24, 10),
		Align = Enum.TextXAlignment.Left,
		Stroke = 3,
		Z = 2,
	})
	local close = UI.button(header, "✕", UI.Colors.Red, {
		Name = "Close",
		Size = UDim2.fromOffset(52, 52),
		Position = UDim2.new(1, -14, 0.5, 0),
		AnchorPoint = Vector2.new(1, 0.5),
		Z = 3,
	})
	local body = UI.new("Frame", {
		Name = "Body",
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -36, 1, -100),
		Position = UDim2.fromOffset(18, 86),
		Parent = window,
	})

	local fitScale = 1
	local openName: string? = nil
	local focusArg: string? = nil
	local tab: { [string]: string } = { Locker = "Auras", Shop = "Deals" }
	local busy = false -- a roll or purchase is in flight
	local lastRoll: { [string]: string } = {} -- what you rolled last (shown until you roll again)
	local self = {} :: Panels

	local function clear()
		for _, child in body:GetChildren() do
			child:Destroy()
		end
	end

	-- Shared pieces -------------------------------------------------------------

	local function grid(parent: Instance, cell: Vector2, position: UDim2, size: UDim2): ScrollingFrame
		local scroller = UI.new("ScrollingFrame", {
			Name = "Grid",
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			Size = size,
			Position = position,
			CanvasSize = UDim2.new(),
			AutomaticCanvasSize = Enum.AutomaticSize.Y,
			ScrollingDirection = Enum.ScrollingDirection.Y,
			ScrollBarThickness = 8,
			ScrollBarImageColor3 = rgb(120, 120, 140),
			Parent = parent,
		})
		UI.new("UIGridLayout", {
			CellSize = UDim2.fromOffset(cell.X, cell.Y),
			CellPadding = UDim2.fromOffset(12, 12),
			SortOrder = Enum.SortOrder.LayoutOrder,
			Parent = scroller,
		})
		UI.new("UIPadding", {
			PaddingTop = UDim.new(0, 6),
			PaddingLeft = UDim.new(0, 6),
			PaddingRight = UDim.new(0, 14),
			PaddingBottom = UDim.new(0, 10),
			Parent = scroller,
		})
		return scroller
	end

	type CardOpts = {
		Icon: string,
		Name: string,
		Sub: string?,
		SubColor: Color3?,
		Color: Color3,
		Locked: boolean?,
		Order: number?,
		Ribbon: string?,
	}

	local function card(parent: Instance, o: CardOpts): Frame
		local frame = UI.new("Frame", {
			Name = "Card",
			BackgroundColor3 = UI.Colors.Card,
			LayoutOrder = o.Order or 0,
			Parent = parent,
		})
		UI.corner(frame, 14)
		UI.stroke(frame, if o.Locked then rgb(70, 70, 84) else o.Color, 3, true)
		local art = UI.new("Frame", {
			Name = "Art",
			Size = UDim2.new(1, -12, 0, 78),
			Position = UDim2.fromOffset(6, 6),
			BackgroundColor3 = Color3.new(1, 1, 1),
			Parent = frame,
		})
		UI.corner(art, 10)
		local base = if o.Locked then rgb(60, 60, 70) else o.Color
		UI.gradient(art, { UI.darken(base, 0.1), UI.darken(base, 0.6) }, 90)
		UI.text(art, if o.Locked then "🔒" else o.Icon, {
			Name = "Icon",
			Size = UDim2.fromOffset(58, 58),
			Position = UDim2.fromScale(0.5, 0.5),
			AnchorPoint = Vector2.new(0.5, 0.5),
			Stroke = 0,
		})
		UI.text(frame, o.Name, {
			Name = "ItemName",
			Size = UDim2.new(1, -12, 0, 26),
			Position = UDim2.fromOffset(6, 88),
			Color = if o.Locked then UI.Colors.Muted else UI.Colors.Text,
			Stroke = 2,
		})
		if o.Sub then
			UI.text(frame, o.Sub, {
				Name = "Sub",
				Font = UI.Fonts.Body,
				Size = UDim2.new(1, -12, 0, 16),
				Position = UDim2.fromOffset(6, 115),
				Color = o.SubColor or UI.Colors.Muted,
				Stroke = 0,
				Rich = true,
			})
		end
		if o.Ribbon then
			local ribbon = UI.new("Frame", {
				Name = "Ribbon",
				Size = UDim2.fromOffset(74, 24),
				Position = UDim2.new(1, 4, 0, -6),
				AnchorPoint = Vector2.new(1, 0),
				BackgroundColor3 = UI.Colors.Red,
				Rotation = 8,
				ZIndex = 3,
				Parent = frame,
			})
			UI.corner(ribbon, 6)
			UI.text(
				ribbon,
				o.Ribbon,
				{ Size = UDim2.new(1, -6, 1, -4), Position = UDim2.fromOffset(3, 2), Stroke = 2, Z = 4 }
			)
		end
		return frame
	end

	local function cardButton(frame: Frame, text: string, color: Color3, onClick: (() -> ())?): TextButton
		local b = UI.button(frame, text, color, {
			Name = "Action",
			Size = UDim2.new(1, -16, 0, 36),
			Position = UDim2.new(0, 8, 1, -8),
			AnchorPoint = Vector2.new(0, 1),
			Radius = 10,
		})
		if onClick then
			b.Activated:Connect(function()
				if not busy then
					onClick()
				end
			end)
		else
			b.Active = false
		end
		return b
	end

	local function act(action: string, arg: any): Result
		busy = true
		local result = deps.request(action, arg)
		busy = false
		if result.msg then
			deps.toast(result.msg, if result.ok then "Good" else "Bad")
		end
		return result
	end

	local function tabs(names: { string }, current: string, onPick: (string) -> ())
		local row = UI.new("Frame", {
			Name = "Tabs",
			BackgroundTransparency = 1,
			Size = UDim2.new(1, 0, 0, 44),
			Parent = body,
		})
		UI.list(row, true, 10)
		for i, name in names do
			local selected = name == current
			local b = UI.button(row, string.upper(name), if selected then UI.Colors.Gold else rgb(70, 70, 90), {
				Name = name,
				Size = UDim2.fromOffset(150, 40),
				Order = i,
				Radius = 10,
			})
			b.Activated:Connect(function()
				onPick(name)
			end)
		end
	end

	local function percent(weight: number, total: number): string
		local pct = weight / total * 100
		if pct >= 10 then
			return string.format("%d%%", math.floor(pct + 0.5))
		elseif pct >= 1 then
			return string.format("%.1f%%", pct)
		end
		return string.format("%.2f%%", pct)
	end

	-- STYLES / AWAKEN --------------------------------------------------------------

	local function rollPanel(what: "Style" | "Awakening")
		local profile = deps.profile()
		if not profile then
			return
		end
		local list: { Config.StyleDef } = if what == "Style" then Config.Styles else Config.Awakenings
		local kind = if what == "Style" then "Styles" else "Awakenings"
		local owned = profile.Owned[kind]
		local equippedId = profile.Equipped[if what == "Style" then "Style" else "Awakening"]
		local weights = Util.rarityWeights(list)
		local total = 0
		for _, w in weights do
			total += w
		end

		-- Left: the equipped one and the ROLL button.
		local left = UI.new("Frame", {
			Name = "Feature",
			Size = UDim2.new(0, 290, 1, 0),
			BackgroundColor3 = UI.Colors.PanelLight,
			Parent = body,
		})
		UI.corner(left, 16)
		local featureStroke = UI.stroke(left, UI.Colors.Gold, 3, true)
		local art = UI.new("Frame", {
			Name = "Art",
			Size = UDim2.new(1, -24, 0, 170),
			Position = UDim2.fromOffset(12, 12),
			BackgroundColor3 = Color3.new(1, 1, 1),
			Parent = left,
		})
		UI.corner(art, 12)
		local artGradient = UI.gradient(art, { rgb(80, 80, 90), rgb(20, 20, 26) }, 90)
		local icon = UI.text(
			art,
			"",
			{
				Name = "Icon",
				Size = UDim2.fromOffset(120, 120),
				Position = UDim2.fromScale(0.5, 0.5),
				AnchorPoint = Vector2.new(0.5, 0.5),
				Stroke = 0,
			}
		)
		local nameLabel = UI.text(
			left,
			"",
			{ Name = "ItemName", Size = UDim2.new(1, -24, 0, 44), Position = UDim2.fromOffset(12, 188), Stroke = 3 }
		)
		local rarityLabel = UI.text(
			left,
			"",
			{
				Name = "Rarity",
				Font = UI.Fonts.Heavy,
				Size = UDim2.new(1, -24, 0, 20),
				Position = UDim2.fromOffset(12, 232),
				Stroke = 0,
			}
		)
		local blurb = UI.text(left, "", {
			Name = "Blurb",
			Font = UI.Fonts.Body,
			Size = UDim2.new(1, -30, 0, 58),
			Position = UDim2.fromOffset(15, 258),
			Wrapped = true,
			MaxSize = 17,
			Color = UI.Colors.Muted,
			Stroke = 0,
		})
		local function show(item: Config.StyleDef?)
			if not item then
				icon.Text = "❔"
				nameLabel.Text = "NONE YET"
				nameLabel.TextColor3 = UI.Colors.Muted
				rarityLabel.Text = "ROLL TO UNLOCK ONE"
				rarityLabel.TextColor3 = UI.Colors.Muted
				blurb.Text = "Use a Spin to roll a random " .. string.lower(what) .. "."
				return
			end
			local r = Util.rarity(item.Rarity)
			icon.Text = item.Icon
			nameLabel.Text = string.upper(item.Name)
			nameLabel.TextColor3 = item.Color
			rarityLabel.Text = string.upper(item.Rarity)
			rarityLabel.TextColor3 = r.Color
			blurb.Text = item.Blurb
			featureStroke.Color = r.Color
			artGradient.Color = ColorSequence.new(UI.darken(item.Color, 0.15), UI.darken(item.Color, 0.75))
		end
		local caption = UI.text(left, if lastRoll[what] then "YOU ROLLED" else "EQUIPPED", {
			Name = "Caption",
			Font = UI.Fonts.Heavy,
			Color = UI.Colors.Muted,
			Size = UDim2.new(1, -24, 0, 16),
			Position = UDim2.fromOffset(12, 186),
			Stroke = 0,
		})
		nameLabel.Position = UDim2.fromOffset(12, 200)
		rarityLabel.Position = UDim2.fromOffset(12, 242)
		blurb.Position = UDim2.fromOffset(15, 266)
		show(Util.find(list, lastRoll[what] or equippedId))
		UI.text(left, `🎟️ {profile.Spins} SPIN{if profile.Spins == 1 then "" else "S"} LEFT`, {
			Name = "SpinsLeft",
			Font = UI.Fonts.Heavy,
			Color = UI.Colors.Gold,
			Size = UDim2.new(1, -24, 0, 20),
			Position = UDim2.new(0, 12, 1, -86),
			Stroke = 0,
		})
		local roll = UI.button(left, "🎲 ROLL (1 SPIN)", rgb(150, 70, 245), {
			Name = "Roll",
			Size = UDim2.new(1, -24, 0, 56),
			Position = UDim2.new(0, 12, 1, -12),
			AnchorPoint = Vector2.new(0, 1),
		})
		roll.Activated:Connect(function()
			if busy then
				return
			end
			busy = true
			deps.hold(true)
			local result = deps.request("Roll", what)
			if not result.ok then
				busy = false
				deps.hold(false)
				deps.toast(result.msg or "Couldn't roll.", "Bad")
				return
			end
			local target = Util.find(list, result.id)
			-- Slot-machine spin that slows down and lands on the result.
			for i = 1, 20 do
				if not left.Parent then
					break
				end
				show(list[math.random(1, #list)])
				task.wait(0.03 + i * 0.011)
			end
			if left.Parent then
				show(target)
				local pop = UI.new("UIScale", { Scale = 1.25, Parent = art })
				UI.tween(pop, 0.4, { Scale = 1 }, Enum.EasingStyle.Back)
			end
			if target then
				lastRoll[what] = target.Id
				caption.Text = "YOU ROLLED"
				if result.new then
					rarityLabel.Text = `NEW {string.upper(target.Rarity)}!`
					deps.toast(`You unlocked {target.Name} ({target.Rarity})! Press EQUIP to use it.`, "Good")
				else
					deps.toast(`Already had {target.Name}: +${Util.comma(result.refund or 0)} back.`, "Reward")
				end
			end
			task.wait(0.6)
			busy = false
			deps.hold(false)
		end)

		-- Right: everything you can roll.
		local scroller = grid(body, Vector2.new(160, 190), UDim2.fromOffset(306, 0), UDim2.new(1, -306, 1, 0))
		for i, item in list do
			local isOwned = owned[item.Id] == true
			local r = Util.rarity(item.Rarity)
			local frame = card(scroller, {
				Icon = item.Icon,
				Name = if isOwned then item.Name else "???",
				Sub = `{string.upper(item.Rarity)} • {percent(weights[i], total)}`,
				SubColor = r.Color,
				Color = r.Color,
				Locked = not isOwned,
				Order = i,
			})
			if not isOwned then
				cardButton(frame, "LOCKED", rgb(60, 60, 72), nil)
			elseif equippedId == item.Id then
				cardButton(frame, "EQUIPPED", rgb(60, 60, 72), nil)
			else
				cardButton(frame, "EQUIP", UI.Colors.Green, function()
					act("Equip", { Kind = what, Id = item.Id })
				end)
			end
		end
	end

	-- LOCKER -------------------------------------------------------------------------

	local function lockerPanel()
		local profile = deps.profile()
		if not profile then
			return
		end
		local current = tab.Locker
		tabs({ "Auras", "Titles" }, current, function(name)
			tab.Locker = name
			self.refresh()
		end)
		local scroller = grid(body, Vector2.new(160, 190), UDim2.fromOffset(0, 54), UDim2.new(1, 0, 1, -54))
		if current == "Auras" then
			local wearing = profile.Equipped.Aura
			local none = card(
				scroller,
				{ Icon = "🚫", Name = "No Aura", Sub = "Plain and simple", Color = rgb(120, 120, 135), Order = 0 }
			)
			if wearing == "" then
				cardButton(none, "EQUIPPED", rgb(60, 60, 72), nil)
			else
				cardButton(none, "TAKE OFF", rgb(90, 90, 110), function()
					act("Equip", { Kind = "Aura", Id = "" })
				end)
			end
			for i, aura in Config.Auras do
				local isOwned = profile.Owned.Auras[aura.Id] == true
				local r = Util.rarity(aura.Rarity)
				local frame = card(scroller, {
					Icon = aura.Icon,
					Name = aura.Name,
					Sub = string.upper(aura.Rarity),
					SubColor = r.Color,
					Color = aura.Color,
					Locked = not isOwned,
					Order = i,
				})
				if isOwned then
					if wearing == aura.Id then
						cardButton(frame, "EQUIPPED", rgb(60, 60, 72), nil)
					else
						cardButton(frame, "EQUIP", UI.Colors.Green, function()
							act("Equip", { Kind = "Aura", Id = aura.Id })
						end)
					end
				elseif aura.Price then
					cardButton(frame, "IN SHOP", UI.Colors.Red, function()
						self.open("Shop", "Aura:" .. aura.Id)
					end)
				else
					cardButton(frame, "WHEEL PRIZE", UI.Colors.Pink, nil)
				end
			end
		else
			local wearing = profile.Equipped.Title
			for i, title in Config.Titles do
				local isOwned = profile.Owned.Titles[title.Id] == true
				local r = Util.rarity(title.Rarity)
				local frame = card(scroller, {
					Icon = "🏷️",
					Name = title.Name,
					Sub = string.upper(title.Rarity),
					SubColor = r.Color,
					Color = title.Color,
					Locked = not isOwned,
					Order = i,
				})
				if isOwned then
					if wearing == title.Id then
						cardButton(frame, "EQUIPPED", rgb(60, 60, 72), nil)
					else
						cardButton(frame, "EQUIP", UI.Colors.Green, function()
							act("Equip", { Kind = "Title", Id = title.Id })
						end)
					end
				elseif title.Price then
					cardButton(frame, "IN SHOP", UI.Colors.Red, function()
						self.open("Shop", "Title:" .. title.Id)
					end)
				elseif title.UnlockLevel then
					cardButton(frame, `LEVEL {title.UnlockLevel}`, rgb(70, 70, 90), nil)
				else
					cardButton(frame, "SPECIAL", UI.Colors.Pink, nil)
				end
			end
		end
	end

	-- SHOP -----------------------------------------------------------------------------

	local function buyButton(frame: Frame, kind: string, id: string, price: number, owned: boolean, cash: number)
		if owned then
			cardButton(frame, "OWNED", rgb(60, 60, 72), nil)
			return
		end
		local affordable = cash >= price
		cardButton(
			frame,
			"$" .. Util.comma(price),
			if affordable then UI.Colors.Green else rgb(110, 110, 125),
			function()
				act("Buy", { Kind = kind, Id = id })
			end
		)
	end

	local function shopPanel()
		local profile = deps.profile()
		if not profile then
			return
		end
		local focus = focusArg
		focusArg = nil
		if focus then
			if focus == "Deal" then
				tab.Shop = "Deals"
			elseif string.sub(focus, 1, 5) == "Aura:" then
				tab.Shop = "Auras"
			elseif string.sub(focus, 1, 6) == "Title:" then
				tab.Shop = "Titles"
			end
		end
		local current = tab.Shop
		tabs({ "Deals", "Auras", "Titles", "Spins" }, current, function(name)
			tab.Shop = name
			self.refresh()
		end)
		local now = Workspace:GetServerTimeNow()
		local cash = profile.Cash
		local note = UI.text(body, "💰 CASH ONLY: NO ROBUX, NO GAMEPASSES. EVERYTHING IS EARNED BY PLAYING.", {
			Name = "Note",
			Font = UI.Fonts.Heavy,
			Color = rgb(130, 255, 150),
			Size = UDim2.new(1, 0, 0, 18),
			Position = UDim2.fromOffset(0, 50),
			Stroke = 0,
		})
		note.TextXAlignment = Enum.TextXAlignment.Left
		local scroller = grid(body, Vector2.new(160, 190), UDim2.fromOffset(0, 76), UDim2.new(1, 0, 1, -76))
		local deal = Util.dealOfTheDay(now)

		local function auraCard(aura: Config.AuraDef, order: number)
			local price = Util.price("Aura", aura.Id, now)
			if not price then
				return
			end
			local onSale = deal ~= nil and deal.Kind == "Aura" and deal.Id == aura.Id
			local r = Util.rarity(aura.Rarity)
			local frame = card(scroller, {
				Icon = aura.Icon,
				Name = aura.Name,
				Sub = if onSale
					then `<s>${Util.comma(aura.Price :: number)}</s> {string.upper(aura.Rarity)}`
					else string.upper(aura.Rarity),
				SubColor = r.Color,
				Color = aura.Color,
				Order = order,
				Ribbon = if onSale then `-{math.floor(Config.DailyDealDiscount * 100)}%` else nil,
			})
			buyButton(frame, "Aura", aura.Id, price, profile.Owned.Auras[aura.Id] == true, cash)
		end
		local function titleCard(title: Config.TitleDef, order: number)
			local price = Util.price("Title", title.Id, now)
			if not price then
				return
			end
			local onSale = deal ~= nil and deal.Kind == "Title" and deal.Id == title.Id
			local r = Util.rarity(title.Rarity)
			local frame = card(scroller, {
				Icon = "🏷️",
				Name = title.Name,
				Sub = if onSale
					then `<s>${Util.comma(title.Price :: number)}</s> TITLE`
					else string.upper(title.Rarity) .. " TITLE",
				SubColor = r.Color,
				Color = title.Color,
				Order = order,
				Ribbon = if onSale then `-{math.floor(Config.DailyDealDiscount * 100)}%` else nil,
			})
			buyButton(frame, "Title", title.Id, price, profile.Owned.Titles[title.Id] == true, cash)
		end

		if current == "Deals" then
			if deal and deal.Kind == "Aura" then
				local aura = Util.find(Config.Auras, deal.Id)
				if aura then
					auraCard(aura, 1)
				end
			elseif deal then
				local title = Util.find(Config.Titles, deal.Id)
				if title then
					titleCard(title, 1)
				end
			end
			local secondsLeft = 86400 - (now % 86400)
			local info = card(scroller, {
				Icon = "⏰",
				Name = "New deal in",
				Sub = Util.duration(secondsLeft),
				SubColor = UI.Colors.Gold,
				Color = rgb(90, 90, 110),
				Order = 2,
			})
			cardButton(info, "COME BACK!", rgb(70, 70, 90), nil)
			for i, bundle in Config.Bundles do
				if i <= 2 then
					local frame = card(
						scroller,
						{
							Icon = bundle.Icon,
							Name = bundle.Name,
							Sub = "ROLL STYLES",
							Color = bundle.Color,
							Order = 2 + i,
						}
					)
					buyButton(frame, "Bundle", bundle.Id, bundle.Price, false, cash)
				end
			end
		elseif current == "Auras" then
			for i, aura in Config.Auras do
				auraCard(aura, i)
			end
		elseif current == "Titles" then
			for i, title in Config.Titles do
				titleCard(title, i)
			end
		else
			for i, bundle in Config.Bundles do
				local frame = card(scroller, {
					Icon = bundle.Icon,
					Name = bundle.Name,
					Sub = if bundle.Kind == "Spins" then "FOR STYLES + AWAKEN" else "FOR THE LUCKY WHEEL",
					Color = bundle.Color,
					Order = i,
				})
				buyButton(frame, "Bundle", bundle.Id, bundle.Price, false, cash)
			end
		end
	end

	-- STATS --------------------------------------------------------------------------

	local function statsPanel()
		local profile = deps.profile()
		if not profile then
			return
		end
		local s = profile.Stats
		local matches = math.max(1, s.Matches)
		local style = Util.find(Config.Styles, profile.Equipped.Style)
		local awakening = Util.find(Config.Awakenings, profile.Equipped.Awakening)
		local title = Util.find(Config.Titles, profile.Equipped.Title)
		local rows = {
			{ "⭐", "Level", `{profile.Level}  ({Util.comma(profile.XP)} / {Util.comma(profile.XPNeeded)} XP)` },
			{ "💵", "Cash", "$" .. Util.comma(profile.Cash) },
			{ "👊", "Knockouts", Util.comma(s.KOs) },
			{ "🏆", "Wins", Util.comma(s.Wins) },
			{ "⚔️", "Matches", Util.comma(s.Matches) },
			{ "💀", "Times knocked out", Util.comma(s.Deaths) },
			{ "📈", "Win rate", string.format("%d%%", math.floor(s.Wins / matches * 100 + 0.5)) },
			{ "⏱️", "Time played", Util.duration(s.PlayTime) },
			{ "🥊", "Style", if style then style.Name else "-" },
			{ "⚡", "Awakening", if awakening then awakening.Name else "None yet" },
			{ "🏷️", "Title", if title then title.Name else "-" },
			{ "🎟️", "Spins / Lucky Spins", `{profile.Spins} / {profile.LuckySpins}` },
		}
		local scroller = UI.new("ScrollingFrame", {
			Name = "List",
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			Size = UDim2.fromScale(1, 1),
			CanvasSize = UDim2.new(),
			AutomaticCanvasSize = Enum.AutomaticSize.Y,
			ScrollBarThickness = 8,
			Parent = body,
		})
		UI.new("UIGridLayout", {
			CellSize = UDim2.new(0.5, -8, 0, 64),
			CellPadding = UDim2.fromOffset(12, 10),
			SortOrder = Enum.SortOrder.LayoutOrder,
			Parent = scroller,
		})
		for i, row in rows do
			local frame =
				UI.new("Frame", { Name = "Row", BackgroundColor3 = UI.Colors.Card, LayoutOrder = i, Parent = scroller })
			UI.corner(frame, 12)
			UI.stroke(frame, rgb(60, 60, 78), 2, true)
			UI.text(
				frame,
				row[1],
				{
					Size = UDim2.fromOffset(44, 44),
					Position = UDim2.new(0, 10, 0.5, 0),
					AnchorPoint = Vector2.new(0, 0.5),
					Stroke = 0,
				}
			)
			UI.text(frame, row[2], {
				Font = UI.Fonts.Body,
				Color = UI.Colors.Muted,
				Size = UDim2.new(1, -70, 0, 18),
				Position = UDim2.fromOffset(62, 8),
				Align = Enum.TextXAlignment.Left,
				Stroke = 0,
			})
			UI.text(frame, row[3], {
				Name = "Value",
				Size = UDim2.new(1, -70, 0, 30),
				Position = UDim2.fromOffset(62, 27),
				Align = Enum.TextXAlignment.Left,
				Stroke = 2,
			})
		end
	end

	-- CODES --------------------------------------------------------------------------

	local function codesPanel()
		UI.text(body, "Got a code? Type it here!", {
			Size = UDim2.new(1, 0, 0, 44),
			Position = UDim2.fromOffset(0, 40),
			Stroke = 3,
		})
		local boxFrame = UI.new("Frame", {
			Name = "BoxFrame",
			Size = UDim2.new(0.8, 0, 0, 70),
			Position = UDim2.new(0.5, 0, 0, 120),
			AnchorPoint = Vector2.new(0.5, 0),
			BackgroundColor3 = UI.Colors.Card,
			Parent = body,
		})
		UI.corner(boxFrame, 14)
		UI.stroke(boxFrame, ACCENTS.Codes, 3, true)
		local box = UI.new("TextBox", {
			Name = "CodeBox",
			BackgroundTransparency = 1,
			Size = UDim2.new(1, -30, 1, -16),
			Position = UDim2.fromOffset(15, 8),
			Text = "",
			PlaceholderText = "ENTER CODE",
			PlaceholderColor3 = rgb(120, 120, 140),
			TextColor3 = UI.Colors.Text,
			FontFace = UI.Fonts.Title,
			TextScaled = true,
			ClearTextOnFocus = false,
			Parent = boxFrame,
		})
		local redeem = UI.button(body, "REDEEM", ACCENTS.Codes, {
			Name = "Redeem",
			Size = UDim2.fromOffset(260, 64),
			Position = UDim2.new(0.5, 0, 0, 214),
			AnchorPoint = Vector2.new(0.5, 0),
		})
		local message = UI.text(body, "Codes are shared on the game's page and group.", {
			Name = "Message",
			Font = UI.Fonts.Body,
			Color = UI.Colors.Muted,
			Size = UDim2.new(0.9, 0, 0, 24),
			Position = UDim2.new(0.5, 0, 0, 300),
			AnchorPoint = Vector2.new(0.5, 0),
			Stroke = 0,
		})
		local function submit()
			if busy or box.Text == "" then
				return
			end
			busy = true
			local result = deps.request("Redeem", box.Text)
			busy = false
			message.Text = result.msg or ""
			message.TextColor3 = if result.ok then UI.Colors.Green else UI.Colors.Red
			if result.ok then
				box.Text = ""
				deps.toast(result.msg or "Code redeemed!", "Good")
			end
		end
		redeem.Activated:Connect(submit)
		box.FocusLost:Connect(function(enterPressed)
			if enterPressed then
				submit()
			end
		end)
	end

	-- EXTRA ----------------------------------------------------------------------------

	local function extraPanel()
		local options: { { any } } = {
			{ "🥊 TRAINING GROUNDS", "Practice on dummies away from the crowd.", "Train", UI.Colors.Orange },
			{ "🏠 BACK TO LOBBY", "Teleport back to the middle of the hub.", "Lobby", UI.Colors.Blue },
			{ "⚔️ JOIN / LEAVE QUEUE", "Same as the PLAY button.", "Queue", UI.Colors.Green },
		}
		for i, o in options do
			local b = UI.button(body, o[1], o[4], {
				Name = o[3],
				Size = UDim2.new(1, -40, 0, 84),
				Position = UDim2.new(0.5, 0, 0, 30 + (i - 1) * 110),
				AnchorPoint = Vector2.new(0.5, 0),
			})
			UI.text(body, o[2], {
				Font = UI.Fonts.Body,
				Color = UI.Colors.Muted,
				Size = UDim2.new(1, -40, 0, 18),
				Position = UDim2.new(0.5, 0, 0, 116 + (i - 1) * 110),
				AnchorPoint = Vector2.new(0.5, 0),
				Stroke = 0,
			})
			b.Activated:Connect(function()
				if busy then
					return
				end
				local result = act(o[3], nil)
				if result.ok and o[3] ~= "Queue" then
					self.close()
				end
			end)
		end
	end

	------------------------------------------------------------------------------------

	local builders: { [string]: () -> () } = {
		Styles = function()
			rollPanel("Style")
		end,
		Awaken = function()
			rollPanel("Awakening")
		end,
		Locker = lockerPanel,
		Shop = shopPanel,
		Stats = statsPanel,
		Codes = codesPanel,
		Extra = extraPanel,
	}

	function self.refresh()
		local name = openName
		if not name or busy then
			return
		end
		-- The codes box would lose what you typed, so leave that one alone.
		if name == "Codes" and #body:GetChildren() > 0 then
			return
		end
		clear()
		local build = builders[name]
		if build then
			build()
		end
	end

	function self.open(name, focus)
		if not builders[name] then
			return
		end
		if busy then
			return
		end
		local accent = ACCENTS[name] or UI.Colors.Gold
		openName = name
		focusArg = focus
		titleLabel.Text = TITLES[name] or name
		windowStroke.Color = accent
		headerGradient.Color = ColorSequence.new(accent, UI.darken(accent, 0.35))
		footGradient.Color = ColorSequence.new(UI.darken(accent, 0.3), UI.darken(accent, 0.35))
		clear()
		builders[name]()
		if not gui.Enabled then
			gui.Enabled = true
			windowScale.Scale = fitScale * 0.7
			UI.tween(windowScale, 0.25, { Scale = fitScale }, Enum.EasingStyle.Back)
		end
	end

	function self.close()
		if busy then
			return
		end
		openName = nil
		gui.Enabled = false
		clear()
	end

	function self.current()
		return openName
	end

	function self.setScale(scale)
		fitScale = scale
		windowScale.Scale = scale
	end

	close.Activated:Connect(self.close)
	backdrop.Activated:Connect(self.close)

	self.Gui = gui
	return self
end

return Panels
