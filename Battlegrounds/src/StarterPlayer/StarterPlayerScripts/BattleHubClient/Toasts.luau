--!strict
-- Pop-up messages: small toasts under the top bar and a big LEVEL UP splash.

local UI = require(script.Parent:WaitForChild("UI"))

local rgb = Color3.fromRGB

export type Toasts = {
	Gui: ScreenGui,
	setScale: (scale: number) -> (),
	show: (text: string, kind: string?) -> (),
	levelUp: (text: string) -> (),
	big: (title: string, subtitle: string, color: Color3) -> (),
}

local KIND_COLORS: { [string]: Color3 } = {
	Info = rgb(40, 42, 56),
	Good = rgb(40, 150, 70),
	Bad = rgb(180, 40, 50),
	Reward = rgb(200, 140, 20),
	LevelUp = rgb(200, 140, 20),
}

local KIND_ICONS: { [string]: string } = {
	Info = "💬",
	Good = "✅",
	Bad = "⚠️",
	Reward = "💰",
	LevelUp = "⭐",
}

local Toasts = {}

function Toasts.new(playerGui: PlayerGui): Toasts
	local gui = UI.new("ScreenGui", {
		Name = "BattleHubToasts",
		ResetOnSpawn = false,
		IgnoreGuiInset = true,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = 20,
		Parent = playerGui,
	})
	local stack = UI.new("Frame", {
		Name = "Stack",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(440, 420),
		Position = UDim2.new(1, -20, 0, 104),
		AnchorPoint = Vector2.new(1, 0),
		Parent = gui,
	})
	local stackScale = UI.new("UIScale", { Parent = stack })
	local layout = UI.list(stack, false, 6)
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Right

	local splash = UI.new("Frame", {
		Name = "Splash",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(700, 200),
		Position = UDim2.fromScale(0.5, 0.38),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Visible = false,
		Parent = gui,
	})
	local splashScale = UI.new("UIScale", { Parent = splash })
	local splashTitle = UI.text(splash, "LEVEL UP!", {
		Name = "Title",
		Size = UDim2.new(1, 0, 0.62, 0),
		Color = rgb(255, 215, 60),
		Stroke = 5,
		StrokeColor = rgb(60, 30, 0),
	})
	UI.gradient(splashTitle, { rgb(255, 245, 170), rgb(255, 180, 20) }, 90)
	local splashSub = UI.text(splash, "", {
		Name = "Subtitle",
		Size = UDim2.new(1, 0, 0.3, 0),
		Position = UDim2.fromScale(0, 0.66),
		Font = UI.Fonts.Heavy,
		Stroke = 3,
	})

	local order = 0
	local fit = 1
	local self = {} :: Toasts
	self.Gui = gui

	function self.setScale(scale)
		fit = scale
		stackScale.Scale = scale
		stack.Position = UDim2.new(1, -20 * scale, 0, 104 * scale)
	end

	function self.show(text, kind)
		local k = kind or "Info"
		order += 1
		local frame = UI.new("Frame", {
			Name = "Toast",
			Size = UDim2.fromOffset(430, 46),
			BackgroundColor3 = KIND_COLORS[k] or KIND_COLORS.Info,
			BackgroundTransparency = 0.08,
			LayoutOrder = order,
			Parent = stack,
		})
		UI.corner(frame, 12)
		local stroke = UI.stroke(frame, UI.darken(KIND_COLORS[k] or KIND_COLORS.Info, 0.55), 2, true)
		local icon = UI.text(frame, KIND_ICONS[k] or "💬", {
			Name = "Icon",
			Size = UDim2.fromOffset(34, 34),
			Position = UDim2.new(0, 8, 0.5, 0),
			AnchorPoint = Vector2.new(0, 0.5),
			Stroke = 0,
		})
		local label = UI.text(frame, text, {
			Name = "Message",
			Font = UI.Fonts.Body,
			Size = UDim2.new(1, -60, 1, -10),
			Position = UDim2.fromOffset(50, 5),
			Align = Enum.TextXAlignment.Left,
			Wrapped = true,
			MaxSize = 19,
			Stroke = 1.5,
		})
		-- Long messages get a taller toast.
		if #text > 44 then
			frame.Size = UDim2.fromOffset(430, if #text > 90 then 84 else 64)
		end
		local count = 0
		for _, child in stack:GetChildren() do
			if child:IsA("Frame") then
				count += 1
			end
		end
		if count > 4 then
			local oldest: Frame? = nil
			for _, child in stack:GetChildren() do
				if child:IsA("Frame") and (oldest == nil or child.LayoutOrder < oldest.LayoutOrder) then
					oldest = child
				end
			end
			if oldest then
				oldest:Destroy()
			end
		end
		local scale = UI.new("UIScale", { Scale = 0.6, Parent = frame })
		UI.tween(scale, 0.25, { Scale = 1 }, Enum.EasingStyle.Back)
		task.delay(if k == "Bad" then 6 else 4, function()
			if frame.Parent then
				UI.tween(frame, 0.3, { BackgroundTransparency = 1 })
				UI.tween(label, 0.3, { TextTransparency = 1 })
				UI.tween(icon, 0.3, { TextTransparency = 1 })
				UI.tween(stroke, 0.3, { Transparency = 1 })
				for _, s in label:GetChildren() do
					if s:IsA("UIStroke") then
						UI.tween(s, 0.3, { Transparency = 1 })
					end
				end
				task.wait(0.3)
				frame:Destroy()
			end
		end)
	end

	local splashToken = 0
	function self.big(title, subtitle, color)
		splashToken += 1
		local token = splashToken
		splashTitle.Text = title
		splashTitle.TextColor3 = color
		splashSub.Text = subtitle
		splash.Visible = true
		splashScale.Scale = 0.3 * fit
		UI.tween(splashScale, 0.45, { Scale = fit }, Enum.EasingStyle.Back)
		task.delay(2.4, function()
			if token == splashToken then
				UI.tween(splashScale, 0.25, { Scale = 0 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
				task.wait(0.26)
				if token == splashToken then
					splash.Visible = false
				end
			end
		end)
	end

	function self.levelUp(text)
		self.big("LEVEL UP!", text, rgb(255, 215, 60))
	end

	return self
end

return Toasts
