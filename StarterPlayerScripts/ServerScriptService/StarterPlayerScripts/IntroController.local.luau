-- IntroController
-- Runs the first-time intro for this player and keeps everyone else's view
-- tidy while someone is in theirs.
--
-- Flow for a new player: join -> the screen is black (no title screen) ->
-- IntroService parks the real character out of sight -> IntroCinematic plays
-- with a copy of this player's avatar -> the real character is standing on
-- the shore -> camera and controls come back.
--
-- Returning players never see any of this: IntroService says "Done" and this
-- script does nothing for them.
--
-- The loading screen (ReplicatedFirst.LoadingScreen) sits above all of this. The
-- two talk through PlayerGui attributes: LoadingScreen = "Showing" / "Finished"
-- (written there) and IntroScreen = "Cover" / "Cutscene" / "World" (written here).
-- The cutscene never starts under the loading screen, and "World" is only set
-- once the island is really on screen (it is also the welcome message's cue).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local ContextActionService = game:GetService("ContextActionService")
local TweenService = game:GetService("TweenService")
local GuiService = game:GetService("GuiService")
local TextChatService = game:GetService("TextChatService")

local player = Players.LocalPlayer
local pg = player:WaitForChild("PlayerGui")
local system = game:GetService("ReplicatedStorage"):WaitForChild("FishingSystem")
local Config = require(system:WaitForChild("IntroConfig"))
local IntroActor = require(system:WaitForChild("IntroActor"))
local Cinematic = require(system:WaitForChild("IntroCinematic"))
local Theme = require(system:WaitForChild("BubbleTheme"))

---------------------------------------------------------------- hiding parked characters

-- While someone is in their intro, IntroService parks their real character out
-- of sight and marks it IntroHidden. Every client keeps it invisible (a local
-- change only), so nobody sees a frozen avatar hanging around.
local hidden = {} -- character -> saved name display
local selfHidden = false
local fadingIn = false -- (the hand-over dissolve drives the own character's transparency itself)

local function setShown(character, shown)
	for _, d in character:GetDescendants() do
		if d:IsA("BasePart") or d:IsA("Decal") then
			d.LocalTransparencyModifier = shown and 0 or 1
		end
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		if shown then
			if hidden[character] then humanoid.DisplayDistanceType = hidden[character] end
		elseif hidden[character] == nil then
			hidden[character] = humanoid.DisplayDistanceType
			humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
		end
	end
end

local function refresh(character)
	if not character or not character.Parent then return end
	local mine = character == player.Character
	local want = character:GetAttribute("IntroHidden") == true or (mine and selfHidden)
	if want then
		setShown(character, false)
		if hidden[character] == nil then hidden[character] = Enum.HumanoidDisplayDistanceType.Viewer end
	elseif hidden[character] ~= nil then
		setShown(character, true)
		hidden[character] = nil
	end
end

local function watchCharacter(character)
	character:GetAttributeChangedSignal("IntroHidden"):Connect(function() refresh(character) end)
	character.DescendantAdded:Connect(function(d)
		if hidden[character] ~= nil and (d:IsA("BasePart") or d:IsA("Decal")) then
			d.LocalTransparencyModifier = 1
		end
	end)
	character.AncestryChanged:Connect(function(_, parent)
		if not parent then hidden[character] = nil end
	end)
	refresh(character)
end

local function watchPlayer(p)
	p.CharacterAdded:Connect(watchCharacter)
	if p.Character then task.spawn(watchCharacter, p.Character) end
end
for _, p in Players:GetPlayers() do watchPlayer(p) end
Players.PlayerAdded:Connect(watchPlayer)

-- the camera scripts reset the local character's transparency every frame, so
-- keep a hidden own character hidden after them
RunService:BindToRenderStep("IntroKeepHidden", Enum.RenderPriority.Camera.Value + 2, function()
	local character = player.Character
	if character and hidden[character] ~= nil and not fadingIn then
		for _, d in character:GetDescendants() do
			if d:IsA("BasePart") or d:IsA("Decal") then d.LocalTransparencyModifier = 1 end
		end
	end
end)

---------------------------------------------------------------- the local intro

local remote = system:WaitForChild("IntroEvent", 60)
if not remote then
	warn("[Intro] IntroEvent never appeared; is IntroService in ServerScriptService?")
	return
end

local running = false
local characterSince = os.clock()
player.CharacterAdded:Connect(function() characterSince = os.clock() end)

local function state() return player:GetAttribute("IntroState") end

local function menu()
	local m = pg:FindFirstChild("FishingMenu")
	if m and m:IsA("ScreenGui") then return m end
	return nil
end

-- The title screen has been removed: players go straight into the cutscene.
-- If a title menu is ever put back, the intro still waits for its Play button.
local function menuBlocking()
	local m = menu()
	if not m then return false end
	return m.Enabled and m:GetAttribute("Playing") ~= true
end

local function waitFor(check, timeout)
	local started = os.clock()
	while not check() do
		if os.clock() - started > timeout then return false end
		task.wait(0.05)
	end
	return true
end

---------------------------------------------------------------- screen: black, bars, skip

local function makeScreen()
	local gui = Instance.new("ScreenGui")
	gui.Name = "IntroCinematic"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 250
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = pg
	local bar = Config.Look.Letterbox or 0
	local top = Instance.new("Frame")
	top.Name = "Top"
	top.BorderSizePixel = 0
	top.BackgroundColor3 = Color3.new(0, 0, 0)
	top.Size = UDim2.fromScale(1, 0)
	top.ZIndex = 2
	top.Parent = gui
	local bottom = top:Clone()
	bottom.Name = "Bottom"
	bottom.AnchorPoint = Vector2.new(0, 1)
	bottom.Position = UDim2.fromScale(0, 1)
	bottom.Parent = gui
	local black = Instance.new("Frame")
	black.Name = "Black"
	black.BorderSizePixel = 0
	black.BackgroundColor3 = Color3.new(0, 0, 0)
	black.BackgroundTransparency = 1
	black.Size = UDim2.fromScale(1, 1)
	black.ZIndex = 5
	black.Parent = gui
	local skip = Theme.New("TextButton", "Skip", gui, {
		AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -22, 1, -18), Size = UDim2.fromOffset(118, 42),
		Text = "SKIP  »", TextSize = 18, Visible = false, ZIndex = 6, BorderSizePixel = 0,
	})
	Theme.Button(skip, Theme.Purple)
	local screen = { gui = gui, black = black, top = top, bottom = bottom, skip = skip }
	function screen.bars(show, time)
		local size = UDim2.fromScale(1, show and bar or 0)
		for _, f in { top, bottom } do
			TweenService:Create(f, TweenInfo.new(time or 0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Size = size }):Play()
		end
	end
	function screen.fade(to, time)
		local tween = TweenService:Create(black, TweenInfo.new(time or 0.4, Enum.EasingStyle.Quad), { BackgroundTransparency = 1 - to })
		tween:Play()
		return tween
	end
	return screen
end

---------------------------------------------------------------- locking the game around the cinematic

local function lockGame()
	local undo = {}
	-- movement: the title screen's own trick, plus the proper controls switch
	ContextActionService:BindActionAtPriority("IntroLock", function() return Enum.ContextActionResult.Sink end, false, 3000,
		Enum.PlayerActions.CharacterForward, Enum.PlayerActions.CharacterBackward, Enum.PlayerActions.CharacterLeft,
		Enum.PlayerActions.CharacterRight, Enum.PlayerActions.CharacterJump)
	table.insert(undo, function() ContextActionService:UnbindAction("IntroLock") end)
	pcall(function()
		local controls = require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule", 5)):GetControls()
		controls:Disable()
		table.insert(undo, function() controls:Enable() end)
	end)
	-- every other screen (HUD, backpack, shop windows...) goes away and comes back as it was,
	-- including ones that are still being built when the cinematic starts
	local KEEP = { IntroCinematic = true, LoadingScreen = true, WelcomeMessage = true }
	local function hideGui(g)
		if g:IsA("ScreenGui") and not KEEP[g.Name] and g.Enabled then
			g.Enabled = false
			table.insert(undo, function() if g.Parent then g.Enabled = true end end)
		end
	end
	for _, g in pg:GetChildren() do hideGui(g) end
	local lateGui = pg.ChildAdded:Connect(function(g) task.defer(hideGui, g) end)
	table.insert(undo, function() lateGui:Disconnect() end)
	for _, kind in { Enum.CoreGuiType.Backpack, Enum.CoreGuiType.PlayerList, Enum.CoreGuiType.Health, Enum.CoreGuiType.Chat, Enum.CoreGuiType.EmotesMenu } do
		local ok, was = pcall(function() return StarterGui:GetCoreGuiEnabled(kind) end)
		if ok and was then
			pcall(function() StarterGui:SetCoreGuiEnabled(kind, false) end)
			table.insert(undo, function() pcall(function() StarterGui:SetCoreGuiEnabled(kind, true) end) end)
		end
	end
	-- no resetting mid-cinematic
	if pcall(function() StarterGui:SetCore("ResetButtonCallback", false) end) then
		table.insert(undo, function() pcall(function() StarterGui:SetCore("ResetButtonCallback", true) end) end)
	end
	-- the backpack UI re-hides Roblox's backpack itself; keep that behaviour
	return function()
		for i = #undo, 1, -1 do pcall(undo[i]) end
	end
end

local function reducedMotion() return pg:GetAttribute("ReduceMotion") == true end

local function readPlaces()
	local props = system:FindFirstChild("IntroProps")
	if not props then return nil end
	local wash, boat, focus = props:GetAttribute("WashUp"), props:GetAttribute("BoatStart"), props:GetAttribute("Focus")
	if typeof(wash) ~= "CFrame" or typeof(boat) ~= "CFrame" then return nil end
	return { washUp = wash, boatStart = boat, focus = typeof(focus) == "Vector3" and focus or wash.Position }, props
end

local function runIntro(screen)
	running = true
	pg:SetAttribute("IntroScreen", "Cutscene")
	screen = screen or makeScreen()
	screen.fade(1, 0.35).Completed:Wait()
	-- let the title screen finish closing (it hands the camera back first)
	waitFor(function() local m = menu() return not (m and m.Enabled) end, 4)
	local unlock = lockGame()
	local camera = workspace.CurrentCamera
	camera.CameraType = Enum.CameraType.Scriptable

	local result = "Error"
	local cleanup
	local ok, err = pcall(function()
		local character = player.Character or player.CharacterAdded:Wait()
		character:WaitForChild("Humanoid", 10)
		if not player:HasAppearanceLoaded() then
			waitFor(function() return player:HasAppearanceLoaded() end, 6)
		end
		task.wait(0.1)
		local actor, why = IntroActor.fromCharacter(character)
		if not actor then error("could not copy the avatar: " .. tostring(why)) end
		remote:FireServer("Begin")
		-- stop waiting as soon as the server answers either way ("Done" means it ended the intro)
		if not waitFor(function()
			local s = state()
			return s == "Done" or (s == "Playing" and player:GetAttribute("IntroParked") == true)
		end, 15) or state() ~= "Playing" then
			actor:destroy()
			error("the server did not start the intro")
		end
		selfHidden = true
		refresh(player.Character)
		local places, props = readPlaces()
		if not places then
			actor:destroy()
			error("intro places are missing")
		end
		screen.bars(true, 0.8)
		local skipped = false
		local shownAt = os.clock() + (Config.Look.SkipAfter or 2)
		local skipConn = screen.skip.Activated:Connect(function() skipped = true end)
		-- a new character mid-intro (reset, died) ends it
		local respawnConn = player.CharacterAdded:Connect(function() skipped = true end)
		ContextActionService:BindActionAtPriority("IntroSkip", function(_, inputState)
			if inputState == Enum.UserInputState.Begin and screen.skip.Visible then skipped = true end
			return Enum.ContextActionResult.Sink
		end, false, 3001, Enum.KeyCode.ButtonB)
		local skipShow = RunService.Heartbeat:Connect(function()
			if Config.Look.ShowSkip ~= false and os.clock() >= shownAt and not screen.skip.Visible then
				screen.skip.Visible = true
				Theme.Pop(screen.skip)
			end
		end)
		local placeSent = false
		local function place(why)
			if placeSent then return end
			placeSent = true
			remote:FireServer("Finish", why)
		end
		local endCF
		result, endCF, cleanup = Cinematic.run({
			actor = actor, places = places, props = props, config = Config,
			ui = { black = screen.black }, reduced = reducedMotion(),
			skipped = function() return skipped end,
			onPlace = function() place("Finished") end,
			isPlaced = function() return state() == "Done" end,
		})
		skipConn:Disconnect()
		skipShow:Disconnect()
		respawnConn:Disconnect()
		ContextActionService:UnbindAction("IntroSkip")
		screen.skip.Visible = false
		if result ~= "Finished" then
			-- skipped (or something went wrong): cut to black, then hand over on the shore
			screen.fade(1, 0.3).Completed:Wait()
			place(result)
		end
		waitFor(function() return state() == "Done" end, 8)
		-- hand over: every player's cinematic body is the same standard one, so it
		-- dissolves into their own avatar on the same spot rather than switching in
		-- one frame in front of the camera
		local own = player.Character
		if result == "Finished" and cleanup and own and actor and actor.model and actor.model.Parent and not reducedMotion() then
			local standIn = {}
			for _, d in actor.model:GetDescendants() do
				if d:IsA("BasePart") or d:IsA("Decal") then table.insert(standIn, d) end
			end
			fadingIn = true
			local t0 = os.clock()
			local D = 0.45
			while os.clock() - t0 < D do
				local k = math.clamp((os.clock() - t0) / D, 0, 1)
				k = k * k * (3 - 2 * k)
				for _, d in standIn do d.LocalTransparencyModifier = k end
				for _, d in own:GetDescendants() do
					if d:IsA("BasePart") or d:IsA("Decal") then d.LocalTransparencyModifier = 1 - k end
				end
				RunService.RenderStepped:Wait()
			end
			fadingIn = false
		end
		-- (and the stand-in goes)
		if cleanup then cleanup() cleanup = nil end
		selfHidden = false
		refresh(player.Character)
		camera.CFrame = endCF
	end)
	if not ok then
		warn("[Intro] " .. tostring(err))
		pcall(function() remote:FireServer("Finish", "Error") end)
		waitFor(function() return state() == "Done" end, 6)
	end
	if cleanup then pcall(cleanup) end
	selfHidden = false
	refresh(player.Character)

	-- back to the game
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	camera.FieldOfView = 70
	if humanoid then camera.CameraSubject = humanoid end
	camera.CameraType = Enum.CameraType.Custom
	unlock()
	screen.bars(false, 0.7)
	screen.fade(0, result == "Finished" and 0.2 or 0.7)
	task.delay(1, function()
		screen.gui:Destroy()
		pg:SetAttribute("IntroScreen", "World")
	end)
	running = false
end

-- the loading screen is still up (with a cap, so a broken one never holds the intro)
local function loadingScreenUp()
	if pg:GetAttribute("LoadingScreen") ~= "Showing" then return false end
	if not pg:FindFirstChild("LoadingScreen") then return false end
	return time() < 45 -- seconds since this session started
end

-- Straight in: from the first frame the screen is black until the save has
-- been read. A new player goes from that black straight into the cutscene; a
-- returning player sees it lift onto the island.
task.spawn(function()
	local cover
	if state() ~= "Done" then
		cover = makeScreen()
		cover.black.BackgroundTransparency = 0
		pg:SetAttribute("IntroScreen", "Cover")
	else
		pg:SetAttribute("IntroScreen", "World")
	end
	local coverSince = os.clock()
	local function lift(time)
		if not cover then return end
		cover.fade(0, time or 0.6)
		local old = cover
		task.delay((time or 0.6) + 0.2, function()
			old.gui:Destroy()
			pg:SetAttribute("IntroScreen", "World")
		end)
		cover = nil
	end
	local gaveUp = false
	local declinedAt = -math.huge
	while true do
		local s = state()
		local ready = player.Character ~= nil and os.clock() - characterSince > 1
		if ready and not running and not menuBlocking() then
			if s == "Waiting" then
				if gaveUp then
					-- the save answered only after we had let them into the game:
					-- never yank a playing player into the cutscene; it plays next visit.
					-- Stay in here until the server has really left "Waiting" (the reply
					-- takes a round trip), asking again now and then in case one was dropped
					if os.clock() - declinedAt > 2 then
						declinedAt = os.clock()
						pcall(function() remote:FireServer("Finish", "Error") end)
					end
				elseif loadingScreenUp() then
					-- tell the loading screen to go to black; the cutscene starts right after
					pg:SetAttribute("IntroScreen", "Cutscene")
				else
					runIntro(cover)
					cover = nil
				end
			elseif s == "Done" then
				gaveUp = false
				lift(0.7)
			elseif cover and os.clock() - coverSince > 12 then
				-- the save never answered: never leave anyone staring at black
				gaveUp = true
				lift(0.7)
			end
		end
		task.wait(0.1)
	end
end)

---------------------------------------------------------------- developer messages

remote.OnClientEvent:Connect(function(kind, text)
	if kind ~= "DevMessage" or type(text) ~= "string" then return end
	local shown = pcall(function()
		local channels = TextChatService:FindFirstChild("TextChannels")
		local system_ = channels and (channels:FindFirstChild("RBXSystem") or channels:FindFirstChild("RBXGeneral"))
		system_:DisplaySystemMessage("[Intro] " .. text)
	end)
	if not shown then
		pcall(function()
			StarterGui:SetCore("ChatMakeSystemMessage", { Text = "[Intro] " .. text, Color = Color3.fromRGB(248, 207, 108) })
		end)
	end
	print("[Intro] " .. text)
end)

-- keep gamepad selection off the skip button's screen once it is gone
pg.ChildRemoved:Connect(function(child)
	if child.Name == "IntroCinematic" and GuiService.SelectedObject and not GuiService.SelectedObject:IsDescendantOf(pg) then
		GuiService.SelectedObject = nil
	end
end)
