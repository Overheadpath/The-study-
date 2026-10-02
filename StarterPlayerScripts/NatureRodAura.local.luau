-- NatureRodAura (client)
-- A few tiny leaves drift around anything tagged NatureAura: Nature's Rod in a
-- player's hands and the one on display at the shop. Client-only and small on
-- purpose: four leaves per rod, each on its own slow loop, fading in and out and
-- never further than half a stud from the wood. The motes and the soft light
-- are ordinary emitters on the rod itself; this adds the leaves.

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")

local TAG = "NatureAura"
local LEAVES = 4
local RANGE = 70 -- studs from the camera; further than this nobody can see a leaf this small
local COLORS = { Color3.fromRGB(98, 148, 60), Color3.fromRGB(122, 168, 76), Color3.fromRGB(84, 130, 54) }

local folder = Instance.new("Folder")
folder.Name = "NatureRodAura"
folder.Parent = workspace

local rng = Random.new()
local rods = {}

local function newLeaf()
	local p = Instance.new("Part")
	p.Name = "AuraLeaf"
	p.Size = Vector3.new(0.14, 0.014, 0.075)
	p.Color = COLORS[rng:NextInteger(1, #COLORS)]
	p.Material = Enum.Material.SmoothPlastic
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.CastShadow = false
	p.Transparency = 1
	p.Parent = folder
	return p
end

local function reset(leaf, first)
	leaf.s = rng:NextNumber(0, 1)
	leaf.angle = rng:NextNumber(0, math.pi * 2)
	leaf.radius = rng:NextNumber(0.22, 0.45)
	leaf.spin = rng:NextNumber(0.5, 1.1) * (rng:NextNumber() < 0.5 and -1 or 1)
	leaf.rise = rng:NextNumber(0.12, 0.26)
	leaf.life = rng:NextNumber(3.5, 5.5)
	-- the first set starts part-way through their lives, so they do not all appear at once
	leaf.born = os.clock() - (first and rng:NextNumber(0, leaf.life) or 0)
	leaf.tumble = Vector3.new(rng:NextNumber(-2, 2), rng:NextNumber(-2, 2), rng:NextNumber(-2, 2))
end

local function add(part)
	if rods[part] or not part:IsA("BasePart") then return end
	local entry = { leaves = {} }
	for i = 1, LEAVES do
		local leaf = { part = newLeaf() }
		reset(leaf, true)
		entry.leaves[i] = leaf
	end
	rods[part] = entry
end

local function remove(part)
	local entry = rods[part]
	if not entry then return end
	for _, leaf in ipairs(entry.leaves) do leaf.part:Destroy() end
	rods[part] = nil
end

for _, p in ipairs(CollectionService:GetTagged(TAG)) do add(p) end
CollectionService:GetInstanceAddedSignal(TAG):Connect(add)
CollectionService:GetInstanceRemovedSignal(TAG):Connect(remove)

RunService.RenderStepped:Connect(function()
	local now = os.clock()
	local camera = workspace.CurrentCamera
	local eye = camera and camera.CFrame.Position or Vector3.zero
	for part, entry in pairs(rods) do
		-- the shop preview and a rod left in the backpack are tagged too; only
		-- a rod out in the world gets leaves
		local shown = part.Parent ~= nil and part:IsDescendantOf(workspace) and (part.Position - eye).Magnitude < RANGE
		local from = part:GetAttribute("AuraFrom") or Vector3.new(-0.3, 0, 0)
		local to = part:GetAttribute("AuraTo") or Vector3.new(4.5, 0.8, 0)
		local axis = to - from
		local u = axis.Unit
		local v = u:Cross(Vector3.new(0, 0, 1))
		if v.Magnitude < 0.1 then v = u:Cross(Vector3.new(0, 1, 0)) end
		v = v.Unit
		local w = u:Cross(v)
		for _, leaf in ipairs(entry.leaves) do
			if not shown then
				leaf.part.Transparency = 1
			else
				local age = now - leaf.born
				if age > leaf.life then
					reset(leaf)
					age = 0
				end
				local f = age / leaf.life
				local a = leaf.angle + leaf.spin * age
				local localPos = from + axis * leaf.s + (v * math.cos(a) + w * math.sin(a)) * leaf.radius
				local world = part.CFrame:PointToWorldSpace(localPos) + Vector3.new(0, leaf.rise * age, 0)
				leaf.part.CFrame = CFrame.new(world) * CFrame.Angles(leaf.tumble.X * age, leaf.tumble.Y * age, leaf.tumble.Z * age)
				-- fades in and out and never goes fully solid: an aura, not confetti
				leaf.part.Transparency = 1 - math.sin(f * math.pi) * 0.72
			end
		end
	end
end)
