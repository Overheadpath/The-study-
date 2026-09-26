-- ComputerTransition
-- Getting from the 3D room into the 2D games. On USE the player walks over to the
-- computer chair, turns and sits down; once they are settled the camera glides from
-- behind them into the monitor, and the existing 2D game screen takes over from the
-- monitor's screen. leave() plays the same thing backwards.
--
-- Where the USE prompt used to open the 2D game straight away:
--
--	local ComputerTransition = require(game.ReplicatedStorage:WaitForChild("ComputerTransition"))
--
--	ComputerTransition.enter(computer, function()
--		-- the existing code that shows the 2D game
--	end)
--
-- and where the player quits the 2D game:
--
--	ComputerTransition.leave(function()
--		-- the existing code that hides the 2D game
--	end)
--
-- `computer` is the computer's model. Its screen is the part named "Screen" (or
-- "Display" / "Monitor"), and its chair is the Seat nearest to that screen. If
-- either is missing, or someone else is already in the chair, enter() shows the
-- game straight away like before.
--
-- The chair itself is taken on the server (ComputerSeatService), so everyone sees
-- the player sitting in it; everything on the player's own screen is played here.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local PathfindingService = game:GetService("PathfindingService")

assert(RunService:IsClient(), "ComputerTransition runs on the client: require it from a LocalScript")
local player = Players.LocalPlayer

---------------------------------------------------------------- tuning

local WALK_SPEED = 10 -- a calm walk over to the chair (studs/s, only while walking there)
local TURN_TIME = 0.35 -- turning to face the desk
local SIT_TIME = 0.5 -- lowering into the chair (the default sit animation blends in over the same time)
local CAMERA_TIME = 1.5 -- the glide from behind the player into the monitor
local FADE_TIME = 0.35 -- the monitor's screen giving way to the 2D game (0 = a straight cut)
local FRONT_GAP = 0.9 -- the player sits down from this far in front of the seat...
local SIDE_GAP = 2 -- ...or this far beside it, when the desk leaves no room in front
local SEAT_RANGE = 12 -- how far from the screen the chair can be

local ComputerTransition = {}

local session = nil -- the computer the player is at, from enter() until leave() is done
local busy = false -- enter() or leave() is playing

---------------------------------------------------------------- helpers

-- calls step(alpha) every frame for `duration` seconds as alpha eases from 0 to 1;
-- false if the session ended part way (the player died)
local function animate(s, duration, step)
	local start = os.clock()
	while session == s do
		local t = if duration > 0 then math.min((os.clock() - start) / duration, 1) else 1
		step(t * t * (3 - 2 * t))
		if t >= 1 then return true end
		RunService.RenderStepped:Wait()
	end
	return false
end

local controls = nil
local function getControls()
	if controls == nil then
		local ok, result = pcall(function()
			return require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule", 5)):GetControls()
		end)
		controls = ok and result or false
	end
	return controls or nil
end

local remote = nil
local function ask(action, value)
	if remote == nil then
		remote = ReplicatedStorage:WaitForChild("ComputerSeat", 5) or false
		if not remote then
			warn("ComputerTransition: ComputerSeatService isn't running (it goes in ServerScriptService), so the player can't sit down")
		end
	end
	if not remote then return false end
	local ok, result = pcall(remote.InvokeServer, remote, action, value)
	return ok and result == true
end

-- everything back as it was; also what happens if the player dies at the computer
local function finish(s)
	if session ~= s then return end
	session, busy = nil, false
	s.died:Disconnect()
	for _, prompt in s.prompts do prompt.Enabled = true end
	if s.controls then s.controls:Enable() end
	for part, base in s.faded or {} do part.LocalTransparencyModifier = base end
	local camera = workspace.CurrentCamera
	if s.cameraType and camera.CameraType == Enum.CameraType.Scriptable then
		camera.CameraType = s.cameraType
	end
end

---------------------------------------------------------------- the computer

-- the monitor's screen: a part called Screen (or Display / Monitor), else any part
-- showing a SurfaceGui
local SCREEN_NAMES = { screen = 1, display = 2, monitor = 3 }
local function findScreen(computer)
	local best, bestRank = nil, math.huge
	for _, d in computer:GetDescendants() do
		if d:IsA("BasePart") then
			local rank = SCREEN_NAMES[d.Name:lower()] or (d:FindFirstChildOfClass("SurfaceGui") and 4)
			if rank and rank < bestRank then best, bestRank = d, rank end
		end
	end
	return best
end

-- the computer chair: the Seat nearest the screen, wherever it is in the model tree
local function findSeat(screen)
	local best, bestDistance = nil, math.huge
	for _, part in workspace:GetPartBoundsInRadius(screen.Position, SEAT_RANGE) do
		local distance = (part.Position - screen.Position).Magnitude
		if part:IsA("Seat") and distance < bestDistance then best, bestDistance = part, distance end
	end
	return best
end

-- The side of the screen the player looks at: its centre, which way it faces, which
-- way is up on it, and how wide and tall it is. A SurfaceGui on the screen says which
-- face that is; otherwise it's the face turned towards the chair.
local function screenView(screen, seat)
	local cf, size = screen.CFrame, screen.Size
	local surface = screen:FindFirstChildOfClass("SurfaceGui")
	local face = surface and surface.Face
	if not face then
		local toSeat = (seat.Position - cf.Position).Unit
		local best = -math.huge
		for _, id in Enum.NormalId:GetEnumItems() do
			local facing = cf:VectorToWorldSpace(Vector3.FromNormalId(id)):Dot(toSeat)
			if facing > best then face, best = id, facing end
		end
	end
	local normal = Vector3.FromNormalId(face)
	local edges = {}
	for _, axis in { Vector3.xAxis, Vector3.yAxis, Vector3.zAxis } do
		if axis:Dot(normal) == 0 then
			table.insert(edges, { direction = cf:VectorToWorldSpace(axis), length = axis:Dot(size) })
		end
	end
	-- of the face's two edges, the one nearer upright is its height
	local across, up = edges[1], edges[2]
	if math.abs(across.direction.Y) > math.abs(up.direction.Y) then across, up = up, across end
	local upward = if up.direction.Y < 0 then -up.direction else up.direction
	local center = cf.Position + cf:VectorToWorldSpace(normal * size / 2)
	return center, cf:VectorToWorldSpace(normal), upward, across.length, up.length
end

-- how far from the screen the camera has to be for the screen to fill the whole view
local function fillDistance(camera, width, height)
	local viewport = camera.ViewportSize
	local tanY = math.tan(math.rad(camera.FieldOfView) / 2)
	local tanX = tanY * viewport.X / math.max(viewport.Y, 1)
	return math.min(height / 2 / tanY, width / 2 / tanX)
end

---------------------------------------------------------------- getting into the chair

-- The way to the spot the player sits down from: just in front of the seat if the
-- desk leaves them room there, otherwise beside it, their own side of the chair
-- first. The gap between chair and desk is usually too tight to path into, so the
-- front is reached by a step in from beside the chair. The last point is the spot.
local function route(s)
	local cf, size = s.seat.CFrame, s.seat.Size
	local here = cf:PointToObjectSpace(s.root.Position)
	local side = if here.X < 0 then -1 else 1
	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { s.character, s.seat }
	params.RespectCanCollide = true
	local body = Vector3.new(2.5, 3.5, 1.2) -- the room a standing player takes up above seat height
	local function at(x, z) -- a point beside/in front of the seat, and whether a player fits there
		local spot = cf * CFrame.new(x, 0, z)
		local clear = #workspace:GetPartBoundsInBox(spot * CFrame.new(0, size.Y / 2 + 0.2 + body.Y / 2, 0), body, params) == 0
		return Vector3.new(spot.X, s.root.Position.Y, spot.Z), clear
	end
	local frontZ, besideX = -(size.Z / 2 + FRONT_GAP), size.X / 2 + SIDE_GAP
	local front, frontClear = at(0, frontZ)
	if frontClear then
		if here.Z < -size.Z / 2 then return { front } end -- (already on the desk side of the chair)
		for _, x in { side, -side } do
			local beside, clear = at(x * besideX, frontZ)
			if clear then return { beside, front } end
		end
	end
	for _, x in { side, -side } do
		local beside, clear = at(x * besideX, 0)
		if clear then return { beside } end
	end
	return { front } -- (no room anywhere: head for the front and see how close they get)
end

-- walks straight at `point` until the player is within `near` of it, or stops getting anywhere
local function stepTo(s, point, near)
	local humanoid, root = s.humanoid, s.root
	humanoid:MoveTo(point)
	local last, lastMoved = root.Position, os.clock()
	while session == s do
		local position = root.Position
		if Vector2.new(point.X - position.X, point.Z - position.Z).Magnitude < near then return end
		if (position - last).Magnitude > 0.15 then
			last, lastMoved = position, os.clock()
		elseif os.clock() - lastMoved > 0.5 then
			return -- walked into something
		end
		RunService.Heartbeat:Wait()
	end
end

-- walks the player along `points`: pathfinding to the first (around the chair and
-- anything else in the way), then straight on through the rest
local function walkTo(s, points)
	local humanoid, root = s.humanoid, s.root
	local steps = {}
	local path = PathfindingService:CreatePath({ AgentRadius = 1.25, AgentHeight = 5, AgentCanJump = false })
	local ok = pcall(path.ComputeAsync, path, root.Position, points[1])
	if ok and path.Status == Enum.PathStatus.Success then
		for _, waypoint in path:GetWaypoints() do table.insert(steps, { waypoint.Position, 1 }) end
	end
	for i, point in points do table.insert(steps, { point, if i == #points then 0.25 else 0.5 }) end
	local speed = humanoid.WalkSpeed
	humanoid.WalkSpeed = math.min(speed, WALK_SPEED)
	for _, step in steps do
		if session ~= s then break end
		stepTo(s, step[1], step[2])
	end
	humanoid.WalkSpeed = speed
	humanoid:MoveTo(root.Position) -- and stop there
end

-- turns the player on the spot to face `direction`
local function turnTo(s, direction)
	local humanoid, root = s.humanoid, s.root
	local from, to = root.CFrame.Rotation, CFrame.lookAt(Vector3.zero, direction)
	local autoRotate = humanoid.AutoRotate
	humanoid.AutoRotate = false
	animate(s, TURN_TIME, function(a)
		root.CFrame = CFrame.new(root.Position) * from:Lerp(to, a)
	end)
	humanoid.AutoRotate = autoRotate
end

-- where a SeatWeld holds the player, as an offset from the seat, and moving them by
-- changing it (whichever end of the weld the seat is on)
local function heldAt(weld, seat)
	return if weld.Part0 == seat then weld.C0 * weld.C1:Inverse() else weld.C1 * weld.C0:Inverse()
end
local function holdAt(weld, seat, offset)
	if weld.Part0 == seat then weld.C0 = offset * weld.C1 else weld.C1 = offset * weld.C0 end
end

-- The server takes the chair for the player: everyone else sees an ordinary Roblox
-- sit. The SeatWeld it makes would snap the player into the seat, so the moment it
-- arrives here it's pointed back at where they're standing (standCF), and the sit is
-- played from there. Without a standCF it's left as the ordinary sit.
local function sitDown(s)
	local seat, root = s.seat, s.root
	local weld, seated
	local function catch(child)
		if weld or not (child:IsA("Weld") and child.Name == "SeatWeld" and (child.Part0 == root or child.Part1 == root)) then return end
		weld, seated = child, heldAt(child, seat)
		if s.standCF then holdAt(child, seat, seat.CFrame:Inverse() * s.standCF) end
	end
	local added = seat.ChildAdded:Connect(catch)
	local asked = ask("Sit", seat)
	local deadline = os.clock() + 1.5
	while asked and not weld and session == s and os.clock() < deadline do
		for _, child in seat:GetChildren() do catch(child) end
		RunService.Heartbeat:Wait()
	end
	added:Disconnect()
	if not (weld and s.standCF) then return end
	local standing = seat.CFrame:Inverse() * s.standCF
	s.weld, s.seated, s.standing = weld, seated, standing
	animate(s, SIT_TIME, function(a) holdAt(weld, seat, standing:Lerp(seated, a)) end)
end

-- the default Animate script's sit animation, while it's playing
local function sitTrack(s)
	local animateScript = s.character:FindFirstChild("Animate")
	local sit = animateScript and animateScript:FindFirstChild("sit")
	local animator = s.humanoid:FindFirstChildOfClass("Animator")
	if not (sit and animator) then return nil end
	for _, track in animator:GetPlayingAnimationTracks() do
		if track.Animation and track.Animation.Parent == sit then return track end
	end
	return nil
end

-- up out of the chair and back onto the spot they sat down from
local function standUp(s)
	local weld = s.weld
	if weld and weld.Parent then
		local track = sitTrack(s)
		if track then track:AdjustWeight(0.01, SIT_TIME) end -- (the legs straighten as they rise)
		animate(s, SIT_TIME, function(a) holdAt(weld, s.seat, s.seated:Lerp(s.standing, a)) end)
	end
	ask("Stand", s.standCF)
	s.humanoid.Sit = false
end

---------------------------------------------------------------- the camera

-- The camera's way from where it is now (behind the seated player) to square in front
-- of the monitor, close enough that the screen fills the view. It goes up and over
-- the player's head rather than through it and settles in front of the screen,
-- turning from the player to the screen as it goes.
local function cameraPath(s, camera)
	local from = camera.CFrame
	local lookingAt = from.Position + from.LookVector * math.max((camera.Focus.Position - from.Position).Magnitude, 1)
	local center, normal, up, width, height = screenView(s.screen, s.seat)
	local to = center + normal * fillDistance(camera, width, height)
	local lift = Vector3.yAxis * math.clamp((from.Position - s.head).Magnitude * 0.35, 0, 3)
	local over, down = s.head + lift, to + lift * 0.8
	return function(t)
		local u = 1 - t
		local position = from.Position * (u * u * u) + over * (3 * u * u * t) + down * (3 * u * t * t) + to * (t * t * t)
		return CFrame.lookAt(position, lookingAt:Lerp(center, t), Vector3.yAxis:Lerp(up, t))
	end
end

-- puts the camera `t` of the way along the path, fading the player out as it passes
-- over their head (and for good by the time it reaches the screen)
local function placeCamera(s, camera, t)
	local cf = s.path(t)
	camera.CFrame = cf
	local amount = math.max(math.clamp(2 - (cf.Position - s.head).Magnitude, 0, 1), math.clamp((t - 0.75) / 0.2, 0, 1))
	for part, base in s.faded do
		part.LocalTransparencyModifier = math.max(base, amount)
	end
end

local function cameraIn(s)
	local camera = workspace.CurrentCamera
	s.cameraType, s.cameraSubject = camera.CameraType, camera.CameraSubject
	s.head = (s.character:FindFirstChild("Head") or s.root).Position
	s.path = cameraPath(s, camera)
	s.faded = {}
	for _, d in s.character:GetDescendants() do
		if d:IsA("BasePart") or d:IsA("Decal") then s.faded[d] = d.LocalTransparencyModifier end
	end
	camera.CameraType = Enum.CameraType.Scriptable
	animate(s, CAMERA_TIME, function(a) placeCamera(s, camera, a) end)
end

local function cameraOut(s)
	local camera = workspace.CurrentCamera
	camera.CameraType = Enum.CameraType.Scriptable -- (the 2D game may have handed the camera back already)
	animate(s, CAMERA_TIME * 0.8, function(a) placeCamera(s, camera, 1 - a) end)
	camera.CameraSubject = s.cameraSubject
	camera.CameraType = s.cameraType
end

-- A quick dip through the screen's own colour, so the monitor and the 2D game swap
-- without a hard cut. Returns once `swap` has run; the colour fades on its own.
local function throughScreen(s, swap)
	if FADE_TIME <= 0 then
		task.spawn(swap)
		return
	end
	local gui = Instance.new("ScreenGui")
	gui.Name = "ComputerTransition"
	gui.ScreenInsets = Enum.ScreenInsets.None
	gui.ResetOnSpawn = false
	gui.DisplayOrder = 10000
	local cover = Instance.new("Frame")
	cover.Size = UDim2.fromScale(1, 1)
	cover.BorderSizePixel = 0
	cover.BackgroundColor3 = s.screenColor
	cover.BackgroundTransparency = 1
	cover.Parent = gui
	gui.Parent = player:WaitForChild("PlayerGui")
	local fadeIn = TweenService:Create(cover, TweenInfo.new(FADE_TIME * 0.4, Enum.EasingStyle.Sine), { BackgroundTransparency = 0 })
	fadeIn:Play()
	fadeIn.Completed:Wait()
	task.spawn(swap)
	local fadeOut = TweenService:Create(cover, TweenInfo.new(FADE_TIME * 0.6, Enum.EasingStyle.Sine), { BackgroundTransparency = 1 })
	fadeOut.Completed:Connect(function() gui:Destroy() end)
	fadeOut:Play()
end

---------------------------------------------------------------- enter / leave

-- Walks the player to the computer, sits them down and takes the camera into the
-- monitor, then calls showGame. Yields until the game is showing.
function ComputerTransition.enter(computer, showGame)
	if busy or session then return false end
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = humanoid and humanoid.RootPart
	if not root or humanoid.Health <= 0 then return false end

	local model = if computer:IsA("Model") then computer else computer:FindFirstAncestorOfClass("Model") or computer
	local screen = findScreen(model)
	local seat = screen and findSeat(screen)
	if not (screen and seat) then
		warn(`ComputerTransition: {model:GetFullName()} needs a part named "Screen" and a Seat on its chair, so the game opened without sitting down`)
	elseif (screen.Position - seat.Position):Dot(seat.CFrame.LookVector) < 0 then
		warn(`ComputerTransition: {seat:GetFullName()} faces away from the screen; turn it so its front faces the monitor`)
	end
	if not (screen and seat) or (seat.Occupant and seat.Occupant ~= humanoid) then
		task.spawn(showGame)
		return true
	end

	local s = {
		character = character, humanoid = humanoid, root = root, seat = seat, screen = screen,
		prompts = {}, controls = getControls(),
		screenColor = if screen:FindFirstChildOfClass("SurfaceGui") then Color3.new() else screen.Color,
	}
	session, busy = s, true
	s.died = humanoid.Died:Connect(function() finish(s) end)

	-- the USE prompt stays hidden while they're at the computer, and the character
	-- only answers to the controls again once they're back on their feet
	for _, d in model:GetDescendants() do
		if d:IsA("ProximityPrompt") and d.Enabled then
			d.Enabled = false
			table.insert(s.prompts, d)
		end
	end
	if s.controls then s.controls:Disable() end
	humanoid:UnequipTools()

	if humanoid.SeatPart ~= seat then
		if humanoid.SeatPart then -- sitting somewhere else: up off that first
			ask("Stand")
			humanoid.Sit = false
			task.wait(0.3)
		end
		local points = route(s)
		local spot = points[#points]
		if session == s then walkTo(s, points) end
		-- (a player who brushed the seat on the way is already in it: nothing to play)
		if session == s and not humanoid.SeatPart then
			-- Sit down smoothly from the spot. If something kept them from getting there,
			-- an ordinary snap into the seat beats sliding through the chair to it.
			if Vector2.new(spot.X - root.Position.X, spot.Z - root.Position.Z).Magnitude < 1.5 then
				local facing = seat.CFrame.LookVector * Vector3.new(1, 0, 1)
				if facing.Magnitude > 0.1 then turnTo(s, facing.Unit) end
				s.standCF = root.CFrame
			end
			sitDown(s)
		end
	end
	if session ~= s then return false end
	cameraIn(s)
	if session ~= s then return false end
	throughScreen(s, showGame)
	busy = false
	return true
end

-- Calls hideGame, brings the camera back out of the monitor and gets the player up
-- out of the chair. Yields until they're back on their feet.
function ComputerTransition.leave(hideGame)
	local s = session
	if not s then
		if hideGame then task.spawn(hideGame) end
		return false
	end
	if busy then return false end
	busy = true
	if hideGame then throughScreen(s, hideGame) end
	cameraOut(s)
	standUp(s)
	finish(s)
	return true
end

-- a new character means whatever was going on at the computer is over
player.CharacterAdded:Connect(function()
	if session then finish(session) end
end)

return ComputerTransition
