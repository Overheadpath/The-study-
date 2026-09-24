-- IntroService
-- Decides who sees the first-time intro, remembers who has seen it, and
-- looks after each player's real character while their client plays it.
--
--   joins -> read HasSeenIntro from the game's existing save record
--     missing/false -> IntroState "Waiting" (IntroController plays it after Play)
--     true          -> IntroState "Done" (nothing happens)
--   intro starts -> the real character is parked, anchored and hidden above
--                   the wash-up spot (on land, so OceanSafety never fires)
--   intro ends or is skipped -> the character stands on the shore, unhidden,
--                   and HasSeenIntro = true is saved
--
-- Saving uses the same DataStore and key as the Atlantic unlock
-- (FishingIslandUnlocks_v1 / Player_<UserId>): one extra field, every other
-- field kept exactly as it was. If the save cannot be read the intro is
-- skipped for that visit; if it cannot be written the game carries on and the
-- intro simply shows again next time.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local DataStoreService = game:GetService("DataStoreService")
local CollectionService = game:GetService("CollectionService")
local ServerStorage = game:GetService("ServerStorage")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")

local system = ReplicatedStorage:WaitForChild("FishingSystem")
local Config = require(system:WaitForChild("IntroConfig"))
local devAllowed = require(ServerStorage:WaitForChild("FishingDevAccess"))

local remote = system:FindFirstChild("IntroEvent")
if not remote then
	remote = Instance.new("RemoteEvent")
	remote.Name = "IntroEvent"
	remote.Parent = system
end

local store = DataStoreService:GetDataStore(Config.Save.DataStore)
local isStudio = RunService:IsStudio()
local testing = isStudio and Config.Testing.AlwaysPlayInStudio == true
local V = Vector3.new

---------------------------------------------------------------- saving

local warnedApi = false
local function explain(err)
	local text = tostring(err)
	if isStudio and not warnedApi and (text:find("StudioAccessToApisNotAllowed") or text:find("API Services")) then
		warnedApi = true
		warn("[Intro] Saving is off in Studio. Turn on Game Settings > Security > Enable Studio Access to API Services, or set IntroConfig.Testing.AlwaysPlayInStudio = true while testing.")
	end
	return text
end

local function saveKey(userId) return Config.Save.KeyPrefix .. userId end

-- returns ok, seen
local function readSeen(userId)
	for attempt = 1, math.max(1, Config.Save.LoadAttempts) do
		local ok, record = pcall(function() return store:GetAsync(saveKey(userId)) end)
		if ok then
			return true, type(record) == "table" and record[Config.Save.Field] == true
		end
		warn("[Intro] could not read the save (attempt " .. attempt .. "): " .. explain(record))
		if attempt < Config.Save.LoadAttempts then task.wait(attempt) end
	end
	return false, false
end

local pendingSaves = 0
local function writeSeen(userId, value)
	pendingSaves += 1
	local saved = false
	for attempt = 1, math.max(1, Config.Save.SaveAttempts) do
		local ok, err = pcall(function()
			store:UpdateAsync(saveKey(userId), function(old)
				-- keep everything else in the record (the Atlantic unlock lives here too)
				local record = type(old) == "table" and old or {}
				record[Config.Save.Field] = value == true
				record.IntroSeenAt = value and os.time() or nil
				return record
			end)
		end)
		if ok then
			saved = true
			break
		end
		warn("[Intro] could not save " .. Config.Save.Field .. " (attempt " .. attempt .. "): " .. explain(err))
		if attempt < Config.Save.SaveAttempts then task.wait(2 * attempt) end
	end
	pendingSaves -= 1
	return saved
end

game:BindToClose(function()
	local started = os.clock()
	while pendingSaves > 0 and os.clock() - started < 20 do task.wait(0.25) end
end)

---------------------------------------------------------------- places and props

local function flat(v)
	local f = V(v.X, 0, v.Z)
	if f.Magnitude < 1e-4 then return V(0, 0, -1) end
	return f.Unit
end

local function marker(name)
	local m = type(name) == "string" and workspace:FindFirstChild(name, true)
	if m and m:IsA("BasePart") then return m end
	return nil
end

local function spawnPoint()
	for _, d in workspace:GetDescendants() do
		if d:IsA("SpawnLocation") and d.Enabled then return d end
	end
	return nil
end

local function rayParams()
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local ignore = {}
	for _, p in Players:GetPlayers() do
		if p.Character then table.insert(ignore, p.Character) end
	end
	for _, name in { "Boats", "FishingEffects", "IntroScene" } do
		local f = workspace:FindFirstChild(name)
		if f then table.insert(ignore, f) end
	end
	for _, name in { Config.Places.WashUpMarker, Config.Places.BoatMarker, Config.Places.FocusMarker } do
		local m = type(name) == "string" and workspace:FindFirstChild(name, true)
		if m then table.insert(ignore, m) end
	end
	params.FilterDescendantsInstances = ignore
	params.IgnoreWater = false
	pcall(function() params.RespectCanCollide = true end)
	return params
end

local WATER = Config.Places.WaterLevel
local function groundAt(pos, params)
	local hit = workspace:Raycast(V(pos.X, 400, pos.Z), V(0, -520, 0), params)
	if hit and hit.Material ~= Enum.Material.Water and hit.Position.Y > WATER + 0.35 then return hit end
	return nil
end

-- Walk out from the spawn island until there is open water: the last solid
-- stretch before it is the shoreline (thin posts and pilings are skipped).
-- The first direction with clear sea for the boat wins.
local function findShore(params)
	local spawn = spawnPoint()
	local centre = spawn and spawn.Position or V(0, 5, 0)
	local base = flat(Config.Places.ApproachDirection)
	for i = 0, 7 do
		local dir = flat(CFrame.Angles(0, math.rad(45 * i), 0) * base)
		local shore, runStart, runEnd, lastD = nil, nil, nil, nil
		for d = 2, 900, 1 do
			local hit = groundAt(centre + dir * d, params)
			if hit then
				if not runStart or d - lastD > 1.5 then runStart = d end
				runEnd, lastD = hit, d
			else
				if runStart and lastD and lastD - runStart >= 3 then shore = runEnd end
				runStart = runStart and (d - (lastD or d) <= 1.5) and runStart or nil
				if shore and d - (shore.Position - centre):Dot(dir) > 14 then break end
			end
		end
		if shore then
			local shorePos = V(shore.Position.X, 0, shore.Position.Z)
			local boatPos = shorePos + dir * Config.Places.BoatDistance
			local clear = true
			for k = 12, Config.Places.BoatDistance + 20, 8 do
				if groundAt(shorePos + dir * k, params) then clear = false break end
			end
			if clear then return shore, dir, boatPos end
		end
	end
	return nil
end

local places
local function computePlaces()
	if places then return places end
	local params = rayParams()
	local washMarker, boatMarker, focusMarker = marker(Config.Places.WashUpMarker), marker(Config.Places.BoatMarker), marker(Config.Places.FocusMarker)
	local washUp, inland
	if washMarker then
		inland = flat(washMarker.CFrame.LookVector)
		local g = groundAt(washMarker.Position, params)
		local pos = g and g.Position or washMarker.Position
		washUp = CFrame.lookAt(pos, pos + inland)
	end
	local boatStart
	if not washUp or not boatMarker then
		local shore, dir, boatPos = findShore(params)
		if shore and not washUp then
			inland = -dir
			local bodyAt = shore.Position + inland * Config.Places.BodyInland
			local g = groundAt(bodyAt, params)
			local pos = g and g.Position or V(bodyAt.X, shore.Position.Y, bodyAt.Z)
			washUp = CFrame.lookAt(pos, pos + inland)
		end
		if boatPos and not boatMarker then
			boatStart = CFrame.lookAt(V(boatPos.X, WATER, boatPos.Z), V(boatPos.X, WATER, boatPos.Z) - dir)
		end
	end
	if not washUp then
		warn("[Intro] could not find a shoreline; place a Part named " .. Config.Places.WashUpMarker .. " where the player should wash up.")
		return nil
	end
	if boatMarker then
		local look = flat(boatMarker.CFrame.LookVector)
		local p = boatMarker.Position
		boatStart = CFrame.lookAt(V(p.X, WATER, p.Z), V(p.X, WATER, p.Z) + look)
	elseif not boatStart then
		-- straight out to sea from the wash-up spot
		local out = -flat(washUp.LookVector)
		local p = washUp.Position + out * Config.Places.BoatDistance
		boatStart = CFrame.lookAt(V(p.X, WATER, p.Z), V(p.X, WATER, p.Z) - out)
	end
	local focus = focusMarker and focusMarker.Position
	if not focus then
		local spawn = spawnPoint()
		focus = spawn and spawn.Position + V(0, 4, 0) or washUp.Position + flat(washUp.LookVector) * 40
	end
	places = { washUp = washUp, boatStart = boatStart, focus = focus }
	return places
end

-- the baseplate boat: tagged or named IntroBoat, else a loose part its size
local function findBoat()
	for _, tagged in CollectionService:GetTagged(Config.Places.BoatTag) do
		if tagged:IsA("BasePart") or tagged:IsA("Model") then return tagged end
	end
	for _, root in { workspace, ServerStorage, ReplicatedStorage } do
		local named = root:FindFirstChild(Config.Places.BoatTag, true)
		if named and named ~= system and (named:IsA("BasePart") or named:IsA("Model")) and not named:IsDescendantOf(system) then return named end
	end
	local want = Config.Places.BoatSize
	local boats = workspace:FindFirstChild("Boats")
	for _, d in workspace:GetDescendants() do
		if d:IsA("BasePart") and not d:IsA("Terrain") and (d.Size - want).Magnitude < 1.2
			and not (boats and d:IsDescendantOf(boats)) and not d:FindFirstAncestorWhichIsA("Tool") then
			return d
		end
	end
	return nil
end

local props = Instance.new("Folder")
props.Name = "IntroProps"
local function buildProps()
	local boat = findBoat()
	local rowboat = ServerStorage:FindFirstChild("RowboatTemplate")
	if not boat then
		warn("[Intro] the baseplate boat was not found; tag it IntroBoat. Using " .. (rowboat and "the rowboat" or "a plain raft") .. " instead.")
		boat = rowboat
	end
	local copy
	if boat then
		local was = boat.Archivable
		boat.Archivable = true
		copy = boat:Clone()
		boat.Archivable = was
	end
	if not copy then
		copy = Instance.new("Part")
		copy.Size = Config.Places.BoatSize
		copy.Color = Color3.fromRGB(163, 162, 165)
	end
	for _, d in copy:GetDescendants() do
		if d:IsA("BaseScript") or d:IsA("ModuleScript") or d:IsA("ProximityPrompt") then d:Destroy() end
	end
	copy.Name = "Boat"
	copy.Parent = props
	-- the paddle is made from the rowboat's own oar
	for _, name in { "Oar", "OarBlade" } do
		local part = rowboat and rowboat:FindFirstChild(name, true)
		if part and part:IsA("BasePart") then
			local c = part:Clone()
			for _, x in c:GetChildren() do x:Destroy() end
			c.Name = name
			c.Parent = props
		end
	end
	local p = computePlaces()
	if p then
		props:SetAttribute("WashUp", p.washUp)
		props:SetAttribute("BoatStart", p.boatStart)
		props:SetAttribute("Focus", p.focus)
	end
	props.Parent = system
	return p ~= nil
end

local ready = false
task.spawn(function()
	local ok, result = pcall(buildProps)
	ready = ok and result == true
	if not ok then warn("[Intro] setting up failed: " .. tostring(result)) end
end)

---------------------------------------------------------------- the real character

local sessions = {} -- player -> { since = clock, character = model }

local function setState(p, state, result)
	p:SetAttribute("IntroState", state)
	if result then p:SetAttribute("IntroResult", result) end
end

local function standHeight(character)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart")
	local half = root and root.Size.Y / 2 or 1
	if humanoid and humanoid.RigType == Enum.HumanoidRigType.R15 then return humanoid.HipHeight + half end
	local leg = character:FindFirstChild("Right Leg") or character:FindFirstChild("Left Leg")
	return (leg and leg.Size.Y or 2) + half
end

-- the same standing spot the cinematic's copy ends on
local function standCFrame(character)
	local wash = places.washUp
	local F = flat(wash.LookVector)
	local spot = wash.Position - F * Config.Timing.StandBack
	local g = groundAt(spot, rayParams())
	local y = math.max(wash.Position.Y, g and g.Position.Y or wash.Position.Y)
	local pos = V(spot.X, y + standHeight(character) + 0.05, spot.Z)
	return CFrame.lookAt(pos, pos + F)
end

local function still(character)
	for _, d in character:GetDescendants() do
		if d:IsA("BasePart") then
			d.AssemblyLinearVelocity = Vector3.zero
			d.AssemblyAngularVelocity = Vector3.zero
		end
	end
end

local function park(character)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart")
	if humanoid then
		humanoid:UnequipTools()
		humanoid.Sit = false
	end
	character:PivotTo(standCFrame(character) + V(0, Config.Places.ParkHeight, 0))
	still(character)
	if root then root.Anchored = true end
	character:SetAttribute("IntroHidden", true)
end

local function release(character, placeIt)
	if not character or not character.Parent then return end
	local root = character:FindFirstChild("HumanoidRootPart")
	if placeIt and places then character:PivotTo(standCFrame(character)) end
	still(character)
	-- (an admin freeze holds the root too: it stays held until the admin lets go)
	local owner = Players:GetPlayerFromCharacter(character)
	if root and not (owner and owner:GetAttribute("AdminFrozen") == true) then root.Anchored = false end
	character:SetAttribute("IntroHidden", nil)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid and placeIt then humanoid:ChangeState(Enum.HumanoidStateType.GettingUp) end
end

local function shouldSave()
	return not testing and Config.Mode == "FirstTimeOnly"
end

local function finish(p, result)
	local session = sessions[p]
	local state = p:GetAttribute("IntroState")
	if state == "Playing" then
		release(session and session.character, true)
	elseif state == "Waiting" then
		-- a Finish that lands while begin() is still parking: never leave the
		-- real character anchored in the air
		if session and session.character then release(session.character, true) end
	else
		return
	end
	sessions[p] = nil
	p:SetAttribute("IntroParked", false)
	setState(p, "Done", result)
	-- only a watched (or skipped) intro counts as seen; a broken scene must not
	-- burn the player's one chance at it
	local saveOn = Config.Save.SaveOn or { Finished = true, Skipped = true }
	if shouldSave() and saveOn[result] then task.spawn(writeSeen, p.UserId, true) end
end

local function begin(p)
	if p:GetAttribute("IntroState") ~= "Waiting" or sessions[p] then return end
	local session = { since = os.clock() }
	sessions[p] = session
	local waited = os.clock()
	while not ready and os.clock() - waited < 8 do task.wait(0.2) end
	if sessions[p] ~= session or p:GetAttribute("IntroState") ~= "Waiting" then return end
	local character = p.Character
	if not ready or not places or not character or not character:FindFirstChild("HumanoidRootPart") then
		sessions[p] = nil
		warn("[Intro] could not start for " .. p.Name .. (ready and "" or " (intro places not ready)"))
		finish(p, "Error")
		return
	end
	park(character)
	session.character = character
	session.since = os.clock()
	p:SetAttribute("IntroParked", true)
	setState(p, "Playing")
	-- load the open sea and the shore for this player; the client fades in
	-- from black while this happens, so it never holds the intro up
	task.spawn(function()
		pcall(function() p:RequestStreamAroundAsync(places.boatStart.Position, 6) end)
		pcall(function() p:RequestStreamAroundAsync(places.washUp.Position, 4) end)
	end)
end

local function decide(p)
	setState(p, "Loading")
	if Config.Mode == "Off" then setState(p, "Done", "Disabled") return end
	if testing or Config.Mode == "Always" then setState(p, "Waiting") return end
	local ok, seen = readSeen(p.UserId)
	if not p.Parent then return end
	if not ok then
		setState(p, "Done", "LoadFailed")
	elseif seen then
		setState(p, "Done", "Seen")
	else
		setState(p, "Waiting")
	end
end

local lastRequest = {}
remote.OnServerEvent:Connect(function(p, action, arg)
	if type(action) ~= "string" then return end
	local now = os.clock()
	if now - (lastRequest[p] or 0) < 0.3 then return end
	lastRequest[p] = now
	if action == "Begin" then
		begin(p)
	elseif action == "Finish" then
		local result = (arg == "Finished" or arg == "Skipped") and arg or "Error"
		finish(p, result)
	elseif action == "Replay" then
		if Config.AllowReplayFromSettings and p:GetAttribute("IntroState") == "Done" then setState(p, "Waiting") end
	end
end)

Players.PlayerAdded:Connect(function(p)
	-- a new character in the middle of the intro (reset, died) ends it where it is
	p.CharacterAdded:Connect(function(character)
		local session = sessions[p]
		if session and session.character and session.character ~= character then
			sessions[p] = nil
			p:SetAttribute("IntroParked", false)
			setState(p, "Done", "Interrupted")
			local saveOn = Config.Save.SaveOn or { Finished = true, Skipped = true }
			if shouldSave() and saveOn.Interrupted then task.spawn(writeSeen, p.UserId, true) end
		end
	end)
	task.spawn(decide, p)
end)
for _, p in Players:GetPlayers() do task.spawn(decide, p) end

Players.PlayerRemoving:Connect(function(p)
	sessions[p] = nil
	lastRequest[p] = nil
end)

-- if a client goes quiet mid-intro, the server finishes it so nobody is stuck
task.spawn(function()
	while true do
		task.wait(1)
		for p, session in sessions do
			if p.Parent and session.character and os.clock() - session.since > Config.Timing.ServerTimeout then
				warn("[Intro] " .. p.Name .. "'s intro timed out; finishing it on the server")
				finish(p, "Timeout")
			end
		end
	end
end)

---------------------------------------------------------------- developer commands

local lastCommand = {}
local function devCommand(p, text)
	if not Config.Testing.DevCommands or type(text) ~= "string" then return end
	local word = text:lower():match("^%s*/intro%s*(%a*)")
	if word == nil or not devAllowed(p) then return end
	if os.clock() - (lastCommand[p] or 0) < 0.6 then return end
	lastCommand[p] = os.clock()
	local function say(msg) remote:FireClient(p, "DevMessage", msg) end
	if word == "reset" then
		task.spawn(function()
			if writeSeen(p.UserId, false) then
				say("Reset. You will see the intro the next time you join, or type /intro play.")
			else
				say("Could not reach the save." .. (isStudio and " In Studio, turn on Enable Studio Access to API Services." or ""))
			end
		end)
	elseif word == "play" then
		local state = p:GetAttribute("IntroState")
		if state == "Playing" or state == "Waiting" then
			say("The intro is already running.")
		else
			setState(p, "Waiting")
			say("Playing the intro.")
		end
	else
		task.spawn(function()
			local ok, seen = readSeen(p.UserId)
			say(string.format("State %s (%s). Saved %s = %s. Mode %s%s.",
				tostring(p:GetAttribute("IntroState")), tostring(p:GetAttribute("IntroResult")),
				Config.Save.Field, ok and tostring(seen) or "unreadable", Config.Mode,
				testing and ", AlwaysPlayInStudio on" or ""))
		end)
	end
end

-- TextChatService commands run here on the server; legacy chat is covered too
pcall(function()
	local command = Instance.new("TextChatCommand")
	command.Name = "IntroDevCommand"
	command.PrimaryAlias = "/intro"
	command.Parent = TextChatService
	command.Triggered:Connect(function(source, text)
		local p = source and Players:GetPlayerByUserId(source.UserId)
		if p then devCommand(p, text) end
	end)
end)
local function listen(p) p.Chatted:Connect(function(msg) devCommand(p, msg) end) end
Players.PlayerAdded:Connect(listen)
for _, p in Players:GetPlayers() do listen(p) end
Players.PlayerRemoving:Connect(function(p) lastCommand[p] = nil end)
