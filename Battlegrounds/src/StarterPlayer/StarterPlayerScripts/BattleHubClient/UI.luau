--!strict
-- Small toolkit for building the hub's UI in code: instances with properties,
-- rounded corners, strokes, gradients, hexagons and bouncy buttons.

local TweenService = game:GetService("TweenService")

local UI = {}

UI.Fonts = {
	Title = Font.fromEnum(Enum.Font.Bangers),
	Heavy = Font.fromEnum(Enum.Font.GothamBlack),
	Body = Font.fromEnum(Enum.Font.GothamBold),
	Marker = Font.fromEnum(Enum.Font.PermanentMarker),
}

UI.Colors = {
	Panel = Color3.fromRGB(24, 24, 32),
	PanelLight = Color3.fromRGB(36, 36, 48),
	Card = Color3.fromRGB(34, 34, 46),
	Text = Color3.fromRGB(245, 245, 250),
	Muted = Color3.fromRGB(165, 165, 185),
	Black = Color3.fromRGB(8, 8, 12),
	Gold = Color3.fromRGB(255, 196, 48),
	Green = Color3.fromRGB(70, 210, 70),
	Red = Color3.fromRGB(235, 50, 60),
	Blue = Color3.fromRGB(45, 140, 240),
	Purple = Color3.fromRGB(155, 77, 242),
	Pink = Color3.fromRGB(235, 65, 210),
	Orange = Color3.fromRGB(242, 138, 46),
}

-- Creates an instance, sets properties (Parent last) and parents children to it.
function UI.new(className: string, props: { [string]: any }?, children: { Instance }?): any
	local inst = Instance.new(className)
	local parent: Instance? = nil
	if props then
		for key, value in props do
			if key == "Parent" then
				parent = value
			else
				(inst :: any)[key] = value
			end
		end
	end
	if children then
		for _, child in children do
			child.Parent = inst
		end
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

function UI.corner(parent: Instance, radius: number?): UICorner
	return UI.new("UICorner", { CornerRadius = UDim.new(0, radius or 12), Parent = parent })
end

function UI.stroke(parent: Instance, color: Color3, thickness: number?, border: boolean?): UIStroke
	return UI.new("UIStroke", {
		Color = color,
		Thickness = thickness or 3,
		LineJoinMode = Enum.LineJoinMode.Round,
		ApplyStrokeMode = if border then Enum.ApplyStrokeMode.Border else Enum.ApplyStrokeMode.Contextual,
		Parent = parent,
	})
end

function UI.gradient(parent: Instance, colors: { Color3 }, rotation: number?): UIGradient
	local keys = {}
	for i, c in colors do
		table.insert(keys, ColorSequenceKeypoint.new((i - 1) / math.max(1, #colors - 1), c))
	end
	return UI.new("UIGradient", { Color = ColorSequence.new(keys), Rotation = rotation or 90, Parent = parent })
end

function UI.padding(parent: Instance, px: number): UIPadding
	local d = UDim.new(0, px)
	return UI.new(
		"UIPadding",
		{ PaddingTop = d, PaddingBottom = d, PaddingLeft = d, PaddingRight = d, Parent = parent }
	)
end

function UI.list(parent: Instance, horizontal: boolean?, gap: number?, center: boolean?): UIListLayout
	return UI.new("UIListLayout", {
		FillDirection = if horizontal then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical,
		Padding = UDim.new(0, gap or 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = if center then Enum.HorizontalAlignment.Center else Enum.HorizontalAlignment.Left,
		VerticalAlignment = if center and horizontal then Enum.VerticalAlignment.Center else Enum.VerticalAlignment.Top,
		Parent = parent,
	})
end

function UI.darken(c: Color3, amount: number): Color3
	return c:Lerp(Color3.new(0, 0, 0), amount)
end

function UI.lighten(c: Color3, amount: number): Color3
	return c:Lerp(Color3.new(1, 1, 1), amount)
end

function UI.tween(
	inst: Instance,
	time: number,
	props: { [string]: any },
	style: Enum.EasingStyle?,
	direction: Enum.EasingDirection?
): Tween
	local t = TweenService:Create(
		inst,
		TweenInfo.new(time, style or Enum.EasingStyle.Quad, direction or Enum.EasingDirection.Out),
		props
	)
	t:Play()
	return t
end

export type TextProps = {
	Font: Font?,
	Color: Color3?,
	Stroke: number?, -- outline thickness (0 = none)
	StrokeColor: Color3?,
	Size: UDim2?,
	Position: UDim2?,
	AnchorPoint: Vector2?,
	Align: Enum.TextXAlignment?,
	YAlign: Enum.TextYAlignment?,
	Wrapped: boolean?,
	MaxSize: number?,
	Rich: boolean?,
	Name: string?,
	Z: number?,
	Order: number?,
}

-- Transparent, auto-sizing text.
function UI.text(parent: Instance, text: string, p: TextProps?): TextLabel
	local o: TextProps = p or {}
	local label = UI.new("TextLabel", {
		Name = o.Name or "Text",
		BackgroundTransparency = 1,
		Text = text,
		TextScaled = true,
		RichText = o.Rich or false,
		FontFace = o.Font or UI.Fonts.Title,
		TextColor3 = o.Color or UI.Colors.Text,
		Size = o.Size or UDim2.fromScale(1, 1),
		Position = o.Position or UDim2.fromScale(0, 0),
		AnchorPoint = o.AnchorPoint or Vector2.zero,
		TextXAlignment = o.Align or Enum.TextXAlignment.Center,
		TextYAlignment = o.YAlign or Enum.TextYAlignment.Center,
		TextWrapped = o.Wrapped or false,
		ZIndex = o.Z or 1,
		LayoutOrder = o.Order or 0,
		Parent = parent,
	})
	if o.MaxSize then
		UI.new("UITextSizeConstraint", { MaxTextSize = o.MaxSize, Parent = label })
	end
	local stroke = if o.Stroke == nil then 2 else o.Stroke
	if stroke > 0 then
		UI.stroke(label, o.StrokeColor or UI.Colors.Black, stroke)
	end
	return label
end

-- Makes a button grow when hovered and squish when pressed.
function UI.bouncy(button: GuiButton, target: GuiObject?)
	local host = target or button
	local scale = host:FindFirstChildOfClass("UIScale") or UI.new("UIScale", { Parent = host })
	button.MouseEnter:Connect(function()
		UI.tween(scale, 0.12, { Scale = 1.07 })
	end)
	button.MouseLeave:Connect(function()
		UI.tween(scale, 0.12, { Scale = 1 })
	end)
	button.MouseButton1Down:Connect(function()
		UI.tween(scale, 0.06, { Scale = 0.93 })
	end)
	button.MouseButton1Up:Connect(function()
		UI.tween(scale, 0.1, { Scale = 1.05 })
	end)
end

export type ButtonProps = {
	Size: UDim2?,
	Position: UDim2?,
	AnchorPoint: Vector2?,
	TextColor: Color3?,
	Font: Font?,
	Name: string?,
	Z: number?,
	Order: number?,
	Radius: number?,
}

-- Chunky rounded button with a darker outline and a light-to-dark gradient.
function UI.button(parent: Instance, text: string, color: Color3, p: ButtonProps?): TextButton
	local o: ButtonProps = p or {}
	local button = UI.new("TextButton", {
		Name = o.Name or "Button",
		Text = "",
		AutoButtonColor = false,
		BackgroundColor3 = Color3.new(1, 1, 1),
		Size = o.Size or UDim2.fromOffset(180, 50),
		Position = o.Position or UDim2.fromScale(0, 0),
		AnchorPoint = o.AnchorPoint or Vector2.zero,
		ZIndex = o.Z or 1,
		LayoutOrder = o.Order or 0,
		Parent = parent,
	})
	UI.corner(button, o.Radius or 12)
	UI.stroke(button, UI.darken(color, 0.55), 3, true)
	UI.gradient(button, { UI.lighten(color, 0.18), color, UI.darken(color, 0.2) }, 90)
	UI.text(button, text, {
		Name = "Label",
		Font = o.Font or UI.Fonts.Title,
		Color = o.TextColor or UI.Colors.Text,
		Size = UDim2.new(1, -16, 1, -10),
		Position = UDim2.fromOffset(8, 5),
		Stroke = 2,
		Z = (o.Z or 1) + 1,
	})
	UI.bouncy(button)
	return button
end

function UI.setButton(button: TextButton, text: string, color: Color3?)
	local label = button:FindFirstChild("Label")
	if label and label:IsA("TextLabel") then
		label.Text = text
	end
	if color then
		local gradient = button:FindFirstChildOfClass("UIGradient")
		if gradient then
			gradient.Color = ColorSequence.new({
				ColorSequenceKeypoint.new(0, UI.lighten(color, 0.18)),
				ColorSequenceKeypoint.new(0.5, color),
				ColorSequenceKeypoint.new(1, UI.darken(color, 0.2)),
			})
		end
		local stroke = button:FindFirstChildOfClass("UIStroke")
		if stroke then
			stroke.Color = UI.darken(color, 0.55)
		end
	end
end

-- Hexagons --------------------------------------------------------------------

local SQRT3 = math.sqrt(3)

-- Pointy-top hexagon (three overlapping rotated bars), centred in its parent.
function UI.hex(parent: Instance, height: number, color: Color3, z: number, name: string?, transparency: number?): Frame
	local r = height / 2
	local box = UI.new("Frame", {
		Name = name or "Hex",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(SQRT3 * r, 2 * r),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		ZIndex = z,
		Parent = parent,
	})
	for i = 0, 2 do
		UI.new("Frame", {
			Name = "Bar",
			BackgroundColor3 = color,
			BackgroundTransparency = transparency or 0,
			BorderSizePixel = 0,
			Size = UDim2.fromOffset(SQRT3 * r, r),
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Rotation = i * 60,
			ZIndex = z,
			Parent = box,
		})
	end
	return box
end

function UI.paintHex(hex: Instance, color: Color3)
	for _, bar in hex:GetChildren() do
		if bar:IsA("Frame") then
			bar.BackgroundColor3 = color
		end
	end
end

export type HexButton = {
	Root: Frame,
	Button: TextButton,
	Rim: Frame,
	Inner: Frame,
	Icon: TextLabel,
	Label: TextLabel,
	Color: Color3,
}

-- The big gem-like menu buttons along the bottom of the screen.
function UI.hexButton(
	parent: Instance,
	name: string,
	icon: string,
	label: string,
	color: Color3,
	height: number
): HexButton
	local root = UI.new("Frame", {
		Name = name,
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(SQRT3 * height / 2, height + height * 0.18),
		Parent = parent,
	})
	UI.new("UIScale", { Parent = root })
	local shadow = UI.hex(root, height, Color3.new(0, 0, 0), 1, "Shadow", 0.55)
	shadow.Position = UDim2.new(0.5, 0, 0.5, 5)
	UI.hex(root, height, UI.darken(color, 0.62), 2, "Border")
	local rim = UI.hex(root, height * 0.86, color, 3, "Rim")
	local inner = UI.hex(root, height * 0.7, UI.darken(color, 0.28), 4, "Inner")
	UI.hex(root, height * 0.7 - 10, UI.darken(color, 0.12), 5, "Face")
	for _, h in root:GetChildren() do
		if h:IsA("Frame") then
			h.Position = h.Position - UDim2.fromOffset(0, height * 0.09)
		end
	end
	local iconLabel = UI.text(root, icon, {
		Name = "Icon",
		Size = UDim2.fromOffset(height * 0.44, height * 0.44),
		Position = UDim2.new(0.5, 0, 0.5, -height * 0.13),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Stroke = 0,
		Z = 6,
	})
	local text = UI.text(root, label, {
		Name = "Label",
		Size = UDim2.new(1.5, 0, 0, height * 0.3),
		Position = UDim2.new(0.5, 0, 1, -height * 0.02),
		AnchorPoint = Vector2.new(0.5, 1),
		Stroke = 3,
		Z = 7,
	})
	local button = UI.new("TextButton", {
		Name = "Hit",
		Text = "",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 8,
		Parent = root,
	})
	UI.bouncy(button, root)
	return { Root = root, Button = button, Rim = rim, Inner = inner, Icon = iconLabel, Label = text, Color = color }
end

return UI
