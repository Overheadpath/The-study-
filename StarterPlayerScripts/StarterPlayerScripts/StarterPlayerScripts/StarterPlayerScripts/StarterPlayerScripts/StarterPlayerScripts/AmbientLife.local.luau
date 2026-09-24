-- AmbientLife
-- Fish under the surface, ripples, splashes, a shoal, gulls overhead and
-- fireflies after dark. Everything is built at runtime on the client, so it
-- adds nothing to the place file, never replicates, and the server does no work.
-- Reads workspace.GlobalWind (set by WindSystem) and Lighting's Dayness
-- attribute (set by DayCycle) so it stays in step with the rest of the world.

local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")

local WATER_Y = 0.21
local ISLAND = Vector3.new(30, 5.29, -14)
local SHORE = 95            -- fish stay outside this, so they read as open water
local FAR = 235

local camera = workspace.CurrentCamera
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

---------------------------------------------------------------- ripples
local RIPPLES = 16
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
local splash = mk("Splash", Vector3.new(0.4, 0.4, 0.4), Color3.fromRGB(255, 255, 255), { Transparency = 1 })
local spray = Instance.new("ParticleEmitter")
spray.Enabled = false
spray.Rate = 0
spray.Lifetime = NumberRange.new(0.5, 1.1)
spray.Speed = NumberRange.new(7, 15)
spray.SpreadAngle = Vector2.new(42, 42)
spray.Acceleration = Vector3.new(0, -46, 0)
spray.Drag = 1.2
spray.Rotation = NumberRange.new(0, 360)
spray.RotSpeed = NumberRange.new(-180, 180)
spray.Size = NumberSequence.new({
	NumberSequenceKeypoint.new(0, 0.9),
	NumberSequenceKeypoint.new(1, 0.15),
})
spray.Transparency = NumberSequence.new({
	NumberSequenceKeypoint.new(0, 0.1),
	NumberSequenceKeypoint.new(0.7, 0.35),
	NumberSequenceKeypoint.new(1, 1),
})
spray.Color = ColorSequence.new(Color3.fromRGB(236, 250, 255))
spray.LightEmission = 0.5
spray.Parent = splash

-- One reusable sound on the same part, so a splash is heard where it happens and
-- falls away with distance. Named *Ambient* on purpose: BubbleInventoryController
-- routes those into the FishingAmbienceMix group, so the in-game ambient toggle
-- covers it like the wind. Quiet - this is a fish, not a cannonball.
local splashSound = Instance.new("Sound")
splashSound.Name = "AmbientSplash"
splashSound.SoundId = "rbxasset://sounds/impact_water.mp3"
splashSound.Volume = 0
splashSound.RollOffMode = Enum.RollOffMode.InverseTapered
splashSound.RollOffMinDistance = 14
splashSound.RollOffMaxDistance = 170
splashSound.Parent = splash

-- BubbleInventoryController only routes sounds that live under SoundService into
-- its FishingAmbienceMix group, and this one has to live on the splash part to be
-- positional - so join the group by hand once the controller has made it, and the
-- Settings > Ambience toggle covers splashes like it covers the wind.
task.spawn(function()
	for _ = 1, 40 do
		local mix = game:GetService("SoundService"):FindFirstChild("FishingAmbienceMix")
		if mix and mix:IsA("SoundGroup") then
			splashSound.SoundGroup = mix
			return
		end
		task.wait(0.25)
	end
end)

local function doSplash(x, z, power)
	splash.CFrame = CFrame.new(x, WATER_Y + 0.3, z)
	spray:Emit(math.floor(8 + power * 14))
	ripple(x, z, 8 + power * 10, 0.35)
	splashSound.Volume = math.clamp(0.10 + power * 0.14, 0, 0.30)
	splashSound.PlaybackSpeed = 1.22 - power * 0.28 + (rng:NextNumber() - 0.5) * 0.16
	splashSound:Play()
end

---------------------------------------------------------------- fish under the surface
-- Backs seen through water: mostly dark, with the odd brown or rust one so the
-- shoal does not read as one repeated object. Two thirds of them keep to the
-- shallows where the player actually stands and fishes; the rest work the open
-- water. Every one differs in size, depth, speed, direction and how much its
-- path wanders, because identical circles are what make fish look fake.
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
	local a = rng:NextNumber(0, math.pi * 2)
	local r = (i <= 10) and rng:NextNumber(SHORE - 4, SHORE + 40) or rng:NextNumber(SHORE + 45, FAR)
	local colour = FISH_COLOURS[rng:NextInteger(1, #FISH_COLOURS)]
	fish[i] = {
		body = mk("Fish", Vector3.new(1.5 * s, 0.55 * s, 3.4 * s), colour,
			{ Shape = Enum.PartType.Ball, Transparency = 0.34 }),
		tail = mk("FishTail", Vector3.new(0.22 * s, 1.0 * s, 1.3 * s), colour, { Transparency = 0.42 }),
		home = Vector3.new(ISLAND.X + math.cos(a) * r, 0, ISLAND.Z + math.sin(a) * r),
		rad = rng:NextNumber(9, 32),
		speed = rng:NextNumber(0.07, 0.30) * (rng:NextNumber() < 0.5 and 1 or -1),
		phase = rng:NextNumber(0, math.pi * 2),
		depth = rng:NextNumber(-2.8, -0.75),
		wobR = rng:NextNumber(2.5, 9),          -- the circle breathes in and out
		wobRate = rng:NextNumber(0.05, 0.14),
		wobPh = rng:NextNumber(0, math.pi * 2),
		tailRate = rng:NextNumber(5, 9),
		scale = s,
		next = rng:NextNumber(5, 20),
	}
end

---------------------------------------------------------------- fish that jump
-- Now and then one comes out of the water near the shore, turns over and drops
-- back in with a splash. Two at most, long random gaps, never on a beat.
local JUMP_NEAR, JUMP_FAR = SHORE - 5, SHORE + 42
local jumpers = {}
for i = 1, 2 do
	local s = rng:NextNumber(0.9, 1.6)
	local colour = FISH_COLOURS[rng:NextInteger(1, #FISH_COLOURS)]
	jumpers[i] = {
		body = mk("JumpFish", Vector3.new(0.9 * s, 0.8 * s, 2.4 * s), colour,
			{ Shape = Enum.PartType.Ball, Transparency = 1 }),
		tail = mk("JumpFishTail", Vector3.new(0.2 * s, 0.95 * s, 1.0 * s), colour, { Transparency = 1 }),
		scale = s,
		t = 0,
		dur = 0,
		wait = rng:NextNumber(5, 18),
		start = Vector3.zero,
		land = Vector3.zero,
		height = 3,
	}
end

---------------------------------------------------------------- a shoal that surfaces
local shoal = {}
for i = 1, 9 do
	shoal[i] = {
		part = mk("ShoalFish", Vector3.new(0.55, 0.3, 1.5), Color3.fromRGB(96, 148, 170),
			{ Shape = Enum.PartType.Ball, Transparency = 0.25 }),
		off = Vector3.new(rng:NextNumber(-4, 4), rng:NextNumber(-1.2, 1.2), rng:NextNumber(-5, 5)),
		ph = rng:NextNumber(0, math.pi * 2),
	}
end
local shoalAngle = rng:NextNumber(0, math.pi * 2)
local shoalRadius = rng:NextNumber(115, 165)
local shoalNextBreach = 12

---------------------------------------------------------------- birds
-- Ten parts each, which is all it takes to read as a bird at 40 studs: a body,
-- a head with two eyes and a beak, a tail, and a wing in two pieces per side so
-- the outer feathers trail the inner wing on the downbeat instead of the whole
-- wing rotating as one plank. Three plumages, so the flock is not one object
-- repeated. Still cheap: everything is anchored and moved by CFrame.
local function mkw(name, size, colour)
	local w = Instance.new("WedgePart")
	w.Name = name
	w.Size = size
	w.Color = colour
	w.Anchored = true
	w.CanCollide = false
	w.CanQuery = false
	w.CanTouch = false
	w.CastShadow = false
	w.Material = Enum.Material.SmoothPlastic
	w.Parent = folder
	return w
end

local PLUMAGE = {
	-- gull: white body, grey wings, dark tips, orange beak
	{ body = Color3.fromRGB(246, 248, 250), wing = Color3.fromRGB(214, 221, 229),
	  tip = Color3.fromRGB(74, 84, 96), beak = Color3.fromRGB(240, 168, 58) },
	-- tern: pale blue-grey with a dark cap-ish head tone
	{ body = Color3.fromRGB(226, 234, 241), wing = Color3.fromRGB(168, 190, 206),
	  tip = Color3.fromRGB(58, 78, 96), beak = Color3.fromRGB(232, 120, 72) },
	-- shearwater: warm brown back, cream underside
	{ body = Color3.fromRGB(224, 210, 188), wing = Color3.fromRGB(150, 122, 92),
	  tip = Color3.fromRGB(86, 66, 48), beak = Color3.fromRGB(226, 158, 70) },
}

local EYE = Color3.fromRGB(28, 30, 34)
local birds = {}
for i = 1, 5 do
	local c = PLUMAGE[((i - 1) % #PLUMAGE) + 1]
	local sc = rng:NextNumber(0.85, 1.25)
	birds[i] = {
		s = sc,
		body = mk("Bird", Vector3.new(1.0 * sc, 0.92 * sc, 2.6 * sc), c.body, { Shape = Enum.PartType.Ball }),
		head = mk("BirdHead", Vector3.new(0.74 * sc, 0.72 * sc, 0.8 * sc), c.body, { Shape = Enum.PartType.Ball }),
		eyeL = mk("BirdEye", Vector3.new(0.17 * sc, 0.17 * sc, 0.17 * sc), EYE, { Shape = Enum.PartType.Ball }),
		eyeR = mk("BirdEye", Vector3.new(0.17 * sc, 0.17 * sc, 0.17 * sc), EYE, { Shape = Enum.PartType.Ball }),
		beak = mkw("BirdBeak", Vector3.new(0.2 * sc, 0.26 * sc, 0.62 * sc), c.beak),
		tail = mkw("BirdTail", Vector3.new(1.05 * sc, 0.15 * sc, 0.88 * sc), c.wing),
		wlIn = mk("BirdWing", Vector3.new(1.5 * sc, 0.14 * sc, 1.0 * sc), c.wing),
		wrIn = mk("BirdWing", Vector3.new(1.5 * sc, 0.14 * sc, 1.0 * sc), c.wing),
		wlOut = mk("BirdWingTip", Vector3.new(1.05 * sc, 0.12 * sc, 0.74 * sc), c.tip),
		wrOut = mk("BirdWingTip", Vector3.new(1.05 * sc, 0.12 * sc, 0.74 * sc), c.tip),
		-- the path: a circle whose radius and height both breathe on their own
		-- slow clocks, so no bird ever repeats a lap or flies a straight line
		rad = rng:NextNumber(62, 148),
		radWob = rng:NextNumber(6, 24),
		radRate = rng:NextNumber(0.03, 0.09),
		radPh = rng:NextNumber(0, math.pi * 2),
		y = rng:NextNumber(34, 74),
		yWob = rng:NextNumber(2.5, 7),
		yRate = rng:NextNumber(0.05, 0.13),
		yPh = rng:NextNumber(0, math.pi * 2),
		speed = rng:NextNumber(0.045, 0.085) * (rng:NextNumber() < 0.5 and 1 or -1),
		ph = rng:NextNumber(0, math.pi * 2),
		-- wingbeats: slow, and interrupted by long glides
		flapRate = rng:NextNumber(1.7, 2.7),
		flapPh = rng:NextNumber(0, math.pi * 2),
		gliding = rng:NextNumber() < 0.5,
		glideT = rng:NextNumber(2, 8),
		amp = 0.5,
		last = nil,
	}
end

---------------------------------------------------------------- fireflies (night only)
local flies = {}
for i = 1, 26 do
	local a = rng:NextNumber(0, math.pi * 2)
	local r = rng:NextNumber(8, 74)
	flies[i] = {
		part = mk("Firefly", Vector3.new(0.34, 0.34, 0.34), Color3.fromRGB(226, 255, 150),
			{ Shape = Enum.PartType.Ball, Material = Enum.Material.Neon, Transparency = 1 }),
		home = Vector3.new(ISLAND.X + math.cos(a) * r, ISLAND.Y + rng:NextNumber(2.5, 12), ISLAND.Z + math.sin(a) * r),
		ph = rng:NextNumber(0, math.pi * 2),
		sp = rng:NextNumber(0.35, 0.9),
		rad = rng:NextNumber(2.5, 7),
	}
end

---------------------------------------------------------------- drive it
local nextSplash = 6
local nextIdleRipple = 1

RunService.RenderStepped:Connect(function(dt)
	local t = os.clock()
	local wind = workspace:FindFirstChild("Terrain") and workspace.GlobalWind or Vector3.zero
	local windMag = math.clamp(wind.Magnitude / 20, 0.2, 1.4)
	local dayness = Lighting:GetAttribute("Dayness")
	if dayness == nil then dayness = 1 end

	------------------------------------------------ fish
	for _, f in ipairs(fish) do
		local ang = t * f.speed + f.phase
		local rad = f.rad + math.sin(t * f.wobRate + f.wobPh) * f.wobR
		local pos = f.home + Vector3.new(
			math.cos(ang) * rad,
			f.depth + math.sin(t * 0.45 + f.phase) * 0.35,
			math.sin(ang) * rad)
		-- heading from where it will actually be a moment later, so the wander of
		-- the path turns the fish instead of it sliding sideways
		local step = (f.speed >= 0 and 0.06 or -0.06)
		local ahead = f.home + Vector3.new(
			math.cos(ang + step) * rad,
			f.depth,
			math.sin(ang + step) * rad)
		local dir = ahead - Vector3.new(pos.X, f.depth, pos.Z)
		if dir.Magnitude < 0.001 then dir = Vector3.zAxis end
		f.body.CFrame = CFrame.lookAt(pos, pos + dir.Unit)
		f.tail.CFrame = f.body.CFrame
			* CFrame.new(0, 0, 2.0 * f.scale)
			* CFrame.Angles(0, math.sin(t * f.tailRate + f.phase) * 0.5, 0)

		-- every so often one noses the surface and leaves a ring
		f.next = f.next - dt
		if f.next <= 0 then
			f.next = rng:NextNumber(7, 22)
			ripple(pos.X, pos.Z, rng:NextNumber(5, 11), 0.2)
		end
	end

	------------------------------------------------ fish that jump
	for _, j in ipairs(jumpers) do
		if j.dur > 0 then
			j.t = j.t + dt
			local f = j.t / j.dur
			if f >= 1 then
				j.dur = 0
				j.body.Transparency, j.tail.Transparency = 1, 1
				doSplash(j.land.X, j.land.Z, 0.45 + j.scale * 0.25)   -- the landing
			else
				-- one clean arc: 4f(1-f) peaks at the halfway point and is zero at
				-- both ends, so it leaves and re-enters the water exactly level
				local arc = 4 * f * (1 - f)
				local pos = j.start:Lerp(j.land, f) + Vector3.new(0, arc * j.height, 0)
				local rise = j.height * 4 * (1 - 2 * f) / j.dur
				local vel = (j.land - j.start) / j.dur + Vector3.new(0, rise, 0)
				if vel.Magnitude < 0.01 then vel = Vector3.zAxis end
				j.body.CFrame = CFrame.lookAt(pos, pos + vel.Unit)
				j.tail.CFrame = j.body.CFrame * CFrame.new(0, 0, 1.35 * j.scale)
					* CFrame.Angles(0, math.sin(t * 20) * 0.45, 0)
				-- hidden while it is level with the surface, so it appears out of the
				-- water rather than popping into existence on top of it
				local seen = math.clamp(math.min(f, 1 - f) / 0.09, 0, 1)
				j.body.Transparency = 1 - seen * 0.94
				j.tail.Transparency = 1 - seen * 0.88
			end
		else
			j.wait = j.wait - dt
			if j.wait <= 0 then
				j.wait = rng:NextNumber(9, 26)
				local a = rng:NextNumber(0, math.pi * 2)
				local r = rng:NextNumber(JUMP_NEAR, JUMP_FAR)
				local from = Vector3.new(ISLAND.X + math.cos(a) * r, WATER_Y, ISLAND.Z + math.sin(a) * r)
				local heading = rng:NextNumber(0, math.pi * 2)
				local travel = rng:NextNumber(3.5, 8)
				j.start = from
				j.land = from + Vector3.new(math.cos(heading) * travel, 0, math.sin(heading) * travel)
				j.height = rng:NextNumber(2.2, 4.4)
				j.dur = rng:NextNumber(0.9, 1.3)
				j.t = 0
				doSplash(from.X, from.Z, 0.3)                        -- the water it left
			end
		end
	end

	------------------------------------------------ shoal
	shoalAngle = shoalAngle + dt * 0.055
	shoalNextBreach = shoalNextBreach - dt
	local breaching = shoalNextBreach < 1.6 and shoalNextBreach > 0
	if shoalNextBreach <= 0 then
		shoalNextBreach = rng:NextNumber(22, 46)
		shoalRadius = rng:NextNumber(110, 175)
	end
	local sc = Vector3.new(
		ISLAND.X + math.cos(shoalAngle) * shoalRadius,
		breaching and 0.1 or -2.2,
		ISLAND.Z + math.sin(shoalAngle) * shoalRadius)
	local sdir = Vector3.new(-math.sin(shoalAngle), 0, math.cos(shoalAngle))
	local sframe = CFrame.lookAt(sc, sc + sdir)
	for _, s in ipairs(shoal) do
		local wob = Vector3.new(
			math.sin(t * 1.6 + s.ph) * 0.7,
			math.sin(t * 2.2 + s.ph) * 0.35,
			math.cos(t * 1.3 + s.ph) * 0.7)
		s.part.CFrame = sframe * CFrame.new(s.off + wob)
			* CFrame.Angles(0, math.sin(t * 9 + s.ph) * 0.3, 0)
		if breaching and rng:NextNumber() < dt * 1.6 then
			local p = s.part.Position
			doSplash(p.X, p.Z, 0.35)
		end
	end

	------------------------------------------------ the odd splash
	nextSplash = nextSplash - dt * windMag
	if nextSplash <= 0 then
		nextSplash = rng:NextNumber(11, 30)
		local a = rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(SHORE, FAR * 0.8)
		doSplash(ISLAND.X + math.cos(a) * r, ISLAND.Z + math.sin(a) * r, rng:NextNumber(0.4, 1))
	end

	-- wind stirs the surface: more chop when it gusts
	nextIdleRipple = nextIdleRipple - dt * windMag * 1.6
	if nextIdleRipple <= 0 then
		nextIdleRipple = rng:NextNumber(0.5, 1.6)
		local a = rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(SHORE - 6, FAR)
		ripple(ISLAND.X + math.cos(a) * r, ISLAND.Z + math.sin(a) * r, rng:NextNumber(4, 9), 0.13)
	end

	------------------------------------------------ ripple pool
	for _, rp in ipairs(ripples) do
		if rp.life > 0 then
			rp.life = rp.life + dt
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

	------------------------------------------------ birds
	for _, b in ipairs(birds) do
		local ang = t * b.speed + b.ph
		local rad = b.rad + math.sin(t * b.radRate + b.radPh) * b.radWob
		local pos = Vector3.new(
			ISLAND.X + math.cos(ang) * rad,
			b.y + math.sin(t * b.yRate + b.yPh) * b.yWob,
			ISLAND.Z + math.sin(ang) * rad)
		-- face where it is actually going, which includes the wander, not just the
		-- tangent of an ideal circle
		local prev = b.last or pos
		b.last = pos
		local vel = pos - prev
		local dir = (vel.Magnitude > 0.0015) and vel.Unit
			or Vector3.new(-math.sin(ang), 0, math.cos(ang)) * (b.speed >= 0 and 1 or -1)
		local bank = math.clamp((b.speed >= 0 and -1 or 1) * (0.26 + 0.16 * math.sin(t * b.radRate + b.radPh)), -0.55, 0.55)
		-- long glides broken by short bursts of wingbeats; the amplitude eases
		-- between the two so wings never snap from still to beating
		b.glideT = b.glideT - dt
		if b.glideT <= 0 then
			b.gliding = not b.gliding
			b.glideT = b.gliding and rng:NextNumber(3, 9) or rng:NextNumber(2, 5)
		end
		local want = b.gliding and 0.05 or 0.6
		b.amp = b.amp + (want - b.amp) * math.min(1, dt * 1.5)
		local beat = math.sin(t * b.flapRate + b.flapPh) * b.amp
		local sc = b.s
		local frame = CFrame.lookAt(pos, pos + dir)
			* CFrame.Angles(math.rad(-3) + beat * 0.08, 0, bank)
		b.body.CFrame = frame
		b.head.CFrame = frame * CFrame.new(0, 0.34 * sc, -1.3 * sc)
		b.beak.CFrame = b.head.CFrame * CFrame.new(0, -0.05 * sc, -0.48 * sc) * CFrame.Angles(0, math.pi, 0)
		b.eyeL.CFrame = b.head.CFrame * CFrame.new(-0.26 * sc, 0.12 * sc, -0.15 * sc)
		b.eyeR.CFrame = b.head.CFrame * CFrame.new(0.26 * sc, 0.12 * sc, -0.15 * sc)
		b.tail.CFrame = frame * CFrame.new(0, 0.1 * sc, 1.52 * sc) * CFrame.Angles(math.rad(-7), 0, 0)
		-- inner wing hinges at the shoulder; the tip hinges again at its end and
		-- trails a little behind the beat, which is what makes it look like a wing
		local shoulder, half = 0.42 * sc, 0.75 * sc
		local trail = 0.45 + 0.3 * math.max(beat, 0)
		b.wlIn.CFrame = frame * CFrame.new(-shoulder, 0.16 * sc, 0.05 * sc)
			* CFrame.Angles(0, 0, beat * 0.95) * CFrame.new(-half, 0, 0)
		b.wrIn.CFrame = frame * CFrame.new(shoulder, 0.16 * sc, 0.05 * sc)
			* CFrame.Angles(0, 0, -beat * 0.95) * CFrame.new(half, 0, 0)
		b.wlOut.CFrame = b.wlIn.CFrame * CFrame.new(-half, 0, 0)
			* CFrame.Angles(0, 0, beat * trail) * CFrame.new(-0.53 * sc, 0, 0)
		b.wrOut.CFrame = b.wrIn.CFrame * CFrame.new(half, 0, 0)
			* CFrame.Angles(0, 0, -beat * trail) * CFrame.new(0.53 * sc, 0, 0)
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
			-- each blinks on its own rhythm
			local blink = 0.5 + 0.5 * math.sin(t * 2.4 + fl.ph * 3)
			fl.part.Transparency = 1 - nightFade * blink
		elseif fl.part.Transparency < 1 then
			fl.part.Transparency = 1
		end
	end
end)
