-- AdminHatService
-- The horned helmet on the mannequin beside the rod stall is the admins' hat. It is
-- also an accessory in the backpack's Accessories tab: everyone sees it there, but
-- only admins and developers (ServerScriptService.AdminPermissions, the game's one
-- list of who is who) can wear it. They wear it automatically every time they spawn,
-- and can take it off or put it back on from the Accessories tab or with /hat.
-- Everyone else never gets it: the server alone decides, and nothing a client sends
-- can put it on anyone.
--
-- The hat is copied from the display itself (tagged AdminHatDisplay), so if the
-- display hat is changed in Studio the worn one changes with it. It sits on the
-- head exactly as it sits on the mannequin's head. Nothing else on the avatar is
-- touched: it is one more accessory.
--
-- For the backpack:
--   * FishingSystem.AccessoryPreviews.AdminHat - a look-only copy (a plain model,
--     not an accessory) for the picture in the Accessories tab
--   * the player attribute CanWearAdminHat - whether the tab offers EQUIP or shows
--     ADMIN ONLY (for show only: every request is checked again here)
--   * FishingSystem.AccessoryAction (RemoteEvent) - ("Wear" | "Remove", "AdminHat")
--     from the tab; for an admin it sets the same AdminHatOff attribute /hat sets

local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")

local Perm = require(script.Parent:WaitForChild("AdminPermissions"))
local function allowed(player) return Perm.isAdmin(player) end

local system = ReplicatedStorage:WaitForChild("FishingSystem")

local HAT_NAME = "AdminHat"
local DISPLAY_TAG = "AdminHatDisplay"
local CAN_WEAR = "CanWearAdminHat"

-- anything on a display part that must not come along onto a player's head
local STRIP = { "JointInstance", "WeldConstraint", "Constraint", "BaseScript", "ModuleScript", "ProximityPrompt", "ClickDetector", "Sound", "BillboardGui", "SurfaceGui", "ParticleEmitter", "TouchTransmitter" }
-- all the backpack's picture keeps of each part
local VISUAL = { "DataModelMesh", "Decal", "Texture", "SurfaceAppearance" }

local template = nil

local function findDisplay()
	for _, m in ipairs(CollectionService:GetTagged(DISPLAY_TAG)) do
		if m:IsA("Model") and m:IsDescendantOf(workspace) then
			return m
		end
	end
	return nil
end

-- the mannequin head the display hat sits on: the nearest head with a HatAttachment
local function displayHead(display)
	local centre = display:GetBoundingBox().Position
	local best, bestD = nil, 12
	for _, d in ipairs((display.Parent or workspace):GetDescendants()) do
		if d.Name == "Head" and d:IsA("BasePart") and d:FindFirstChild("HatAttachment") then
			local dist = (d.Position - centre).Magnitude
			if dist < bestD then best, bestD = d, dist end
		end
	end
	return best
end

-- the look-only copy for the backpack, turned so its front faces the picture's camera
local function publishPreview(acc, anchorCF)
	local folder = system:FindFirstChild("AccessoryPreviews")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "AccessoryPreviews"
		folder.Parent = system
	end
	local model = Instance.new("Model")
	model.Name = HAT_NAME
	for _, p in ipairs(acc:GetChildren()) do
		if p:IsA("BasePart") and not p:GetAttribute("HatHandle") then
			local copy = p:Clone()
			for _, d in ipairs(copy:GetDescendants()) do
				local keep = false
				for _, class in ipairs(VISUAL) do
					if d:IsA(class) then keep = true break end
				end
				if not keep then d:Destroy() end
			end
			copy.Anchored = true
			copy.Parent = model
		end
	end
	if not model:FindFirstChildWhichIsA("BasePart") then model:Destroy() return end
	-- the pivot is the head's own frame turned half round: the pictures look along -Z,
	-- so the face of the hat (the head's front) ends up towards the camera
	local centre = model:GetBoundingBox().Position
	model.WorldPivot = CFrame.new(centre) * anchorCF.Rotation * CFrame.Angles(0, math.pi, 0)
	local old = folder:FindFirstChild(HAT_NAME)
	if old then old:Destroy() end
	model.Parent = folder
end

local function buildTemplate(display)
	local head = displayHead(display)
	local wasArchivable = display.Archivable
	display.Archivable = true
	local copy = display:Clone()
	display.Archivable = wasArchivable
	local parts = {}
	for _, d in ipairs(copy:GetDescendants()) do
		if d:IsA("BasePart") then table.insert(parts, d) end
	end
	if #parts == 0 then copy:Destroy() return nil end
	-- where the hat meets the head: the mannequin's HatAttachment, or else the
	-- middle of the hat's underside
	local anchorCF
	if head then
		anchorCF = head.HatAttachment.WorldCFrame
	else
		local cf, size = copy:GetBoundingBox()
		anchorCF = cf * CFrame.new(0, -size.Y / 2 + 0.25, 0)
	end
	local acc = Instance.new("Accessory")
	acc.Name = HAT_NAME
	acc.AccessoryType = Enum.AccessoryType.Hat
	acc:SetAttribute("AdminHat", true)
	acc:SetAttribute("IntroStrip", true) -- the castaway in the intro does not wear it
	-- the handle: an invisible part right where the hat meets the head, its attachment at
	-- its centre. On R15 avatars Roblox rescales an accessory's Handle and moves the
	-- Handle's attachment; with this handle that changes nothing anyone can see, so the
	-- worn hat is the display hat exactly (same size, same place) on every avatar.
	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.4, 0.4, 0.4)
	handle.Transparency = 1
	handle.CanCollide = false
	handle.CanTouch = false
	handle.CanQuery = false
	handle.CastShadow = false
	handle.Massless = true
	handle.CFrame = anchorCF
	handle:SetAttribute("HatHandle", true)
	handle.Parent = acc
	for _, p in ipairs(parts) do
		for _, d in ipairs(p:GetDescendants()) do
			for _, class in ipairs(STRIP) do
				if d:IsA(class) then d:Destroy() break end
			end
		end
		for _, t in ipairs(p:GetTags()) do p:RemoveTag(t) end
		p.Anchored = false
		p.CanCollide = false
		p.CanTouch = false
		p.CanQuery = false
		p.Massless = true
		if p.Name == "Handle" then p.Name = "HatPart" end
		-- A Ball or Cylinder with uneven sides: on the mannequin (anchored) Roblox draws a
		-- Ball as a round ball as wide as its smallest side and a Cylinder as round as its
		-- thinner side, but worn (welded to a player) the same part is drawn stretched to its
		-- full size - the red ball became a huge red disc and the horns flat blades. So the
		-- worn copy gets the sizes the mannequin shows.
		if p:IsA("Part") then
			local s = p.Size
			if p.Shape == Enum.PartType.Ball then
				local d = math.min(s.X, s.Y, s.Z)
				p.Size = Vector3.new(d, d, d)
			elseif p.Shape == Enum.PartType.Cylinder then
				local d = math.min(s.Y, s.Z)
				p.Size = Vector3.new(s.X, d, d)
			end
		end
		p.Parent = acc
	end
	for _, p in ipairs(parts) do
		local w = Instance.new("Weld")
		w.Name = "AdminHatWeld"
		w.Part0 = handle
		w.Part1 = p
		w.C0 = handle.CFrame:ToObjectSpace(p.CFrame)
		w.Parent = handle
	end
	local attach = Instance.new("Attachment")
	attach.Name = "HatAttachment"
	attach.CFrame = CFrame.new()
	attach.Parent = handle
	copy:Destroy()
	-- (the picture is only a nicety: a problem with it must never cost admins the hat)
	local ok, err = pcall(publishPreview, acc, anchorCF)
	if not ok then warn("[AdminHat] The backpack picture could not be made: " .. tostring(err)) end
	acc.Parent = ServerStorage -- never Workspace: a loose accessory there is picked up by whoever touches it
	return acc
end

local function wear(player, character)
	if not template or not allowed(player) or player:GetAttribute("AdminHatOff") == true then return end
	if not player:HasAppearanceLoaded() then
		-- loading the avatar can swap the head, which would drop a hat added before it
		local done = false
		local conn = player.CharacterAppearanceLoaded:Connect(function() done = true end)
		local t0 = os.clock()
		while not done and os.clock() - t0 < 10 and player.Parent do task.wait(0.1) end
		conn:Disconnect()
	end
	if player.Character ~= character or not character.Parent then return end
	if player:GetAttribute("AdminHatOff") == true or not allowed(player) then return end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local head = character:FindFirstChild("Head")
	if not humanoid or not head or not head:FindFirstChild("HatAttachment") then return end
	if character:FindFirstChild(HAT_NAME) then return end
	humanoid:AddAccessory(template:Clone())
end

local function takeOff(player)
	local character = player.Character
	local hat = character and character:FindFirstChild(HAT_NAME)
	if hat and hat:GetAttribute("AdminHat") then hat:Destroy() end
end

-- what the backpack shows this player (and, if they stopped being an admin, the hat comes off)
local function syncCanWear(player)
	local can = allowed(player)
	player:SetAttribute(CAN_WEAR, can)
	if not can then takeOff(player) end
	return can
end

local wired = {}
local function onPlayer(player)
	if wired[player] then return end
	wired[player] = true
	syncCanWear(player)
	player.CharacterAdded:Connect(function(character) task.spawn(wear, player, character) end)
	if player.Character then task.spawn(wear, player, player.Character) end
	-- /hat and the Accessories tab both set this (each after checking the player is an admin)
	player:GetAttributeChangedSignal("AdminHatOff"):Connect(function()
		local character = player.Character
		if not character then return end
		if player:GetAttribute("AdminHatOff") == true then
			takeOff(player)
		else
			task.spawn(wear, player, character)
		end
	end)
	-- (Studio tests can switch a player's level with AdminTestLevel)
	if RunService:IsStudio() then
		player:GetAttributeChangedSignal("AdminTestLevel"):Connect(function()
			if syncCanWear(player) and player.Character then task.spawn(wear, player, player.Character) end
		end)
	end
end
Players.PlayerAdded:Connect(onPlayer)
for _, p in ipairs(Players:GetPlayers()) do onPlayer(p) end

-- EQUIP / UNEQUIP in the Accessories tab
local action = system:FindFirstChild("AccessoryAction")
if not (action and action:IsA("RemoteEvent")) then
	action = Instance.new("RemoteEvent")
	action.Name = "AccessoryAction"
	action.Parent = system
end
local lastAction = {}
action.OnServerEvent:Connect(function(player, verb, id)
	if id ~= HAT_NAME or (verb ~= "Wear" and verb ~= "Remove") then return end
	local now = os.clock()
	if now - (lastAction[player] or 0) < 0.4 then return end
	lastAction[player] = now
	-- the check that counts: whatever the client shows, only an admin gets past here
	if not syncCanWear(player) then return end
	if verb == "Wear" then
		player:SetAttribute("AdminHatOff", false)
		if player.Character then task.spawn(wear, player, player.Character) end
	else
		player:SetAttribute("AdminHatOff", true)
		takeOff(player)
	end
end)

Players.PlayerRemoving:Connect(function(p)
	wired[p] = nil
	lastAction[p] = nil
end)

-- the display can stream in or be moved; look for it for a minute
task.spawn(function()
	local t0 = os.clock()
	while not template and os.clock() - t0 < 60 do
		local display = findDisplay()
		if display then template = buildTemplate(display) end
		if not template then task.wait(1) end
	end
	if not template then warn("[AdminHat] No hat display tagged " .. DISPLAY_TAG .. " was found.") return end
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Character then task.spawn(wear, p, p.Character) end
	end
end)
