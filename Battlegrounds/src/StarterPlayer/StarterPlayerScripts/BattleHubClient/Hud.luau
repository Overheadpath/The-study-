--!strict
-- The always-on screen UI: level + XP, cash, spins, match status, Invite
-- Friends, and the row of hexagon buttons along the bottom.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Util = require(Shared:WaitForChild("Util"))
local UI = require(script.Parent:WaitForChild("UI"))

local rgb = Color3.fromRGB

export type Hud = {
	Gui: ScreenGui,
	Top: Frame,
	Bottom: Frame,
	Buttons: { [string]: UI.HexButton },
	Extra: TextButton,
	Invite: TextButton,
	setProfile: (profile: { [string]: any }) -> (),
	setStatus: (status: string, detail: string) -> (),
	setPlay: (mode: string) -> (), -- "Play", "Queued" or "InMatch"
	bump: (which: "Cash" | "Level" | "Spins") -> (),
}

local Hud = {}

local BUTTONS: { { any } } = {
	{ "Styles", "🥊", "STYLES", rgb(242, 193, 46) },
	{ "Awaken", "⚡", "AWAKEN", rgb(232, 63, 210) },
	{ "Locker", "🎒", "LOCKER", rgb(242, 138, 46) },
	{ "Play", "▶", "PLAY", rgb(60, 203, 60) },
	{ "Shop", "🛒", "SHOP", rgb(232, 50, 60) },
	{ "Stats", "📊", "STATS", rgb(46, 139, 242) },
	{ "Codes", "🎁", "CODES", rgb(155, 77, 242) },
}

local function badge(parent: Instance, name: string, x: number, frameColor: Color3, inner: { Color3 }): (Frame, Frame)
	local outer = UI.new("Frame", {
		Name = name,
		Size = UDim2.fromOffset(290, 78),
		Position = UDim2.new(0.5, x, 0, 8),
		AnchorPoint = Vector2.new(0.5, 0),
		BackgroundColor3 = frameColor,
		Parent = parent,
	})
	UI.corner(outer, 14)
	UI.stroke(outer, UI.darken(frameColor, 0.7), 3, true)
	UI.gradient(outer, { UI.lighten(frameColor, 0.25), frameColor, UI.darken(frameColor, 0.25) }, 90)
	local fill = UI.new("Frame", {
		Name = "Inner",
		Size = UDim2.new(1, -12, 1, -12),
		Position = UDim2.fromOffset(6, 6),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = outer,
	})
	UI.corner(fill, 10)
	UI.gradient(fill, inner, 90)
	return outer, fill
end

function Hud.new(playerGui: PlayerGui): Hud
	local gui = UI.new("ScreenGui", {
		Name = "BattleHubHud",
		ResetOnSpawn = false,
		IgnoreGuiInset = true,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = 5,
		Parent = playerGui,
	})

	-- Top bar -------------------------------------------------------------------
	local top = UI.new("Frame", {
		Name = "Top",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(1240, 170),
		Position = UDim2.new(0.5, 0, 0, 6),
		AnchorPoint = Vector2.new(0.5, 0),
		Parent = gui,
	})
	UI.new("UIScale", { Parent = top })

	local levelBadge, levelFill = badge(top, "Level", -175, rgb(255, 196, 48), { rgb(92, 60, 12), rgb(48, 30, 6) })
	UI.text(levelBadge, "⭐", {
		Name = "Star",
		Size = UDim2.fromOffset(74, 74),
		Position = UDim2.new(0, -18, 0.5, 0),
		AnchorPoint = Vector2.new(0, 0.5),
		Stroke = 0,
		Z = 3,
	})
	local levelText = UI.text(levelFill, "Level 1", {
		Name = "Value",
		Size = UDim2.new(1, -80, 0, 38),
		Position = UDim2.fromOffset(64, 4),
		Align = Enum.TextXAlignment.Left,
		Stroke = 3,
	})
	local xpBack = UI.new("Frame", {
		Name = "XPBar",
		Size = UDim2.new(1, -86, 0, 13),
		Position = UDim2.fromOffset(66, 46),
		BackgroundColor3 = rgb(24, 16, 4),
		Parent = levelFill,
	})
	UI.corner(xpBack, 6)
	local xpFill = UI.new("Frame", {
		Name = "Fill",
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = xpBack,
	})
	UI.corner(xpFill, 6)
	UI.gradient(xpFill, { rgb(255, 236, 130), rgb(255, 176, 20) }, 90)

	local cashBadge, cashFill = badge(top, "Cash", 175, rgb(96, 226, 64), { rgb(24, 86, 28), rgb(10, 44, 14) })
	local cashText = UI.text(cashFill, "$0", {
		Name = "Value",
		Size = UDim2.new(1, -86, 0, 50),
		Position = UDim2.new(0, 14, 0.5, 0),
		AnchorPoint = Vector2.new(0, 0.5),
		Align = Enum.TextXAlignment.Right,
		Stroke = 3,
	})
	UI.text(cashBadge, "$", {
		Name = "Symbol",
		Font = UI.Fonts.Title,
		Color = rgb(120, 255, 90),
		Size = UDim2.fromOffset(70, 80),
		Position = UDim2.new(1, 16, 0.5, 0),
		AnchorPoint = Vector2.new(1, 0.5),
		Stroke = 4,
		StrokeColor = rgb(10, 50, 10),
		Z = 3,
	})

	-- Spin counters under the cash (like the reference's tag under the cash).
	local pills = UI.new("Frame", {
		Name = "Pills",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(246, 30),
		Position = UDim2.new(0.5, 224, 0, 90),
		AnchorPoint = Vector2.new(0.5, 0),
		Parent = top,
	})
	UI.list(pills, true, 8, true)
	local function pill(name: string, color: Color3): TextLabel
		local frame =
			UI.new("Frame", { Name = name, Size = UDim2.fromOffset(119, 30), BackgroundColor3 = color, Parent = pills })
		UI.corner(frame, 8)
		UI.stroke(frame, UI.darken(color, 0.6), 2, true)
		UI.gradient(frame, { UI.lighten(color, 0.2), UI.darken(color, 0.15) }, 90)
		return UI.text(
			frame,
			"",
			{ Name = "Value", Size = UDim2.new(1, -10, 1, -6), Position = UDim2.fromOffset(5, 3), Stroke = 2 }
		)
	end
	local spinsText = pill("Spins", rgb(150, 70, 245))
	local luckyText = pill("Lucky", rgb(235, 60, 160))

	-- Match status tab between the two badges.
	local status = UI.new("Frame", {
		Name = "Status",
		Size = UDim2.fromOffset(186, 58),
		Position = UDim2.new(0.5, 0, 0, 92),
		AnchorPoint = Vector2.new(0.5, 0),
		BackgroundColor3 = rgb(12, 12, 16),
		BackgroundTransparency = 0.1,
		Parent = top,
	})
	UI.corner(status, 10)
	UI.stroke(status, rgb(60, 60, 70), 2, true)
	local statusText = UI.text(status, "INTERMISSION", {
		Name = "Status",
		Font = UI.Fonts.Heavy,
		Size = UDim2.new(1, -14, 0, 26),
		Position = UDim2.fromOffset(7, 5),
		Stroke = 0,
	})
	local detailText = UI.text(status, "", {
		Name = "Detail",
		Font = UI.Fonts.Body,
		Color = UI.Colors.Gold,
		Size = UDim2.new(1, -14, 0, 18),
		Position = UDim2.fromOffset(7, 34),
		Stroke = 0,
	})

	local invite = UI.button(top, "INVITE FRIENDS", rgb(40, 125, 235), {
		Name = "Invite",
		Size = UDim2.fromOffset(230, 58),
		Position = UDim2.new(0.5, 520, 0, 16),
		AnchorPoint = Vector2.new(0.5, 0),
	})
	local inviteStroke = invite:FindFirstChildOfClass("UIStroke")
	if inviteStroke then
		inviteStroke.Color = rgb(150, 205, 255)
	end

	-- Bottom buttons --------------------------------------------------------------
	local bottom = UI.new("Frame", {
		Name = "Bottom",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(1000, 190),
		Position = UDim2.new(0.5, 0, 1, -10),
		AnchorPoint = Vector2.new(0.5, 1),
		Parent = gui,
	})
	UI.new("UIScale", { Parent = bottom })
	local buttons: { [string]: UI.HexButton } = {}
	for i, def in BUTTONS do
		local isPlay = def[1] == "Play"
		local height = if isPlay then 138 else 112
		local b = UI.hexButton(bottom, def[1], def[2], def[3], def[4], height)
		local x = (i - 4) * 136
		b.Root.AnchorPoint = Vector2.new(0.5, 1)
		b.Root.Position = UDim2.new(0.5, x, 1, if isPlay then -44 else -12)
		buttons[def[1]] = b
	end
	local extra = UI.button(bottom, "EXTRA", rgb(60, 190, 60), {
		Name = "Extra",
		Size = UDim2.fromOffset(104, 36),
		Position = UDim2.new(0.5, 0, 1, -6),
		AnchorPoint = Vector2.new(0.5, 1),
		Radius = 8,
	})

	local self = {} :: Hud
	self.Gui = gui
	self.Top = top
	self.Bottom = bottom
	self.Buttons = buttons
	self.Extra = extra
	self.Invite = invite

	function self.setProfile(p)
		levelText.Text = "Level " .. tostring(p.Level)
		local ratio = if p.XPNeeded > 0 then math.clamp(p.XP / p.XPNeeded, 0, 1) else 0
		UI.tween(xpFill, 0.35, { Size = UDim2.fromScale(ratio, 1) })
		cashText.Text = "$" .. Util.comma(p.Cash)
		spinsText.Text = `🎟️ {p.Spins} SPIN{if p.Spins == 1 then "" else "S"}`
		luckyText.Text = `🎡 {p.LuckySpins} LUCKY`
	end

	function self.setStatus(statusValue, detail)
		statusText.Text = statusValue
		detailText.Text = detail
	end

	function self.setPlay(mode)
		local b = buttons.Play
		if mode == "Queued" then
			b.Label.Text = "QUEUED ✓"
			UI.paintHex(b.Rim, rgb(250, 210, 60))
		elseif mode == "InMatch" then
			b.Label.Text = "IN MATCH"
			UI.paintHex(b.Rim, rgb(230, 60, 60))
		else
			b.Label.Text = "PLAY"
			UI.paintHex(b.Rim, b.Color)
		end
	end

	function self.bump(which)
		local target: GuiObject = if which == "Cash" then cashBadge elseif which == "Level" then levelBadge else pills
		local scale = target:FindFirstChildOfClass("UIScale") or UI.new("UIScale", { Parent = target })
		scale.Scale = 1.12
		UI.tween(scale, 0.35, { Scale = 1 }, Enum.EasingStyle.Back)
	end

	return self
end

return Hud
