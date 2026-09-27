--!strict
--[[
	Builds the three battle maps players vote on, plus the training grounds
	(the EXTRA button).

	Maps are stored in ServerStorage.BattleArenas and only the voted one is
	copied into Workspace while a match runs. Each map is a Model with:
	  * a "Spawns" folder of invisible parts where fighters appear
	  * a "KillY" attribute: anyone who falls below this height is knocked out
	Want your own map? Put a Model named after the arena Id (see Config.Arenas)
	with a Spawns folder and a KillY attribute into ServerStorage.BattleArenas
	and the builder will leave it alone. To edit a map, drag it into Workspace,
	change it, then drag it back.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Kit = require(script.Parent:WaitForChild("BuildKit"))

local rgb = Color3.fromRGB
local M = Enum.Material

local function makeRandom(seed: number): (number, number) -> number
	local state = seed
	return function(a: number, b: number): number
		state = (state * 1103515245 + 12345) % 2147483648
		return a + (b - a) * (state / 2147483648)
	end
end

local function spawns(map: Model, origin: CFrame, radius: number, y: number, count: number)
	local folder = Kit.folder(map, "Spawns")
	for i = 1, count do
		local a = (i - 1) / count * math.pi * 2
		local pos = origin * Vector3.new(math.cos(a) * radius, y, math.sin(a) * radius)
		local center = origin * Vector3.new(0, y, 0)
		local p = Kit.box(folder, Vector3.new(4, 1, 4), CFrame.lookAt(pos, center), rgb(255, 255, 255), {
			Name = "Spawn",
			Transparency = 1,
			CanCollide = false,
			CanQuery = false,
		})
		p.CanTouch = false
	end
end

local function boundary(map: Model, origin: CFrame, half: number, height: number)
	for _, d in { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
		local size = if d[1] ~= 0 then Vector3.new(2, height, half * 2) else Vector3.new(half * 2, height, 2)
		Kit.box(map, size, origin * CFrame.new(d[1] * half, height / 2 - 10, d[2] * half), rgb(255, 255, 255), {
			Name = "Boundary",
			Transparency = 1,
			CastShadow = false,
		})
	end
end

local function lamp(parent: Instance, cf: CFrame, color: Color3)
	Kit.box(
		parent,
		Vector3.new(0.7, 14, 0.7),
		cf * CFrame.new(0, 7, 0),
		rgb(40, 40, 46),
		{ Name = "LampPost", Material = M.Metal }
	)
	Kit.box(
		parent,
		Vector3.new(0.5, 0.5, 4),
		cf * CFrame.new(0, 13.8, -1.8),
		rgb(40, 40, 46),
		{ Name = "LampArm", Material = M.Metal }
	)
	local head = Kit.neon(parent, Vector3.new(1.4, 0.5, 2), cf * CFrame.new(0, 13.4, -3.4), color, "LampHead")
	Kit.pointLight(head, color, 1.6, 30)
end

----------------------------------------------------------------------------------

local function buildRuinedCity(map: Model, o: CFrame)
	local rand = makeRandom(101)
	Kit.box(
		map,
		Vector3.new(240, 6, 240),
		o * CFrame.new(0, -3, 0),
		rgb(58, 60, 66),
		{ Name = "Ground", Material = M.Asphalt }
	)
	-- Roads with lane markings.
	Kit.box(
		map,
		Vector3.new(240, 0.1, 30),
		o * CFrame.new(0, 0.05, 0),
		rgb(44, 46, 52),
		{ Name = "Road", Material = M.Asphalt }
	)
	Kit.box(
		map,
		Vector3.new(30, 0.1, 240),
		o * CFrame.new(0, 0.06, 0),
		rgb(44, 46, 52),
		{ Name = "Road", Material = M.Asphalt }
	)
	for i = -9, 9 do
		if math.abs(i) > 1 then
			Kit.box(
				map,
				Vector3.new(6, 0.12, 0.6),
				o * CFrame.new(i * 12, 0.08, 0),
				rgb(240, 200, 40),
				{ Name = "LaneLine", CanCollide = false }
			)
			Kit.box(
				map,
				Vector3.new(0.6, 0.12, 6),
				o * CFrame.new(0, 0.08, i * 12),
				rgb(240, 200, 40),
				{ Name = "LaneLine", CanCollide = false }
			)
		end
	end
	-- City blocks with broken buildings.
	local buildingColors = { rgb(120, 110, 105), rgb(150, 80, 60), rgb(95, 100, 110), rgb(130, 120, 100) }
	for qx = -1, 1, 2 do
		for qz = -1, 1, 2 do
			local block = o * CFrame.new(qx * 67.5, 0, qz * 67.5)
			Kit.box(
				map,
				Vector3.new(105, 0.8, 105),
				block * CFrame.new(0, 0.4, 0),
				rgb(140, 138, 134),
				{ Name = "Sidewalk", Material = M.Concrete }
			)
			local height = rand(34, 62)
			local bcf = block * CFrame.new(qx * 22, 0, qz * 22)
			local color = buildingColors[(qx + 1) + (qz + 1) // 2 + 1]
			Kit.box(map, Vector3.new(38, height, 34), bcf * CFrame.new(0, height / 2 + 0.8, 0), color, {
				Name = "Building",
				Material = M.Brick,
			})
			-- window rows facing the middle of the map
			for row = 1, math.floor(height / 9) do
				local y = 0.8 + row * 8
				Kit.box(
					map,
					Vector3.new(30, 3, 0.4),
					bcf * CFrame.new(0, y, -qz * 17.1),
					rgb(30, 40, 60),
					{ Name = "Windows", Material = M.Glass, Reflectance = 0.2 }
				)
				Kit.box(
					map,
					Vector3.new(0.4, 3, 26),
					bcf * CFrame.new(-qx * 19.1, y, 0),
					rgb(30, 40, 60),
					{ Name = "Windows", Material = M.Glass, Reflectance = 0.2 }
				)
			end
			-- jagged broken roof
			for _ = 1, 4 do
				local s = rand(4, 10)
				Kit.wedge(
					map,
					Vector3.new(rand(6, 14), s, rand(6, 12)),
					bcf
						* CFrame.new(rand(-12, 12), height + 0.8 + s / 2, rand(-10, 10))
						* CFrame.Angles(0, math.floor(rand(0, 4)) * math.pi / 2, 0),
					color,
					{
						Name = "Broken",
						Material = M.Brick,
					}
				)
			end
			-- small cover walls
			Kit.box(
				map,
				Vector3.new(12, 4, 2),
				block * CFrame.new(-qx * 20, 2.8, -qz * 30) * CFrame.Angles(0, rand(-0.4, 0.4), 0),
				rgb(150, 150, 150),
				{
					Name = "CoverWall",
					Material = M.Concrete,
				}
			)
		end
	end
	-- Craters.
	for _, c in { { 0, 0 }, { -40, 12 }, { 36, -30 } } do
		local ccf = o * CFrame.new(c[1], 0, c[2])
		Kit.disc(
			map,
			16,
			0.3,
			ccf * CFrame.new(0, 0.15, 0),
			rgb(28, 26, 28),
			{ Name = "Crater", Material = M.Slate, CanCollide = false }
		)
		for i = 1, 10 do
			local a = i / 10 * math.pi * 2
			local s = rand(1.4, 3)
			Kit.box(
				map,
				Vector3.new(s, s * 0.7, s),
				ccf
					* CFrame.new(math.cos(a) * 8.5, s * 0.3, math.sin(a) * 8.5)
					* CFrame.Angles(rand(0, 1), rand(0, 3), rand(0, 1)),
				rgb(90, 88, 86),
				{
					Name = "Rubble",
					Material = M.Concrete,
				}
			)
		end
	end
	-- Scattered rubble.
	for _ = 1, 36 do
		local s = rand(1, 3.5)
		Kit.box(
			map,
			Vector3.new(s, s * rand(0.4, 1), s * rand(0.6, 1.4)),
			o
				* CFrame.new(rand(-110, 110), s * 0.35, rand(-110, 110))
				* CFrame.Angles(rand(0, 0.6), rand(0, 3), rand(0, 0.6)),
			rgb(105, 102, 98),
			{
				Name = "Rubble",
				Material = M.Concrete,
			}
		)
	end
	-- Wrecked cars.
	local carColors = { rgb(150, 30, 30), rgb(40, 70, 130), rgb(200, 160, 40) }
	for i, pos in { { 24, 9 }, { -8, -46 }, { -60, 4 } } do
		local ccf = o * CFrame.new(pos[1], 0, pos[2]) * CFrame.Angles(0, rand(0, math.pi * 2), rand(-0.08, 0.08))
		Kit.box(
			map,
			Vector3.new(11, 3, 5.4),
			ccf * CFrame.new(0, 2.1, 0),
			carColors[i],
			{ Name = "Car", Material = M.Metal }
		)
		Kit.box(
			map,
			Vector3.new(6, 2.4, 5),
			ccf * CFrame.new(-0.8, 4.8, 0),
			carColors[i],
			{ Name = "Car", Material = M.Metal }
		)
		Kit.box(
			map,
			Vector3.new(6.1, 1.6, 5.1),
			ccf * CFrame.new(-0.8, 4.9, 0),
			rgb(40, 50, 60),
			{ Name = "CarGlass", Material = M.Glass, Transparency = 0.3 }
		)
		for _, w in { { 3.4, 2.7 }, { -3.4, 2.7 }, { 3.4, -2.7 }, { -3.4, -2.7 } } do
			Kit.cyl(
				map,
				1,
				2.6,
				ccf * CFrame.new(w[1], 1.3, w[2]) * CFrame.Angles(0, math.rad(90), 0),
				rgb(20, 20, 20),
				{ Name = "Wheel", Material = M.Rubber }
			)
		end
	end
	-- Street lamps.
	for i = -1, 1, 2 do
		for j = -1, 1, 2 do
			lamp(
				map,
				o * CFrame.new(i * 18, 0.8, j * 40) * CFrame.Angles(0, if i > 0 then math.pi / 2 else -math.pi / 2, 0),
				rgb(255, 180, 90)
			)
			lamp(
				map,
				o * CFrame.new(j * 40, 0.8, i * 18) * CFrame.Angles(0, if i > 0 then 0 else math.pi, 0),
				rgb(255, 180, 90)
			)
		end
	end
	boundary(map, o, 120, 140)
	spawns(map, o, 52, 3, 8)
	map:SetAttribute("KillY", o.Position.Y - 30)
end

local function buildVolcano(map: Model, o: CFrame)
	local rand = makeRandom(202)
	local lava = Kit.box(
		map,
		Vector3.new(460, 2, 460),
		o * CFrame.new(0, -9, 0),
		rgb(255, 110, 40),
		{ Name = "Lava", Material = M.CrackedLava }
	)
	local embers = Instance.new("ParticleEmitter")
	embers.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	embers.Color = ColorSequence.new(rgb(255, 200, 80), rgb(255, 60, 20))
	embers.Size = NumberSequence.new(0.6, 0)
	embers.Lifetime = NumberRange.new(2, 4)
	embers.Rate = 120
	embers.Speed = NumberRange.new(2, 6)
	embers.LightEmission = 1
	embers.Parent = lava
	-- Main island.
	Kit.cyl(
		map,
		12,
		190,
		o * CFrame.new(0, -6, 0) * CFrame.Angles(0, 0, math.rad(90)),
		rgb(52, 46, 46),
		{ Name = "Island", Material = M.Basalt }
	)
	-- Glowing cracks.
	for i = 1, 14 do
		local a = i / 14 * math.pi * 2 + rand(-0.2, 0.2)
		local r0 = rand(28, 40)
		local len = rand(20, 45)
		local mid = r0 + len / 2
		Kit.neon(
			map,
			Vector3.new(rand(0.5, 1.2), 0.1, len),
			o * CFrame.new(math.cos(a) * mid, 0.05, math.sin(a) * mid) * CFrame.Angles(0, -a + math.pi / 2, 0),
			rgb(255, 90, 20),
			"LavaCrack"
		)
	end
	-- Rocks around the rim.
	for i = 1, 16 do
		local a = i / 16 * math.pi * 2
		local r = rand(80, 90)
		local hgt = rand(6, 20)
		Kit.wedge(
			map,
			Vector3.new(rand(8, 14), hgt, rand(8, 14)),
			o * CFrame.new(math.cos(a) * r, hgt / 2, math.sin(a) * r) * CFrame.Angles(0, -a + math.pi / 2, 0),
			rgb(40, 36, 38),
			{
				Name = "Rock",
				Material = M.Rock,
			}
		)
	end
	-- Central cone with a lava pool on top.
	for i, d in { 52, 38, 24 } do
		Kit.cyl(
			map,
			4,
			d,
			o * CFrame.new(0, (i - 1) * 4 + 2, 0) * CFrame.Angles(0, 0, math.rad(90)),
			rgb(60, 50, 48),
			{ Name = "Cone", Material = M.Basalt }
		)
	end
	local pool = Kit.cyl(
		map,
		0.4,
		14,
		o * CFrame.new(0, 12.1, 0) * CFrame.Angles(0, 0, math.rad(90)),
		rgb(255, 100, 20),
		{ Name = "LavaPool", Material = M.Neon }
	)
	Kit.pointLight(pool, rgb(255, 120, 40), 3, 40)
	local smoke = Instance.new("Smoke")
	smoke.Color = rgb(80, 60, 60)
	smoke.Opacity = 0.15
	smoke.RiseVelocity = 8
	smoke.Size = 6
	smoke.Parent = pool
	-- Stepping-stone islands over the lava.
	for i = 1, 5 do
		local a = i / 5 * math.pi * 2 + 0.3
		Kit.cyl(
			map,
			4,
			16,
			o * CFrame.new(math.cos(a) * 112, -2, math.sin(a) * 112) * CFrame.Angles(0, 0, math.rad(90)),
			rgb(48, 42, 42),
			{
				Name = "Islet",
				Material = M.Basalt,
			}
		)
	end
	boundary(map, o, 150, 140)
	spawns(map, o, 45, 3, 8)
	map:SetAttribute("KillY", o.Position.Y - 4)
end

local function buildSkyDojo(map: Model, o: CFrame)
	local rand = makeRandom(303)
	local red = rgb(200, 35, 35)
	Kit.box(
		map,
		Vector3.new(150, 4, 150),
		o * CFrame.new(0, -2, 0),
		rgb(176, 124, 82),
		{ Name = "Deck", Material = M.WoodPlanks }
	)
	for i, s in { 140, 104, 64 } do
		Kit.box(
			map,
			Vector3.new(s, 10, s),
			o * CFrame.new(0, -4 - i * 10 + 5, 0) * CFrame.Angles(0, i * 0.3, 0),
			rgb(90, 88, 96),
			{
				Name = "Rock",
				Material = M.Slate,
			}
		)
	end
	Kit.box(
		map,
		Vector3.new(80, 0.2, 80),
		o * CFrame.new(0, 0.1, 0),
		rgb(205, 190, 130),
		{ Name = "Tatami", Material = M.Fabric }
	)
	for _, d in { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
		local size = if d[1] ~= 0 then Vector3.new(1, 0.3, 80) else Vector3.new(80, 0.3, 1)
		Kit.box(
			map,
			size,
			o * CFrame.new(d[1] * 40, 0.15, d[2] * 40),
			rgb(40, 28, 20),
			{ Name = "MatEdge", Material = M.Wood }
		)
	end
	-- Torii gate.
	for _, x in { -14, 14 } do
		Kit.cyl(
			map,
			24,
			3,
			o * CFrame.new(x, 12, -62) * CFrame.Angles(0, 0, math.rad(90)),
			red,
			{ Name = "Torii", Material = M.Wood }
		)
	end
	Kit.box(
		map,
		Vector3.new(40, 2.6, 3.4),
		o * CFrame.new(0, 24.4, -62),
		rgb(25, 20, 20),
		{ Name = "Torii", Material = M.Wood }
	)
	Kit.box(map, Vector3.new(34, 1.6, 2.4), o * CFrame.new(0, 19.5, -62), red, { Name = "Torii", Material = M.Wood })
	-- Corner posts with lanterns.
	for _, x in { -40, 40 } do
		for _, z in { -40, 40 } do
			Kit.cyl(
				map,
				14,
				2,
				o * CFrame.new(x, 7, z) * CFrame.Angles(0, 0, math.rad(90)),
				red,
				{ Name = "Post", Material = M.Wood }
			)
			local lantern =
				Kit.neon(map, Vector3.new(2.4, 3, 2.4), o * CFrame.new(x, 15.5, z), rgb(255, 190, 110), "Lantern")
			Kit.pointLight(lantern, rgb(255, 170, 90), 1.5, 24)
		end
	end
	-- Cherry trees.
	for _, t in { { -58, -58 }, { 58, -58 }, { -58, 58 }, { 58, 58 } } do
		local base = o * CFrame.new(t[1], 0, t[2])
		Kit.cyl(
			map,
			14,
			2.6,
			base * CFrame.new(0, 7, 0) * CFrame.Angles(0, 0, math.rad(90)),
			rgb(90, 55, 40),
			{ Name = "Trunk", Material = M.Wood }
		)
		local crown: Part? = nil
		for i = 1, 3 do
			crown = Kit.ball(
				map,
				rand(10, 13),
				base * CFrame.new(rand(-4, 4), 14 + i * 2, rand(-4, 4)),
				rgb(255, 170, 205),
				{
					Name = "Blossom",
					Material = M.LeafyGrass,
				}
			)
		end
		local petals = Instance.new("ParticleEmitter")
		petals.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		petals.Color = ColorSequence.new(rgb(255, 200, 220))
		petals.Size = NumberSequence.new(0.5, 0.3)
		petals.Lifetime = NumberRange.new(3, 5)
		petals.Rate = 6
		petals.Speed = NumberRange.new(1, 3)
		petals.Acceleration = Vector3.new(2, -3, 0)
		petals.Parent = crown
	end
	-- Low fences along two sides.
	for _, z in { -73, 73 } do
		for i = -3, 3 do
			if i ~= 0 then
				Kit.box(
					map,
					Vector3.new(16, 2.5, 0.8),
					o * CFrame.new(i * 20, 1.25, z),
					rgb(120, 80, 50),
					{ Name = "Fence", Material = M.Wood }
				)
			end
		end
	end
	-- Floating stepping stones.
	for i = 1, 6 do
		local a = i / 6 * math.pi * 2
		Kit.box(
			map,
			Vector3.new(9, 2, 9),
			o * CFrame.new(math.cos(a) * 92, rand(-3, 5), math.sin(a) * 92) * CFrame.Angles(0, a, 0),
			rgb(110, 108, 116),
			{
				Name = "Stone",
				Material = M.Slate,
			}
		)
	end
	boundary(map, o, 150, 160)
	spawns(map, o, 45, 3, 8)
	map:SetAttribute("KillY", o.Position.Y - 60)
end

----------------------------------------------------------------------------------

local function dummy(parent: Instance, cf: CFrame): Model
	local model, torso = Kit.figure(parent, cf, {
		Skin = rgb(205, 170, 120),
		Shirt = rgb(200, 160, 110),
		Pants = rgb(170, 130, 90),
		Belt = rgb(160, 30, 30),
	}, "Guard", "Training Dummy")
	local root = Kit.box(model, Vector3.new(2, 2, 1), torso.CFrame, rgb(255, 255, 255), {
		Name = "HumanoidRootPart",
		Transparency = 1,
		CanCollide = false,
	})
	model.PrimaryPart = root
	local humanoid = Instance.new("Humanoid")
	humanoid.RigType = Enum.HumanoidRigType.R6
	humanoid.MaxHealth = 1000
	humanoid.Health = 1000
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.Viewer
	humanoid.HealthDisplayDistance = 60
	humanoid.NameDisplayDistance = 60
	humanoid.Parent = model
	model:SetAttribute("TrainingDummy", true)
	return model
end

local function buildTraining(parent: Instance, o: CFrame): Model
	local map = Kit.model(parent, "TrainingGrounds")
	Kit.box(
		map,
		Vector3.new(120, 4, 120),
		o * CFrame.new(0, -2, 0),
		rgb(116, 118, 124),
		{ Name = "Ground", Material = M.Concrete }
	)
	Kit.ring(
		map,
		o * CFrame.new(0, 0.05, 0),
		50,
		0.6,
		0.1,
		4,
		rgb(255, 130, 30),
		{ Name = "Line", Material = M.Neon, CanCollide = false }
	)
	for _, d in { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
		local size = if d[1] ~= 0 then Vector3.new(2, 4, 120) else Vector3.new(120, 4, 2)
		Kit.box(
			map,
			size,
			o * CFrame.new(d[1] * 59, 2, d[2] * 59),
			rgb(60, 60, 66),
			{ Name = "Barrier", Material = M.Concrete }
		)
	end
	local dummies = Kit.folder(map, "Dummies")
	for i = 1, 6 do
		dummy(dummies, o * CFrame.new(-30 + (i - 1) * 12, 0, -24))
	end
	local spawnPart =
		Kit.box(map, Vector3.new(4, 1, 4), o * CFrame.new(0, 3, 30) * CFrame.Angles(0, 0, 0), rgb(255, 255, 255), {
			Name = "Spawn",
			Transparency = 1,
			CanCollide = false,
			CanQuery = false,
		})
	spawnPart.CanTouch = false
	-- Portal back to the lobby.
	local gate = o * CFrame.new(0, 0, 48)
	for _, x in { -7, 7 } do
		Kit.box(
			map,
			Vector3.new(2, 16, 2),
			gate * CFrame.new(x, 8, 0),
			rgb(70, 72, 80),
			{ Name = "GatePost", Material = M.Metal }
		)
	end
	Kit.box(
		map,
		Vector3.new(16, 2, 2),
		gate * CFrame.new(0, 17, 0),
		rgb(70, 72, 80),
		{ Name = "GateTop", Material = M.Metal }
	)
	local portal = Kit.box(map, Vector3.new(12, 15, 0.4), gate * CFrame.new(0, 8.5, 0), rgb(80, 180, 255), {
		Name = "LobbyPortal",
		Material = M.Neon,
		Transparency = 0.5,
		CanCollide = false,
	})
	Kit.prompt(portal, "Lobby", "Go", "Back to Lobby", 14)
	Kit.sign(map, o * CFrame.new(0, 12, -44), 34, 7, "TRAINING GROUNDS", {
		Name = "Sign",
		TextColor = rgb(255, 150, 40),
		Gradient = { rgb(255, 210, 120), rgb(255, 110, 20) },
		Glow = rgb(255, 130, 30),
		Subtitle = "PRACTICE YOUR COMBOS",
	})
	map:SetAttribute("KillY", o.Position.Y - 40)
	return map
end

local ArenaBuilder = {}

ArenaBuilder.Builders = {
	RuinedCity = buildRuinedCity,
	VolcanoCrater = buildVolcano,
	SkyDojo = buildSkyDojo,
} :: { [string]: (Model, CFrame) -> () }

-- Builds any arena missing from `storage` (normally ServerStorage) and the
-- training grounds in `world` (normally Workspace) if they aren't there yet.
function ArenaBuilder.build(storage: Instance, world: Instance): Folder
	local folder = storage:FindFirstChild("BattleArenas") :: Folder?
	if not folder then
		local f = Instance.new("Folder")
		f.Name = "BattleArenas"
		f.Parent = storage
		folder = f
	end
	assert(folder)
	local origin = CFrame.new(Config.ArenaOrigin)
	for _, arena in Config.Arenas do
		if not folder:FindFirstChild(arena.Id) then
			local builder = ArenaBuilder.Builders[arena.Id]
			if builder then
				builder(Kit.model(folder, arena.Id), origin)
			else
				warn(
					`[BattleHub] No map for arena "{arena.Id}". Add a Model with that name to ServerStorage.BattleArenas.`
				)
			end
		end
	end
	if not world:FindFirstChild("TrainingGrounds") then
		buildTraining(world, CFrame.new(Config.TrainingOrigin))
	end
	return folder
end

return ArenaBuilder
