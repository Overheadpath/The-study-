-- WindSystem
-- One wind, fixed in direction, driving three things that have to agree with
-- each other: thin streaks of air crossing the map, the trees leaning and
-- rustling under it, and the rush you hear. Client-side only, so the server
-- does no work and none of it replicates.

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")

local TAG = "WindTree"
local ISLAND = Vector3.new(55, 5.3, -178) -- the middle of Nature's Island (moved when the island was enlarged)
local VIEW_DISTANCE = 300

---------------------------------------------------------------- the wind
-- ONE heading, held for good. Only the strength breathes, and it breathes on
-- slow incommensurate sines so the gusting never repeats and never snaps.
local HEADING = math.rad(24)
local DIR = Vector3.new(math.cos(HEADING), 0, math.sin(HEADING)).Unit
local SIDE = Vector3.new(-DIR.Z, 0, DIR.X)
local LEAN_AXIS = Vector3.new(DIR.Z, 0, -DIR.X)

local BASE_SPEED = 18
local GUST = 5.5

local function gustAt(t)
	-- 0..1, centred near 0.5, smooth. The three rates are halved from the first
	-- version: the gusting now breathes over ~30s rather than ~15s, which is what
	-- makes the whole map read as a light breeze instead of weather.
	local g = 0.5
		+ 0.28 * math.sin(t * 0.115)
		+ 0.14 * math.sin(t * 0.285 + 1.3)
		+ 0.08 * math.sin(t * 0.485 + 2.9)
	return math.clamp(g, 0, 1)
end

---------------------------------------------------------------- the field
-- The village sits behind a fence in a ring of trees, so it is sheltered; the
-- open grass and the shore are not. Streak opacity, tree movement and the
-- audio all read from this one function, which is why they agree.
local SHELTER_R, OPEN_R = 34, 88
local SHELTERED = 0.30

local function exposure(pos)
	local r = (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(ISLAND.X, 0, ISLAND.Z)).Magnitude
	local f = math.clamp((r - SHELTER_R) / (OPEN_R - SHELTER_R), 0, 1)
	f = f * f * (3 - 2 * f)                                     -- smoothstep
	local high = math.clamp((pos.Y - ISLAND.Y - 18) / 40, 0, 1) -- higher up is windier
	return math.clamp(SHELTERED + (1 - SHELTERED) * f + 0.22 * high, 0, 1.15)
end

---------------------------------------------------------------- streaks of air
-- Beams, not particles: a beam is a camera-facing ribbon, so a thin one reads
-- as a drawn line from every angle and never shows a box edge. No Neon, no
-- sprite texture, nothing round and nothing that glows.
local STREAKS = 34            -- fewer than before: present, never a curtain
local RUN = 340                 -- studs travelled before a streak is recycled
local SPREAD = 100              -- half-width of the band they cross in. The island
                                -- is about 166 studs across, so keeping the band
                                -- close to that is what puts streaks near the
                                -- player instead of out over empty ocean.
local STREAK_FLOOR = 0.42       -- the village is the most sheltered spot on the map
                                -- and also where players stand, so streaks there
                                -- still read -- just less than out on the shore

local folder = Instance.new("Folder")
folder.Name = "WindStreaks"
folder.Parent = workspace

local anchor = Instance.new("Part")
anchor.Name = "StreakAnchor"
anchor.Anchored = true
anchor.CanCollide = false
anchor.CanQuery = false
anchor.CanTouch = false
anchor.CastShadow = false
anchor.Transparency = 1
anchor.Size = Vector3.one
anchor.CFrame = CFrame.new()    -- unrotated at the origin, so attachment
anchor.Parent = folder          -- positions are world positions

-- soft at both ends, solid through the middle: that is what makes it a streak
-- of air rather than a stick.
local function shape(alpha)
	return NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(0.22, alpha),
		NumberSequenceKeypoint.new(0.78, alpha),
		NumberSequenceKeypoint.new(1, 1),
	})
end

local STEPS = 7                 -- quantised alpha, so we allocate almost never
local SHAPES = {}
for i = 0, STEPS do
	SHAPES[i] = shape(1 - (i / STEPS) * 0.42)   -- never more opaque than 0.58
end

local rng = Random.new(20260920)
local streaks = {}

local function respawn(s, first)
	s.travel = first and rng:NextNumber(0, RUN) or 0
	s.speed = rng:NextNumber(58, 96)                 -- fast: a gust, not a drift
	s.len = rng:NextNumber(22, 58)
	s.width = rng:NextNumber(0.11, 0.24)             -- thin
	s.bob = rng:NextNumber(0.25, 0.7)                -- a very slight vertical drift
	s.bobPhase = rng:NextNumber(0, math.pi * 2)
	s.origin = ISLAND
		- DIR * (RUN * 0.5)
		+ SIDE * rng:NextNumber(-SPREAD, SPREAD)
		-- mostly above head height, a few low enough to pass through the trees
		+ Vector3.new(0, rng:NextNumber(7, 56), 0)
	s.bucket = -1
end

for i = 1, STREAKS do
	local a0 = Instance.new("Attachment"); a0.Parent = anchor
	local a1 = Instance.new("Attachment"); a1.Parent = anchor
	local b = Instance.new("Beam")
	b.Name = "WindStreak"
	b.Attachment0 = a0
	b.Attachment1 = a1
	b.FaceCamera = true
	b.Segments = 1
	b.LightInfluence = 0
	b.LightEmission = 0
	b.Color = ColorSequence.new(Color3.fromRGB(242, 249, 255))
	b.Transparency = SHAPES[0]
	b.Parent = anchor
	local s = { a0 = a0, a1 = a1, beam = b }
	streaks[i] = s
	respawn(s, true)
end

---------------------------------------------------------------- trees
-- The bend is zero at the ground and grows with height, so the trunk stays
-- planted and the canopy is what actually travels. Hard ceilings on all three
-- so a strong gust makes a tree sway, never topple.
-- Everything here is deliberately slow. A tree should look majestic: the canopy
-- travels a long way but takes its time getting there, and the leaves shiver
-- rather than rattle. Every rate below is about half of the first version's and
-- the amplitudes are smaller with it, because fast AND wide reads as a storm.
local BOW_PER_STUD = 0.42       -- degrees of bend per stud above the base
local MAX_LEAN = math.rad(5.2)  -- furthest a canopy ever leans downwind
local MAX_ROLL = math.rad(2.0)  -- and across the wind, which is the side-to-side
local MAX_SHAKE = math.rad(4.5) -- furthest a single leaf ever twists
local WAVE_K = 0.05             -- how fast a gust rolls across a canopy

local trees = {}

-- every tree and leaf moves at 1.5x the pace of the first version. Colin asked
-- for "two times faster" (2026-09-23), then for it to be eased back a touch
-- (2026-09-24), so this is the 2x pace slowed by a quarter. Each tree still runs
-- on its own randomised rates and phases, so no two sway together. The wind's
-- gusting keeps its own pace.
local TREE_SPEED = 1.5

-- tree models by name: the village's Tree/CornerTree and Nature's Island's Canopy
local TREE_NAMES = { Tree = true, CornerTree = true, Canopy = true }

local function register(model, keep)
	if trees[model] then return end
	if not model:IsDescendantOf(workspace) then return end
	-- a tree inside a tree (Nature's Island nests Canopy models) moves with its outer tree
	local outer = model.Parent
	while outer and outer ~= workspace do
		if trees[outer] or (outer:IsA("Model") and TREE_NAMES[outer.Name]) then return end
		outer = outer.Parent
	end

	local parts, lowest = {}, math.huge
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and d.Name ~= "LeafSource" then
			parts[#parts + 1] = d
			lowest = math.min(lowest, d.Position.Y - d.Size.Y * 0.5)
		end
	end
	if #parts == 0 then return end

	local centre = model:GetPivot().Position
	local pivot = CFrame.new(centre.X, lowest, centre.Z)   -- the trunk stays planted

	local entry = {
		origin = pivot.Position,
		pivot = pivot,
		inverse = pivot:Inverse(),
		-- every tree on its own clock, so no two move together. The spread is
		-- wide on purpose: neighbouring trees should visibly disagree about
		-- where they are in their sway.
		-- (a tree rebuilt after streaming keeps its clock, so it does not jump)
		rate = keep and keep.rate or rng:NextNumber(0.17, 0.38),
		rate2 = keep and keep.rate2 or rng:NextNumber(0.11, 0.27),
		phase = keep and keep.phase or rng:NextNumber(0, math.pi * 2),
		phase2 = keep and keep.phase2 or rng:NextNumber(0, math.pi * 2),
		vigour = keep and keep.vigour or rng:NextNumber(0.80, 1.12),
		-- sheltered trees move less than exposed ones, but every tree moves:
		-- the floor here is higher than the one the audio and the streaks use
		field = math.max(exposure(pivot.Position), 0.62),
		items = table.create(#parts),
	}
	for _, part in ipairs(parts) do
		local height = math.max(0, part.Position.Y - lowest)
		local isLeaf = (part.Name == "Leaf")
		entry.items[#entry.items + 1] = {
			part = part,
			base = part.CFrame,
			pos = part.Position,
			leaf = isLeaf,
			bow = math.rad(height * BOW_PER_STUD),
			-- each leaf shivers on its own three frequencies and its own phase,
			-- which is what stops the canopy reading as one rigid object
			shake = isLeaf and math.rad(rng:NextNumber(3.2, 6.0)) or 0,
			fA = rng:NextNumber(2.85, 4.35),
			fB = rng:NextNumber(2.25, 3.6),
			fC = rng:NextNumber(3.45, 5.4),
			ph = rng:NextNumber(0, math.pi * 2),
		}
	end
	trees[model] = entry
end

local function unregister(model)
	local entry = trees[model]
	if not entry then return end
	for _, item in ipairs(entry.items) do
		if item.part.Parent then item.part.CFrame = item.base end
	end
	trees[model] = nil
end

-- Two ways in, because one is not reliable on the client: the tag registry can
-- still be empty when StarterPlayerScripts run, and a tree added by hand later
-- may never get tagged at all. Scanning by name as well means every tree on the
-- map sways, tagged or not.
local function collect()
	for _, m in ipairs(CollectionService:GetTagged(TAG)) do register(m) end
	for _, d in ipairs(workspace:GetDescendants()) do
		if d:IsA("Model") and TREE_NAMES[d.Name] then register(d) end
	end
end

collect()
CollectionService:GetInstanceAddedSignal(TAG):Connect(register)
CollectionService:GetInstanceRemovedSignal(TAG):Connect(unregister)

-- and keep sweeping for a few seconds, to catch whatever had not replicated yet
task.spawn(function()
	for _ = 1, 20 do
		task.wait(0.25)
		collect()
	end
end)

-- The place streams, so trees and their parts keep arriving (and leaving) as
-- the player moves. Any part that lands inside a tree queues that tree to be
-- rebuilt from what is there now; a tree that loses parts is rebuilt too.
local pendingTrees = {}
local function outerTree(inst)
	local found, a = nil, inst
	while a and a ~= workspace do
		if a:IsA("Model") and (TREE_NAMES[a.Name] or CollectionService:HasTag(a, TAG)) then found = a end
		a = a.Parent
	end
	return found
end
workspace.DescendantAdded:Connect(function(d)
	if d:IsA("BasePart") or d:IsA("Model") then
		local tree = outerTree(d)
		if tree then pendingTrees[tree] = true end
	end
end)
local function rebuildPending()
	local done = 0
	for model in pairs(pendingTrees) do
		pendingTrees[model] = nil
		local old = trees[model]
		unregister(model) -- puts the parts it moved back first
		if model:IsDescendantOf(workspace) then register(model, old) end
		done += 1
		if done >= 6 then break end -- spread big streaming bursts over a few frames
	end
end

---------------------------------------------------------------- the rush
-- Two quiet layers. The bed is always there; the rush comes up as the player
-- walks out of the sheltered village into the open, and drops away again.
-- Both are eased towards their target, never switched.
local bed = SoundService:FindFirstChild("WindAmbience")
local rush = SoundService:FindFirstChild("WindGust")
for _, s in ipairs({ bed, rush }) do
	if s then
		s.Volume = 0
		pcall(function() s:Play() end)
	end
end

-- quiet enough to sit under everything else, loud enough to actually hear.
-- these four numbers are the whole mix: raise RUSH_* for a windier map.
local BED_MIN, BED_RANGE = 0.030, 0.050
local RUSH_MIN, RUSH_RANGE = 0.060, 0.130
local bedVol, rushVol, rushRate = 0, 0, 0.72
local bedRate = 0.34

---------------------------------------------------------------- drive it
RunService.RenderStepped:Connect(function(dt)
	local now = os.clock()
	local gust = gustAt(now)
	local speed = BASE_SPEED + GUST * (gust * 2 - 1)
	workspace.GlobalWind = DIR * speed

	-- read the camera fresh: the one that exists when this script loads is not
	-- necessarily the one the player ends up looking through
	local camera = workspace.CurrentCamera
	local eye = camera and camera.CFrame.Position or Vector3.zero

	------------------------------------------------ streaks
	for _, s in ipairs(streaks) do
		-- constant velocity along one axis: the movement is smooth by
		-- construction, and every streak agrees on the direction
		s.travel = s.travel + s.speed * (0.72 + 0.5 * gust) * dt
		if s.travel > RUN then respawn(s, false) end

		local tail = s.origin + DIR * s.travel
			+ Vector3.new(0, math.sin(now * s.bob + s.bobPhase) * 1.4, 0)
		local head = tail + DIR * s.len

		s.a0.Position = tail
		s.a1.Position = head

		-- ease in and out of the run so nothing pops
		local f = s.travel / RUN
		local fade = math.max(math.min(f / 0.16, (1 - f) / 0.24, 1), 0)
		local vis = fade * math.max(math.min(exposure(tail), 1), STREAK_FLOOR) * (0.55 + 0.45 * gust)

		s.beam.Width0 = s.width * (0.45 + 0.55 * fade)
		s.beam.Width1 = s.beam.Width0
		local bucket = math.floor(vis * STEPS + 0.5)
		if bucket ~= s.bucket then
			s.bucket = bucket
			s.beam.Transparency = SHAPES[math.clamp(bucket, 0, STEPS)]
		end
	end

	------------------------------------------------ the rush
	local field = exposure(eye)
	local ease = 1 - math.exp(-dt * 1.6)        -- ~0.6s to settle: no steps, no clicks
	-- out on the desert island its own wind (DesertAtmosphere) takes over from this sea breeze
	local duck = 1 - (SoundService:GetAttribute("DesertBlend") or 0)
	if bed then
		bedVol = bedVol + ((BED_MIN + BED_RANGE * gust) * duck - bedVol) * ease
		bed.Volume = bedVol
		-- both layers are the same 10s sample. Drift the bed's pitch on a slow
		-- cycle that does not divide into the rush's, so the two never settle
		-- into a loop you can hear repeating.
		bedRate = 0.34 + 0.035 * math.sin(now * 0.041)
		bed.PlaybackSpeed = bedRate
	end
	if rush then
		local target = (RUSH_MIN + RUSH_RANGE * gust) * field * duck
		rushVol = rushVol + (target - rushVol) * ease
		rush.Volume = rushVol
		rushRate = rushRate + ((0.62 + 0.22 * gust) - rushRate) * ease
		rush.PlaybackSpeed = rushRate
	end

	------------------------------------------------ trees
	if next(pendingTrees) then rebuildPending() end
	local tnow = now * TREE_SPEED
	for model, entry in pairs(trees) do
		local first = entry.items[1]
		if not first or not first.part.Parent then
			-- streamed out (all or part of it): rebuild from what is left next frame
			pendingTrees[model] = true
		elseif (entry.origin - eye).Magnitude <= VIEW_DISTANCE then
			local drive = entry.field * entry.vigour * (0.55 + 0.50 * gust)
			-- leaning into the wind, magnitude breathing...
			local lean = drive * (0.72 + 0.42 * math.sin(tnow * entry.rate + entry.phase))
			-- ...and a smaller roll across it, which is what makes it read as
			-- swaying side to side rather than nodding
			local roll = drive * 0.38 * math.sin(tnow * entry.rate2 + entry.phase2)

			for _, item in ipairs(entry.items) do
				local cf = item.base

				if item.leaf then
					-- the gust hits the upwind side of the canopy first and rolls
					-- across it, so the rustle travels instead of pulsing as one
					local wave = (item.pos.X * DIR.X + item.pos.Z * DIR.Z) * WAVE_K
					local burst = 0.5 + 0.5 * math.sin(tnow * 0.75 - wave)
					local amp = math.min(item.shake * drive * (0.5 + 0.7 * burst), MAX_SHAKE)
					cf = item.base * CFrame.Angles(
						math.sin(tnow * item.fA + item.ph) * amp,
						math.sin(tnow * item.fB + item.ph * 1.7) * amp * 0.75,
						math.sin(tnow * item.fC + item.ph * 2.3) * amp)
				end

				item.part.CFrame = entry.pivot
					* CFrame.fromAxisAngle(LEAN_AXIS, math.clamp(item.bow * lean, -MAX_LEAN, MAX_LEAN))
					* CFrame.fromAxisAngle(DIR, math.clamp(item.bow * roll, -MAX_ROLL, MAX_ROLL))
					* entry.inverse
					* cf
			end
		end
	end
end)
