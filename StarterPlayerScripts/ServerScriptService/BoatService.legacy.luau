-- BoatService
-- Buying, launching and cleaning up boats. Ownership and coins work the same
-- way rods do (FishingService's wallet). A launched boat is built from its
-- template in ServerStorage, welded to its hull, given a driver's VehicleSeat
-- and the two constraints BoatPhysics steers. Whoever sits in the driver's
-- seat owns the physics, so driving is responsive; empty boats are floated
-- here and tidied away after a while.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")
local ServerStorage = game:GetService("ServerStorage")

local system = game.ReplicatedStorage:WaitForChild("FishingSystem")
local G = require(system.GameplayConfig)
local BoatPhysics = require(system.BoatPhysics)
local ShopLocator = require(system.ShopLocator)
local remote = system:WaitForChild("BoatEvent")
local wallet = ServerStorage:WaitForChild("FishingWallet")

-- the pier can be moved or regrouped in Studio; find its berths when needed
local function berthFolder()
	local dock = ShopLocator.Dock()
	return dock and dock:FindFirstChild("Berths", true)
end

local boatsFolder = Instance.new("Folder")
boatsFolder.Name = "Boats"
boatsFolder.Parent = workspace

local owned = {}      -- player -> {id=true}
local active = {}     -- player -> boat model
local lastSpawn = {}
local floatState = setmetatable({}, { __mode = "k" })
local emptySince = setmetatable({}, { __mode = "k" })

local function near(player)
	local c = player.Character
	local r = c and c:FindFirstChild("HumanoidRootPart")
	if not r then return false end
	for _, m in ipairs(CollectionService:GetTagged("BoatMerchant")) do
		if m:IsA("BasePart") and m:IsDescendantOf(workspace) and (r.Position - m.Position).Magnitude <= 26 then return true end
	end
	return false
end

local function stock(player, message)
	local boat = active[player]
	remote:FireClient(player, "Stock", { owned = owned[player] or {}, active = boat and boat:GetAttribute("BoatId") or false, message = message or "" })
end

local function freeBerth()
	local berths = berthFolder()
	if not berths then return nil end
	local list = berths:GetChildren()
	table.sort(list, function(a, b) return a.Name < b.Name end)
	for _, b in ipairs(list) do
		local taken = false
		for _, boat in ipairs(boatsFolder:GetChildren()) do
			if boat.PrimaryPart and (boat.PrimaryPart.Position - b.Position).Magnitude < 8 then taken = true break end
		end
		if not taken then return b.CFrame end
	end
	local last = list[#list]
	return last.CFrame * CFrame.new(10, 0, 0)
end

local function despawn(player)
	local boat = active[player]
	if boat then boat:Destroy() end
	active[player] = nil
end

local function build(player, cfg, at)
	local template = ServerStorage:FindFirstChild(cfg.Template)
	if not template then warn("[BoatService] template missing: " .. tostring(cfg.Template)) return end
	local boat = template:Clone()
	boat.Name = "Boat"
	boat:SetAttribute("BoatId", cfg.Id)
	boat:SetAttribute("OwnerUserId", player.UserId)
	boat:SetAttribute("BowSign", template:GetAttribute("BowSign") or 1)
	boat:SetAttribute("Driver", 0)
	local hull = boat.PrimaryPart
	local bowSign = boat:GetAttribute("BowSign")

	-- seats: the middle bench drives, the stern bench rides along
	local benchColor, benchMat
	for _, s in ipairs(boat:GetChildren()) do
		if s.Name == "Seat" and s:IsA("BasePart") then
			local local_ = hull.CFrame:PointToObjectSpace(s.Position)
			benchColor, benchMat = s.Color, s.Material
			if math.abs(local_.Z) < 1 then
				local seat = Instance.new("VehicleSeat")
				seat.Name = "DriverSeat"; seat.Size = s.Size; seat.Color = s.Color; seat.Material = s.Material
				seat.TopSurface = s.TopSurface; seat.BottomSurface = s.BottomSurface
				seat.MaxSpeed = 0; seat.Torque = 0; seat.TurnSpeed = 0; seat.HeadsUpDisplay = false
				seat.CFrame = s.CFrame * CFrame.Angles(0, bowSign < 0 and math.pi or 0, 0)
				seat.Parent = boat
				s:Destroy()
			elseif (local_.Z * bowSign) > 1 and cfg.Seats >= 2 then
				local seat = Instance.new("Seat")
				seat.Name = "PassengerSeat"; seat.Size = s.Size; seat.Color = s.Color; seat.Material = s.Material
				seat.TopSurface = s.TopSurface; seat.BottomSurface = s.BottomSurface
				seat.CFrame = s.CFrame * CFrame.Angles(0, bowSign < 0 and math.pi or 0, 0)
				seat.Parent = boat
				s:Destroy()
			end
		end
	end
	if cfg.Tint then
		for _, d in ipairs(boat:GetDescendants()) do if d:IsA("BasePart") and (d.Name == "Hull" or d.Name == "Trim") then d.Color = cfg.Tint end end
	end
	-- one rigid body: everything welded to the hull
	for _, d in ipairs(boat:GetDescendants()) do
		if d:IsA("BasePart") then
			d.Anchored = false
			if d ~= hull then
				d.Massless = true
				if d.Name == "Oar" or d.Name == "Propeller" then
      local joint = Instance.new("Motor6D")
      joint.Name = d.Name == "Oar" and "RowingJoint" or "PropellerJoint"
      joint.Part0 = hull; joint.Part1 = d
      joint.C0 = hull.CFrame:ToObjectSpace(d.CFrame)
      joint.Parent = d
      d.CanCollide = false
     elseif d.Name == "OarBlade" then
      local nearest, distance
      for _, oar in boat:GetChildren() do
       if oar.Name == "Oar" then
        local delta = (oar.Position - d.Position).Magnitude
        if not distance or delta < distance then nearest = oar; distance = delta end
       end
      end
      local w = Instance.new("WeldConstraint"); w.Part0 = nearest or hull; w.Part1 = d; w.Parent = d
     else
      local w = Instance.new("WeldConstraint"); w.Part0 = hull; w.Part1 = d; w.Parent = d
     end
			end
			if d.Name == "Oar" or d.Name == "OarBlade" then d.CanCollide = false end
		end
	end
	hull.CustomPhysicalProperties = PhysicalProperties.new(0.5, 0.3, 0.2)
	local root = Instance.new("Attachment"); root.Name = "Root"; root.Parent = hull
	local mover = Instance.new("LinearVelocity")
	mover.Name = "Mover"; mover.Attachment0 = root; mover.RelativeTo = Enum.ActuatorRelativeTo.World
	mover.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector; mover.MaxForce = 1e6; mover.VectorVelocity = Vector3.zero
	mover.Parent = hull
	local upright = Instance.new("AlignOrientation")
	upright.Name = "Upright"; upright.Mode = Enum.OrientationAlignmentMode.OneAttachment; upright.Attachment0 = root
	upright.RigidityEnabled = false; upright.MaxTorque = 1e7; upright.Responsiveness = 25
	upright.Parent = hull

	local spawnCF = at * CFrame.Angles(0, bowSign < 0 and math.pi or 0, 0)
	boat:PivotTo(CFrame.new(spawnCF.Position + Vector3.new(0, G.BoatWaterY - G.BoatDraft + hull.Size.Y / 2 + 0.5, 0)) * (spawnCF - spawnCF.Position))
	upright.CFrame = hull.CFrame - hull.CFrame.Position
	boat.Parent = boatsFolder
	CollectionService:AddTag(boat, "Boat")

	-- physics goes to whoever drives
	local seat = boat:FindFirstChild("DriverSeat")
	if seat then
		seat:GetPropertyChangedSignal("Occupant"):Connect(function()
			local occ = seat.Occupant
			local driver = occ and Players:GetPlayerFromCharacter(occ.Parent)
			if driver then
				boat:SetAttribute("Driver", driver.UserId)
				pcall(function() hull:SetNetworkOwner(driver) end)
				emptySince[boat] = nil
			else
				boat:SetAttribute("Driver", 0)
				pcall(function() hull:SetNetworkOwner(nil) end)
				floatState[boat] = nil
				emptySince[boat] = os.clock()
			end
		end)
	end
	pcall(function() hull:SetNetworkOwner(nil) end)
	emptySince[boat] = os.clock()
	return boat
end

remote.OnServerEvent:Connect(function(player, action, id)
	if not owned[player] then return end
	if action == "Open" then
		if near(player) then stock(player) end
		return
	end
	if action == "Recall" then
		despawn(player)
		stock(player, "Your boat has been brought in.")
		return
	end
	if not near(player) then return end
	local cfg = typeof(id) == "string" and G.GetBoat(id)
	if not cfg then return end
	local isOwned = cfg.Price == 0 or owned[player][id]
	if action == "Buy" then
		if isOwned then stock(player, "You already own the " .. cfg.Name .. ".") return end
		if not wallet:Invoke(player, "Debit", cfg.Price) then
			stock(player, "You need $" .. cfg.Price .. " for the " .. cfg.Name .. ".") return
		end
		owned[player][id] = true
		stock(player, cfg.Name .. " is yours! Launch it whenever you like.")
	elseif action == "Spawn" then
		if not isOwned then stock(player, "Buy the " .. cfg.Name .. " first.") return end
		local t = os.clock()
		if t - (lastSpawn[player] or -10) < G.BoatSpawnCooldown then return end
		lastSpawn[player] = t
		despawn(player)
		local berth = freeBerth()
		if not berth then stock(player, "The berths are missing from the dock.") return end
		local boat = build(player, cfg, berth)
		if boat then
			active[player] = boat
			stock(player, cfg.Name .. " is waiting at the berth. Hop in!")
		else
			stock(player, "That boat could not be launched.")
		end
	end
end)

-- empty boats float in place and are tidied away after a while
local elapsed = 0
RunService.Heartbeat:Connect(function(dt)
	for _, boat in ipairs(boatsFolder:GetChildren()) do
		if boat.PrimaryPart and boat:GetAttribute("Driver") == 0 then
			local st = floatState[boat]
			if not st then st = {}; floatState[boat] = st end
			BoatPhysics.step(boat, st, 0, 0, dt)
		end
	end
	elapsed += dt
	if elapsed < 2 then return end
	elapsed = 0
	for player, boat in pairs(active) do
		local since = emptySince[boat]
		if boat.Parent == nil then active[player] = nil
		elseif since and os.clock() - since > G.BoatDespawnAfterEmpty then
			despawn(player)
			remote:FireClient(player, "Message", "Your boat drifted back to the boat shed.")
		end
	end
end)

local function setup(player)
	owned[player] = {}
end
Players.PlayerAdded:Connect(setup)
for _, p in ipairs(Players:GetPlayers()) do setup(p) end
Players.PlayerRemoving:Connect(function(player)
	despawn(player)
	owned[player] = nil; lastSpawn[player] = nil
end)
