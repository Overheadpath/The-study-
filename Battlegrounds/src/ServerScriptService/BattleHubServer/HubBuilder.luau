--!strict
--[[
	Builds the lobby: a big graffiti hall with the SHOP, RANKINGS and ARENA
	halls, the Lucky Wheel, the AFK chamber, display figures and the jumbotron.

	Layout (seen from above, north = -Z):

	            SHOP        AFK
	   Showcase  ||          ||   Lucky Wheel
	RANKINGS =  plaza + jumbotron  = Featured poster
	   Sensei    ||               Daily Deal
	            ARENA

	Everything is placed relative to Config.HubOrigin (the centre of the plaza floor).
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local Kit = require(script.Parent:WaitForChild("BuildKit"))

local rgb = Color3.fromRGB
local M = Enum.Material

local C = {
	Carpet = rgb(44, 40, 48),
	Wood = rgb(168, 104, 60),
	Brick = rgb(150, 58, 40),
	BrickDark = rgb(52, 44, 46),
	Pillar = rgb(58, 56, 64),
	Ceiling = rgb(30, 29, 35),
	Trim = rgb(255, 238, 205),
	Crimson = rgb(255, 38, 56),
	Orange = rgb(255, 128, 32),
	Gold = rgb(255, 196, 48),
	Steel = rgb(78, 80, 90),
	Dark = rgb(22, 22, 28),
	White = rgb(245, 245, 250),
	Blue = rgb(70, 190, 255),
	Pink = rgb(255, 70, 200),
	Purple = rgb(150, 70, 255),
	Skin = rgb(234, 184, 146),
}

local H = 64 -- half the plaza width (inner wall faces sit at +-H)
local WALL_T = 4
local WALL_H = 44
local PLAT_H = 1 -- raised wooden border
local INNER = 36 -- carpet reaches to +-INNER
local PATH = 15 -- half width of the carpet paths into the halls
local DOOR_H = 26
local MID = 40 -- pillars halfway along the walls

local O = CFrame.new(Config.HubOrigin)

local function at(x: number, y: number, z: number): CFrame
	return O * CFrame.new(x, y, z)
end

local function point(x: number, y: number, z: number): Vector3
	return O * Vector3.new(x, y, z)
end

-- Positioned at (x, y, z) and facing direction (dx, dz).
local function facing(x: number, y: number, z: number, dx: number, dz: number): CFrame
	local p = point(x, y, z)
	return CFrame.lookAt(p, p + Vector3.new(dx, 0, dz))
end

-- Positioned at (x, y, z) and facing the point (tx, y, tz).
local function toward(x: number, y: number, z: number, tx: number, tz: number): CFrame
	return facing(x, y, z, tx - x, tz - z)
end

-- Deterministic random numbers so every build looks the same.
local function makeRandom(seed: number): (number, number) -> number
	local state = seed
	return function(a: number, b: number): number
		state = (state * 1103515245 + 12345) % 2147483648
		return a + (b - a) * (state / 2147483648)
	end
end

local Builder = {}

----------------------------------------------------------------------------------
-- Shell: floor, raised border, walls, pillars, ceiling
----------------------------------------------------------------------------------

local function buildShell(hub: Model)
	local shell = Kit.model(hub, "Shell")

	-- Floor slab (the carpet you walk on in the middle).
	Kit.box(shell, Vector3.new(H * 2 + WALL_T * 2, 2, H * 2 + WALL_T * 2), at(0, -1, 0), C.Carpet, {
		Name = "Floor",
		Material = M.Carpet,
	})

	-- Raised wooden border, leaving carpet paths to the three halls.
	local function platform(x0: number, x1: number, z0: number, z1: number)
		Kit.box(
			shell,
			Vector3.new(x1 - x0, PLAT_H, z1 - z0),
			at((x0 + x1) / 2, PLAT_H / 2, (z0 + z1) / 2),
			C.Wood,
			{ Name = "Platform", Material = M.WoodPlanks }
		)
	end
	platform(-H, -PATH, -H, -INNER)
	platform(PATH, H, -H, -INNER)
	platform(-H, -PATH, INNER, H)
	platform(PATH, H, INNER, H)
	platform(-H, -INNER, -INNER, -PATH)
	platform(-H, -INNER, PATH, INNER)
	platform(INNER, H, -INNER, INNER)

	-- Glowing edge where the wood meets the carpet. (nx, nz) points at the carpet.
	local function edge(x0: number, z0: number, x1: number, z1: number, nx: number, nz: number)
		local length = math.max(math.abs(x1 - x0), math.abs(z1 - z0))
		local cx = (x0 + x1) / 2 + nx * 0.12
		local cz = (z0 + z1) / 2 + nz * 0.12
		local size = if x0 == x1
			then Vector3.new(0.25, PLAT_H + 0.1, length)
			else Vector3.new(length, PLAT_H + 0.1, 0.25)
		Kit.neon(shell, size, at(cx, PLAT_H / 2, cz), C.Trim, "Edge")
	end
	edge(-INNER, -INNER, -PATH, -INNER, 0, 1)
	edge(-PATH, -H, -PATH, -INNER, 1, 0)
	edge(PATH, -INNER, INNER, -INNER, 0, 1)
	edge(PATH, -H, PATH, -INNER, -1, 0)
	edge(-INNER, INNER, -PATH, INNER, 0, -1)
	edge(-PATH, INNER, -PATH, H, 1, 0)
	edge(PATH, INNER, INNER, INNER, 0, -1)
	edge(PATH, INNER, PATH, H, -1, 0)
	edge(-INNER, -INNER, -INNER, -PATH, 1, 0)
	edge(-H, -PATH, -INNER, -PATH, 0, 1)
	edge(-INNER, PATH, -INNER, INNER, 1, 0)
	edge(-H, PATH, -INNER, PATH, 0, -1)
	edge(INNER, -INNER, INNER, INNER, -1, 0)

	-- Walls. `openings` = { {from, to, height} } along the wall.
	local function wall(
		axis: "X" | "Z",
		at0: number,
		from: number,
		to: number,
		inward: number,
		openings: { { number } }
	)
		local function segment(a: number, b: number, y0: number, y1: number)
			if b - a <= 0 then
				return
			end
			local mid = (a + b) / 2
			local size, cf
			if axis == "X" then
				size = Vector3.new(b - a, y1 - y0, WALL_T)
				cf = at(mid, (y0 + y1) / 2, at0)
			else
				size = Vector3.new(WALL_T, y1 - y0, b - a)
				cf = at(at0, (y0 + y1) / 2, mid)
			end
			Kit.box(shell, size, cf, C.Brick, { Name = "Wall", Material = M.Brick })
			if y0 == 0 then
				-- dark lower band behind the lockers
				local bandDepth = 0.6
				local offset = inward * (WALL_T / 2 + bandDepth / 2)
				if axis == "X" then
					Kit.box(shell, Vector3.new(b - a, 7, bandDepth), at(mid, 3.5, at0 + offset), C.BrickDark, {
						Name = "WallBase",
						Material = M.Concrete,
					})
				else
					Kit.box(shell, Vector3.new(bandDepth, 7, b - a), at(at0 + offset, 3.5, mid), C.BrickDark, {
						Name = "WallBase",
						Material = M.Concrete,
					})
				end
			end
		end
		local cursor = from
		for _, op in openings do
			segment(cursor, op[1], 0, WALL_H)
			segment(op[1], op[2], op[3], WALL_H)
			cursor = op[2]
		end
		segment(cursor, to, 0, WALL_H)

		-- light bar running along the top of the wall
		local stripOffset = inward * (WALL_T / 2 + 0.3)
		if axis == "X" then
			Kit.neon(
				shell,
				Vector3.new(to - from, 0.6, 0.5),
				at((from + to) / 2, WALL_H - 3, at0 + stripOffset),
				C.Trim,
				"WallLight"
			)
		else
			Kit.neon(
				shell,
				Vector3.new(0.5, 0.6, to - from),
				at(at0 + stripOffset, WALL_H - 3, (from + to) / 2),
				C.Trim,
				"WallLight"
			)
		end
	end

	local full = H + WALL_T
	wall("X", -H - WALL_T / 2, -full, full, 1, { { -PATH, PATH, DOOR_H }, { 27, 41, 14 } }) -- north: shop + AFK
	wall("X", H + WALL_T / 2, -full, full, -1, { { -PATH, PATH, DOOR_H } }) -- south: arena
	wall("Z", -H - WALL_T / 2, -H, H, 1, { { -PATH, PATH, DOOR_H } }) -- west: rankings
	wall("Z", H + WALL_T / 2, -H, H, -1, {}) -- east: featured poster

	-- Pillars with orange light bands.
	local function pillar(x: number, z: number, size: number?)
		local s = size or 6
		Kit.box(
			shell,
			Vector3.new(s, WALL_H, s),
			at(x, WALL_H / 2, z),
			C.Pillar,
			{ Name = "Pillar", Material = M.Concrete }
		)
		for _, y in { 10, 30 } do
			Kit.neon(shell, Vector3.new(s + 0.3, 0.6, s + 0.3), at(x, y, z), C.Orange, "PillarLight")
		end
	end
	for _, x in { -18, 18 } do
		pillar(x, -H + 1)
		pillar(x, H - 1)
	end
	for _, z in { -18, 18 } do
		pillar(-H + 1, z)
	end
	for _, x in { -H + 3, H - 3 } do
		for _, z in { -H + 3, H - 3 } do
			pillar(x, z, 8)
		end
	end
	pillar(-MID, -H + 1)
	pillar(-MID, H - 1)
	pillar(MID, H - 1)
	pillar(H - 1, 27)
	pillar(H - 1, -27)
	pillar(-H + 1, MID)
	pillar(-H + 1, -MID)

	-- Ceiling with big light panels and steel beams.
	Kit.box(
		shell,
		Vector3.new(full * 2, 2, full * 2),
		at(0, WALL_H + 1, 0),
		C.Ceiling,
		{ Name = "Ceiling", Material = M.Concrete }
	)
	for _, x in { -MID, 0, MID } do
		for _, z in { -MID, 0, MID } do
			if not (x == 0 and z == 0) then
				local panel =
					Kit.neon(shell, Vector3.new(22, 0.4, 22), at(x, WALL_H - 0.2, z), rgb(210, 214, 228), "SkyPanel")
				Kit.surfaceLight(panel, Enum.NormalId.Bottom, rgb(255, 244, 230), 1.4, 55)
			end
		end
	end
	for _, z in { -25, 25 } do
		Kit.box(
			shell,
			Vector3.new(full * 2, 2.4, 2.4),
			at(0, WALL_H - 1.2, z),
			C.Steel,
			{ Name = "Beam", Material = M.Metal }
		)
	end
	for _, x in { -25, 25 } do
		Kit.box(
			shell,
			Vector3.new(2.4, 2.4, full * 2),
			at(x, WALL_H - 1.2, 0),
			C.Steel,
			{ Name = "Beam", Material = M.Metal }
		)
	end
end

----------------------------------------------------------------------------------
-- Centre: spawn, floor emblem with glowing cracks, jumbotron, fire braziers
----------------------------------------------------------------------------------

local function screenGui(part: BasePart)
	local gui = Kit.surface(part, Enum.NormalId.Front, 40, 1.8)
	local bg = Instance.new("Frame")
	bg.Name = "Background"
	bg.Size = UDim2.fromScale(1, 1)
	bg.BackgroundColor3 = rgb(12, 10, 18)
	bg.BorderSizePixel = 0
	bg.Parent = gui
	local grad = Instance.new("UIGradient")
	grad.Color = ColorSequence.new(rgb(40, 10, 20), rgb(10, 8, 16))
	grad.Rotation = 90
	grad.Parent = bg
	return gui
end

local function buildCenter(hub: Model)
	local center = Kit.model(hub, "Center")

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "Spawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(14, 1, 14)
	spawn.CFrame = at(0, 0.5, 0)
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.CanQuery = false
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Parent = hub

	-- Emblem: red ring, white inner ring, crossed swords in the middle.
	Kit.ring(center, at(0, 0.06, 0), 17, 1.2, 0.12, 40, C.Crimson, {
		Name = "EmblemRing",
		Material = M.Neon,
		CanCollide = false,
		CastShadow = false,
	})
	Kit.ring(center, at(0, 0.06, 0), 13, 0.4, 0.12, 40, C.Trim, {
		Name = "EmblemRing",
		Material = M.Neon,
		CanCollide = false,
		CastShadow = false,
	})
	Kit.disc(
		center,
		25.6,
		0.08,
		at(0, 0.04, 0),
		rgb(70, 16, 24),
		{ Name = "EmblemFill", Material = M.Carpet, CanCollide = false }
	)
	local logo = Kit.box(center, Vector3.new(24, 0.1, 24), at(0, 0.1, 0), C.Dark, {
		Name = "Logo",
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
	})
	Kit.write(
		logo,
		Enum.NormalId.Top,
		"⚔️",
		{ Size = UDim2.fromScale(0.62, 0.62), Position = UDim2.fromScale(0.19, 0.19), Glow = 1.2 }
	)

	-- Glowing cracks running out from the emblem, like something hit the floor hard.
	local rand = makeRandom(7)
	for i = 1, 9 do
		local angle = (i / 9) * math.pi * 2 + rand(-0.2, 0.2)
		local r = 17.5
		local pos = Vector3.new(math.cos(angle) * r, 0.05, math.sin(angle) * r)
		local heading = angle
		for _ = 1, 4 do
			heading += rand(-0.55, 0.55)
			local length = rand(3, 6.5)
			local nextPos = pos + Vector3.new(math.cos(heading) * length, 0, math.sin(heading) * length)
			if math.max(math.abs(nextPos.X), math.abs(nextPos.Z)) > INNER - 3 then
				break
			end
			local mid = (pos + nextPos) / 2
			local cf = CFrame.lookAt(point(mid.X, 0.05, mid.Z), point(nextPos.X, 0.05, nextPos.Z))
			Kit.neon(center, Vector3.new(rand(0.25, 0.45), 0.1, length + 0.2), cf, rgb(255, 60, 40), "Crack")
			pos = nextPos
		end
	end

	-- Jumbotron hanging over the spawn. The client fills in the screens.
	local tron = Kit.model(center, "Jumbotron")
	tron.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
	local tronY = 34
	Kit.box(tron, Vector3.new(22, 10, 22), at(0, tronY, 0), C.Dark, { Name = "Body", Material = M.Metal })
	for _, y in { tronY + 5.2, tronY - 5.2 } do
		Kit.ring(
			tron,
			at(0, y, 0),
			11.2,
			0.6,
			0.5,
			4,
			C.Crimson,
			{ Name = "TronLight", Material = M.Neon, CanCollide = false }
		)
	end
	local dirs = { { 0, -1 }, { 1, 0 }, { 0, 1 }, { -1, 0 } }
	for i, d in dirs do
		local screen = Kit.box(
			tron,
			Vector3.new(20, 8.4, 0.2),
			facing(d[1] * 11.1, tronY, d[2] * 11.1, d[1], d[2]),
			rgb(10, 10, 14),
			{
				Name = "Screen" .. i,
				Material = M.SmoothPlastic,
				CanCollide = false,
			}
		)
		local gui = screenGui(screen)
		Kit.label(gui, "INTERMISSION", {
			Name = "Phase",
			Font = Enum.Font.Bangers,
			Color = C.White,
			Stroke = rgb(0, 0, 0),
			StrokeThickness = 3,
			Size = UDim2.fromScale(0.9, 0.36),
			Position = UDim2.fromScale(0.05, 0.08),
		})
		Kit.label(gui, "0:20", {
			Name = "Timer",
			Font = Enum.Font.GothamBlack,
			Color = C.Gold,
			Size = UDim2.fromScale(0.6, 0.3),
			Position = UDim2.fromScale(0.2, 0.44),
		})
		Kit.label(gui, Config.GameName, {
			Name = "Detail",
			Font = Enum.Font.GothamBlack,
			Color = rgb(255, 120, 120),
			Size = UDim2.fromScale(0.9, 0.16),
			Position = UDim2.fromScale(0.05, 0.78),
		})
	end
	for _, x in { -9, 9 } do
		for _, z in { -9, 9 } do
			Kit.box(tron, Vector3.new(0.4, WALL_H - (tronY + 5), 0.4), at(x, (WALL_H + tronY + 5) / 2, z), C.Steel, {
				Name = "Cable",
				Material = M.Metal,
				CanCollide = false,
			})
		end
	end

	-- Fire braziers at the corners of the carpet.
	local b = INNER - 8
	for _, x in { -b, b } do
		for _, z in { -b, b } do
			local stand = Kit.cyl(center, 4, 1.2, at(x, 2, z) * CFrame.Angles(0, 0, math.rad(90)), C.Steel, {
				Name = "BrazierStand",
				Material = M.Metal,
			})
			stand.CastShadow = false
			local bowl = Kit.disc(
				center,
				4.2,
				1.4,
				at(x, 4.6, z),
				rgb(40, 38, 42),
				{ Name = "Brazier", Material = M.CorrodedMetal }
			)
			Kit.ring(
				center,
				at(x, 5.2, z),
				2.1,
				0.3,
				0.3,
				12,
				C.Orange,
				{ Name = "BrazierGlow", Material = M.Neon, CanCollide = false }
			)
			local fire = Instance.new("Fire")
			fire.Size = 6
			fire.Heat = 12
			fire.Color = rgb(255, 120, 30)
			fire.SecondaryColor = rgb(255, 40, 20)
			fire.Parent = bowl
			Kit.pointLight(bowl, rgb(255, 140, 60), 2.2, 26)
		end
	end
end

----------------------------------------------------------------------------------
-- Halls: SHOP (north), RANKINGS (west), ARENA (south)
----------------------------------------------------------------------------------

local HALL_W = 40
local HALL_D = 44
local HALL_H = 30

-- Builds the room behind a wall opening. `frame` sits on the inner face of the
-- plaza wall, facing into the hall. Returns a helper that converts hall-local
-- coordinates (x right, y up, d = studs into the hall) into world CFrames.
local function hallRoom(
	parent: Model,
	frame: CFrame,
	floorColor: Color3,
	wallColor: Color3
): (number, number, number) -> CFrame
	local function h(x: number, y: number, d: number): CFrame
		return frame * CFrame.new(x, y, -d)
	end
	local total = HALL_D + WALL_T
	Kit.box(
		parent,
		Vector3.new(HALL_W + WALL_T * 2, 2, total),
		h(0, -1, total / 2),
		floorColor,
		{ Name = "Floor", Material = M.Carpet }
	)
	for _, side in { -1, 1 } do
		Kit.box(
			parent,
			Vector3.new(WALL_T, HALL_H, HALL_D),
			h(side * (HALL_W / 2 + WALL_T / 2), HALL_H / 2, WALL_T + HALL_D / 2),
			wallColor,
			{
				Name = "Wall",
				Material = M.Brick,
			}
		)
		Kit.neon(
			parent,
			Vector3.new(0.4, 0.5, HALL_D),
			h(side * (HALL_W / 2 - 0.2), HALL_H - 3, WALL_T + HALL_D / 2),
			C.Trim,
			"WallLight"
		)
	end
	Kit.box(parent, Vector3.new(HALL_W + WALL_T * 2, HALL_H, WALL_T), h(0, HALL_H / 2, total - WALL_T / 2), wallColor, {
		Name = "BackWall",
		Material = M.Brick,
	})
	Kit.box(
		parent,
		Vector3.new(HALL_W + WALL_T * 2, 2, total),
		h(0, HALL_H + 1, total / 2),
		C.Ceiling,
		{ Name = "Ceiling", Material = M.Concrete }
	)
	for _, d in { 14, 34 } do
		local panel = Kit.neon(parent, Vector3.new(20, 0.4, 10), h(0, HALL_H - 0.2, d), rgb(236, 240, 255), "SkyPanel")
		Kit.surfaceLight(panel, Enum.NormalId.Bottom, rgb(255, 244, 230), 1.3, 34)
	end
	return h
end

local function hallSign(parent: Model, frame: CFrame, text: string, opts: Kit.SignOpts)
	-- On the plaza side of the opening, standing proud of the pillars.
	Kit.sign(parent, frame * CFrame.new(0, DOOR_H + 7.5, 4.8) * CFrame.Angles(0, math.pi, 0), 46, 12, text, opts)
	-- Glow along the top of the doorway.
	Kit.neon(
		parent,
		Vector3.new(HALL_W - 10, 0.5, 0.5),
		frame * CFrame.new(0, DOOR_H - 0.25, 0.3),
		opts.Glow or C.Trim,
		"DoorLight"
	)
end

local function pedestal(parent: Instance, cf: CFrame, glow: Color3, diameter: number?): Part
	local d = diameter or 5
	local base =
		Kit.disc(parent, d, 1.4, cf * CFrame.new(0, 0.7, 0), rgb(34, 32, 38), { Name = "Pedestal", Material = M.Metal })
	Kit.ring(parent, cf * CFrame.new(0, 1.42, 0), d / 2 - 0.2, 0.3, 0.06, 20, glow, {
		Name = "PedestalGlow",
		Material = M.Neon,
		CanCollide = false,
	})
	Kit.pointLight(base, glow, 1.2, 10)
	return base
end

local OUTFITS: { Kit.Outfit } = {
	{
		Skin = C.Skin,
		Shirt = rgb(24, 24, 30),
		Pants = rgb(20, 20, 26),
		Gloves = rgb(200, 30, 40),
		Belt = rgb(230, 230, 235),
	},
	{ Skin = rgb(160, 110, 80), Shirt = rgb(235, 235, 240), Pants = rgb(30, 30, 40), Gloves = rgb(30, 30, 36) },
	{ Skin = rgb(250, 210, 170), Shirt = rgb(40, 20, 60), Pants = rgb(25, 20, 35), Belt = rgb(255, 190, 40) },
	{ Skin = rgb(120, 80, 60), Shirt = rgb(150, 30, 35), Pants = rgb(25, 25, 30), Gloves = rgb(240, 240, 240) },
	{ Skin = C.Skin, Shirt = rgb(20, 60, 110), Pants = rgb(20, 20, 30), Belt = rgb(20, 20, 20) },
	{ Skin = rgb(200, 150, 110), Shirt = rgb(60, 60, 64), Pants = rgb(40, 40, 44), Gloves = rgb(255, 140, 30) },
}

local function buildShopHall(hub: Model)
	local hall = Kit.model(hub, "ShopHall")
	local frame = facing(0, 0, -H, 0, -1)
	local h = hallRoom(hall, frame, C.Carpet, rgb(40, 70, 120))
	hallSign(hall, frame, "SHOP", {
		Name = "ShopSign",
		TextColor = rgb(90, 210, 255),
		Gradient = { rgb(150, 235, 255), rgb(40, 150, 255) },
		Stroke = rgb(10, 30, 70),
		Glow = C.Blue,
		Icons = "💰",
	})

	-- Side stages with every aura on show.
	for _, side in { -1, 1 } do
		Kit.box(hall, Vector3.new(9, PLAT_H, HALL_D - 8), h(side * 15.5, PLAT_H / 2, WALL_T + HALL_D / 2 - 4), C.Wood, {
			Name = "Stage",
			Material = M.WoodPlanks,
		})
		Kit.neon(
			hall,
			Vector3.new(0.25, PLAT_H + 0.1, HALL_D - 8),
			h(side * 11, PLAT_H / 2, WALL_T + HALL_D / 2 - 4),
			C.Blue,
			"Edge"
		)
	end
	local forSale = {}
	for _, aura in Config.Auras do
		if aura.Price then
			table.insert(forSale, aura)
		end
	end
	for i, aura in forSale do
		local side = if i % 2 == 1 then -1 else 1
		local row = math.ceil(i / 2)
		local d = 8 + row * 9
		local spot = h(side * 15.5, PLAT_H, d) * CFrame.Angles(0, if side < 0 then -math.pi / 2 else math.pi / 2, 0)
		local base = pedestal(hall, spot, aura.Color)
		local pose: Kit.Pose = if row == 1 then "Guard" elseif row == 2 then "Victory" else "Kick"
		local fig, torso =
			Kit.figure(hall, spot * CFrame.new(0, 1.4, 0), OUTFITS[(i - 1) % #OUTFITS + 1], pose, aura.Name)
		Util.applyAura(torso, aura)
		Kit.billboard(torso, string.upper(aura.Name), "$" .. Util.comma(aura.Price :: number), aura.Color, 4.6)
		local prompt = Kit.prompt(base, "OpenShop", "Buy", aura.Name, 10)
		prompt:SetAttribute("HubItem", "Aura:" .. aura.Id)
		fig:SetAttribute("Aura", aura.Id)
	end

	-- Counter with the shopkeeper.
	local counter = Kit.box(
		hall,
		Vector3.new(22, 4, 4),
		h(0, 2, HALL_D - 4),
		rgb(26, 26, 32),
		{ Name = "Counter", Material = M.Metal }
	)
	Kit.box(
		hall,
		Vector3.new(23, 0.6, 5),
		h(0, 4.3, HALL_D - 4),
		rgb(210, 214, 222),
		{ Name = "CounterTop", Material = M.Marble }
	)
	Kit.neon(hall, Vector3.new(22, 0.4, 0.3), h(0, 3.2, HALL_D - 6.05), C.Blue, "CounterGlow")
	Kit.neon(hall, Vector3.new(22, 0.4, 0.3), h(0, 0.8, HALL_D - 6.05), C.Blue, "CounterGlow")
	Kit.prompt(counter, "OpenShop", "Open Shop", "Shopkeeper", 14)
	Kit.figure(hall, h(0, 0, HALL_D - 1.4) * CFrame.Angles(0, math.pi, 0), OUTFITS[5], "Idle", "Shopkeeper")
	local back = Kit.box(
		hall,
		Vector3.new(26, 12, 0.5),
		h(0, 16, HALL_D - 0.3) * CFrame.Angles(0, math.pi, 0),
		rgb(16, 30, 50),
		{
			Name = "ShopScreen",
		}
	)
	Kit.write(back, Enum.NormalId.Front, "💰 CASH ONLY 💰", {
		Font = Enum.Font.Bangers,
		Color = rgb(120, 255, 140),
		Stroke = rgb(0, 40, 10),
		Size = UDim2.fromScale(0.9, 0.45),
		Position = UDim2.fromScale(0.05, 0.08),
		Glow = 2,
	})
	Kit.label(back:FindFirstChildOfClass("SurfaceGui") :: SurfaceGui, "NO ROBUX • NO GAMEPASSES • JUST GRIND", {
		Font = Enum.Font.GothamBlack,
		Color = C.White,
		Size = UDim2.fromScale(0.9, 0.2),
		Position = UDim2.fromScale(0.05, 0.62),
	})
end

local function leaderboard(parent: Instance, cf: CFrame, key: string, title: string, color: Color3)
	local board = Kit.box(
		parent,
		Vector3.new(14, 20, 0.6),
		cf,
		rgb(14, 14, 20),
		{ Name = "Board_" .. key, Material = M.SmoothPlastic }
	)
	for _, y in { 10.3, -10.3 } do
		Kit.box(
			parent,
			Vector3.new(15, 0.6, 1.2),
			cf * CFrame.new(0, y, 0.2),
			color,
			{ Name = "BoardFrame", Material = M.Neon, CanCollide = false }
		)
	end
	for _, x in { 7.3, -7.3 } do
		Kit.box(
			parent,
			Vector3.new(0.6, 21.2, 1.2),
			cf * CFrame.new(x, 0, 0.2),
			rgb(200, 205, 215),
			{ Name = "BoardFrame", Material = M.Metal }
		)
	end
	local gui = Kit.surface(board, Enum.NormalId.Front, 40, 1.4)
	Kit.label(gui, title, {
		Name = "Title",
		Font = Enum.Font.Bangers,
		Color = color,
		Stroke = rgb(0, 0, 0),
		StrokeThickness = 3,
		Size = UDim2.fromScale(0.92, 0.12),
		Position = UDim2.fromScale(0.04, 0.02),
	})
	local rows = Instance.new("Frame")
	rows.Name = "Rows"
	rows.BackgroundTransparency = 1
	rows.Size = UDim2.fromScale(0.92, 0.82)
	rows.Position = UDim2.fromScale(0.04, 0.16)
	rows.Parent = gui
	for i = 1, 10 do
		local row = Instance.new("Frame")
		row.Name = "Row" .. i
		row.Size = UDim2.new(1, 0, 0.1, -4)
		row.Position = UDim2.fromScale(0, (i - 1) * 0.1)
		row.BackgroundColor3 = if i % 2 == 0 then rgb(30, 30, 40) else rgb(22, 22, 30)
		row.BorderSizePixel = 0
		row.Parent = rows
		local rankColor = if i == 1
			then rgb(255, 205, 60)
			elseif i == 2 then rgb(215, 220, 230)
			elseif i == 3 then rgb(230, 150, 90)
			else C.White
		Kit.label(
			row,
			"#" .. i,
			{
				Name = "Rank",
				Font = Enum.Font.GothamBlack,
				Color = rankColor,
				Size = UDim2.fromScale(0.16, 0.8),
				Position = UDim2.fromScale(0.02, 0.1),
			}
		)
		Kit.label(row, "---", {
			Name = "Name",
			Font = Enum.Font.GothamBold,
			Color = C.White,
			Size = UDim2.fromScale(0.52, 0.7),
			Position = UDim2.fromScale(0.2, 0.15),
			Align = Enum.TextXAlignment.Left,
		})
		Kit.label(row, "", {
			Name = "Value",
			Font = Enum.Font.GothamBlack,
			Color = color,
			Size = UDim2.fromScale(0.24, 0.7),
			Position = UDim2.fromScale(0.74, 0.15),
			Align = Enum.TextXAlignment.Right,
		})
	end
	Kit.pointLight(board, color, 0.8, 16)
end

local function buildRankingsHall(hub: Model)
	local hall = Kit.model(hub, "RankingsHall")
	local frame = facing(-H, 0, 0, -1, 0)
	local h = hallRoom(hall, frame, C.Carpet, rgb(120, 60, 30))
	hallSign(hall, frame, "RANKINGS", {
		Name = "RankingsSign",
		TextColor = C.Orange,
		Gradient = { rgb(255, 210, 90), rgb(255, 110, 20) },
		Stroke = rgb(60, 20, 0),
		Glow = C.Orange,
		Icons = "🏆",
	})
	local boards = Kit.model(hall, "Boards")
	leaderboard(boards, h(0, 12, HALL_D + WALL_T - 4.4) * CFrame.Angles(0, math.pi, 0), "Level", "TOP LEVEL", C.Gold)
	leaderboard(
		boards,
		h(-HALL_W / 2 + 0.4, 12, 24) * CFrame.Angles(0, -math.pi / 2, 0),
		"Wins",
		"MOST WINS",
		rgb(90, 220, 120)
	)
	leaderboard(boards, h(HALL_W / 2 - 0.4, 12, 24) * CFrame.Angles(0, math.pi / 2, 0), "KOs", "MOST KOs", C.Crimson)

	-- Trophy in the middle of the room.
	local base = h(0, 0, 22)
	Kit.box(
		hall,
		Vector3.new(6, 3, 6),
		base * CFrame.new(0, 1.5, 0),
		rgb(30, 30, 36),
		{ Name = "TrophyStand", Material = M.Marble }
	)
	Kit.ring(
		hall,
		base * CFrame.new(0, 3.02, 0),
		3.1,
		0.3,
		0.06,
		4,
		C.Gold,
		{ Name = "TrophyGlow", Material = M.Neon, CanCollide = false }
	)
	local gold = { Material = M.Foil, Reflectance = 0.15, Name = "Trophy" }
	Kit.disc(hall, 3.6, 0.8, base * CFrame.new(0, 3.4, 0), C.Gold, gold)
	Kit.cyl(hall, 2.6, 0.9, base * CFrame.new(0, 5, 0) * CFrame.Angles(0, 0, math.rad(90)), C.Gold, gold)
	local cup = Kit.ball(hall, 4, base * CFrame.new(0, 7.2, 0), C.Gold, gold)
	Kit.disc(hall, 4.4, 1.6, base * CFrame.new(0, 8.4, 0), C.Gold, gold)
	for _, side in { -1, 1 } do
		Kit.ring(
			hall,
			base * CFrame.new(side * 2.4, 7.6, 0) * CFrame.Angles(0, 0, math.rad(90)),
			1.1,
			0.35,
			0.35,
			10,
			C.Gold,
			gold
		)
	end
	Kit.pointLight(cup, C.Gold, 1.5, 18)
end

local function buildArenaHall(hub: Model)
	local hall = Kit.model(hub, "ArenaHall")
	local frame = facing(0, 0, H, 0, 1)
	local h = hallRoom(hall, frame, rgb(40, 30, 34), rgb(110, 30, 32))
	hallSign(hall, frame, "ARENA", {
		Name = "ArenaSign",
		TextColor = C.Crimson,
		Gradient = { rgb(255, 120, 110), rgb(230, 20, 40) },
		Stroke = rgb(50, 0, 5),
		Glow = C.Crimson,
		Icons = "⚔️",
	})

	-- Battle portal: a big ring of red light you walk up to.
	local portalCf = h(0, 12, HALL_D - 3) * CFrame.Angles(math.rad(90), 0, 0)
	Kit.ring(
		hall,
		portalCf,
		9.5,
		1.6,
		1.6,
		36,
		C.Crimson,
		{ Name = "PortalRing", Material = M.Neon, CanCollide = false }
	)
	Kit.ring(hall, portalCf, 10.8, 1.2, 2.4, 36, rgb(30, 28, 34), { Name = "PortalFrame", Material = M.Metal })
	local swirl = Kit.cyl(hall, 0.3, 18, h(0, 12, HALL_D - 3) * CFrame.Angles(0, math.rad(90), 0), rgb(255, 60, 70), {
		Name = "PortalSwirl",
		Material = M.Neon,
		Transparency = 0.45,
		CanCollide = false,
	})
	local sparks = Instance.new("ParticleEmitter")
	sparks.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	sparks.Color = ColorSequence.new(rgb(255, 180, 160), rgb(255, 30, 50))
	sparks.Size = NumberSequence.new(0.8, 0)
	sparks.Lifetime = NumberRange.new(0.8, 1.4)
	sparks.Rate = 40
	sparks.Speed = NumberRange.new(4, 8)
	sparks.SpreadAngle = Vector2.new(25, 25)
	sparks.LightEmission = 1
	sparks.EmissionDirection = Enum.NormalId.Left
	sparks.Parent = swirl
	Kit.pointLight(swirl, C.Crimson, 3, 30)

	Kit.sign(hall, h(0, 25.5, HALL_D - 3) * CFrame.Angles(0, math.pi, 0), 22, 5, "JOIN BATTLE", {
		Name = "PortalSign",
		TextColor = C.White,
		Stroke = rgb(120, 0, 10),
		Glow = C.Crimson,
		Icons = "⚔️",
	})

	local pad = Kit.disc(
		hall,
		14,
		0.3,
		h(0, 0.15, HALL_D - 12),
		rgb(60, 10, 16),
		{ Name = "QueuePad", Material = M.Neon, Transparency = 0.1 }
	)
	Kit.ring(
		hall,
		h(0, 0.32, HALL_D - 12),
		7.2,
		0.5,
		0.1,
		30,
		C.White,
		{ Name = "PadRing", Material = M.Neon, CanCollide = false }
	)
	Kit.prompt(pad, "Queue", "Join / Leave Battle", "Battle Portal", 14)

	-- Queue board on the left wall; the client keeps it up to date.
	local boardCf = h(-HALL_W / 2 + 0.4, 12, 29) * CFrame.Angles(0, -math.pi / 2, 0)
	local board = Kit.box(hall, Vector3.new(16, 11, 0.6), boardCf, rgb(12, 10, 18), { Name = "QueueBoard" })
	local gui = screenGui(board)
	Kit.label(
		gui,
		"NEXT BATTLE",
		{
			Name = "Phase",
			Font = Enum.Font.Bangers,
			Color = C.White,
			Stroke = rgb(0, 0, 0),
			StrokeThickness = 3,
			Size = UDim2.fromScale(0.9, 0.3),
			Position = UDim2.fromScale(0.05, 0.06),
		}
	)
	Kit.label(
		gui,
		"0:20",
		{
			Name = "Timer",
			Font = Enum.Font.GothamBlack,
			Color = C.Gold,
			Size = UDim2.fromScale(0.6, 0.3),
			Position = UDim2.fromScale(0.2, 0.38),
		}
	)
	Kit.label(
		gui,
		"IN QUEUE: 0",
		{
			Name = "Queue",
			Font = Enum.Font.GothamBlack,
			Color = rgb(255, 120, 120),
			Size = UDim2.fromScale(0.9, 0.18),
			Position = UDim2.fromScale(0.05, 0.74),
		}
	)

	-- How-to board on the right wall.
	local howCf = h(HALL_W / 2 - 0.4, 12, 29) * CFrame.Angles(0, math.pi / 2, 0)
	local how = Kit.box(hall, Vector3.new(16, 11, 0.6), howCf, rgb(240, 240, 244), { Name = "HowToBoard" })
	local howGui = Kit.surface(how, Enum.NormalId.Front, 40, 1)
	Kit.label(
		howGui,
		"HOW TO BATTLE",
		{
			Font = Enum.Font.PermanentMarker,
			Color = rgb(200, 20, 30),
			Size = UDim2.fromScale(0.9, 0.22),
			Position = UDim2.fromScale(0.05, 0.04),
		}
	)
	local lines = {
		"1. Press PLAY or use the portal",
		"2. Vote for the map",
		"3. Last fighter standing wins",
		"4. KOs and wins pay cash + XP",
	}
	for i, line in lines do
		Kit.label(howGui, line, {
			Font = Enum.Font.PermanentMarker,
			Color = rgb(30, 30, 40),
			Size = UDim2.fromScale(0.9, 0.14),
			Position = UDim2.fromScale(0.05, 0.12 + i * 0.17),
			Align = Enum.TextXAlignment.Left,
		})
	end

	-- Punching bags by the entrance.
	for _, side in { -1, 1 } do
		local x = side * 16.5
		Kit.box(hall, Vector3.new(1, 18, 1), h(x, 9, 7), C.Steel, { Name = "BagPost", Material = M.Metal })
		Kit.box(hall, Vector3.new(1, 1, 10), h(x, 18, 11), C.Steel, { Name = "BagArm", Material = M.Metal })
		Kit.box(
			hall,
			Vector3.new(0.3, 4, 0.3),
			h(x, 16, 15),
			rgb(50, 50, 55),
			{ Name = "Chain", Material = M.DiamondPlate }
		)
		Kit.cyl(
			hall,
			6,
			2.8,
			h(x, 11, 15) * CFrame.Angles(0, 0, math.rad(90)),
			rgb(170, 25, 30),
			{ Name = "PunchingBag", Material = M.Leather }
		)
	end
end

----------------------------------------------------------------------------------
-- Lucky Wheel (north-east corner)
----------------------------------------------------------------------------------

local WHEEL_R = 10.5

local function buildWheel(hub: Model)
	local area = Kit.model(hub, "LuckyWheel")
	local cx, cz = 50, -50
	local centerY = PLAT_H + 4 + WHEEL_R + 1
	local wheelCf = toward(cx, centerY, cz, 0, 0)

	-- Base and stand.
	local base = Kit.disc(area, 18, 2, at(cx, PLAT_H + 1, cz), rgb(30, 26, 38), { Name = "Base", Material = M.Metal })
	Kit.ring(
		area,
		at(cx, PLAT_H + 2.05, cz),
		8.6,
		0.6,
		0.1,
		32,
		C.Pink,
		{ Name = "BaseGlow", Material = M.Neon, CanCollide = false }
	)
	Kit.ring(
		area,
		at(cx, PLAT_H + 2.05, cz),
		6.5,
		0.4,
		0.1,
		32,
		C.Purple,
		{ Name = "BaseGlow", Material = M.Neon, CanCollide = false }
	)
	Kit.pointLight(base, C.Pink, 2, 24)
	local prompt = Kit.prompt(base, "SpinWheel", "Spin", "Lucky Wheel", 18)
	prompt.UIOffset = Vector2.new(0, 60)
	for _, side in { -1, 1 } do
		local footPos = (wheelCf * CFrame.new(side * 5, -(centerY - PLAT_H - 2), 2.2)).Position
		local topPos = (wheelCf * CFrame.new(0, 0, 2.2)).Position
		local len = (topPos - footPos).Magnitude
		Kit.box(
			area,
			Vector3.new(1.2, len, 1.2),
			CFrame.lookAt((topPos + footPos) / 2, topPos) * CFrame.Angles(math.rad(90), 0, 0),
			C.Steel,
			{
				Name = "Leg",
				Material = M.Metal,
			}
		)
	end

	-- The spinning part. The client rotates everything in this model around "Pivot".
	local wheel = Kit.model(area, "Wheel")
	wheel:SetAttribute("Pivot", wheelCf)
	wheel.ModelStreamingMode = Enum.ModelStreamingMode.Atomic -- arrives all at once so it can spin
	local prizes = Config.WheelPrizes
	local n = #prizes
	local function rim(theta: number, r: number): Vector3
		-- theta is clockwise from the top, as seen by someone facing the wheel
		return (wheelCf * CFrame.new(-r * math.sin(theta), r * math.cos(theta), 0)).Position
	end
	local c = wheelCf.Position
	for i, prize in prizes do
		local a0 = (i - 1) / n * math.pi * 2
		local a1 = i / n * math.pi * 2
		local steps = 3
		for s = 1, steps do
			local t0 = a0 + (a1 - a0) * (s - 1) / steps
			local t1 = a0 + (a1 - a0) * s / steps
			Kit.triangle(
				wheel,
				c,
				rim(t0, WHEEL_R),
				rim(t1, WHEEL_R),
				0.8,
				prize.Color,
				{ Name = "Slice" .. i, Material = M.SmoothPlastic }
			)
		end
		-- divider line
		local mid0 = (c + rim(a0, WHEEL_R)) / 2
		Kit.box(
			wheel,
			Vector3.new(0.25, WHEEL_R, 1),
			CFrame.lookAt(mid0, mid0 + wheelCf.LookVector, (rim(a0, WHEEL_R) - c).Unit),
			C.Gold,
			{
				Name = "Divider",
				Material = M.Neon,
				CanCollide = false,
			}
		)
		-- prize text, reading outwards from the middle
		local theta = (a0 + a1) / 2
		local labelPos = rim(theta, WHEEL_R * 0.6) + wheelCf.LookVector * 0.45
		local outward = (rim(theta, 1) - c).Unit
		local zAxis = -wheelCf.LookVector
		local xAxis = -outward -- a Front-face SurfaceGui reads along the part's -X
		local holder = Kit.box(
			wheel,
			Vector3.new(6.6, 2, 0.1),
			CFrame.fromMatrix(labelPos, xAxis, zAxis:Cross(xAxis), zAxis),
			C.Dark,
			{
				Name = "PrizeLabel" .. i,
				Transparency = 1,
				CanCollide = false,
				CanQuery = false,
			}
		)
		Kit.write(holder, Enum.NormalId.Front, prize.Label, {
			Font = Enum.Font.Bangers,
			Color = if prize.Kind == "Aura" then rgb(40, 20, 0) else C.White,
			Stroke = if prize.Kind == "Aura" then rgb(255, 245, 200) else rgb(0, 0, 0),
			StrokeThickness = 2,
			PixelsPerStud = 40,
			Glow = 1.3,
		})
	end
	Kit.ring(
		wheel,
		wheelCf * CFrame.Angles(math.rad(90), 0, 0),
		WHEEL_R + 0.5,
		1.2,
		1.6,
		40,
		C.Gold,
		{ Name = "Rim", Material = M.Foil, Reflectance = 0.1 }
	)
	for i = 1, n do
		local peg = rim((i - 1) / n * math.pi * 2, WHEEL_R + 0.5) + wheelCf.LookVector * 1
		Kit.ball(wheel, 0.9, CFrame.new(peg), C.White, { Name = "Peg", Material = M.Neon, CanCollide = false })
	end
	Kit.cyl(
		wheel,
		1.6,
		3.4,
		wheelCf * CFrame.new(0, 0, -0.5) * CFrame.Angles(0, math.rad(90), 0),
		C.Gold,
		{ Name = "Hub", Material = M.Foil }
	)
	Kit.write(
		Kit.box(wheel, Vector3.new(3, 3, 0.1), wheelCf * CFrame.new(0, 0, -1.4), C.Dark, {
			Name = "HubLabel",
			Transparency = 1,
			CanCollide = false,
			CanQuery = false,
		}),
		Enum.NormalId.Front,
		"🎡",
		{ Glow = 1 }
	)

	-- Pointer at the top (does not spin).
	local tip = rim(0, WHEEL_R - 1.2) + wheelCf.LookVector * 1.2
	local left = rim(0, WHEEL_R + 2.4) + wheelCf.RightVector * 1.4 + wheelCf.LookVector * 1.2
	local right = rim(0, WHEEL_R + 2.4) - wheelCf.RightVector * 1.4 + wheelCf.LookVector * 1.2
	Kit.triangle(area, tip, left, right, 0.8, C.White, { Name = "Pointer", Material = M.Neon })

	-- Grand prize display next to the wheel.
	local void = Util.find(Config.Auras, "Void")
	local spot = toward(56, PLAT_H, -29, 0, 0)
	pedestal(area, spot, C.Purple, 6)
	local _, torso = Kit.figure(area, spot * CFrame.new(0, 1.4, 0), OUTFITS[3], "Victory", "GrandPrize")
	Util.applyAura(torso, void)
	Kit.billboard(torso, "VOID AURA", "WHEEL GRAND PRIZE", C.Purple, 5)
	Kit.billboard(base, "LUCKY WHEEL", "FREE SPINS: AFK CHAMBER", C.Pink, centerY + WHEEL_R + 4 - (PLAT_H + 1))
end

----------------------------------------------------------------------------------
-- AFK chamber (door in the north wall, east of the shop)
----------------------------------------------------------------------------------

local function buildAfkChamber(hub: Model)
	local room = Kit.model(hub, "AfkChamber")
	local x0, x1, z0, z1 = 23, 45, -H - WALL_T - 22, -H - WALL_T
	local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
	local w, d = x1 - x0, z1 - z0
	local ceilingY = 16
	local outerD = d + 4 -- room plus back wall, from z0 - 4 to z1
	local outerZ = (z0 - 4 + z1) / 2
	Kit.box(
		room,
		Vector3.new(w + 8, 2, outerD),
		at(cx, -1, outerZ),
		rgb(24, 18, 36),
		{ Name = "Floor", Material = M.Slate }
	)
	for i = 0, 6 do
		Kit.neon(room, Vector3.new(0.2, 0.06, d - 1), at(x0 + 2 + i * (w - 4) / 6, 0.03, cz), C.Purple, "Grid")
	end
	for i = 0, 5 do
		Kit.neon(room, Vector3.new(w - 1, 0.06, 0.2), at(cx, 0.03, z0 + 2 + i * (d - 4) / 5), C.Purple, "Grid")
	end
	for _, x in { x0 - 2, x1 + 2 } do
		Kit.box(
			room,
			Vector3.new(4, ceilingY, outerD),
			at(x, ceilingY / 2, outerZ),
			rgb(60, 40, 90),
			{ Name = "Wall", Material = M.Brick }
		)
	end
	Kit.box(
		room,
		Vector3.new(w + 8, ceilingY, 4),
		at(cx, ceilingY / 2, z0 - 2),
		rgb(60, 40, 90),
		{ Name = "Wall", Material = M.Brick }
	)
	Kit.box(
		room,
		Vector3.new(w + 8, 2, outerD),
		at(cx, ceilingY + 1, outerZ),
		C.Ceiling,
		{ Name = "Ceiling", Material = M.Concrete }
	)
	local lamp = Kit.neon(room, Vector3.new(12, 0.4, 10), at(cx, ceilingY - 0.2, cz), rgb(220, 200, 255), "SkyPanel")
	Kit.surfaceLight(lamp, Enum.NormalId.Bottom, rgb(210, 180, 255), 1.6, 24)

	-- Bean bags to chill on.
	for i, x in { x0 + 4, cx, x1 - 4 } do
		local color = if i == 2 then C.Pink else C.Purple
		Kit.ball(room, 3.8, at(x, 1.2, z0 + 4), color, { Name = "BeanBag", Material = M.Fabric })
		local seat = Instance.new("Seat")
		seat.Name = "Seat"
		seat.Anchored = true
		seat.Size = Vector3.new(2.5, 0.4, 2.5)
		seat.CFrame = at(x, 2.4, z0 + 4) * CFrame.Angles(0, math.pi, 0)
		seat.Transparency = 1
		seat.Parent = room
	end

	local screen = Kit.box(
		room,
		Vector3.new(16, 7, 0.4),
		facing(cx, 8.5, z0 + 0.25, 0, 1),
		rgb(20, 10, 30),
		{ Name = "AfkScreen" }
	)
	local gui = screenGui(screen)
	Kit.label(
		gui,
		"💤 AFK CHAMBER 💤",
		{
			Font = Enum.Font.Bangers,
			Color = rgb(220, 180, 255),
			Stroke = rgb(0, 0, 0),
			StrokeThickness = 3,
			Size = UDim2.fromScale(0.9, 0.34),
			Position = UDim2.fromScale(0.05, 0.06),
		}
	)
	Kit.label(gui, string.format("+1 LUCKY SPIN EVERY %d MIN", Config.Afk.LuckySpinEvery // 60), {
		Font = Enum.Font.GothamBlack,
		Color = C.Pink,
		Size = UDim2.fromScale(0.9, 0.2),
		Position = UDim2.fromScale(0.05, 0.46),
	})
	Kit.label(gui, string.format("+$%d EVERY %d SEC", Config.Afk.CashAmount, Config.Afk.CashEvery), {
		Font = Enum.Font.GothamBlack,
		Color = rgb(120, 255, 140),
		Size = UDim2.fromScale(0.9, 0.18),
		Position = UDim2.fromScale(0.05, 0.72),
	})

	-- Invisible box the server checks to see who is inside.
	local zone = Kit.box(room, Vector3.new(w, 12, d - 1), at(cx, 6, cz - 0.5), C.Purple, {
		Name = "AfkZone",
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
	})
	zone.CanTouch = false

	-- Sign over the door on the plaza side.
	Kit.sign(room, facing(34, 18.2, -H + 1.3, 0, 1), 18, 6, "AFK CHAMBER", {
		Name = "AfkSign",
		TextColor = rgb(80, 200, 255),
		Gradient = { rgb(170, 235, 255), rgb(60, 140, 255) },
		Glow = C.Blue,
		Subtitle = "FREE LUCKY SPINS",
		SubtitleColor = rgb(255, 230, 90),
	})
	Kit.neon(room, Vector3.new(14, 0.4, 0.4), at(34, 14 - 0.2, -H + 0.3), C.Pink, "DoorLight")
end

----------------------------------------------------------------------------------
-- Corners: showcase (NW), sensei & game plan board (SW), daily deal (SE),
-- featured poster (E wall)
----------------------------------------------------------------------------------

local function buildCrown(parent: Instance, cf: CFrame)
	local gold = { Name = "Crown", Material = M.Foil, Reflectance = 0.2 }
	Kit.ring(parent, cf * CFrame.new(0, 1, 0), 3, 0.8, 2, 16, C.Gold, gold)
	for i = 1, 8 do
		local a = (i - 1) / 8 * math.pi * 2
		local spike = cf * CFrame.Angles(0, a, 0) * CFrame.new(0, 3.2, -3) * CFrame.Angles(0, math.pi / 2, 0)
		Kit.wedge(parent, Vector3.new(0.6, 2.4, 1.2), spike * CFrame.new(0, 0, -0.6), C.Gold, gold)
		Kit.wedge(
			parent,
			Vector3.new(0.6, 2.4, 1.2),
			spike * CFrame.new(0, 0, 0.6) * CFrame.Angles(0, math.pi, 0),
			C.Gold,
			gold
		)
		local gem = cf * CFrame.Angles(0, a + math.pi / 8, 0) * CFrame.new(0, 1, -3.45)
		Kit.ball(parent, 0.7, gem, if i % 2 == 0 then C.Crimson else C.Blue, { Name = "Gem", Material = M.Neon })
	end
end

local function buildShowcase(hub: Model)
	local area = Kit.model(hub, "Showcase")

	-- 1: champion crown (level 50 reward)
	local spot1 = toward(-24, PLAT_H, -51, -24, 0)
	local crownBase = pedestal(area, spot1, C.Gold, 7)
	buildCrown(area, spot1 * CFrame.new(0, 1.4, 0))
	Kit.billboard(crownBase, "LEGEND TITLE", "REACH LEVEL 50", C.Gold, 8)

	-- 2: today's deal (the server swaps the aura and price each day)
	local spot2 = toward(-35, PLAT_H, -51, -30, 0)
	local dealBase = pedestal(area, spot2, C.Pink)
	dealBase.Name = "DealPedestal"
	local deal, dealTorso = Kit.figure(area, spot2 * CFrame.new(0, 1.4, 0), OUTFITS[4], "Guard", "DealFigure")
	deal:SetAttribute("Role", "Deal")
	Kit.billboard(dealTorso, "ON SALE", "DAILY DEAL", C.Pink, 4.8)
	local dealPrompt = Kit.prompt(dealBase, "OpenShop", "Check Deal", "Daily Deal", 10)
	dealPrompt:SetAttribute("HubItem", "Deal")
	Kit.sign(area, facing(-29, 12, -H + 1.3, 0, 1), 15, 5, "ON SALE", {
		Name = "SaleSign",
		TextColor = rgb(255, 60, 90),
		Gradient = { rgb(255, 150, 170), rgb(255, 30, 70) },
		Glow = C.Pink,
		Subtitle = "NEW DEAL EVERY DAY",
		SubtitleColor = C.Gold,
	})

	-- 3: hall of fame statue (server writes the #1 player's name on it)
	local spot3 = toward(-48, PLAT_H, -49, -20, -10)
	pedestal(area, spot3, C.White, 6)
	local statue, statueTorso = Kit.figure(area, spot3 * CFrame.new(0, 1.4, 0), {
		Skin = rgb(170, 170, 176),
		Shirt = rgb(150, 150, 158),
		Pants = rgb(130, 130, 138),
		Gloves = rgb(190, 190, 196),
	}, "Victory", "HallOfFame")
	for _, part in statue:GetChildren() do
		if part:IsA("BasePart") then
			part.Material = M.Marble
		end
	end
	local fameDecal = (statue:FindFirstChild("Head") :: BasePart):FindFirstChild("face")
	if fameDecal then
		fameDecal:Destroy()
	end
	Kit.billboard(statueTorso, "HALL OF FAME", "#1 LEVEL: ---", C.White, 5.2)

	-- 4: mythic style
	local featured = Util.find(Config.Styles, Config.FeaturedStyle) or Config.Styles[#Config.Styles]
	local spot4 = toward(-52, PLAT_H, -27, 0, -20)
	pedestal(area, spot4, featured.Color)
	local _, mythicTorso = Kit.figure(area, spot4 * CFrame.new(0, 1.4, 0), OUTFITS[3], "Kick", "MythicStyle")
	Util.applyAura(mythicTorso, Util.find(Config.Auras, "Storm"))
	Kit.billboard(
		mythicTorso,
		string.upper(featured.Name),
		string.upper(featured.Rarity) .. " STYLE • ROLL IN STYLES",
		featured.Color,
		4.8
	)
end

local function buildSensei(hub: Model)
	local area = Kit.model(hub, "SenseiCorner")
	local cx, cz = -50, 50
	-- glowing blue stage
	local stage = Kit.disc(
		area,
		20,
		1,
		at(cx, PLAT_H + 0.5, cz),
		rgb(20, 40, 90),
		{ Name = "Stage", Material = M.Glass, Transparency = 0.1 }
	)
	Kit.ring(
		area,
		at(cx, PLAT_H + 1.02, cz),
		9.6,
		0.8,
		0.1,
		36,
		C.Blue,
		{ Name = "StageGlow", Material = M.Neon, CanCollide = false }
	)
	Kit.ring(
		area,
		at(cx, PLAT_H + 0.4, cz),
		10.2,
		0.6,
		0.9,
		36,
		C.Blue,
		{ Name = "StageGlow", Material = M.Neon, CanCollide = false }
	)
	Kit.pointLight(stage, C.Blue, 2, 26)

	-- game plan whiteboard
	local boardCf = toward(cx - 2, PLAT_H + 10.5, cz + 4, 0, 0)
	local board = Kit.box(area, Vector3.new(18, 9, 0.5), boardCf, rgb(248, 248, 250), { Name = "GamePlan" })
	Kit.box(
		area,
		Vector3.new(19, 10, 0.3),
		boardCf * CFrame.new(0, 0, 0.35),
		rgb(170, 175, 185),
		{ Name = "BoardFrame", Material = M.Metal }
	)
	for _, x in { -8, 8 } do
		Kit.box(
			area,
			Vector3.new(0.6, 5, 0.6),
			boardCf * CFrame.new(x, -6.5, 0.3),
			rgb(170, 175, 185),
			{ Name = "BoardLeg", Material = M.Metal }
		)
	end
	local gui = Kit.surface(board, Enum.NormalId.Front, 40, 1)
	Kit.label(
		gui,
		"GAME PLAN",
		{
			Font = Enum.Font.PermanentMarker,
			Color = rgb(20, 60, 200),
			Size = UDim2.fromScale(0.5, 0.2),
			Position = UDim2.fromScale(0.25, 0.03),
		}
	)
	local marks: { { any } } = {
		{ "✖", 0.12, 0.35, rgb(220, 30, 40) },
		{ "✖", 0.2, 0.62, rgb(220, 30, 40) },
		{ "◯", 0.72, 0.4, rgb(20, 60, 200) },
		{ "◯", 0.8, 0.66, rgb(20, 60, 200) },
		{ "➜", 0.36, 0.42, rgb(30, 30, 40) },
		{ "➜", 0.5, 0.55, rgb(30, 30, 40) },
		{ "💥", 0.62, 0.48, rgb(0, 0, 0) },
	}
	for _, mark in marks do
		Kit.label(gui, mark[1] :: string, {
			Font = Enum.Font.PermanentMarker,
			Color = mark[4] :: Color3,
			Size = UDim2.fromScale(0.12, 0.2),
			Position = UDim2.fromScale(mark[2] :: number, mark[3] :: number),
		})
	end
	Kit.label(
		gui,
		"COMBO • DASH • FINISH",
		{
			Font = Enum.Font.PermanentMarker,
			Color = rgb(30, 30, 40),
			Size = UDim2.fromScale(0.7, 0.13),
			Position = UDim2.fromScale(0.15, 0.84),
		}
	)

	-- the sensei
	local senseiSpot = toward(cx + 3, PLAT_H + 1, cz - 3, 0, 0)
	local sensei = Kit.figure(area, senseiSpot, {
		Skin = rgb(220, 180, 140),
		Shirt = rgb(245, 245, 245),
		Pants = rgb(245, 245, 245),
		Belt = rgb(15, 15, 15),
	}, "Meditate", "Sensei")
	local head = sensei:FindFirstChild("Head") :: BasePart
	Kit.billboard(head, "SENSEI", "PICK YOUR STYLE", C.Blue, 2.4)
	Kit.prompt(sensei:FindFirstChild("Torso") :: BasePart, "OpenStyles", "Talk", "Sensei", 12)
end

local function buildTrainingDoor(hub: Model)
	local area = Kit.model(hub, "TrainingCorner")
	-- Door to the training grounds (same as the EXTRA button).
	local door = toward(48, PLAT_H, 48, 0, 0)
	local orange = rgb(255, 120, 30)
	for _, side in { -1, 1 } do
		Kit.box(
			area,
			Vector3.new(2, 16, 2),
			door * CFrame.new(side * 7, 8, 0),
			C.Steel,
			{ Name = "DoorPost", Material = M.Metal }
		)
		Kit.neon(area, Vector3.new(0.4, 15, 0.4), door * CFrame.new(side * 5.9, 8, -1.1), orange, "DoorGlow")
	end
	Kit.box(area, Vector3.new(16, 2, 2), door * CFrame.new(0, 17, 0), C.Steel, { Name = "DoorTop", Material = M.Metal })
	local gate = Kit.box(area, Vector3.new(12, 15, 0.4), door * CFrame.new(0, 8, 0.4), rgb(255, 110, 30), {
		Name = "TrainingPortal",
		Material = M.Neon,
		Transparency = 0.55,
		CanCollide = false,
	})
	Kit.pointLight(gate, orange, 2, 20)
	Kit.prompt(gate, "Train", "Enter", "Training Grounds", 12)
	Kit.sign(area, door * CFrame.new(0, 21.5, 0), 20, 6, "TRAINING", {
		Name = "TrainingSign",
		TextColor = orange,
		Gradient = { rgb(255, 210, 120), rgb(255, 100, 20) },
		Glow = orange,
		Subtitle = "HIT THE DUMMIES",
		SubtitleColor = C.White,
	})

	-- Two dummies either side of the door as a teaser.
	for i, side in { -1, 1 } do
		local spot = door * CFrame.new(side * 12, 0, -2)
		Kit.disc(
			area,
			3.4,
			0.4,
			spot * CFrame.new(0, 0.2, 0),
			rgb(90, 70, 50),
			{ Name = "DummyBase", Material = M.Wood }
		)
		Kit.figure(area, spot * CFrame.new(0, 0.4, 0), {
			Skin = rgb(205, 170, 120),
			Shirt = rgb(200, 160, 110),
			Pants = rgb(170, 130, 90),
			Belt = rgb(160, 30, 30),
		}, if i == 1 then "Idle" else "Guard", "Dummy")
	end
end

local function buildFeatured(hub: Model)
	local area = Kit.model(hub, "Featured")
	local style = Util.find(Config.Styles, Config.FeaturedStyle) or Config.Styles[#Config.Styles]
	local cf = facing(H - 0.6, 17, 0, -1, 0)
	local poster = Kit.box(area, Vector3.new(44, 22, 0.6), cf, rgb(14, 8, 24), { Name = "Poster" })
	for _, y in { 11.4, -11.4 } do
		Kit.neon(area, Vector3.new(45.6, 0.8, 0.8), cf * CFrame.new(0, y, 0), style.Color, "PosterGlow")
	end
	for _, x in { 22.4, -22.4 } do
		Kit.neon(area, Vector3.new(0.8, 23.6, 0.8), cf * CFrame.new(x, 0, 0), style.Color, "PosterGlow")
	end
	local gui = Kit.surface(poster, Enum.NormalId.Front, 25, 1.6)
	local bg = Instance.new("Frame")
	bg.Size = UDim2.fromScale(1, 1)
	bg.BorderSizePixel = 0
	bg.BackgroundColor3 = Color3.new(1, 1, 1)
	bg.Parent = gui
	local grad = Instance.new("UIGradient")
	grad.Color = ColorSequence.new(style.Color:Lerp(Color3.new(0, 0, 0), 0.35), rgb(8, 4, 14))
	grad.Rotation = 20
	grad.Parent = bg
	Kit.label(
		gui,
		style.Icon,
		{ Size = UDim2.fromScale(0.4, 0.8), Position = UDim2.fromScale(0.58, 0.1), Transparency = 0.15 }
	)
	Kit.label(gui, "NEW " .. string.upper(style.Rarity) .. " STYLE", {
		Font = Enum.Font.GothamBlack,
		Color = C.Gold,
		Size = UDim2.fromScale(0.55, 0.1),
		Position = UDim2.fromScale(0.04, 0.12),
		Align = Enum.TextXAlignment.Left,
	})
	Kit.label(gui, string.upper(style.Name), {
		Font = Enum.Font.Bangers,
		Color = C.White,
		Stroke = style.Color,
		StrokeThickness = 6,
		Size = UDim2.fromScale(0.6, 0.34),
		Position = UDim2.fromScale(0.04, 0.24),
		Align = Enum.TextXAlignment.Left,
	})
	Kit.label(gui, style.Blurb, {
		Font = Enum.Font.GothamBold,
		Color = rgb(230, 220, 255),
		Size = UDim2.fromScale(0.55, 0.09),
		Position = UDim2.fromScale(0.04, 0.6),
		Align = Enum.TextXAlignment.Left,
	})
	Kit.label(gui, "ROLL IT IN STYLES ▶", {
		Font = Enum.Font.Bangers,
		Color = rgb(120, 255, 140),
		Stroke = rgb(0, 30, 0),
		StrokeThickness = 3,
		Size = UDim2.fromScale(0.45, 0.13),
		Position = UDim2.fromScale(0.04, 0.76),
		Align = Enum.TextXAlignment.Left,
	})
	Kit.pointLight(poster, style.Color, 2, 30)

	-- the featured fighter in front of the poster
	local spot = facing(H - 14, PLAT_H, 0, -1, 0)
	local stand = pedestal(area, spot, style.Color, 7)
	local _, torso = Kit.figure(area, spot * CFrame.new(0, 1.4, 0), OUTFITS[1], "Guard", "FeaturedFighter")
	Util.applyAura(torso, Util.find(Config.Auras, "Void"))
	local prompt = Kit.prompt(stand, "OpenStyles", "Roll Styles", style.Name, 12)
	prompt.UIOffset = Vector2.new(0, 40)
end

----------------------------------------------------------------------------------
-- Lockers, graffiti, clutter
----------------------------------------------------------------------------------

local function buildLockers(hub: Model)
	local lockers = Kit.model(hub, "Lockers")
	-- (along, from, to, wallCoord, inward normal x, inward normal z)
	-- Rows sit between the pillars (door pillars at +-18, middle ones at +-40, corners at +-61).
	local rows: { { any } } = {
		{ "Z", -37, -21, -H, 1, 0 },
		{ "Z", 21, 37, -H, 1, 0 },
		{ "Z", 43, 58, -H, 1, 0 },
		{ "X", -37, -21, H, 0, -1 },
		{ "X", -58, -43, H, 0, -1 },
		{ "X", 21, 37, H, 0, -1 },
		{ "Z", -57, -30, H, -1, 0 },
		{ "Z", 30, 57, H, -1, 0 },
	}
	local W, T, D = 3, 8, 2.4
	for _, row in rows do
		local axis, from, to, wallCoord, nx, nz =
			row[1] :: string, row[2] :: number, row[3] :: number, row[4] :: number, row[5] :: number, row[6] :: number
		local count = math.floor((to - from) / W)
		local depthCoord = wallCoord + (nx + nz) * (D / 2 + 0.6)
		for i = 1, count do
			local along = from + (i - 0.5) * W
			local x = if axis == "X" then along else depthCoord
			local z = if axis == "X" then depthCoord else along
			local cf = facing(x, PLAT_H + T / 2, z, nx, nz)
			local tint = if i % 2 == 0 then rgb(66, 68, 78) else rgb(58, 60, 70)
			Kit.box(lockers, Vector3.new(W - 0.08, T, D), cf, tint, { Name = "Locker", Material = M.Metal })
			Kit.box(
				lockers,
				Vector3.new(0.3, 1.2, 0.3),
				cf * CFrame.new(W / 2 - 0.6, -0.5, -D / 2 - 0.1),
				rgb(20, 20, 24),
				{ Name = "Handle", Material = M.Metal }
			)
			for v = 1, 3 do
				Kit.box(
					lockers,
					Vector3.new(W - 1.2, 0.12, 0.1),
					cf * CFrame.new(0, T / 2 - 0.6 - v * 0.35, -D / 2 - 0.02),
					rgb(25, 25, 30),
					{ Name = "Vent" }
				)
			end
		end
		local length = count * W
		local mid = from + length / 2
		local x = if axis == "X" then mid else depthCoord
		local z = if axis == "X" then depthCoord else mid
		local strip = if axis == "X" then Vector3.new(length, 0.3, D + 0.2) else Vector3.new(D + 0.2, 0.3, length)
		Kit.neon(lockers, strip, at(x, PLAT_H + T + 0.15, z), C.Orange, "LockerLight")
	end
end

local function graffiti(parent: Instance, cf: CFrame, width: number, height: number, pieces: { { any } })
	local canvas = Kit.box(parent, Vector3.new(width, height, 0.05), cf, C.Dark, {
		Name = "Graffiti",
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
	})
	canvas.CastShadow = false
	local gui = Kit.surface(canvas, Enum.NormalId.Front, 12, 1.15)
	for _, p in pieces do
		Kit.label(gui, p[1] :: string, {
			Font = p[2] :: Enum.Font,
			Color = p[3] :: Color3,
			Stroke = p[4] :: Color3?,
			StrokeThickness = 4,
			Size = UDim2.fromScale(p[7] :: number, p[8] :: number),
			Position = UDim2.fromScale(p[5] :: number, p[6] :: number),
			Rotation = p[9] :: number,
			Transparency = (p[10] :: number?) or 0,
		})
	end
end

local function buildGraffiti(hub: Model)
	local art = Kit.model(hub, "Graffiti")
	local black = rgb(20, 16, 18)
	local marker = Enum.Font.PermanentMarker
	local creep = Enum.Font.Creepster
	local bang = Enum.Font.Bangers
	-- Panels sit between the pillars, above the lockers.
	-- { text, font, colour, stroke, x, y, w, h, rotation, transparency }
	local N, S, W, E = { 0, 1 }, { 0, -1 }, { 1, 0 }, { -1, 0 }
	local function onWall(dir: { number }, along: number, y: number, width: number, height: number, pieces: { { any } })
		local x = if dir[1] ~= 0 then -dir[1] * (H - 0.35) else along
		local z = if dir[2] ~= 0 then -dir[2] * (H - 0.35) else along
		graffiti(art, facing(x, y, z, dir[1], dir[2]), width, height, pieces)
	end
	-- Wall sections between pillars: +-[21, 37] and +-[43, 57] (east wall: +-[30, 57]).
	onWall(N, -29, 27, 13, 20, {
		{ "NO", marker, C.Crimson, black, 0.05, 0.02, 0.9, 0.4, -6 },
		{ "MERCY", marker, C.Crimson, black, 0.02, 0.38, 0.96, 0.4, -6 },
		{ "fight club", marker, black, nil, 0.1, 0.78, 0.8, 0.2, 4, 0.3 },
	})
	onWall(N, -50, 27, 12, 20, {
		{ "💀", marker, C.White, nil, 0.05, 0.1, 0.9, 0.7, 10 },
	})
	onWall(N, 40, 30, 34, 12, {
		{ "SPIN TO WIN", marker, C.Pink, black, 0.04, 0.05, 0.92, 0.9, -3 },
	})
	onWall(W, -29, 27, 13, 20, {
		{ "FIGHT", bang, C.Orange, black, 0.02, 0.05, 0.96, 0.42, -8 },
		{ "👊", marker, C.White, nil, 0.2, 0.45, 0.6, 0.4, -12 },
	})
	onWall(W, -50, 27, 12, 20, {
		{ "RAW", creep, C.Crimson, black, 0.05, 0.15, 0.9, 0.5, 6 },
	})
	onWall(W, 29, 27, 13, 20, {
		{ "K.O.!", bang, C.Gold, black, 0.05, 0.05, 0.9, 0.45, 6 },
		{ "💥", marker, C.White, nil, 0.2, 0.48, 0.6, 0.42, 0 },
	})
	onWall(W, 50, 27, 12, 20, {
		{ "🔥", marker, C.White, nil, 0.1, 0.1, 0.8, 0.7, -8 },
	})
	onWall(S, -29, 27, 13, 20, {
		{ "STAY", marker, C.Orange, black, 0.05, 0.08, 0.9, 0.38, -4 },
		{ "HUNGRY", marker, C.Orange, black, 0.02, 0.48, 0.96, 0.38, -4 },
	})
	onWall(S, -50, 27, 12, 20, {
		{ "☠️", marker, C.Crimson, nil, 0.1, 0.1, 0.8, 0.7, 6 },
	})
	onWall(S, 29, 27, 13, 20, {
		{ "RISE", bang, C.Crimson, black, 0.05, 0.05, 0.9, 0.42, 5 },
		{ "UP ⚡", bang, C.Gold, black, 0.05, 0.48, 0.9, 0.42, 5 },
	})
	onWall(S, 50, 27, 12, 20, {
		{ "NO", marker, C.White, black, 0.1, 0.05, 0.8, 0.4, 4 },
		{ "RULES", marker, C.White, black, 0.02, 0.48, 0.96, 0.4, 4 },
	})
	onWall(E, -43.5, 27, 24, 18, {
		{ "BATTLE", creep, C.Crimson, black, 0.02, 0.1, 0.72, 0.6, -5 },
		{ "⚔️", marker, C.White, nil, 0.74, 0.14, 0.24, 0.5, 0 },
	})
	onWall(E, 43.5, 27, 24, 18, {
		{ "GRIND", bang, C.Gold, black, 0.04, 0.08, 0.68, 0.66, 4 },
		{ "💪", marker, C.White, nil, 0.74, 0.14, 0.24, 0.5, -6 },
	})

	-- Claw slashes on the two wall sections without lockers.
	local function slash(cf: CFrame)
		for i = -1, 1 do
			Kit.neon(
				art,
				Vector3.new(0.5, 9, 0.2),
				cf * CFrame.new(i * 1.6, 0, 0) * CFrame.Angles(0, 0, math.rad(28)),
				C.Crimson,
				"Slash"
			)
		end
	end
	slash(facing(-H + 0.45, 9, -50, 1, 0))
	slash(facing(50, 9, H - 0.45, 0, -1))
end

local function buildProps(hub: Model)
	local props = Kit.model(hub, "Props")
	local rand = makeRandom(21)
	-- Crate stacks.
	local stacks = { { -54, -58 }, { 53, 58 } }
	for _, st in stacks do
		for i = 1, 3 do
			local size = rand(3.2, 4)
			local x = st[1] + rand(-1, 1) + (if i == 2 then 3.5 else 0)
			local z = st[2] + rand(-1, 1)
			local y = PLAT_H + size / 2 + (if i == 3 then 3.6 else 0)
			Kit.box(
				props,
				Vector3.new(size, size, size),
				at(x, y, z) * CFrame.Angles(0, rand(0, math.pi), 0),
				rgb(120, 86, 52),
				{
					Name = "Crate",
					Material = M.WoodPlanks,
				}
			)
		end
	end
	-- Tyres.
	for i = 1, 4 do
		local x, z = -30 + i * 1.2, 55 + (i % 2) * 1.5
		Kit.cyl(
			props,
			1.4,
			3.6,
			at(x, PLAT_H + 0.7 + (i - 1) * 1.4, z) * CFrame.Angles(0, 0, math.rad(90)),
			rgb(26, 26, 28),
			{
				Name = "Tyre",
				Material = M.Rubber,
			}
		)
	end
end

local function setUpLighting()
	pcall(function()
		(Lighting :: any).Technology = Enum.Technology.Future
	end)
	Lighting.Ambient = rgb(118, 104, 108)
	Lighting.OutdoorAmbient = rgb(128, 118, 124)
	Lighting.Brightness = 2.2
	Lighting.ClockTime = 14
	Lighting.EnvironmentDiffuseScale = 0.6
	Lighting.EnvironmentSpecularScale = 0.6
	Lighting.GlobalShadows = true
	Lighting.ExposureCompensation = 0.15
	local function effect(className: string, name: string): Instance
		local existing = Lighting:FindFirstChild(name)
		if existing then
			existing:Destroy()
		end
		local e = Instance.new(className)
		e.Name = name
		e.Parent = Lighting
		return e
	end
	local bloom = effect("BloomEffect", "BattleHubBloom") :: BloomEffect
	bloom.Intensity = 0.8
	bloom.Size = 30
	bloom.Threshold = 1.5
	local cc = effect("ColorCorrectionEffect", "BattleHubColor") :: ColorCorrectionEffect
	cc.Contrast = 0.12
	cc.Saturation = 0.18
	cc.TintColor = rgb(255, 246, 240)
end

-- Builds the whole lobby into `parent` (normally Workspace) and returns it.
function Builder.build(parent: Instance): Model
	local hub = Instance.new("Model")
	hub.Name = "BattleHub"
	buildShell(hub)
	buildCenter(hub)
	buildShopHall(hub)
	buildRankingsHall(hub)
	buildArenaHall(hub)
	buildWheel(hub)
	buildAfkChamber(hub)
	buildShowcase(hub)
	buildSensei(hub)
	buildTrainingDoor(hub)
	buildFeatured(hub)
	buildLockers(hub)
	buildGraffiti(hub)
	buildProps(hub)
	if Config.SetUpLighting then
		setUpLighting()
	end
	hub.Parent = parent
	return hub
end

return Builder
