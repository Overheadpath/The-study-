-- DesertAtmosphere
-- The desert island's weather, built on this client only: sand streaming over
-- the ground around you, sand blowing off the dune crests, a jet of sand
-- funnelling through the Wind Arch, gusts rushing across the landing, the
-- banners snapping, and every couple of minutes a sandstorm that thickens the
-- air and warms the light. It all eases in as you arrive and switches off
-- completely once you leave, so it costs nothing anywhere else on the map.
--
-- The storm clock runs off server time, so everyone on the island sees the
-- same storm at the same moment without any networking.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local SoundService = game:GetService("SoundService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local CENTRE = Vector3.new(-600, 5.29, 420)
local GROUND = 5.29
local INNER, OUTER = 150, 240                     -- full effect inside INNER, nothing beyond OUTER
local WIND = Vector3.new(-0.94, 0, 0.34).Unit     -- the heading the dunes were built to
local SIDE = Vector3.new(-WIND.Z, 0, WIND.X)

local island = workspace:WaitForChild("maap"):WaitForChild("DesertIsland", 60)
if not island then return end

local rng = Random.new()
local folder = Instance.new("Folder")
folder.Name = "DesertWeather"
folder.Parent = workspace

local PUFF = "rbxasset://textures/particles/smoke_main.dds"
local SAND_LIGHT = Color3.fromRGB(242, 208, 152)
local SAND_MID = Color3.fromRGB(226, 184, 118)

local function kp(t, v) return NumberSequenceKeypoint.new(t, v) end
local function smooth(x) x = math.clamp(x, 0, 1) return x * x * (3 - 2 * x) end

local function holder(name, size, cf)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cf or CFrame.new(CENTRE)
	p.Transparency = 1
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Parent = folder
	return p
end

local function emitter(parent, props)
	local e = Instance.new("ParticleEmitter")
	e.Texture = PUFF
	e.Rate = 0
	e.Enabled = false
	e.LightEmission = 0
	e.LightInfluence = 1
	e.Shape = Enum.ParticleEmitterShape.Box
	e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
	for k, v in pairs(props) do e[k] = v end
	e.Parent = parent
	return e
end

---------------------------------------------------------------- sand over the ground
-- a patch of emitter that follows the player around the island: grains lift
-- off, the wind takes them, and they stream past low and fast as thin wisps
local streamPart = holder("GroundStreams", Vector3.new(130, 0.6, 130))
local streams = emitter(streamPart, {
	EmissionDirection = Enum.NormalId.Top,
	Speed = NumberRange.new(0.5, 1.5),
	SpreadAngle = Vector2.new(25, 25),
	Acceleration = WIND * 68 + Vector3.new(0, -1.5, 0),
	Drag = 2.2,                                   -- settles at about 31 studs/s
	Lifetime = NumberRange.new(1.3, 2.4),
	Orientation = Enum.ParticleOrientation.VelocityParallel,
	Squash = NumberSequence.new(1.6),             -- drawn out along the direction of travel
	Size = NumberSequence.new({kp(0, 0.25), kp(0.3, 0.8), kp(1, 1.2)}),
	Transparency = NumberSequence.new({kp(0, 1), kp(0.18, 0.72), kp(0.7, 0.82), kp(1, 1)}),
	Color = ColorSequence.new(SAND_LIGHT, SAND_MID),
})

---------------------------------------------------------------- sand off the dune crests
local crestEmitters = {}
for _, dune in ipairs(island:WaitForChild("Dunes"):GetChildren()) do
	local a, b = dune:GetAttribute("CrestA"), dune:GetAttribute("CrestB")
	if typeof(a) == "Vector3" and typeof(b) == "Vector3" then
		local along = b - a
		local p = holder("CrestSpray", Vector3.new(along.Magnitude * 0.85, 0.3, 1.2),
			CFrame.fromMatrix((a + b) / 2 + Vector3.new(0, 0.4, 0), along.Unit, Vector3.yAxis))
		local e = emitter(p, {
			EmissionDirection = Enum.NormalId.Top,
			Speed = NumberRange.new(2, 5),
			SpreadAngle = Vector2.new(30, 30),
			Acceleration = WIND * 55 + Vector3.new(0, 1.2, 0),
			Drag = 1.8,
			Lifetime = NumberRange.new(1.2, 2.2),
			Size = NumberSequence.new({kp(0, 0.6), kp(0.4, 2.2), kp(1, 3.6)}),
			Transparency = NumberSequence.new({kp(0, 1), kp(0.15, 0.72), kp(0.6, 0.84), kp(1, 1)}),
			Color = ColorSequence.new(SAND_LIGHT),
			Rotation = NumberRange.new(0, 360),
			RotSpeed = NumberRange.new(-40, 40),
		})
		crestEmitters[#crestEmitters + 1] = { e = e, base = along.Magnitude * 0.3 }
	end
end

---------------------------------------------------------------- the Wind Arch
-- the gap between its legs squeezes the wind into a visible jet of sand
local archJet
local landmarks = island:WaitForChild("Landmarks")
if landmarks:FindFirstChild("WindArch") then
	local pos = CENTRE + Vector3.new(62, 0, 40)
	local start = Vector3.new(pos.X, GROUND + 7, pos.Z) - WIND * 10
	local p = holder("ArchJet", Vector3.new(12, 12, 1), CFrame.fromMatrix(start, SIDE, Vector3.yAxis))
	archJet = emitter(p, {
		EmissionDirection = Enum.NormalId.Back,   -- local +Z runs with the wind
		Speed = NumberRange.new(36, 52),
		SpreadAngle = Vector2.new(6, 6),
		Acceleration = Vector3.new(0, -2, 0),
		Drag = 0.4,
		Lifetime = NumberRange.new(0.9, 1.5),
		Orientation = Enum.ParticleOrientation.VelocityParallel,
		Squash = NumberSequence.new(2),
		Size = NumberSequence.new({kp(0, 0.3), kp(0.5, 0.8), kp(1, 1.1)}),
		Transparency = NumberSequence.new({kp(0, 1), kp(0.15, 0.62), kp(0.75, 0.78), kp(1, 1)}),
		Color = ColorSequence.new(SAND_LIGHT, SAND_MID),
	})
end

---------------------------------------------------------------- the sandstorm's air
-- big soft clouds of sand filling the space around the camera; this and a
-- denser atmosphere are what take the far side of the island away in a storm
local curtainPart = holder("StormCurtain", Vector3.new(120, 36, 120))
local curtain = emitter(curtainPart, {
	EmissionDirection = Enum.NormalId.Top,
	Speed = NumberRange.new(0, 1),
	SpreadAngle = Vector2.new(180, 180),
	Acceleration = WIND * 42,
	Drag = 1.1,
	Lifetime = NumberRange.new(3, 4.5),
	Size = NumberSequence.new({kp(0, 10), kp(1, 22)}),
	Transparency = NumberSequence.new({kp(0, 1), kp(0.2, 0.84), kp(0.75, 0.88), kp(1, 1)}),
	Color = ColorSequence.new(Color3.fromRGB(224, 176, 114)),
	LightInfluence = 0.6,
	Rotation = NumberRange.new(0, 360),
	RotSpeed = NumberRange.new(-18, 18),
})

---------------------------------------------------------------- gusts
-- thin streaks of rushing air, sent down the corridors where the wind would
-- really squeeze: through the arch, over the landing, between the pyramids,
-- across the open middle, and high over the whole island
local CORRIDORS = {
	{ point = Vector3.new(62, 0, 40),   spread = 6,   yMin = 3,  yMax = 16, weight = 3 },
	{ point = Vector3.new(80, 0, -50),  spread = 18,  yMin = 2,  yMax = 9,  weight = 3 },
	{ point = Vector3.new(-15, 0, -40), spread = 14,  yMin = 3,  yMax = 18, weight = 2 },
	{ point = Vector3.new(15, 0, 0),    spread = 26,  yMin = 2,  yMax = 14, weight = 3 },
	{ point = Vector3.new(0, 0, 0),     spread = 100, yMin = 14, yMax = 44, weight = 3 },
}
local totalWeight = 0
for _, c in ipairs(CORRIDORS) do totalWeight += c.weight end
local function pickCorridor()
	local r = rng:NextNumber(0, totalWeight)
	for _, c in ipairs(CORRIDORS) do
		r -= c.weight
		if r <= 0 then return c end
	end
	return CORRIDORS[1]
end

local anchor = holder("GustAnchor", Vector3.one, CFrame.new())  -- at the origin, unrotated,
local STEPS = 7                                                 -- so attachment positions are world positions
local SHAPES = {}
for i = 0, STEPS do
	local a = 1 - (i / STEPS) * 0.5                               -- never more opaque than 0.5
	SHAPES[i] = NumberSequence.new({ kp(0, 1), kp(0.22, a), kp(0.78, a), kp(1, 1) })
end
local RUN = 240
local gusts = {}
local function launch(g, first)
	local c = pickCorridor()
	g.travel = first and rng:NextNumber(0, RUN) or 0
	g.speed = rng:NextNumber(60, 100)
	g.len = rng:NextNumber(10, 30)
	g.width = rng:NextNumber(0.12, 0.26)
	g.origin = CENTRE + c.point + SIDE * rng:NextNumber(-c.spread, c.spread)
		+ Vector3.new(0, rng:NextNumber(c.yMin, c.yMax), 0) - WIND * (RUN * 0.5)
	g.bucket = -1
end
for i = 1, 30 do
	local a0 = Instance.new("Attachment"); a0.Parent = anchor
	local a1 = Instance.new("Attachment"); a1.Parent = anchor
	local b = Instance.new("Beam")
	b.Attachment0 = a0
	b.Attachment1 = a1
	b.FaceCamera = true
	b.Segments = 1
	b.LightInfluence = 0
	b.LightEmission = 0
	b.Color = ColorSequence.new(Color3.fromRGB(250, 234, 204))
	b.Transparency = SHAPES[0]
	b.Enabled = false
	b.Parent = anchor
	local g = { a0 = a0, a1 = a1, beam = b }
	launch(g, true)
	gusts[i] = g
end

---------------------------------------------------------------- banners at the landing
local banners = {}
for _, m in ipairs(landmarks:GetChildren()) do
	local hinge = m:GetAttribute("Hinge")
	if m.Name == "WindBanner" and typeof(hinge) == "Vector3" then
		local cloths = {}
		for i = 1, 4 do
			local c = m:FindFirstChild("Cloth" .. i)
			if c then cloths[#cloths + 1] = c end
		end
		banners[#banners + 1] = { hinge = hinge, cloths = cloths, phase = rng:NextNumber(0, math.pi * 2) }
	end
end

---------------------------------------------------------------- light, air and sound
local grade = Instance.new("ColorCorrectionEffect")  -- lives on the camera, so only this client sees it
grade.Name = "DesertGrade"
grade.Enabled = false

-- DayCycle rewrites the atmosphere's colour and haze, but never its density,
-- so density is the one we can thicken for a storm without fighting it
local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
local baseDensity = atmosphere and atmosphere.Density or 0

local wind = SoundService:FindFirstChild("DesertWind")
if not wind then
	wind = Instance.new("Sound")
	wind.Name = "DesertWind"   -- "Wind" in the name puts it on the Settings > Ambient sound toggle
	wind.SoundId = "rbxasset://sounds/action_falling.mp3"
	wind.Looped = true
	wind.Parent = SoundService
end
wind.Volume = 0
pcall(function() wind:Play() end)

---------------------------------------------------------------- the clocks
local function gustAt(t)
	return math.clamp(0.5 + 0.28 * math.sin(t * 0.31) + 0.14 * math.sin(t * 0.73 + 1.1)
		+ 0.08 * math.sin(t * 1.37 + 2.3), 0, 1)
end

-- one storm somewhere in every 140 s window, 22-32 s long, 7 s to build and 9 s
-- to clear. Seeded by the window number, so every client agrees on it.
local CYCLE = 140
local function stormAt(t)
	local k = math.floor(t / CYCLE)
	local r = Random.new(k * 7919 + 17)
	local start = k * CYCLE + r:NextNumber(35, 95)
	local length = r:NextNumber(22, 32)
	if t < start or t > start + length then return 0 end
	return smooth((t - start) / 7) * (1 - smooth((t - (start + length - 9)) / 9))
end

---------------------------------------------------------------- drive it
local blend, stormLevel = 0, 0
local volume, pitch = 0, 0.55
local wasActive = false

local function setActive(on)
	streams.Enabled = on
	curtain.Enabled = on
	for _, c in ipairs(crestEmitters) do c.e.Enabled = on end
	if archJet then archJet.Enabled = on end
	for _, g in ipairs(gusts) do g.beam.Enabled = on end
	grade.Enabled = on
	if not on then
		streams:Clear()
		curtain:Clear()
		for _, c in ipairs(crestEmitters) do c.e:Clear() end
		if archJet then archJet:Clear() end
	end
end

local function playerPosition()
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root then return root.Position end
	local camera = workspace.CurrentCamera
	return camera and camera.Focus.Position
end

RunService.RenderStepped:Connect(function(dt)
	local camera = workspace.CurrentCamera
	local pos = playerPosition()
	local menu = playerGui:FindFirstChild("FishingMenu")
	local inMenu = menu and menu:IsA("ScreenGui") and menu.Enabled
	local target = 0
	if pos and not inMenu then
		local d = (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(CENTRE.X, 0, CENTRE.Z)).Magnitude
		target = 1 - smooth((d - INNER) / (OUTER - INNER))
	end
	blend += (target - blend) * (1 - math.exp(-dt * 1.8))
	if target == 0 and blend < 0.003 then blend = 0 end

	local now = workspace:GetServerTimeNow()
	local gust = gustAt(now)
	stormLevel += (stormAt(now) - stormLevel) * (1 - math.exp(-dt * 2.5))
	local calm = playerGui:GetAttribute("ReduceMotion") and 0.5 or 1

	-- the hub's sea breeze (WindSystem) fades out under this
	SoundService:SetAttribute("DesertBlend", blend)

	-- sound and air keep easing as you leave, then settle at nothing
	local ease = 1 - math.exp(-dt * 1.6)
	volume += (blend * (0.05 + 0.07 * gust + 0.22 * stormLevel) - volume) * ease
	pitch += ((0.55 + 0.12 * gust + 0.22 * stormLevel) - pitch) * ease
	wind.Volume = volume
	wind.PlaybackSpeed = pitch
	if atmosphere then
		atmosphere.Density = baseDensity + blend * (0.04 + 0.30 * stormLevel)
	end

	local active = blend > 0
	if active ~= wasActive then
		setActive(active)
		wasActive = active
	end
	if not active then return end

	-- warm light always; hazier, flatter and warmer still in a storm
	if camera and grade.Parent ~= camera then grade.Parent = camera end
	local s = stormLevel * blend
	grade.TintColor = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(255, 240, 218), blend):Lerp(Color3.fromRGB(255, 222, 180), s)
	grade.Saturation = 0.08 * blend - 0.10 * s
	grade.Contrast = -0.14 * s
	grade.Brightness = 0.02 * blend + 0.03 * s

	local intensity = blend * calm

	-- the ground streams follow the player, but stay over the island
	if pos then
		local off = Vector3.new(pos.X - CENTRE.X, 0, pos.Z - CENTRE.Z)
		if off.Magnitude > 60 then off = off.Unit * 60 end
		streamPart.CFrame = CFrame.new(CENTRE.X + off.X, GROUND + 0.35, CENTRE.Z + off.Z)
	end
	streams.Rate = intensity * (55 + 45 * gust + 160 * stormLevel)
	for _, c in ipairs(crestEmitters) do
		c.e.Rate = intensity * c.base * (0.6 + 0.8 * gust + 2.2 * stormLevel)
	end
	if archJet then archJet.Rate = intensity * (22 + 22 * gust + 40 * stormLevel) end
	if camera then
		local cp = camera.CFrame.Position
		curtainPart.CFrame = CFrame.new(cp.X, math.max(cp.Y, GROUND + 14), cp.Z)
	end
	curtain.Rate = intensity * 60 * stormLevel

	-- gusts
	local vis = math.min(intensity * (0.5 + 0.5 * gust) * (1 + 0.7 * stormLevel), 1)
	for _, g in ipairs(gusts) do
		g.travel += g.speed * (0.8 + 0.4 * gust + 0.5 * stormLevel) * dt
		if g.travel > RUN then launch(g, false) end
		local tail = g.origin + WIND * g.travel
		g.a0.Position = tail
		g.a1.Position = tail + WIND * g.len
		local f = g.travel / RUN
		local fade = math.max(math.min(f / 0.15, (1 - f) / 0.25, 1), 0)
		g.beam.Width0 = g.width * (0.45 + 0.55 * fade)
		g.beam.Width1 = g.beam.Width0
		local bucket = math.clamp(math.floor(fade * vis * STEPS + 0.5), 0, STEPS)
		if bucket ~= g.bucket then
			g.bucket = bucket
			g.beam.Transparency = SHAPES[bucket]
		end
	end

	-- banners: tauter and quicker as the wind gets up
	local strength = math.clamp(0.55 + 0.35 * gust + 0.6 * stormLevel, 0, 1.5)
	local t = os.clock()
	for _, b in ipairs(banners) do
		local cf = CFrame.lookAt(b.hinge, b.hinge + WIND) * CFrame.new(0.35, 0, 0)
		for i, cloth in ipairs(b.cloths) do
			local wave = math.sin(t * (5 + 4 * strength) - i * 1.1 + b.phase)
				* (0.12 + 0.08 * i) * (1.25 - 0.45 * strength)
			cf = cf * CFrame.Angles(0, wave, 0)
			local len = cloth.Size.Z
			cloth.CFrame = cf * CFrame.new(0, 0, -len / 2)
			cf = cf * CFrame.new(0, 0, -len)
		end
	end
end)

script.Destroying:Connect(function()
	if atmosphere then atmosphere.Density = baseDensity end
	SoundService:SetAttribute("DesertBlend", 0)
	grade:Destroy()
	folder:Destroy()
end)
