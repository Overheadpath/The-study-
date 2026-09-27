--!strict
-- Building blocks for the hub and arena builders: parts, neon strips, signs,
-- triangles, rings and posed display figures.

local Kit = {}

export type Opts = {
	Name: string?,
	Material: Enum.Material?,
	Transparency: number?,
	Reflectance: number?,
	CanCollide: boolean?,
	CastShadow: boolean?,
	CanQuery: boolean?,
}

local function finish<T>(p: T & BasePart, color: Color3, opts: Opts?, parent: Instance): T
	local o: Opts = opts or {}
	p.Anchored = true
	p.Color = color
	p.Material = o.Material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if o.Name then
		p.Name = o.Name
	end
	if o.Transparency then
		p.Transparency = o.Transparency
	end
	if o.Reflectance then
		p.Reflectance = o.Reflectance
	end
	if o.CanCollide ~= nil then
		p.CanCollide = o.CanCollide
	end
	if o.CastShadow ~= nil then
		p.CastShadow = o.CastShadow
	end
	if o.CanQuery ~= nil then
		p.CanQuery = o.CanQuery
	end
	p.Parent = parent
	return p
end

function Kit.box(parent: Instance, size: Vector3, cf: CFrame, color: Color3, opts: Opts?): Part
	local p = Instance.new("Part")
	p.Size = size
	p.CFrame = cf
	return finish(p, color, opts, parent)
end

-- Cylinder whose round ends point along the CFrame's X axis.
function Kit.cyl(parent: Instance, length: number, diameter: number, cf: CFrame, color: Color3, opts: Opts?): Part
	local p = Instance.new("Part")
	p.Shape = Enum.PartType.Cylinder
	p.Size = Vector3.new(length, diameter, diameter)
	p.CFrame = cf
	return finish(p, color, opts, parent)
end

-- Flat disc lying on the ground, centred on `pos`.
function Kit.disc(parent: Instance, diameter: number, height: number, pos: CFrame, color: Color3, opts: Opts?): Part
	return Kit.cyl(parent, height, diameter, pos * CFrame.Angles(0, 0, math.rad(90)), color, opts)
end

function Kit.ball(parent: Instance, diameter: number, cf: CFrame, color: Color3, opts: Opts?): Part
	local p = Instance.new("Part")
	p.Shape = Enum.PartType.Ball
	p.Size = Vector3.new(diameter, diameter, diameter)
	p.CFrame = cf
	return finish(p, color, opts, parent)
end

function Kit.wedge(parent: Instance, size: Vector3, cf: CFrame, color: Color3, opts: Opts?): WedgePart
	local p = Instance.new("WedgePart")
	p.Size = size
	p.CFrame = cf
	return finish(p, color, opts, parent)
end

-- Glowing strip: neon, no collision, no shadow.
function Kit.neon(parent: Instance, size: Vector3, cf: CFrame, color: Color3, name: string?): Part
	return Kit.box(parent, size, cf, color, {
		Name = name or "Neon",
		Material = Enum.Material.Neon,
		CanCollide = false,
		CastShadow = false,
		CanQuery = false,
	})
end

-- Solid triangle between three points, made from two wedges.
function Kit.triangle(
	parent: Instance,
	a: Vector3,
	b: Vector3,
	c: Vector3,
	thickness: number,
	color: Color3,
	opts: Opts?
): (WedgePart, WedgePart)
	local ab, ac, bc = b - a, c - a, c - b
	local abd, acd, bcd = ab:Dot(ab), ac:Dot(ac), bc:Dot(bc)
	if abd > acd and abd > bcd then
		c, a = a, c
	elseif acd > bcd and acd > abd then
		a, b = b, a
	end
	ab, ac, bc = b - a, c - a, c - b
	local right = ac:Cross(ab).Unit
	local up = bc:Cross(right).Unit
	local back = bc.Unit
	local height = math.abs(ab:Dot(up))
	local w1 = Kit.wedge(
		parent,
		Vector3.new(thickness, height, math.abs(ab:Dot(back))),
		CFrame.fromMatrix((a + b) / 2, right, up, back),
		color,
		opts
	)
	local w2 = Kit.wedge(
		parent,
		Vector3.new(thickness, height, math.abs(ac:Dot(back))),
		CFrame.fromMatrix((a + c) / 2, -right, up, -back),
		color,
		opts
	)
	return w1, w2
end

-- Ring of `segments` boxes around `cf`'s Y axis (lying flat unless `cf` is rotated).
function Kit.ring(
	parent: Instance,
	cf: CFrame,
	radius: number,
	width: number,
	height: number,
	segments: number,
	color: Color3,
	opts: Opts?
): { Part }
	local parts = {}
	local length = 2 * radius * math.tan(math.pi / segments) * 1.04
	for i = 1, segments do
		local angle = (i - 1) / segments * math.pi * 2
		local segCf = cf * CFrame.Angles(0, angle, 0) * CFrame.new(0, 0, -radius)
		table.insert(parts, Kit.box(parent, Vector3.new(length, height, width), segCf, color, opts))
	end
	return parts
end

function Kit.model(parent: Instance, name: string): Model
	local m = Instance.new("Model")
	m.Name = name
	m.Parent = parent
	return m
end

function Kit.folder(parent: Instance, name: string): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

function Kit.pointLight(part: BasePart, color: Color3, brightness: number, range: number): PointLight
	local l = Instance.new("PointLight")
	l.Color = color
	l.Brightness = brightness
	l.Range = range
	l.Shadows = false
	l.Parent = part
	return l
end

function Kit.surfaceLight(
	part: BasePart,
	face: Enum.NormalId,
	color: Color3,
	brightness: number,
	range: number
): SurfaceLight
	local l = Instance.new("SurfaceLight")
	l.Face = face
	l.Color = color
	l.Brightness = brightness
	l.Range = range
	l.Angle = 110
	l.Shadows = false
	l.Parent = part
	return l
end

-- ProximityPrompt that the client reacts to through its "HubAction" attribute.
function Kit.prompt(
	part: BasePart,
	action: string,
	actionText: string,
	objectText: string,
	distance: number?
): ProximityPrompt
	local p = Instance.new("ProximityPrompt")
	p.Name = "HubPrompt"
	p.ActionText = actionText
	p.ObjectText = objectText
	p.HoldDuration = 0
	p.MaxActivationDistance = distance or 12
	p.RequiresLineOfSight = false
	p.KeyboardKeyCode = Enum.KeyCode.E
	p:SetAttribute("HubAction", action)
	p.Parent = part
	return p
end

-- Surface text ---------------------------------------------------------------

export type TextOpts = {
	Font: Enum.Font?,
	Color: Color3?,
	Stroke: Color3?,
	StrokeThickness: number?,
	Glow: number?, -- SurfaceGui brightness, >1 blooms
	PixelsPerStud: number?,
	Rotation: number?,
	Gradient: { Color3 }?,
	Size: UDim2?,
	Position: UDim2?,
	Transparency: number?,
	Name: string?,
	Align: Enum.TextXAlignment?,
}

function Kit.surface(part: BasePart, face: Enum.NormalId, pixelsPerStud: number?, glow: number?): SurfaceGui
	local g = Instance.new("SurfaceGui")
	g.Name = "Surface" .. face.Name
	g.Face = face
	g.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	g.PixelsPerStud = pixelsPerStud or 30
	g.LightInfluence = 0
	g.Brightness = glow or 1.5
	g.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	g.MaxDistance = 400
	g.Parent = part
	return g
end

function Kit.label(parent: Instance, text: string, opts: TextOpts?): TextLabel
	local o: TextOpts = opts or {}
	local t = Instance.new("TextLabel")
	t.Name = o.Name or "Label"
	t.BackgroundTransparency = 1
	t.Size = o.Size or UDim2.fromScale(1, 1)
	t.Position = o.Position or UDim2.fromScale(0, 0)
	t.Text = text
	t.TextScaled = true
	t.FontFace = Font.fromEnum(o.Font or Enum.Font.Bangers)
	t.TextColor3 = o.Color or Color3.new(1, 1, 1)
	t.TextTransparency = o.Transparency or 0
	t.TextXAlignment = o.Align or Enum.TextXAlignment.Center
	t.Rotation = o.Rotation or 0
	if o.Stroke then
		local s = Instance.new("UIStroke")
		s.Color = o.Stroke
		s.Thickness = o.StrokeThickness or 4
		s.LineJoinMode = Enum.LineJoinMode.Round
		s.Parent = t
	end
	if o.Gradient then
		local keys = {}
		for i, c in o.Gradient do
			table.insert(keys, ColorSequenceKeypoint.new((i - 1) / math.max(1, #o.Gradient - 1), c))
		end
		local g = Instance.new("UIGradient")
		g.Color = ColorSequence.new(keys)
		g.Rotation = 90
		g.Parent = t
	end
	t.Parent = parent
	return t
end

-- Writes text straight onto one face of a part.
function Kit.write(part: BasePart, face: Enum.NormalId, text: string, opts: TextOpts?): TextLabel
	local o: TextOpts = opts or {}
	local gui = Kit.surface(part, face, o.PixelsPerStud, o.Glow)
	return Kit.label(gui, text, o)
end

-- Framed billboard sign like the big hall signs: dark panel, light frame,
-- glowing text. `cf` is the centre of the panel, facing where people read it.
export type SignOpts = {
	Font: Enum.Font?,
	TextColor: Color3?,
	Stroke: Color3?,
	Gradient: { Color3 }?,
	Frame: Color3?,
	Panel: Color3?,
	Glow: Color3?,
	Subtitle: string?,
	SubtitleColor: Color3?,
	Icons: string?, -- e.g. "⚔️" shown either side of the title
	Name: string?,
}

function Kit.sign(parent: Instance, cf: CFrame, width: number, height: number, text: string, opts: SignOpts?): Model
	local o: SignOpts = opts or {}
	local m = Kit.model(parent, o.Name or "Sign")
	local frame = o.Frame or Color3.fromRGB(215, 220, 228)
	local panel = Kit.box(m, Vector3.new(width, height, 0.8), cf, o.Panel or Color3.fromRGB(28, 28, 34), {
		Name = "Panel",
		Material = Enum.Material.SmoothPlastic,
	})
	local t = 0.9
	local depth = 1.4
	local z = 0.1
	Kit.box(
		m,
		Vector3.new(width + t * 2, t, depth),
		cf * CFrame.new(0, height / 2 + t / 2, z),
		frame,
		{ Name = "Frame", Material = Enum.Material.Metal }
	)
	Kit.box(
		m,
		Vector3.new(width + t * 2, t, depth),
		cf * CFrame.new(0, -height / 2 - t / 2, z),
		frame,
		{ Name = "Frame", Material = Enum.Material.Metal }
	)
	Kit.box(
		m,
		Vector3.new(t, height, depth),
		cf * CFrame.new(width / 2 + t / 2, 0, z),
		frame,
		{ Name = "Frame", Material = Enum.Material.Metal }
	)
	Kit.box(
		m,
		Vector3.new(t, height, depth),
		cf * CFrame.new(-width / 2 - t / 2, 0, z),
		frame,
		{ Name = "Frame", Material = Enum.Material.Metal }
	)
	-- inner glow line hugging the frame
	local glow = o.Glow or o.TextColor or Color3.new(1, 1, 1)
	local g = 0.18
	Kit.neon(m, Vector3.new(width, g, g), cf * CFrame.new(0, height / 2 - g, -0.45), glow)
	Kit.neon(m, Vector3.new(width, g, g), cf * CFrame.new(0, -height / 2 + g, -0.45), glow)
	Kit.neon(m, Vector3.new(g, height, g), cf * CFrame.new(width / 2 - g, 0, -0.45), glow)
	Kit.neon(m, Vector3.new(g, height, g), cf * CFrame.new(-width / 2 + g, 0, -0.45), glow)

	local gui = Kit.surface(panel, Enum.NormalId.Front, math.clamp(math.floor(1100 / width), 12, 60), 2.2)
	local titleHeight = o.Subtitle and 0.68 or 0.86
	local title = o.Icons and (o.Icons .. " " .. text .. " " .. o.Icons) or text
	Kit.label(gui, title, {
		Font = o.Font or Enum.Font.PermanentMarker,
		Color = o.TextColor or Color3.new(1, 1, 1),
		Stroke = o.Stroke or Color3.fromRGB(10, 10, 14),
		StrokeThickness = 5,
		Gradient = o.Gradient,
		Size = UDim2.fromScale(0.94, titleHeight),
		Position = UDim2.fromScale(0.03, 0.06),
		Name = "Title",
	})
	if o.Subtitle then
		Kit.label(gui, o.Subtitle, {
			Font = Enum.Font.GothamBlack,
			Color = o.SubtitleColor or Color3.fromRGB(235, 235, 240),
			Stroke = Color3.fromRGB(10, 10, 14),
			StrokeThickness = 2,
			Size = UDim2.fromScale(0.9, 0.2),
			Position = UDim2.fromScale(0.05, 0.74),
			Name = "Subtitle",
		})
	end
	return m
end

-- Floating name plate that always faces the camera.
function Kit.billboard(part: BasePart, title: string, subtitle: string?, color: Color3?, offset: number?): BillboardGui
	local b = Instance.new("BillboardGui")
	b.Name = "Plate"
	b.Size = UDim2.new(10, 0, subtitle and 2.6 or 1.6, 0)
	b.StudsOffset = Vector3.new(0, offset or 4, 0)
	b.MaxDistance = 90
	b.LightInfluence = 0
	b.Brightness = 1.6
	b.Parent = part
	Kit.label(b, title, {
		Font = Enum.Font.Bangers,
		Color = color or Color3.new(1, 1, 1),
		Stroke = Color3.fromRGB(0, 0, 0),
		StrokeThickness = 2,
		Size = UDim2.fromScale(1, subtitle and 0.58 or 1),
		Name = "Title",
	})
	if subtitle then
		Kit.label(b, subtitle, {
			Font = Enum.Font.GothamBlack,
			Color = Color3.fromRGB(240, 240, 240),
			Stroke = Color3.fromRGB(0, 0, 0),
			StrokeThickness = 1.5,
			Size = UDim2.fromScale(1, 0.38),
			Position = UDim2.fromScale(0, 0.62),
			Name = "Subtitle",
		})
	end
	return b
end

-- Display figures ---------------------------------------------------------------

export type Outfit = {
	Skin: Color3,
	Shirt: Color3,
	Pants: Color3,
	Gloves: Color3?,
	Belt: Color3?,
}

export type Pose = "Idle" | "Guard" | "Victory" | "Point" | "Sit" | "Kick" | "Meditate"

type Angles = { ra: Vector3, la: Vector3, rl: Vector3, ll: Vector3, drop: number }

-- Degrees: X swings a limb forward, Z swings it out to the side.
local POSES: { [Pose]: Angles } = {
	Idle = {
		ra = Vector3.new(0, 0, 6),
		la = Vector3.new(0, 0, -6),
		rl = Vector3.new(0, 0, 3),
		ll = Vector3.new(0, 0, -3),
		drop = 0,
	},
	Guard = {
		ra = Vector3.new(85, 0, -18),
		la = Vector3.new(105, 0, 20),
		rl = Vector3.new(-12, 0, 10),
		ll = Vector3.new(14, 0, -8),
		drop = 0.15,
	},
	Victory = {
		ra = Vector3.new(0, 0, 155),
		la = Vector3.new(0, 0, -155),
		rl = Vector3.new(0, 0, 8),
		ll = Vector3.new(0, 0, -8),
		drop = 0,
	},
	Point = {
		ra = Vector3.new(90, 0, 0),
		la = Vector3.new(-10, 0, -12),
		rl = Vector3.new(0, 0, 4),
		ll = Vector3.new(0, 0, -4),
		drop = 0,
	},
	Sit = {
		ra = Vector3.new(25, 0, 8),
		la = Vector3.new(25, 0, -8),
		rl = Vector3.new(90, 0, 3),
		ll = Vector3.new(90, 0, -3),
		drop = 1,
	},
	Kick = {
		ra = Vector3.new(70, 0, -25),
		la = Vector3.new(-30, 0, -35),
		rl = Vector3.new(80, 0, 0),
		ll = Vector3.new(-8, 0, -6),
		drop = 0,
	},
	Meditate = {
		ra = Vector3.new(30, 0, 25),
		la = Vector3.new(30, 0, -25),
		rl = Vector3.new(90, 0, 40),
		ll = Vector3.new(90, 0, -40),
		drop = 1.4,
	},
}

local function limb(deg: Vector3): CFrame
	return CFrame.Angles(math.rad(deg.X), math.rad(deg.Y), math.rad(deg.Z))
end

-- Blocky display figure standing on `cf` (feet position, facing cf.LookVector).
-- Returns the model and its torso (handy for attaching auras).
function Kit.figure(parent: Instance, cf: CFrame, outfit: Outfit, pose: Pose, name: string?): (Model, Part)
	local m = Kit.model(parent, name or "Figure")
	local a = POSES[pose]
	local torsoCf = cf * CFrame.new(0, 3 - a.drop, 0)
	local torso = Kit.box(m, Vector3.new(2, 2, 1), torsoCf, outfit.Shirt, { Name = "Torso" })
	local head = Kit.box(m, Vector3.new(2, 1, 1), torsoCf * CFrame.new(0, 1.5, 0), outfit.Skin, { Name = "Head" })
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Head
	mesh.Scale = Vector3.new(1.25, 1.25, 1.25)
	mesh.Parent = head
	local face = Instance.new("Decal")
	face.Name = "face"
	face.Texture = "rbxasset://textures/face.png"
	face.Face = Enum.NormalId.Front
	face.Parent = head

	local function arm(side: number, deg: Vector3, limbName: string)
		local pivot = torsoCf * CFrame.new(side * 1.5, 1, 0) * limb(deg)
		local armPart =
			Kit.box(m, Vector3.new(1, 2, 1), pivot * CFrame.new(0, -1, 0), outfit.Shirt, { Name = limbName })
		if outfit.Gloves then
			Kit.box(m, Vector3.new(1.12, 0.7, 1.12), pivot * CFrame.new(0, -1.7, 0), outfit.Gloves, { Name = "Glove" })
		else
			Kit.box(m, Vector3.new(1.02, 0.6, 1.02), pivot * CFrame.new(0, -1.72, 0), outfit.Skin, { Name = "Hand" })
		end
		return armPart
	end
	local function leg(side: number, deg: Vector3, limbName: string)
		local pivot = torsoCf * CFrame.new(side * 0.5, -1, 0) * limb(deg)
		return Kit.box(m, Vector3.new(1, 2, 1), pivot * CFrame.new(0, -1, 0), outfit.Pants, { Name = limbName })
	end
	arm(1, a.ra, "Right Arm")
	arm(-1, Vector3.new(a.la.X, a.la.Y, a.la.Z), "Left Arm")
	leg(1, a.rl, "Right Leg")
	leg(-1, a.ll, "Left Leg")
	if outfit.Belt then
		Kit.box(m, Vector3.new(2.06, 0.3, 1.06), torsoCf * CFrame.new(0, -0.8, 0), outfit.Belt, { Name = "Belt" })
	end
	return m, torso
end

return Kit
