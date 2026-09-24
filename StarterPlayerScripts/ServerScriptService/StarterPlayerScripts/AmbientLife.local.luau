-- AmbientLife
-- The sea and sky around the islands: ripples and splashes, fish under the
-- surface, the game's own fish leaping out of the water (often, and in the
-- view), pods of dolphins porpoising past with their calls, a shoal that
-- surfaces, gulls high overhead (built from blocks, with two-piece wings that
-- really flap), soft lines of foam that roll in to Nature's Island's boardwalk
-- and the cove, lap and draw back with the odd small splash, and fireflies
-- after dark. Everything is built here on the client, so
-- it adds nothing to the place file, never replicates, and the server does no
-- work. Reads workspace.GlobalWind (WindSystem) and Lighting's Dayness
-- attribute (DayCycle) so it stays in step with the rest of the world.
--
-- Models: FishingSystem.FishModels (the catchable fish, stud-built). The gulls
-- and dolphins are built from parts right here, in the same blocky style;
-- FishingSystem.AmbientAssets only supplies the dolphin call.

local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local SoundService = game:GetService("SoundService")

local system = game:GetService("ReplicatedStorage"):WaitForChild("FishingSystem")
local ASSETS = system:WaitForChild("AmbientAssets", 20)
local FISH_MODELS = system:WaitForChild("FishModels", 20)
local player = Players.LocalPlayer
local pg = player:WaitForChild("PlayerGui")

local WATER_Y = 0.21
local ISLAND = Vector3.new(55, 5.3, -178) -- the middle of Nature's Island (moved when the island was enlarged)
local PARK = CFrame.new(0, -600, 0)
local FOAM = "rbxasset://textures/particles/smoke_main.dds"

local rng = Random.new(os.time() % 100000)

local folder = Instance.new("Folder")
folder.Name = "AmbientLife"
folder.Parent = workspace

local function mk(name, size, color, props)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Color = color
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props or {}) do p[k] = v end
	p.Parent = folder
	return p
end

local function smooth(x)
	x = math.clamp(x, 0, 1)
	return x * x * (3 - 2 * x)
end

-- every ambient sound joins the FishingAmbienceMix group once the HUD has made
-- it, so Settings > Ambience covers splashes and dolphins like it covers wind
local mixSounds = {}
local mix
local function joinMix(sound)
	table.insert(mixSounds, sound)
	if mix then sound.SoundGroup = mix end
end
task.spawn(function()
	for _ = 1, 60 do
		local g = SoundService:FindFirstChild("FishingAmbienceMix")
		if g and g:IsA("SoundGroup") then
			mix = g
			for _, s in ipairs(mixSounds) do s.SoundGroup = g end
			return
		end
		task.wait(0.25)
	end
end)

---------------------------------------------------------------- where the water is
-- Open water is wherever a ray straight down from the sky finds nothing solid
-- above the sea: no island, no dock, no boat. Cached on a 6-stud grid.
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.IgnoreWater = true
-- boats move, so they are left out of the cached rays and checked live instead
local boatSpots = {}
local function refreshFilter()
	local list = { folder }
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Character then table.insert(list, p.Character) end
	end
	local scene = workspace:FindFirstChild("IntroScene")
	if scene then table.insert(list, scene) end
	local boats = workspace:FindFirstChild("Boats")
	if boats then table.insert(list, boats) end
	rayParams.FilterDescendantsInstances = list
	table.clear(boatSpots)
	if boats then
		for _, b in ipairs(boats:GetChildren()) do
			if b:IsA("Model") then
				local cf, size = b:GetBoundingBox()
				table.insert(boatSpots, { x = cf.X, z = cf.Z, r = math.max(size.X, size.Z) / 2 + 3 })
			end
		end
	end
end
refreshFilter()

-- 2-stud cells, each sampled at its centre, so a cached answer describes the
-- whole cell (a coarse grid let fish through the dock edge and plank gaps).
-- The cache is emptied now and then because the map streams in around the player.
local CELL = 2
local waterCache, cacheSize = {}, 0
local function openWater(x, z)
	for _, b in ipairs(boatSpots) do
		if (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z) < b.r * b.r then return false end
	end
	local cx, cz = math.floor(x / CELL), math.floor(z / CELL)
	local key = cx * 100003 + cz
	local known = waterCache[key]
	if known ~= nil then return known end
	local hit = workspace:Raycast(Vector3.new((cx + 0.5) * CELL, 160, (cz + 0.5) * CELL), Vector3.new(0, -185, 0), rayParams)
	local ok = (hit == nil) or hit.Position.Y < WATER_Y - 0.6
	if cacheSize > 40000 then table.clear(waterCache) cacheSize = 0 end
	waterCache[key] = ok
	cacheSize += 1
	return ok
end
local function forgetWater()
	table.clear(waterCache)
	cacheSize = 0
end
-- open water all the way round a point
local function clearAround(x, z, r)
	if not openWater(x, z) then return false end
	for i = 0, 5 do
		local a = i * math.pi / 3
		if not openWater(x + math.cos(a) * r, z + math.sin(a) * r) then return false end
	end
	return true
end

local function eyeAndHeading()
	local cam = workspace.CurrentCamera
	local eye = cam and cam.CFrame.Position or ISLAND
	local look = cam and cam.CFrame.LookVector or Vector3.zAxis
	local flat = Vector3.new(look.X, 0, look.Z)
	local heading = flat.Magnitude > 0.05 and math.atan2(flat.Z, flat.X) or rng:NextNumber(0, math.pi * 2)
	return eye, heading
end

-- a spot on open water minR..maxR studs from the camera, mostly in front of it
local function waterNearView(minR, maxR, margin, spread)
	local eye, heading = eyeAndHeading()
	for _ = 1, 16 do
		local a = (rng:NextNumber() < 0.8) and (heading + rng:NextNumber(-(spread or 1.1), spread or 1.1)) or rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(minR, maxR)
		local x, z = eye.X + math.cos(a) * r, eye.Z + math.sin(a) * r
		if clearAround(x, z, margin or 2) then return Vector3.new(x, WATER_Y, z) end
	end
	return nil
end

-- a spot on open water in a ring round the island
local function waterNearIsland(minR, maxR)
	for _ = 1, 20 do
		local a = rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(minR, maxR)
		local x, z = ISLAND.X + math.cos(a) * r, ISLAND.Z + math.sin(a) * r
		if openWater(x, z) then return Vector3.new(x, 0, z) end
	end
	return Vector3.new(ISLAND.X + maxR, 0, ISLAND.Z)
end

local function introPlaying()
	-- (the server marks the intro done when he is set down on the sand, but the get-up and
	-- the island reveal still play after that: the screen says when it is really over)
	return player:GetAttribute("IntroState") == "Playing" or player:GetAttribute("IntroParked") == true
		or pg:GetAttribute("IntroScreen") == "Cutscene"
end
local function easeOut(x)
	x = math.clamp(x, 0, 1)
	return 1 - (1 - x) * (1 - x)
end

---------------------------------------------------------------- ripples
local RIPPLES = 20
local ripples = {}
for i = 1, RIPPLES do
	ripples[i] = {
		part = mk("Ripple", Vector3.new(0.14, 1, 1), Color3.fromRGB(228, 246, 252), {
			Shape = Enum.PartType.Cylinder,
			Material = Enum.Material.Neon,
			Transparency = 1,
		}),
		life = 0, dur = 1, x = 0, z = 0, max = 10, peak = 0.25,
	}
end

local function ripple(x, z, maxR, peak)
	for _, r in ipairs(ripples) do
		if r.life <= 0 then
			r.life = 0.0001
			r.dur = rng:NextNumber(1.7, 3.0)
			r.x, r.z = x, z
			r.max = maxR or rng:NextNumber(7, 16)
			r.peak = peak or 0.22
			return
		end
	end
end

---------------------------------------------------------------- splashes
-- a small pool, so leaps that land together each get their own spray and sound
local SPLASH_ID = system.AudioAssets.Splash.SoundId
local splashes = {}
for i = 1, 6 do
	local part = mk("Splash", Vector3.new(0.4, 0.4, 0.4), Color3.fromRGB(255, 255, 255), { Transparency = 1 })
	local spray = Instance.new("ParticleEmitter")
	spray.Enabled = false
	spray.Rate = 0
	spray.Texture = FOAM
	spray.Lifetime = NumberRange.new(0.5, 1.1)
	spray.Speed = NumberRange.new(7, 15)
	spray.SpreadAngle = Vector2.new(42, 42)
	spray.Acceleration = Vector3.new(0, -46, 0)
	spray.Drag = 1.2
	spray.Rotation = NumberRange.new(0, 360)
	spray.RotSpeed = NumberRange.new(-120, 120)
	spray.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1.1), NumberSequenceKeypoint.new(1, 0.3) })
	spray.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.2),
		NumberSequenceKeypoint.new(0.7, 0.45),
		NumberSequenceKeypoint.new(1, 1),
	})
	spray.Color = ColorSequence.new(Color3.fromRGB(236, 250, 255))
	spray.LightEmission = 0.2
	spray.Parent = part
	local sound = Instance.new("Sound")
	sound.Name = "AmbientSplash"
	sound.SoundId = SPLASH_ID
	sound.Volume = 0
	sound.RollOffMode = Enum.RollOffMode.InverseTapered
	sound.RollOffMinDistance = 14
	sound.RollOffMaxDistance = 170
	sound.Parent = part
	joinMix(sound)
	splashes[i] = { part = part, spray = spray, sound = sound }
end
local splashNext = 0

local function doSplash(x, z, power)
	splashNext = splashNext % #splashes + 1
	local s = splashes[splashNext]
	s.part.CFrame = CFrame.new(x, WATER_Y + 0.3, z)
	s.spray:Emit(math.floor(8 + power * 16))
	ripple(x, z, 8 + power * 10, 0.35)
	s.sound.Volume = math.clamp(0.10 + power * 0.14, 0, 0.32)
	s.sound.PlaybackSpeed = 1.22 - power * 0.28 + (rng:NextNumber() - 0.5) * 0.16
	s.sound:Play()
end

---------------------------------------------------------------- fish under the surface
-- Backs seen through water: mostly dark, with the odd brown or rust one so the
-- shoal does not read as one repeated object. Every one differs in size,
-- depth, speed, direction and how much its path wanders.
local FISH_COLOURS = {
	Color3.fromRGB(26, 56, 72),
	Color3.fromRGB(38, 76, 90),
	Color3.fromRGB(58, 92, 100),
	Color3.fromRGB(104, 84, 58),
	Color3.fromRGB(146, 88, 52),
}
local fish = {}
for i = 1, 16 do
	local s = rng:NextNumber(0.75, 2.05)
	local colour = FISH_COLOURS[rng:NextInteger(1, #FISH_COLOURS)]
	fish[i] = {
		body = mk("Fish", Vector3.new(1.3 * s, 0.6 * s, 3.0 * s), colour, { Material = Enum.Material.Plastic, Transparency = 0.34 }),
		tail = mk("FishTail", Vector3.new(0.22 * s, 1.0 * s, 1.3 * s), colour, { Material = Enum.Material.Plastic, Transparency = 0.42 }),
		home = (i <= 10) and waterNearIsland(140, 185) or waterNearIsland(185, 260),
		rad = rng:NextNumber(9, 26),
		speed = rng:NextNumber(0.07, 0.30) * (rng:NextNumber() < 0.5 and 1 or -1),
		phase = rng:NextNumber(0, math.pi * 2),
		depth = rng:NextNumber(-2.8, -0.75),
		wobR = rng:NextNumber(2.5, 8),
		wobRate = rng:NextNumber(0.05, 0.14),
		wobPh = rng:NextNumber(0, math.pi * 2),
		tailRate = rng:NextNumber(5, 9),
		scale = s,
		next = rng:NextNumber(5, 20),
	}
end

---------------------------------------------------------------- the game's fish, leaping
-- The catchable fish themselves (Bluefin Betta to Crownfin Koi) jump clear of
-- the water, often and where the player is looking: they burst out nose up,
-- thrash, sometimes roll, and knife back in nose down, and now and then skip
-- once or twice more. Common fish jump most, the rare ones now and then.
local SPECIES = {
	{ "BluefinBetta", 6 }, { "CoralBetta", 5 }, { "SunburstBetta", 4 }, { "JadeKoi", 3 },
	{ "AmethystAngel", 3 }, { "EmberLionfish", 2 }, { "PearlArowana", 2 }, { "CrownfinKoi", 1 },
}
local FISH_TURN = CFrame.Angles(0, -math.pi / 2, 0) -- the models' noses point along -X
local GRAVITY = 58

local function pickSpecies()
	local total = 0
	for _, s in ipairs(SPECIES) do total += s[2] end
	local roll = rng:NextNumber(0, total)
	for _, s in ipairs(SPECIES) do
		roll -= s[2]
		if roll <= 0 then return s[1] end
	end
	return SPECIES[1][1]
end

local function buildJumper(species)
	local template = FISH_MODELS and FISH_MODELS:FindFirstChild(species)
	if not template then return nil end
	local m = template:Clone()
	m.Name = "Leaping" .. species
	-- ScaleTo sets an absolute scale, and the fish models carry their own, so multiply it
	local scale = rng:NextNumber(1.6, 2.2)
	pcall(function() m:ScaleTo(m:GetScale() * scale) end)
	for _, d in ipairs(m:GetDescendants()) do
		if d:IsA("JointInstance") or d:IsA("WeldConstraint") or d:IsA("LuaSourceContainer") or d:IsA("Sound") then d:Destroy() end
	end
	local body = m.PrimaryPart or m:FindFirstChild("Body", true)
	if not body then m:Destroy() return nil end
	local parts, rel = {}, {}
	for _, p in ipairs(m:GetDescendants()) do
		if p:IsA("BasePart") then
			p.Anchored = true
			p.CanCollide = false
			p.CanQuery = false
			p.CanTouch = false
			p.CastShadow = false
			-- a Ball part only ever draws as a round sphere; a sphere mesh draws the
			-- ellipsoid its size describes (the fish models are built from these)
			if p:IsA("Part") and p.Shape == Enum.PartType.Ball and not p:FindFirstChildOfClass("SpecialMesh") then
				local sm = Instance.new("SpecialMesh")
				sm.MeshType = Enum.MeshType.Sphere
				sm.Parent = p
			end
			parts[#parts + 1] = p
			rel[#rel + 1] = body.CFrame:ToObjectSpace(p.CFrame)
		end
	end
	local _, size = m:GetBoundingBox()
	m.Parent = folder
	local cfs = table.create(#parts, PARK)
	workspace:BulkMoveTo(parts, cfs, Enum.BulkMoveMode.FireCFrameChanged)
	return { model = m, parts = parts, rel = rel, cfs = cfs, length = math.max(size.X, size.Z), active = false }
end

local jumpers = {}
for _ = 1, 12 do
	local j = buildJumper(pickSpecies())
	if j then table.insert(jumpers, j) end
end

local function poseJumper(j, frame)
	local base = frame * FISH_TURN
	for i, r in ipairs(j.rel) do j.cfs[i] = base * r end
	workspace:BulkMoveTo(j.parts, j.cfs, Enum.BulkMoveMode.FireCFrameChanged)
end

local function parkJumper(j)
	for i = 1, #j.cfs do j.cfs[i] = PARK end
	workspace:BulkMoveTo(j.parts, j.cfs, Enum.BulkMoveMode.FireCFrameChanged)
	j.active = false
	j.rollBase = 0
end

-- the whole flight over open water: under the arc and all round the landing
local function pathClear(from, dir, dist)
	for k = 1, 3 do
		local p = from + dir * (dist * k / 4)
		if not openWater(p.X, p.Z) then return false end
	end
	local land = from + dir * dist
	return clearAround(land.X, land.Z, 3)
end

-- returns false (and changes nothing) when the leap would come down on land
local function launch(j, from, dir, height, hops, quiet)
	local size = math.clamp(j.length / 5, 0.8, 1.6)
	local dist = rng:NextNumber(5, 11) * size
	if not pathClear(from, dir, dist) then
		dir = -dir
		if not pathClear(from, dir, dist) then return false end
	end
	-- deep enough that the whole body is under at both ends of the arc
	local sink = j.length * 0.55
	j.start = Vector3.new(from.X, WATER_Y - sink, from.Z)
	j.dir = dir
	j.vy = math.sqrt(2 * GRAVITY * (height + sink))
	j.dur = 2 * j.vy / GRAVITY
	j.speed = dist / j.dur
	j.t = 0
	j.roll = (rng:NextNumber() < 0.3) and (rng:NextNumber() < 0.5 and math.pi or -math.pi) or 0
	j.rollBase = j.rollBase or 0
	j.hops = hops
	j.height = height
	j.active = true
	if not quiet then doSplash(from.X, from.Z, 0.25 + size * 0.2) end
	return true
end

local function startJump(at, dir)
	for _, j in ipairs(jumpers) do
		if not j.active then
			local size = math.clamp(j.length / 5, 0.8, 1.6)
			local hops = (rng:NextNumber() < 0.25) and rng:NextInteger(1, 2) or 0
			return launch(j, at, dir, rng:NextNumber(2.2, 5.6) * size, hops)
		end
	end
	return false
end

local function stepJumper(j, dt, t)
	j.t += dt
	local tt = j.t
	if tt >= j.dur then
		local land = j.start + j.dir * j.speed * j.dur
		local size = math.clamp(j.length / 5, 0.8, 1.6)
		doSplash(land.X, land.Z, 0.45 + size * 0.3)
		-- skips on across the surface, a little lower each time (keeping any roll it made)
		j.rollBase = (j.rollBase or 0) + j.roll
		if not (j.hops > 0 and launch(j, land, j.dir, j.height * 0.62, j.hops - 1, true)) then
			parkJumper(j)
		end
		return
	end
	local pos = j.start + j.dir * j.speed * tt + Vector3.new(0, j.vy * tt - 0.5 * GRAVITY * tt * tt, 0)
	local vel = j.dir * j.speed + Vector3.new(0, j.vy - GRAVITY * tt, 0)
	local u = tt / j.dur
	-- thrashing, strongest as it leaves the water and again as it goes back in
	local thrash = (0.35 + 0.65 * math.abs(1 - 2 * u)) * 0.22
	local frame = CFrame.lookAt(pos, pos + vel.Unit)
		* CFrame.Angles(0, 0, (j.rollBase or 0) + j.roll * smooth(u))
		* CFrame.Angles(0, math.sin(t * 27 + j.length) * thrash, 0)
	poseJumper(j, frame)
end

---------------------------------------------------------------- dolphins
-- A pod of two to four crosses the view every so often, porpoising: out of the
-- water in a long arc, back in nose first, a dip, and out again, in loose
-- formation. They call as they come. Each is built from blocks, about seven
-- studs nose to flukes: a grey back, pale belly, a rounded melon and beak, a
-- swept dorsal fin, and a tail stock on its own hinge so the flukes kick.
local dolphinCall = ASSETS and ASSETS:FindFirstChild("DolphinCall")
local DOLPHIN_BACK = Color3.fromRGB(84, 110, 132)
local DOLPHIN_SIDE = Color3.fromRGB(112, 138, 158)
local DOLPHIN_BELLY = Color3.fromRGB(214, 222, 228)
local EYE_DARK = Color3.fromRGB(27, 42, 53)
-- { name, size, offset from the body centre, colour, turn, wedge }, in the
-- dolphin's own frame: -Z forward, +Y up
local DOLPHIN_BODY = {
	{ "Body", Vector3.new(1.2, 1.1, 2.4), Vector3.new(0, 0, 0), DOLPHIN_SIDE },
	{ "Back", Vector3.new(0.92, 0.14, 2.2), Vector3.new(0, 0.56, 0.1), DOLPHIN_BACK },
	{ "Belly", Vector3.new(1.0, 0.32, 2.0), Vector3.new(0, -0.43, -0.1), DOLPHIN_BELLY },
	{ "Head", Vector3.new(1.0, 0.92, 0.9), Vector3.new(0, 0.04, -1.6), DOLPHIN_SIDE },
	{ "Melon", Vector3.new(0.8, 0.34, 0.62), Vector3.new(0, 0.46, -1.62), DOLPHIN_BACK },
	{ "Beak", Vector3.new(0.46, 0.32, 0.66), Vector3.new(0, -0.14, -2.34), DOLPHIN_SIDE },
	{ "Jaw", Vector3.new(0.42, 0.12, 0.6), Vector3.new(0, -0.31, -2.3), DOLPHIN_BELLY },
	{ "EyeL", Vector3.new(0.06, 0.12, 0.12), Vector3.new(-0.51, 0.1, -1.8), EYE_DARK },
	{ "EyeR", Vector3.new(0.06, 0.12, 0.12), Vector3.new(0.51, 0.1, -1.8), EYE_DARK },
	-- a wedge is tall at its back end, which is exactly a swept dorsal fin
	{ "Dorsal", Vector3.new(0.14, 0.8, 0.95), Vector3.new(0, 0.95, 0.25), DOLPHIN_BACK, nil, true },
	{ "FlipperL", Vector3.new(0.8, 0.08, 0.42), Vector3.new(-0.74, -0.36, -0.95), DOLPHIN_BACK, CFrame.Angles(0, 0.5, 0.45) },
	{ "FlipperR", Vector3.new(0.8, 0.08, 0.42), Vector3.new(0.74, -0.36, -0.95), DOLPHIN_BACK, CFrame.Angles(0, -0.5, -0.45) },
}
local DOLPHIN_HINGE = Vector3.new(0, 0.02, 1.15)
local DOLPHIN_TAIL = { -- offsets from the hinge
	{ "TailStock", Vector3.new(0.72, 0.64, 1.2), Vector3.new(0, 0, 0.55), DOLPHIN_SIDE },
	{ "TailTop", Vector3.new(0.52, 0.12, 1.05), Vector3.new(0, 0.32, 0.5), DOLPHIN_BACK },
	{ "FlukeL", Vector3.new(1.0, 0.09, 0.46), Vector3.new(-0.48, 0, 1.3), DOLPHIN_BACK, CFrame.Angles(0, -0.38, 0) },
	{ "FlukeR", Vector3.new(1.0, 0.09, 0.46), Vector3.new(0.48, 0, 1.3), DOLPHIN_BACK, CFrame.Angles(0, 0.38, 0) },
}
local function buildDolphin(sc)
	local d = { parts = {}, rel = {}, tail = {}, cfs = {}, busy = false, shown = 0 }
	local function add(spec, list)
		local p
		if spec[6] then
			p = Instance.new("WedgePart")
			p.Anchored = true
			p.CanCollide = false
			p.CanQuery = false
			p.CanTouch = false
			p.CastShadow = false
			p.Name = "Dolphin" .. spec[1]
			p.Size = spec[2] * sc
			p.Color = spec[4]
			p.Material = Enum.Material.Plastic
			p.CFrame = PARK
			p.Parent = folder
		else
			p = mk("Dolphin" .. spec[1], spec[2] * sc, spec[4], { Material = Enum.Material.Plastic, CFrame = PARK })
		end
		table.insert(d.parts, p)
		table.insert(list, CFrame.new(spec[3] * sc) * (spec[5] or CFrame.identity))
		table.insert(d.cfs, PARK)
	end
	for _, spec in ipairs(DOLPHIN_BODY) do add(spec, d.rel) end
	d.bodyCount = #d.parts
	for _, spec in ipairs(DOLPHIN_TAIL) do add(spec, d.tail) end
	d.hinge = CFrame.new(DOLPHIN_HINGE * sc)
	d.length = 5.5 * sc
	return d
end
-- one frame of a dolphin: where it is, how far the flukes kick, how solid it looks
local function poseDolphin(d, frame, kick, transparency)
	local nb = d.bodyCount
	for i = 1, nb do d.cfs[i] = frame * d.rel[i] end
	local tailFrame = frame * d.hinge * CFrame.Angles(kick, 0, 0)
	for i, r in ipairs(d.tail) do d.cfs[nb + i] = tailFrame * r end
	workspace:BulkMoveTo(d.parts, d.cfs, Enum.BulkMoveMode.FireCFrameChanged)
	if math.abs(transparency - d.shown) > 0.02 or ((transparency == 0 or transparency == 1) and d.shown ~= transparency) then
		d.shown = transparency
		for _, p in ipairs(d.parts) do p.Transparency = transparency end
	end
end
local dolphins = {}
for i = 1, 6 do dolphins[i] = buildDolphin(rng:NextNumber(0.82, 1.08) * 1.25) end
local callHolder = mk("DolphinVoice", Vector3.new(0.4, 0.4, 0.4), Color3.new(1, 1, 1), { Transparency = 1 })
local call
if dolphinCall then
	call = dolphinCall:Clone()
	call.Name = "AmbientDolphins"
	call.Volume = 0.55
	call.RollOffMode = Enum.RollOffMode.InverseTapered
	call.RollOffMinDistance = 24
	call.RollOffMaxDistance = 280
	call.Parent = callHolder
	joinMix(call)
end

local pods = {}

local function startPod()
	local free = {}
	for _, d in ipairs(dolphins) do if not d.busy then table.insert(free, d) end end
	if #free < 2 then return false end
	local eye, heading = eyeAndHeading()
	for _ = 1, 10 do
		local centre = waterNearView(55, 165, 10, 0.8)
		if not centre then return false end
		-- across the view, so the whole pod is seen passing
		local across = heading + (rng:NextNumber() < 0.5 and 1 or -1) * math.pi / 2 + rng:NextNumber(-0.45, 0.45)
		local dir = Vector3.new(math.cos(across), 0, math.sin(across))
		local length = rng:NextNumber(80, 125)
		local origin = centre - dir * length / 2
		local okPath = true
		for k = 0, 10 do
			local p = origin + dir * (length * k / 10)
			if not clearAround(p.X, p.Z, 6) then okPath = false break end
		end
		if okPath then
			local side = Vector3.new(-dir.Z, 0, dir.X)
			local pod = { origin = origin, dir = dir, side = side, length = length, speed = rng:NextNumber(12, 16), t = 0, members = {}, calls = 0, nextCall = 0.2 }
			pod.dur = length / pod.speed
			local count = math.min(#free, rng:NextInteger(2, 4))
			for m = 1, count do
				local d = free[m]
				d.busy = true
				table.insert(pod.members, {
					d = d,
					back = (m - 1) * rng:NextNumber(3.5, 6) + rng:NextNumber(0, 1.5),
					lateral = (m == 1) and 0 or rng:NextNumber(-5, 5),
					period = rng:NextNumber(1.55, 1.9),
					air = rng:NextNumber(0.5, 0.6),
					height = rng:NextNumber(2.6, 4.2),
					phase = rng:NextNumber(0, 1),
					wasUp = false,
				})
			end
			-- run until the last dolphin in the line has faded out, not just the leader
			local maxBack = 0
			for _, mm in ipairs(pod.members) do maxBack = math.max(maxBack, mm.back) end
			pod.dur = (pod.length + maxBack) / pod.speed
			table.insert(pods, pod)
			return true
		end
	end
	return false
end

-- height of one dolphin above (or below) the water at cycle phase ph (0..1)
local function porpoise(ph, air, height)
	if ph < air then
		local u = ph / air
		return WATER_Y - 0.9 + (height + 0.9) * 4 * u * (1 - u)
	end
	local u = (ph - air) / (1 - air)
	return WATER_Y - 0.9 - 1.6 * math.sin(math.pi * u)
end

local function stepPod(pod, dt, t)
	pod.t += dt
	local done = pod.t >= pod.dur
	for _, m in ipairs(pod.members) do
		local d = m.d
		if done then
			poseDolphin(d, PARK, 0, 0)
			d.busy = false
		else
			local travel = pod.speed * pod.t - m.back
			local function at(tt)
				local tr = pod.speed * tt - m.back
				local ph = (tt / m.period + m.phase) % 1
				local flat = pod.origin + pod.dir * tr + pod.side * m.lateral
				return Vector3.new(flat.X, porpoise(ph, m.air, m.height), flat.Z)
			end
			local pos = at(pod.t)
			local ahead = at(pod.t + 0.04)
			local vel = ahead - pos
			if vel.Magnitude < 1e-4 then vel = pod.dir end
			-- the flukes beat hardest climbing out of the water and diving back in
			local kick = math.sin(t * 5.2 + m.back) * 0.32 * (0.6 + 0.4 * math.min(1, math.abs(vel.Unit.Y) * 3))
			-- ease in and out of the pass: they arrive from the deep and leave into it
			local edge = math.min(travel / 8, (pod.length - travel) / 8)
			poseDolphin(d, CFrame.lookAt(pos, pos + vel.Unit) * CFrame.Angles(0, 0, math.sin(t * 1.3 + m.back) * 0.08), kick, 1 - smooth(edge))
			-- a splash each time one breaks the surface and each time it goes back in
			local up = pos.Y > WATER_Y + 0.1
			if up ~= m.wasUp and edge > 0.3 then doSplash(pos.X, pos.Z, up and 0.55 or 0.8) end
			m.wasUp = up
			if m == pod.members[1] then
				callHolder.CFrame = CFrame.new(pos.X, WATER_Y + 1, pos.Z)
			end
		end
	end
	if call and not done then
		pod.nextCall -= dt
		if pod.nextCall <= 0 and pod.calls < 3 then
			pod.calls += 1
			pod.nextCall = rng:NextNumber(3.5, 6)
			call.PlaybackSpeed = rng:NextNumber(0.94, 1.08)
			call.TimePosition = 0
			call:Play()
		end
	end
	return done
end

---------------------------------------------------------------- a shoal that surfaces
local shoal = {}
for i = 1, 9 do
	shoal[i] = {
		part = mk("ShoalFish", Vector3.new(0.5, 0.34, 1.3), Color3.fromRGB(96, 148, 170), { Material = Enum.Material.Plastic, Transparency = 0.25 }),
		off = Vector3.new(rng:NextNumber(-4, 4), rng:NextNumber(-1.2, 1.2), rng:NextNumber(-5, 5)),
		ph = rng:NextNumber(0, math.pi * 2),
	}
end
local shoalAngle = rng:NextNumber(0, math.pi * 2)
local shoalRadius = rng:NextNumber(150, 200)
local shoalNextBreach = 12

---------------------------------------------------------------- gulls
-- Built from blocks like everything else on the map: white body and head, a
-- grey back, grey wings with black tips, a yellow beak with its red spot. Each
-- wing is two pieces, hinged at the shoulder and again at the wrist, so the
-- tips trail the stroke. They flap in short bursts between long glides, bank
-- into their turns and wheel over the island and the water around it.
local GULL_WHITE = Color3.fromRGB(242, 244, 246)
local GULL_GREY = Color3.fromRGB(158, 166, 176)
local GULL_DARK = Color3.fromRGB(40, 44, 52)
local GULL_BEAK = Color3.fromRGB(246, 196, 60)
local GULL_SPOT = Color3.fromRGB(214, 72, 56)
-- { size, offset } in the bird's own frame: -Z forward, +Y up, +X its right
local GULL_BODY = {
	{ Vector3.new(0.7, 0.6, 1.5), Vector3.new(0, 0, 0), GULL_WHITE },         -- body
	{ Vector3.new(0.74, 0.1, 1.1), Vector3.new(0, 0.33, 0.05), GULL_GREY },   -- back
	{ Vector3.new(0.5, 0.48, 0.52), Vector3.new(0, 0.24, -0.95), GULL_WHITE }, -- head
	{ Vector3.new(0.14, 0.12, 0.36), Vector3.new(0, 0.18, -1.38), GULL_BEAK }, -- beak
	{ Vector3.new(0.08, 0.06, 0.08), Vector3.new(0, 0.1, -1.46), GULL_SPOT },  -- the red spot
	{ Vector3.new(0.07, 0.08, 0.08), Vector3.new(-0.255, 0.32, -1.05), GULL_DARK },
	{ Vector3.new(0.07, 0.08, 0.08), Vector3.new(0.255, 0.32, -1.05), GULL_DARK },
	{ Vector3.new(0.52, 0.12, 0.5), Vector3.new(0, 0.06, 0.98), GULL_WHITE },  -- tail
	{ Vector3.new(0.5, 0.13, 0.14), Vector3.new(0, 0.06, 1.26), GULL_DARK },   -- tail tip
	{ Vector3.new(0.3, 0.08, 0.2), Vector3.new(0, -0.33, 0.35), GULL_BEAK },   -- tucked feet
}
-- right wing; the left one is the mirror image
local SHOULDER = Vector3.new(0.34, 0.2, -0.12)
local INNER = { Vector3.new(1.3, 0.1, 0.78), Vector3.new(0.65, 0, 0.04) }  -- from the shoulder
local WRIST = Vector3.new(1.28, 0, 0)
local OUTER = { Vector3.new(1.15, 0.09, 0.6), Vector3.new(0.56, 0, 0.1) }  -- from the wrist
local TIP = { Vector3.new(0.42, 0.1, 0.52), Vector3.new(1.05, 0, 0.13) }
local function mirror(v, side) return Vector3.new(v.X * side, v.Y, v.Z) end
local function buildGull(sc)
	local g = { parts = {}, cfs = {}, rel = {}, wings = {} }
	local function add(size, color)
		table.insert(g.parts, mk("Gull", size * sc, color, { Material = Enum.Material.Plastic, CFrame = PARK }))
		table.insert(g.cfs, PARK)
		return #g.parts
	end
	for _, spec in ipairs(GULL_BODY) do
		add(spec[1], spec[3])
		table.insert(g.rel, CFrame.new(spec[2] * sc))
	end
	g.bodyCount = #g.parts
	for _, side in ipairs({ -1, 1 }) do
		table.insert(g.wings, {
			side = side,
			inner = add(INNER[1], GULL_GREY), outer = add(OUTER[1], GULL_GREY), tip = add(TIP[1], GULL_DARK),
			shoulder = CFrame.new(mirror(SHOULDER, side) * sc),
			innerOff = CFrame.new(mirror(INNER[2], side) * sc),
			wrist = CFrame.new(mirror(WRIST, side) * sc),
			outerOff = CFrame.new(mirror(OUTER[2], side) * sc),
			tipOff = CFrame.new(mirror(TIP[2], side) * sc),
		})
	end
	return g
end
-- beat lifts both wings from the shoulder (positive is up); tip bends the wrists
local function poseGull(g, frame, beat, tip)
	for i = 1, g.bodyCount do g.cfs[i] = frame * g.rel[i] end
	for _, w in ipairs(g.wings) do
		local arm = frame * w.shoulder * CFrame.Angles(0, 0, w.side * beat)
		g.cfs[w.inner] = arm * w.innerOff
		local hand = arm * w.wrist * CFrame.Angles(0, 0, w.side * tip)
		g.cfs[w.outer] = hand * w.outerOff
		g.cfs[w.tip] = hand * w.tipOff
	end
	workspace:BulkMoveTo(g.parts, g.cfs, Enum.BulkMoveMode.FireCFrameChanged)
end
-- A few birds, high up, each on its own lane: every one circles the island the
-- same way at the same pace, spread evenly round the circle, on its own radius
-- and height, so they never bunch up or cross head-on. Their lanes breathe very
-- slowly, and they glide far more than they flap.
local GULLS = 7
local GULL_OMEGA = 0.052 -- radians a second: a lap takes about two minutes
local function shuffled(list)
	local out = table.clone(list)
	for i = #out, 2, -1 do
		local j = rng:NextInteger(1, i)
		out[i], out[j] = out[j], out[i]
	end
	return out
end
local rOrder = shuffled({ 75, 90, 105, 120, 135, 150, 165 })
local hOrder = shuffled({ 60, 64, 68, 72, 76, 80, 84 })
local gulls = {}
for i = 1, GULLS do
	local g = buildGull(rng:NextNumber(1.1, 1.35))
	g.rad = rOrder[i] + rng:NextNumber(-3, 3)
	g.radWob = rng:NextNumber(3, 7)
	g.radRate = rng:NextNumber(0.012, 0.028)
	g.radPh = rng:NextNumber(0, math.pi * 2)
	g.y = hOrder[i] + rng:NextNumber(-1, 1)
	g.yWob = rng:NextNumber(1.5, 3.5)
	g.yRate = rng:NextNumber(0.02, 0.045)
	g.yPh = rng:NextNumber(0, math.pi * 2)
	g.speed = GULL_OMEGA
	g.ph = (i - 1) / GULLS * math.pi * 2 + rng:NextNumber(-0.18, 0.18)
	g.flapHz = rng:NextNumber(1.9, 2.4)
	g.flapPh = rng:NextNumber(0, math.pi * 2)
	g.gliding = rng:NextNumber() < 0.8
	g.glideT = rng:NextNumber(2, 9)
	g.amp = g.gliding and 0.03 or 0.5
	g.lift, g.liftWant = 0, 0 -- eased extra height over whatever stands under its path
	g.probeT = i * 0.035 -- the obstacle checks are spread over the frames
	-- keep the whole circle clear of what is already loaded under it
	local top = WATER_Y
	for k = 0, 23 do
		local a = k / 24 * math.pi * 2
		for _, rr in ipairs({ g.rad - g.radWob, g.rad, g.rad + g.radWob }) do
			local hit = workspace:Raycast(Vector3.new(ISLAND.X + math.cos(a) * rr, 400, ISLAND.Z + math.sin(a) * rr), Vector3.new(0, -420, 0), rayParams)
			if hit then top = math.max(top, hit.Position.Y) end
		end
	end
	g.y = math.max(g.y, top + 20 + g.yWob)
	gulls[#gulls + 1] = g
end
-- where a bird is on its lane at time tt
local function gullAt(b, tt)
	local ang = tt * b.speed + b.ph
	local rad = b.rad + math.sin(tt * b.radRate + b.radPh) * b.radWob
	return Vector3.new(ISLAND.X + math.cos(ang) * rad, b.y + math.sin(tt * b.yRate + b.yPh) * b.yWob, ISLAND.Z + math.sin(ang) * rad)
end

---------------------------------------------------------------- the shoreline
-- Soft lines of foam roll in toward the island, meet the boardwalk's edge (or
-- run up the sand at the cove) and draw back again, now and then with a small
-- splash where they meet the wall. The shore is measured, not written down: rays
-- march in from the sea round the whole island (again as the map streams in), so
-- the docks, the cove and any later change to the island are found by themselves.
local SHORE_BINS = 120
local SHORE_OUT, SHORE_IN = 175, 100
-- (the island's base reaches out under the water just below the surface; that
-- is sea bed, not shore, so land must come within 0.3 of the waterline)
local LAND_Y = WATER_Y - 0.3
local FOAM_Y = WATER_Y + 0.04
local WAVE_POOL, WAVE_SEGS = 9, 6
local WAVE_COLOUR = Color3.fromRGB(234, 247, 251)
local WIND_FALLBACK = Vector3.new(math.cos(math.rad(24)), 0, math.sin(math.rad(24)))
local shore = {}
local profileQueue, queued = {}, {}
local function enqueue(k)
	if not queued[k] then queued[k] = true table.insert(profileQueue, k) end
end
local function landY(x, z, tx, tz)
	-- two rays side by side, so a gap between planks never reads as open water
	for _, s in ipairs({ -0.7, 0.7 }) do
		local hit = workspace:Raycast(Vector3.new(x + s * tx, 14, z + s * tz), Vector3.new(0, -40, 0), rayParams)
		if hit and hit.Position.Y >= LAND_Y then return hit.Position.Y end
	end
	return nil
end
local function binAngle(k) return (k - 0.5) / SHORE_BINS * math.pi * 2 end
local function probeBin(k)
	-- a re-measured bin keeps its smoothed edge until settleShore works it out again,
	-- so the foam along it does not blink out while the whole shore is re-measured
	local prev = shore[k]
	local function put(e)
		if prev and prev.rs and prev.kind == e.kind then e.rs = prev.rs end
		shore[k] = e
	end
	local a = binAngle(k)
	local nx, nz = math.cos(a), math.sin(a)
	local tx, tz = -nz, nx
	local function at(r) return ISLAND.X + nx * r, ISLAND.Z + nz * r end
	local x, z = at(SHORE_OUT)
	if landY(x, z, tx, tz) then shore[k] = { kind = "none" } return end
	local rWater, rLand = SHORE_OUT, nil
	for r = SHORE_OUT - 3, SHORE_IN, -3 do
		x, z = at(r)
		if landY(x, z, tx, tz) then rLand = r break end
		rWater = r
	end
	if not rLand then shore[k] = { kind = "unknown" } return end -- not streamed in yet
	for _ = 1, 3 do
		local mid = (rWater + rLand) / 2
		x, z = at(mid)
		if landY(x, z, tx, tz) then rLand = mid else rWater = mid end
	end
	local edge = (rWater + rLand) / 2
	x, z = at(edge - 1)
	local y1 = landY(x, z, tx, tz) or LAND_Y
	if y1 > WATER_Y + 1.2 then
		put({ kind = "wall", r = edge })
	else
		x, z = at(edge - 4)
		local y4 = landY(x, z, tx, tz) or y1
		local slope = math.max(0.05, (y4 - LAND_Y) / 4)
		put({ kind = "beach", r = edge, slope = slope, reach = math.clamp(0.95 / slope, 1, 5) })
	end
end
local function wrapK(k) return (k - 1) % SHORE_BINS + 1 end
local function solid(e) return e and (e.kind == "wall" or e.kind == "beach") end
-- after a pass: a wall bin that sticks far out past its neighbours is a dock or
-- a pier, not the shore (no waves there); then smooth the edge a little
local function settleShore()
	for k = 1, SHORE_BINS do
		local e = shore[k]
		if e and e.kind == "wall" then
			local rs = {}
			for d = -5, 5 do
				local n = shore[wrapK(k + d)]
				if d ~= 0 and solid(n) then table.insert(rs, n.r) end
			end
			table.sort(rs)
			local median = rs[math.max(1, math.floor(#rs / 2))]
			if median and e.r > median + 8 then e.kind = "none" end
		end
	end
	for k = 1, SHORE_BINS do
		local e = shore[k]
		if solid(e) then
			local sum, w = e.r * 2, 2
			for _, d in ipairs({ -1, 1 }) do
				local n = shore[wrapK(k + d)]
				if solid(n) and n.kind == e.kind then sum += n.r w += 1 end
			end
			e.rs = sum / w
		end
	end
end
-- the shore at any angle, between the two nearest bins (nil where there is none)
local function shoreAt(theta)
	local f = (theta / (math.pi * 2)) % 1 * SHORE_BINS + 0.5
	local k0 = math.floor(f)
	local a = f - k0
	local e0, e1 = shore[wrapK(k0)], shore[wrapK(k0 + 1)]
	if not (solid(e0) and solid(e1) and e0.rs and e1.rs) then return nil end
	local beach = (e0.kind == "beach" and 1 - a or 0) + (e1.kind == "beach" and a or 0)
	return {
		r = e0.rs + (e1.rs - e0.rs) * a,
		beach = beach,
		slope = ((e0.slope or 0.3) * (1 - a) + (e1.slope or 0.3) * a),
		reach = ((e0.reach or 1) * (1 - a) + (e1.reach or 1) * a),
		wall = e0.kind == "wall" and e1.kind == "wall",
	}
end
task.delay(1.5, function() for k = 1, SHORE_BINS do enqueue(k) end end)
if RunService:IsStudio() then _G.AmbientShore = { shore = shore, shoreAt = shoreAt } end -- (for checking in Studio)

-- the foam lines: a pool, each line six flat segments sharing their end points
local waves, waveParts, waveCfs = {}, {}, {}
for i = 1, WAVE_POOL do
	local w = { active = false, segs = {}, idx = {} }
	for j = 1, WAVE_SEGS do
		local p = mk("ShoreFoam", Vector3.new(1, 0.05, 1), WAVE_COLOUR, { Transparency = 1, CFrame = PARK })
		table.insert(waveParts, p)
		table.insert(waveCfs, PARK)
		w.segs[j] = p
		w.idx[j] = #waveParts
	end
	waves[i] = w
end
local TAPER_T = { 0.28, 0.1, 0, 0, 0.1, 0.28 }
local TAPER_W = { 0.55, 0.85, 1, 1, 0.85, 0.55 }
local U_HIT = 0.6
local nextWave, heroT = 2, 0

-- a gentle spray where a wave meets the wall; its own small pool, so the leaping
-- fish and dolphins keep their splashes
local shoreSplashes = {}
for i = 1, 3 do
	local part = mk("ShoreSplash", Vector3.new(0.4, 0.4, 0.4), Color3.fromRGB(255, 255, 255), { Transparency = 1 })
	local spray = Instance.new("ParticleEmitter")
	spray.Enabled = false
	spray.Rate = 0
	spray.Texture = FOAM
	spray.Lifetime = NumberRange.new(0.4, 0.8)
	spray.Speed = NumberRange.new(2.5, 5.5)
	spray.SpreadAngle = Vector2.new(30, 30)
	spray.Acceleration = Vector3.new(0, -32, 0)
	spray.Drag = 1.5
	spray.Rotation = NumberRange.new(0, 360)
	spray.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0.15) })
	spray.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.3), NumberSequenceKeypoint.new(0.6, 0.6), NumberSequenceKeypoint.new(1, 1) })
	spray.Color = ColorSequence.new(Color3.fromRGB(236, 250, 255))
	spray.LightEmission = 0.15
	spray.Parent = part
	local sound = Instance.new("Sound")
	sound.Name = "ShoreSplash"
	sound.SoundId = SPLASH_ID
	sound.Volume = 0
	sound.RollOffMode = Enum.RollOffMode.InverseTapered
	sound.RollOffMinDistance = 8
	sound.RollOffMaxDistance = 90
	sound.Parent = part
	joinMix(sound)
	shoreSplashes[i] = { part = part, spray = spray, sound = sound }
end
local shoreSplashNext, shoreSplashCool = 0, 0
local function shoreSplash(pos, outward, power)
	shoreSplashNext = shoreSplashNext % #shoreSplashes + 1
	local s = shoreSplashes[shoreSplashNext]
	s.part.CFrame = CFrame.lookAt(pos, pos + outward) * CFrame.Angles(math.rad(-35), 0, 0) -- tipped out to sea
	s.spray:Emit(4 + math.floor(power * 10))
	s.sound.Volume = 0.035 + power * 0.08
	s.sound.PlaybackSpeed = rng:NextNumber(1.35, 1.6)
	s.sound:Play()
	ripple(pos.X + outward.X * 1.5, pos.Z + outward.Z * 1.5, rng:NextNumber(3, 4.5), 0.12)
end

local function washUp()
	local props = system:FindFirstChild("IntroProps")
	local w = props and props:GetAttribute("WashUp")
	return typeof(w) == "CFrame" and w.Position or nil
end
local function startWave(theta, opts)
	for _, w in ipairs(waves) do
		if not w.active then
			local s = shoreAt(theta)
			if not s then return false end
			w.active = true
			w.theta = theta
			w.arc = opts.arc or rng:NextNumber(16, 30)
			w.span = w.arc / s.r
			w.life = opts.life or rng:NextNumber(8.5, 11)
			w.age = opts.age or 0
			w.d0 = opts.d0 or rng:NextNumber(11, 15)
			w.peel = opts.peel or (rng:NextNumber(0.03, 0.07) * (rng:NextNumber() < 0.5 and -1 or 1))
			w.seed = rng:NextNumber(0, math.pi * 2)
			w.splashed = false
			return true
		end
	end
	return false
end
local function spanFree(theta, span)
	for _, w in ipairs(waves) do
		if w.active and w.age / w.life < 0.3 then
			local d = math.abs(((theta - w.theta + math.pi) % (math.pi * 2)) - math.pi)
			if d < (span + w.span) * 0.3 then return false end
		end
	end
	return true
end
local lastEye = nil
local function spawnWaves(dt, eye, look, quiet, windFlat, reduced)
	local toEye = Vector3.new(eye.X - ISLAND.X, 0, eye.Z - ISLAND.Z)
	if toEye.Magnitude > 420 then return end
	local thetaCam = math.atan2(toEye.Z, toEye.X)
	local nearIsland = toEye.Magnitude < 60
	local function candidate()
		for _ = 1, 10 do
			local th = nearIsland and rng:NextNumber(0, math.pi * 2) or (thetaCam + rng:NextNumber(-1.1, 1.1))
			local s = shoreAt(th)
			if s then
				local n = Vector3.new(math.cos(th), 0, math.sin(th))
				local P = Vector3.new(ISLAND.X, 0, ISLAND.Z) + n * s.r
				local v = Vector3.new(P.X - eye.X, 0, P.Z - eye.Z)
				local dist = v.Magnitude
				local lookFlat = Vector3.new(look.X, 0, look.Z)
				local inView = dist < 45 or (lookFlat.Magnitude > 0.05 and v.Unit:Dot(lookFlat.Unit) > 0.2)
				local windward = math.max(0, -n:Dot(windFlat))
				if dist > 10 and dist < 230 and inView and rng:NextNumber() < 0.4 + 0.6 * windward and spanFree(th, 22 / s.r) then
					return th
				end
			end
		end
		return nil
	end
	-- a jump of the camera (a cut, the cutscene reaching the shore): some waves already under way
	if not lastEye or (eye - lastEye).Magnitude > 60 then
		for _ = 1, 5 do
			local th = candidate()
			if th then startWave(th, { age = rng:NextNumber(0, 0.85) * 10 }) end
		end
	end
	lastEye = eye
	-- the arrival: gentle waves wash in just below where the castaway lies
	local wash = quiet and washUp()
	if wash and (eye - wash).Magnitude < 50 then
		heroT -= dt
		if heroT <= 0 then
			heroT = rng:NextNumber(5, 7)
			local th = math.atan2(wash.Z - ISLAND.Z, wash.X - ISLAND.X) + rng:NextNumber(-0.04, 0.04)
			startWave(th, { arc = rng:NextNumber(20, 26), d0 = 12, life = 9.5, peel = 0.04 })
		end
	end
	local windK = math.clamp((workspace.GlobalWind.Magnitude / 20 - 0.62) / 0.55, 0, 1)
	local rate = (0.85 + 0.3 * windK) * (reduced and 0.5 or 1) * (wash and 0.7 or 1)
	nextWave -= dt * rate
	if nextWave <= 0 then
		nextWave = rng:NextNumber(1.3, 2.4)
		local th = candidate()
		if th then startWave(th, {}) end
	end
end
local function hideWave(w)
	for j = 1, WAVE_SEGS do
		waveCfs[w.idx[j]] = PARK
		if w.segs[j].Transparency ~= 1 then w.segs[j].Transparency = 1 end
	end
end
local function q(x, step) return math.floor(x / step + 0.5) * step end
local function driveWaves(dt, eye, dayness, quiet)
	local wash = quiet and washUp()
	local rBody = wash and Vector3.new(wash.X - ISLAND.X, 0, wash.Z - ISLAND.Z).Magnitude
	local night = 1 - 0.3 * math.clamp((0.34 - dayness) / 0.28, 0, 1)
	for _, w in ipairs(waves) do
		if w.active then
			w.age += dt
			local u = w.age / w.life
			if u >= 1 then
				w.active = false
				hideWave(w)
			else
				local mid = Vector3.new(ISLAND.X + math.cos(w.theta) * 130, 0, ISLAND.Z + math.sin(w.theta) * 130)
				if (mid - Vector3.new(eye.X, 0, eye.Z)).Magnitude > 300 then
					hideWave(w)
				else
					local pts = {}
					local hidden = false
					local vMid = 0
					for j = 0, WAVE_SEGS do
						local th = w.theta + w.span * (j / WAVE_SEGS - 0.5)
						local s = shoreAt(th)
						if not s then hidden = true break end
						local uj = math.clamp(u + w.peel * (j / WAVE_SEGS - 0.5), 0, 1)
						local d, width, T
						local v = math.max(0, (uj - U_HIT) / (1 - U_HIT))
						if uj < U_HIT then
							d = w.d0 * (1 - uj / U_HIT) ^ 1.2
							width = 0.3 + 0.6 * smooth(uj / U_HIT)
							T = 1 - 0.42 * smooth(uj / 0.3)
						else
							local reach = s.reach
							if rBody and math.abs(((th - math.atan2(wash.Z - ISLAND.Z, wash.X - ISLAND.X) + math.pi) % (math.pi * 2)) - math.pi) * s.r < 12 then
								-- never let the swash reach the castaway lying on the sand
								reach = math.min(reach, math.max(0.6, (s.r - rBody) - 1.5))
							end
							local dWall = 2.2 * easeOut(v)
							local dBeach = v < 0.4 and -reach * easeOut(v / 0.4) or (-reach + (1.2 + reach) * smooth((v - 0.4) / 0.6))
							d = dWall + (dBeach - dWall) * s.beach
							width = (0.9 - 0.5 * v) * (1 - s.beach) + 0.7 * s.beach
							T = 0.58 + 0.42 * smooth(v / (0.75 + 0.25 * s.beach))
						end
						if j == WAVE_SEGS // 2 then vMid = uj end
						d += 0.3 * math.sin(j * 1.9 + w.seed) * (1 - v)
						local r = s.r + d
						local y = d >= 0 and FOAM_Y or math.max(FOAM_Y, LAND_Y + s.slope * (-d) + 0.05)
						pts[j] = { p = Vector3.new(ISLAND.X + math.cos(th) * r, y, ISLAND.Z + math.sin(th) * r), width = width, T = T, slope = (d < 0) and s.slope or 0, n = Vector3.new(math.cos(th), 0, math.sin(th)), wall = s.wall }
					end
					if hidden then
						hideWave(w)
					else
						for j = 1, WAVE_SEGS do
							local a, b = pts[j - 1], pts[j]
							local len = (b.p - a.p).Magnitude
							local m = (a.p + b.p) / 2
							local up = (a.slope > 0) and (Vector3.yAxis + a.n * a.slope).Unit or Vector3.yAxis
							local T = math.clamp(math.max(a.T, b.T) + TAPER_T[j], 0, 1)
							T = 1 - (1 - T) * night
							local width = (a.width + b.width) / 2 * TAPER_W[j]
							-- (never across the camera itself)
							if (m - eye).Magnitude < 4 then T = 1 end
							if len < 0.05 then T = 1 end
							waveCfs[w.idx[j]] = CFrame.lookAt(m, b.p, up)
							local seg = w.segs[j]
							local size = Vector3.new(q(width, 0.03), 0.05, len)
							if (seg.Size - size).Magnitude > 0.02 then seg.Size = size end
							local tq = q(T, 0.025)
							if seg.Transparency ~= tq then seg.Transparency = tq end
						end
						-- the little splash, once, as the wave meets the wall
						if not w.splashed and vMid >= U_HIT then
							w.splashed = true
							local c = pts[WAVE_SEGS // 2]
							local dist = (c.p - eye).Magnitude
							local chance = (c.wall and 0.4 or 0.12) * (pg:GetAttribute("ReduceMotion") and 0.5 or 1)
							local nearBody = wash and (c.p - wash).Magnitude < 14
							if shoreSplashCool <= 0 and dist > 10 and dist < 150 and not nearBody and rng:NextNumber() < chance then
								shoreSplashCool = rng:NextNumber(1.8, 3.2)
								local s = shoreAt(w.theta)
								if s then
									local n = c.n
									shoreSplash(Vector3.new(ISLAND.X, WATER_Y + 0.15, ISLAND.Z) + n * (s.r + 0.3), n, rng:NextNumber(0.15, 0.3))
								end
							end
						end
					end
				end
			end
		end
	end
	shoreSplashCool -= dt
	workspace:BulkMoveTo(waveParts, waveCfs, Enum.BulkMoveMode.FireCFrameChanged)
end

---------------------------------------------------------------- fireflies (night only)
local flies = {}
for i = 1, 26 do
	local a = rng:NextNumber(0, math.pi * 2)
	local r = rng:NextNumber(8, 60)
	local x, z = ISLAND.X + math.cos(a) * r, ISLAND.Z + math.sin(a) * r
	local hit = workspace:Raycast(Vector3.new(x, 160, z), Vector3.new(0, -185, 0), rayParams)
	local ground = hit and hit.Position.Y or ISLAND.Y
	flies[i] = {
		part = mk("Firefly", Vector3.new(0.34, 0.34, 0.34), Color3.fromRGB(226, 255, 150), { Shape = Enum.PartType.Ball, Material = Enum.Material.Neon, Transparency = 1 }),
		home = Vector3.new(x, math.max(ground, WATER_Y) + rng:NextNumber(2, 7), z),
		ph = rng:NextNumber(0, math.pi * 2),
		sp = rng:NextNumber(0.35, 0.9),
		rad = rng:NextNumber(2.5, 6),
	}
end

---------------------------------------------------------------- drive it
local nextJump = 2
local nextPod = rng:NextNumber(6, 12)
local nextSplash = 6
local nextIdleRipple = 1
local nextFilter = 0
local filterTicks = 0
local shoalSplashT = 0

RunService.RenderStepped:Connect(function(dt)
	local t = os.clock()
	dt = math.min(dt, 0.1)
	local wind = workspace.GlobalWind
	local windMag = math.clamp(wind.Magnitude / 20, 0.2, 1.4)
	local dayness = Lighting:GetAttribute("Dayness")
	if dayness == nil then dayness = 1 end
	local quiet = introPlaying()
	if quiet then dayness = 1 end -- the cutscene is lit as an afternoon, so no fireflies in it

	nextFilter -= dt
	if nextFilter <= 0 then
		nextFilter = 5
		refreshFilter()
		filterTicks += 1
		-- the map streams in around the player: re-ask the water (and the shore) now and then
		if filterTicks % 6 == 0 then
			forgetWater()
			for k = 1, SHORE_BINS do enqueue(k) end
		else
			for k = 1, SHORE_BINS do if shore[k] and shore[k].kind == "unknown" then enqueue(k) end end
		end
	end

	------------------------------------------------ the shoreline
	do
		local cam = workspace.CurrentCamera
		local eye = cam and cam.CFrame.Position or ISLAND
		local look = cam and cam.CFrame.LookVector or Vector3.zAxis
		-- measure a few bins of the shore each frame while the island is near
		if #profileQueue > 0 and (Vector3.new(eye.X - ISLAND.X, 0, eye.Z - ISLAND.Z)).Magnitude < 420 then
			for _ = 1, 6 do
				local k = table.remove(profileQueue, 1)
				if not k then break end
				queued[k] = nil
				probeBin(k)
			end
			if #profileQueue == 0 then settleShore() end
		end
		local wf = Vector3.new(wind.X, 0, wind.Z)
		local windFlat = wf.Magnitude > 0.1 and wf.Unit or WIND_FALLBACK
		spawnWaves(dt, eye, look, quiet, windFlat, pg:GetAttribute("ReduceMotion") == true)
		driveWaves(dt, eye, dayness, quiet)
	end

	------------------------------------------------ fish under the surface
	for _, f in ipairs(fish) do
		local ang = t * f.speed + f.phase
		local rad = f.rad + math.sin(t * f.wobRate + f.wobPh) * f.wobR
		local pos = f.home + Vector3.new(math.cos(ang) * rad, f.depth + math.sin(t * 0.45 + f.phase) * 0.35, math.sin(ang) * rad)
		local step = (f.speed >= 0 and 0.06 or -0.06)
		local ahead = f.home + Vector3.new(math.cos(ang + step) * rad, f.depth, math.sin(ang + step) * rad)
		local dir = ahead - Vector3.new(pos.X, f.depth, pos.Z)
		if dir.Magnitude < 0.001 then dir = Vector3.zAxis end
		f.body.CFrame = CFrame.lookAt(pos, pos + dir.Unit)
		f.tail.CFrame = f.body.CFrame * CFrame.new(0, 0, 2.0 * f.scale) * CFrame.Angles(0, math.sin(t * f.tailRate + f.phase) * 0.5, 0)
		f.next -= dt
		if f.next <= 0 then
			f.next = rng:NextNumber(7, 22)
			if openWater(pos.X, pos.Z) then ripple(pos.X, pos.Z, rng:NextNumber(5, 11), 0.2) end
		end
	end

	------------------------------------------------ leaping fish
	for _, j in ipairs(jumpers) do
		if j.active then stepJumper(j, dt, t) end
	end
	nextJump -= dt
	if nextJump <= 0 then
		nextJump = rng:NextNumber(0.45, 1.5)
		if not quiet then
			local at = waterNearView(16, 125, 3, 1.0)
			if at then
				local a = rng:NextNumber(0, math.pi * 2)
				local dir = Vector3.new(math.cos(a), 0, math.sin(a))
				startJump(at, dir)
				-- now and then a little school goes up together
				if rng:NextNumber() < 0.22 then
					for _ = 1, rng:NextInteger(1, 2) do
						local off = Vector3.new(rng:NextNumber(-4, 4), 0, rng:NextNumber(-4, 4))
						local p = at + off
						if openWater(p.X, p.Z) then
							task.delay(rng:NextNumber(0.08, 0.35), function() startJump(p, (dir + Vector3.new(rng:NextNumber(-0.3, 0.3), 0, rng:NextNumber(-0.3, 0.3))).Unit) end)
						end
					end
				end
			end
		end
	end

	------------------------------------------------ dolphins
	for i = #pods, 1, -1 do
		if stepPod(pods[i], dt, t) then table.remove(pods, i) end
	end
	nextPod -= dt
	if nextPod <= 0 then
		nextPod = rng:NextNumber(14, 26)
		if not quiet and #pods < 2 then
			if not startPod() then nextPod = rng:NextNumber(4, 8) end
		end
	end

	------------------------------------------------ shoal
	shoalAngle += dt * 0.055
	shoalNextBreach -= dt
	local breaching = shoalNextBreach < 1.6 and shoalNextBreach > 0
	if shoalNextBreach <= 0 then
		shoalNextBreach = rng:NextNumber(22, 46)
		shoalRadius = rng:NextNumber(150, 210)
	end
	local sc = Vector3.new(ISLAND.X + math.cos(shoalAngle) * shoalRadius, breaching and 0.1 or -2.2, ISLAND.Z + math.sin(shoalAngle) * shoalRadius)
	local sdir = Vector3.new(-math.sin(shoalAngle), 0, math.cos(shoalAngle))
	local sframe = CFrame.lookAt(sc, sc + sdir)
	for _, s in ipairs(shoal) do
		local wob = Vector3.new(math.sin(t * 1.6 + s.ph) * 0.7, math.sin(t * 2.2 + s.ph) * 0.35, math.cos(t * 1.3 + s.ph) * 0.7)
		s.part.CFrame = sframe * CFrame.new(s.off + wob) * CFrame.Angles(0, math.sin(t * 9 + s.ph) * 0.3, 0)
	end
	-- a few splashes as it breaks the surface, not one per fish per frame
	shoalSplashT -= dt
	if breaching and shoalSplashT <= 0 then
		shoalSplashT = rng:NextNumber(0.25, 0.45)
		local p = shoal[rng:NextInteger(1, #shoal)].part.Position
		if openWater(p.X, p.Z) then doSplash(p.X, p.Z, 0.35) end
	end

	------------------------------------------------ the odd splash, and the wind on the water
	nextSplash -= dt * windMag
	if nextSplash <= 0 then
		nextSplash = rng:NextNumber(11, 30)
		local p = waterNearView(30, 180, 1, 1.4)
		-- (not in the middle of the calm arrival)
		if p and not quiet then doSplash(p.X, p.Z, rng:NextNumber(0.4, 1)) end
	end
	nextIdleRipple -= dt * windMag * 1.6
	if nextIdleRipple <= 0 then
		nextIdleRipple = rng:NextNumber(0.5, 1.6)
		local p = waterNearView(10, 170, 0, 1.6)
		if p then ripple(p.X, p.Z, rng:NextNumber(4, 9), 0.13) end
	end

	------------------------------------------------ ripple pool
	for _, rp in ipairs(ripples) do
		if rp.life > 0 then
			rp.life += dt
			local f = rp.life / rp.dur
			if f >= 1 then
				rp.life = 0
				rp.part.Transparency = 1
			else
				local d = 1.5 + rp.max * f
				rp.part.Size = Vector3.new(0.14, d, d)
				rp.part.CFrame = CFrame.new(rp.x, WATER_Y + 0.12, rp.z) * CFrame.Angles(0, 0, math.pi / 2)
				rp.part.Transparency = 1 - (1 - f) * rp.peak
			end
		end
	end

	------------------------------------------------ gulls
	for _, b in ipairs(gulls) do
		local base = gullAt(b, t)
		-- the heading comes from the lane itself, so it never jitters
		local ahead = gullAt(b, t + 0.35) - base
		local dir = ahead.Magnitude > 0.001 and ahead.Unit or Vector3.zAxis
		-- climb over anything that has streamed in under (or just ahead of) the lane,
		-- checked four times a second rather than every frame
		b.probeT -= dt
		if b.probeT <= 0 then
			b.probeT = 0.25
			local flat = Vector3.new(dir.X, 0, dir.Z)
			local probe = base + (flat.Magnitude > 0.01 and flat.Unit * 16 or Vector3.zero)
			local hit = workspace:Raycast(Vector3.new(probe.X, base.Y + 60, probe.Z), Vector3.new(0, -80, 0), rayParams)
			b.liftWant = hit and math.max(0, hit.Position.Y + 18 - base.Y) or 0
		end
		b.lift += (b.liftWant - b.lift) * math.min(1, dt * (b.liftWant > b.lift and 1.2 or 0.35))
		local pos = base + Vector3.new(0, b.lift, 0)
		-- a gentle, steady bank into the circle
		local bank = -math.clamp(0.15 + 0.05 * math.sin(t * b.radRate + b.radPh), 0, 0.24)
		-- long glides with the odd short burst of wingbeats; the amplitude eases between them
		b.glideT -= dt
		if b.glideT <= 0 then
			b.gliding = not b.gliding
			b.glideT = b.gliding and rng:NextNumber(6, 12) or rng:NextNumber(0.9, 1.8)
		end
		local ampWant = b.gliding and 0.03 or 0.5
		b.amp += (ampWant - b.amp) * math.min(1, dt * 1.6)
		local w = t * b.flapHz * math.pi * 2 + b.flapPh
		local beat = math.sin(w) * b.amp
		local tip = math.sin(w - 0.9) * b.amp * 0.6 -- the outer wing trails the stroke
		-- a slight rise and fall with each beat
		local frame = CFrame.lookAt(pos + Vector3.new(0, -beat * 0.08, 0), pos + dir) * CFrame.Angles(math.rad(-2), 0, bank)
		-- a shallow V while gliding, and the wrists fold a touch on the upstroke
		poseGull(b, frame, beat + 0.06, tip - 0.04)
	end

	------------------------------------------------ fireflies
	local nightFade = math.clamp((0.34 - dayness) / 0.28, 0, 1)
	for _, fl in ipairs(flies) do
		if nightFade > 0.02 then
			local p = fl.home + Vector3.new(
				math.sin(t * fl.sp + fl.ph) * fl.rad,
				math.sin(t * fl.sp * 0.7 + fl.ph * 2) * 1.8,
				math.cos(t * fl.sp * 0.83 + fl.ph * 1.4) * fl.rad)
			fl.part.CFrame = CFrame.new(p)
			local blink = 0.5 + 0.5 * math.sin(t * 2.4 + fl.ph * 3)
			fl.part.Transparency = 1 - nightFade * blink
		elseif fl.part.Transparency < 1 then
			fl.part.Transparency = 1
		end
	end
end)
