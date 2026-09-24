-- MovementController
-- Idle / walk / run / sprint for the player, plus the stamina that pays for
-- sprinting. The default Animate script keeps doing what it is good at (jumps,
-- falls, tools, swimming hand-off); this script hands it the animations from
-- GameplayConfig and swaps in the sprint animation while Shift is held.
-- Every number lives in GameplayConfig.Movement / .Stamina.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")

local system = game.ReplicatedStorage:WaitForChild("FishingSystem")
local Theme = require(system:WaitForChild("BubbleTheme"))
local G = require(system:WaitForChild("GameplayConfig"))
local M, S = G.Movement, G.Stamina

local player = Players.LocalPlayer
local pg = player:WaitForChild("PlayerGui")

---------------------------------------------------------------- stamina HUD
local gui = Theme.New("ScreenGui", "StaminaHUD", pg, { ResetOnSpawn = false, DisplayOrder = 31 })
local group = Theme.New("CanvasGroup", "Bar", gui, {
	-- (in the gap between the fishing reel panel, whose bottom edge is 100 px up, and the
	-- hotbar, whose top is 84 px up, so it never covers either)
	AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -86), Size = UDim2.fromOffset(232, 12),
	BackgroundColor3 = Color3.fromRGB(27, 67, 85), BorderSizePixel = 0, GroupTransparency = 1,
})
Theme.Corner(group, 8)
Theme.Border(group, 2, Theme.Ink)
local fill = Theme.New("Frame", "Fill", group, { Position = UDim2.fromOffset(2, 2), Size = UDim2.new(1, -4, 1, -4), BackgroundColor3 = Theme.Mint, BorderSizePixel = 0 })
Theme.Corner(fill, 6)
local hudScale = Theme.New("UIScale", "ResponsiveScale", group, { Scale = 1 })

-- on touch there is no Shift, so a button does the job
local sprintButton
if UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled then
	sprintButton = Theme.New("TextButton", "Sprint", gui, { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -22, 1, -112), Size = UDim2.fromOffset(72, 72), Text = "RUN", TextSize = 18 })
	Theme.Button(sprintButton, Theme.Mint)
	Theme.Corner(sprintButton, 36)
end

---------------------------------------------------------------- state
local stamina = S.Max
local wantSprint = false          -- the input
local sprinting = false           -- what we are actually doing
local exhausted = false           -- ran dry: wait for MinToSprint
local regenAt = 0
local fullSince = os.clock()
local shownAlpha = 0

local character, humanoid, animate
local baseIds = {}

local function setAnimation(folder, child, id)
	local f = animate and animate:FindFirstChild(folder)
	local a = f and f:FindFirstChild(child)
	if not (a and a:IsA("Animation")) or a.AnimationId == id then return end
	-- the Animate script only reloads a track when the Animation *instance*
	-- changes, so swap the object (weight child and all) rather than editing
	-- its id in place
	local old = a.AnimationId
	local fresh = a:Clone()
	fresh.AnimationId = id
	a:Destroy()
	fresh.Parent = f
	-- the track that was loaded from the old object keeps playing underneath
	-- everything otherwise; fade it out once the new one is in
	task.delay(0.1, function()
		local animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
		if not animator then return end
		for _, track in ipairs(animator:GetPlayingAnimationTracks()) do
			local src = track.Animation
			if src and src.AnimationId == old and src.Parent == nil then track:Stop(0.25) end
		end
	end)
end

-- idle / walk / run go to the Animate script once per character
local function applyAnimations()
	if not animate then return end
	setAnimation("idle", "Animation1", M.Animations.Idle1)
	setAnimation("idle", "Animation2", M.Animations.Idle2)
	setAnimation("walk", "WalkAnim", M.Animations.Walk)
	setAnimation("run", "RunAnim", M.Animations.Run)
end

-- the sprint is our own track at Action priority, so it sits cleanly on top of
-- whatever Animate is blending and comes off again the moment sprinting stops
local sprintTrack
local function loadSprint()
	local animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
	if not animator then return end
	local a = Instance.new("Animation")
	a.Name = "Sprint"
	a.AnimationId = M.Animations.Sprint
	local ok, track = pcall(function() return animator:LoadAnimation(a) end)
	if ok and track then
		track.Priority = Enum.AnimationPriority.Action
		track.Looped = true
		sprintTrack = track
	end
end
local sprintPlaying = false
local function setSprintTrack(on)
	if on == sprintPlaying or not sprintTrack then return end
	sprintPlaying = on
	if on then sprintTrack:Play(0.15) else sprintTrack:Stop(0.2) end
end

local function onCharacter(c)
	character = c
	humanoid = c:WaitForChild("Humanoid")
	animate = c:WaitForChild("Animate", 10)
	sprinting = false
	exhausted = false
	stamina = S.Max
	sprintTrack = nil
	sprintPlaying = false
	applyAnimations()
	loadSprint()
end
if player.Character then task.spawn(onCharacter, player.Character) end
player.CharacterAdded:Connect(onCharacter)

---------------------------------------------------------------- input
local function setWant(on)
	wantSprint = on
	if sprintButton then sprintButton.BackgroundColor3 = on and Theme.Gold or Theme.Mint end
end
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.RightShift then setWant(true)
	elseif input.KeyCode == Enum.KeyCode.ButtonL3 then setWant(not wantSprint) end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.RightShift then setWant(false) end
end)
if sprintButton then sprintButton.Activated:Connect(function() setWant(not wantSprint) end) end
-- anything else (another UI, a test) can drive sprint through this attribute
player:GetAttributeChangedSignal("WantSprint"):Connect(function() setWant(player:GetAttribute("WantSprint") == true) end)

---------------------------------------------------------------- admin movement
-- The server decides these (AdminService, after checking who asked): a freeze, a
-- flight, a changed walking speed. They arrive as attributes on the player, which a
-- client cannot set for the server, so this script only carries them out.

local FLY_SPEED, FLY_BOOST = 44, 2.2 -- studs a second, and how much faster with Shift
local flight = nil -- { velocity, gyro, attachment, current }
local function stopFlight()
	if not flight then return end
	for _, x in ipairs({ flight.velocity, flight.gyro, flight.attachment }) do pcall(function() x:Destroy() end) end
	flight = nil
	if humanoid and humanoid.Parent then
		humanoid.PlatformStand = false
		pcall(function() humanoid:ChangeState(Enum.HumanoidStateType.Freefall) end)
	end
end
local function startFlight()
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if flight or not root or not humanoid then return end
	local att = Instance.new("Attachment")
	att.Name = "AdminFlyAttachment"
	att.Parent = root
	local lv = Instance.new("LinearVelocity")
	lv.Name = "AdminFlyVelocity"
	lv.Attachment0 = att
	lv.RelativeTo = Enum.ActuatorRelativeTo.World
	lv.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	lv.MaxForce = 1e6
	lv.VectorVelocity = Vector3.zero
	lv.Parent = root
	local ao = Instance.new("AlignOrientation")
	ao.Name = "AdminFlyGyro"
	ao.Mode = Enum.OrientationAlignmentMode.OneAttachment
	ao.Attachment0 = att
	ao.MaxTorque = 1e6
	ao.Responsiveness = 18
	ao.CFrame = root.CFrame.Rotation
	ao.Parent = root
	humanoid.PlatformStand = true
	flight = { velocity = lv, gyro = ao, attachment = att, current = root.AssemblyLinearVelocity }
end
local function driveFlight(dt)
	local wants = player:GetAttribute("AdminFly") == true and humanoid and humanoid.Parent and humanoid.Health > 0
	if not wants then stopFlight() return end
	if not flight then startFlight() end
	if not flight then return end
	local cam = workspace.CurrentCamera
	-- the usual movement input (keys, stick or thumbstick) arrives flat in the world as
	-- MoveDirection; turned onto the camera, forward goes where the camera looks, up
	-- and down included
	local md = humanoid.MoveDirection
	local look = cam.CFrame.LookVector
	local flatLook = Vector3.new(look.X, 0, look.Z)
	flatLook = flatLook.Magnitude > 0.05 and flatLook.Unit or Vector3.new(0, 0, -1)
	local flatRight = Vector3.new(-flatLook.Z, 0, flatLook.X)
	local dir = look * md:Dot(flatLook) + cam.CFrame.RightVector * md:Dot(flatRight)
	local typing = UserInputService:GetFocusedTextBox() ~= nil
	if not typing then
		if UserInputService:IsKeyDown(Enum.KeyCode.Space) or UserInputService:IsKeyDown(Enum.KeyCode.ButtonA) then dir += Vector3.yAxis end
		if UserInputService:IsKeyDown(Enum.KeyCode.Q) or UserInputService:IsKeyDown(Enum.KeyCode.LeftControl) or UserInputService:IsKeyDown(Enum.KeyCode.ButtonB) then dir -= Vector3.yAxis end
	end
	if RunService:IsStudio() then
		-- (a test can steer the flight without a keyboard)
		local test = player:GetAttribute("FlyTestInput")
		if typeof(test) == "Vector3" then dir = test end
	end
	if dir.Magnitude > 1 then dir = dir.Unit end
	local fast = wantSprint and FLY_BOOST or 1
	local target = dir * FLY_SPEED * fast
	-- eased, so starting, stopping and turning are smooth
	flight.current = flight.current:Lerp(target, 1 - math.exp(-dt * 5))
	flight.velocity.VectorVelocity = flight.current
	-- face the way the camera faces, leaning a touch into the flight
	local flat = Vector3.new(cam.CFrame.LookVector.X, 0, cam.CFrame.LookVector.Z)
	if flat.Magnitude > 0.05 then
		local lean = math.clamp(flight.current:Dot(flat.Unit) / (FLY_SPEED * FLY_BOOST), -1, 1)
		flight.gyro.CFrame = CFrame.lookAt(Vector3.zero, flat.Unit) * CFrame.Angles(-math.rad(18) * lean, 0, 0)
	end
end
player:GetAttributeChangedSignal("AdminFly"):Connect(function()
	if player:GetAttribute("AdminFly") ~= true then stopFlight() end
end)
player.CharacterAdded:Connect(function() flight = nil end)

---------------------------------------------------------------- drive it
local function menuOpen()
	local menu = pg:FindFirstChild("FishingMenu")
	return menu and menu:IsA("ScreenGui") and menu.Enabled
end

RunService.Heartbeat:Connect(function(dt)
	local now = os.clock()
	local alive = humanoid and humanoid.Parent and humanoid.Health > 0
	local moving = alive and humanoid.MoveDirection.Magnitude > 0.1
	local seated = alive and (humanoid.Sit or humanoid.SeatPart ~= nil)
	local swimming = alive and humanoid:GetState() == Enum.HumanoidStateType.Swimming
	-- (held by an admin, or flying: no sprinting, no stamina, walking speed left alone)
	local locked = menuOpen() or player:GetAttribute("AdminFrozen") == true or player:GetAttribute("AdminFly") == true
	driveFlight(dt)

	-- can we sprint right now?
	local canSprint = alive and moving and not seated and not swimming and not locked and not exhausted and stamina > 0
	local shouldSprint = wantSprint and canSprint
	if shouldSprint ~= sprinting then
		sprinting = shouldSprint
		player:SetAttribute("Sprinting", sprinting)
	end
	-- the sprint clip only while our feet are on the ground, so jumps and falls
	-- keep their own animations
	local grounded = alive and humanoid.FloorMaterial ~= Enum.Material.Air
	setSprintTrack(sprinting and grounded)
	if sprintPlaying and sprintTrack then sprintTrack:AdjustSpeed(math.clamp(humanoid.WalkSpeed / 26, 0.8, 1.3)) end

	-- stamina
	if sprinting then
		stamina = math.max(0, stamina - S.DrainPerSecond * dt)
		regenAt = now + S.RegenDelay
		if stamina <= 0 then exhausted = true; if sprintButton then setWant(false) end end
	elseif now >= regenAt then
		stamina = math.min(S.Max, stamina + S.RegenPerSecond * dt)
		if exhausted and stamina >= S.MinToSprint then exhausted = false end
	end
	if stamina >= S.Max - 0.01 then
		if fullSince == 0 then fullSince = now end
	else
		fullSince = 0
	end

	-- speed eases rather than steps
	if alive and not locked and not seated then
		-- an admin's own speed replaces the walk, and the sprint keeps its ratio to it
		local base = player:GetAttribute("AdminSpeed")
		base = type(base) == "number" and math.clamp(base, 4, 100) or nil
		local target = sprinting and (base and base * M.SprintSpeed / M.NormalSpeed or M.SprintSpeed) or (base or M.NormalSpeed)
		humanoid.WalkSpeed += (target - humanoid.WalkSpeed) * (1 - math.exp(-dt * M.SpeedBlend))
	end

	-- HUD
	local frac = stamina / S.Max
	fill.Size = fill.Size:Lerp(UDim2.new(frac, -4, 1, -4), 1 - math.exp(-dt * 14))
	fill.BackgroundColor3 = exhausted and Theme.Pink or (frac < S.MinToSprint / S.Max and Theme.Gold or Theme.Mint)
	local show = not locked and (sprinting or frac < 1 or (fullSince > 0 and now - fullSince < S.HideWhenFullAfter))
	shownAlpha += ((show and 1 or 0) - shownAlpha) * (1 - math.exp(-dt * 6))
	group.GroupTransparency = 1 - shownAlpha
	if sprintButton then sprintButton.Visible = not locked end
	local cam = workspace.CurrentCamera
	if cam then hudScale.Scale = math.clamp(cam.ViewportSize.X / 1100, 0.75, 1) end
end)
