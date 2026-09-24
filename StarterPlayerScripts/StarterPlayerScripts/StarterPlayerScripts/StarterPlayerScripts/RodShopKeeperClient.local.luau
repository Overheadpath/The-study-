-- RodShopKeeperClient
-- The owner behind the corner rod shop in the hub village. The keeper lies
-- across the counter, bored out of their mind; walk up and they lift their
-- head to look at you; open the shop (the BrowseRods prompt, handled by
-- TradingController) and they stand up and wave.
--
-- Every pose is a set of joint angles (degrees, X/Y/Z) on top of each joint's
-- standing rest pose, which the rig carries in a RestC0 attribute. It all runs
-- here on the client, so it is smooth and each player gets the keeper's own
-- attention. The server (RodShopKeeper) relays "greet" over RodShopEvent
-- whenever someone opens the shop, so everyone nearby sees the wave.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer

local POSES = {
	bored = {
		Waist = Vector3.new(-58, 0, 0), Neck = Vector3.new(-38, 28, 22),
		RightShoulder = Vector3.new(128, 0, -48), LeftShoulder = Vector3.new(128, 0, 48),
		RightElbow = Vector3.new(48, 0, 0), LeftElbow = Vector3.new(48, 0, 0),
		RightWrist = Vector3.new(-20, 0, 0), LeftWrist = Vector3.new(-20, 0, 0),
	},
	attentive = {
		Waist = Vector3.new(-44, 0, 0), Neck = Vector3.new(30, 0, 0),
		RightShoulder = Vector3.new(118, 0, -40), LeftShoulder = Vector3.new(118, 0, 40),
		RightElbow = Vector3.new(62, 0, 0), LeftElbow = Vector3.new(62, 0, 0),
		RightWrist = Vector3.new(-25, 0, 0), LeftWrist = Vector3.new(-25, 0, 0),
	},
	wave = {
		Waist = Vector3.new(-8, 0, 0), Neck = Vector3.new(6, 0, 0),
		RightShoulder = Vector3.new(0, 0, 158), LeftShoulder = Vector3.new(42, 0, 8),
		RightElbow = Vector3.new(22, 0, 0), LeftElbow = Vector3.new(40, 0, 0),
		RightWrist = Vector3.new(0, 0, 0), LeftWrist = Vector3.new(0, 0, 0),
	},
}
local ATTEND_NEAR, ATTEND_FAR = 14, 17 -- studs: the keeper notices you / loses interest
local WAVE_SECONDS = 3.2
local GREETINGS = { "Oh! A customer!", "Hey there!", "Welcome in!", "Finally, someone!" }

local function findShop()
	local node = workspace:FindFirstChild("maap")
	node = node and node:FindFirstChild("Hub")
	node = node and node:FindFirstChild("Village")
	return node and node:FindFirstChild("RodShop")
end

local shop
do
	-- the map can arrive late on a slow join
	local deadline = os.clock() + 30
	repeat
		shop = findShop()
		if not shop then task.wait(0.5) end
	until shop or os.clock() > deadline
end
if not shop then return end

local JOINT_COUNT = 0 -- how many joints the poses drive
for _ in pairs(POSES.bored) do JOINT_COUNT += 1 end

local keeper
local joints = {}
local function collectJoints()
	table.clear(joints)
	keeper = shop:FindFirstChild("ShopKeeper")
	if not keeper then return end
	for _, motor in ipairs(keeper:GetDescendants()) do
		if motor:IsA("Motor6D") and POSES.bored[motor.Name] then
			local rest = motor:GetAttribute("RestC0")
			if typeof(rest) == "CFrame" then
				joints[motor.Name] = { motor = motor, rest = rest, angle = POSES.bored[motor.Name] }
			end
		end
	end
end
collectJoints()

local waveUntil, waveAt = 0, nil
local attending = false
local sighAt, sighStart = os.clock() + 5, -100
local nextRescan = 0

local function keeperWave(target, speak)
	waveUntil = os.clock() + WAVE_SECONDS
	waveAt = target
	local head = speak and keeper and keeper:FindFirstChild("Head")
	if head then
		local line = GREETINGS[math.random(#GREETINGS)]
		local ok = pcall(function()
			game:GetService("TextChatService"):DisplayBubble(head, line)
		end)
		if not ok then pcall(function() game:GetService("Chat"):Chat(head, line) end) end
	end
end

local remote = ReplicatedStorage:WaitForChild("RodShopEvent", 20)
if remote then
	remote.OnClientEvent:Connect(function(action, who)
		if action ~= "greet" or not keeper then return end
		local character = who and who.Character
		local target = character and character:FindFirstChild("HumanoidRootPart")
		local root = keeper:FindFirstChild("HumanoidRootPart")
		if not target or not root then return end
		-- the customer always gets their wave, however far out their camera is
		-- zoomed; bystanders only need it when they are nearby
		local cam = workspace.CurrentCamera
		local nearby = cam and (cam.CFrame.Position - root.Position).Magnitude < 70
		if who == player or nearby then
			-- only the customer being served sees the speech bubble
			keeperWave(target, who == player)
		end
	end)
end

-- Heartbeat rather than RenderStepped: just as smooth, and it keeps running
-- when the viewport is not being drawn
RunService.Heartbeat:Connect(function(dt)
	local now = os.clock()
	-- the map can stream the keeper out and back in as new instances
	if now > nextRescan then
		nextRescan = now + 1
		-- rescan when a joint has left the world, or when some limbs had not
		-- streamed in yet the last time we looked
		local stale, found = false, 0
		for _, j in pairs(joints) do
			found += 1
			if not j.motor:IsDescendantOf(workspace) then stale = true break end
		end
		if stale or found < JOINT_COUNT then
			shop = findShop() or shop
			collectJoints()
		end
	end
	if not next(joints) or not keeper then return end
	local root = keeper:FindFirstChild("HumanoidRootPart")
	if not root then return end

	-- does the player standing in front of the keeper have their attention?
	local character = player.Character
	local me = character and character:FindFirstChild("HumanoidRootPart")
	if me then
		local o = root.CFrame:PointToObjectSpace(me.Position)
		local distance = Vector3.new(o.X, 0, o.Z).Magnitude
		local inFront = -o.Z > 0.5
		attending = inFront and distance < (attending and ATTEND_FAR or ATTEND_NEAR)
	else
		attending = false
	end

	local waving = now < waveUntil
	local target = waving and POSES.wave or (attending and POSES.attentive or POSES.bored)
	-- quick to perk up, slow and lazy to slump back down
	local rate = waving and 8 or (attending and 4.5 or 1.6)
	local k = 1 - math.exp(-dt * rate)

	-- where the keeper looks while paying attention
	local lookTarget = (waving and waveAt) or (attending and me) or nil
	local yaw, pitch = 0, 0
	if lookTarget and lookTarget.Parent then
		local o = root.CFrame:PointToObjectSpace(lookTarget.Position)
		yaw = math.clamp(math.deg(math.atan2(-o.X, -o.Z)), -38, 38)
		pitch = math.clamp(math.deg(math.atan2(o.Y, Vector3.new(o.X, 0, o.Z).Magnitude)), -15, 15)
	end

	-- a long bored sigh every so often
	if not waving and not attending and now > sighAt then
		sighStart = now
		sighAt = now + 8 + math.random() * 6
	end
	local sighT = (now - sighStart) / 1.8
	local sigh = (sighT >= 0 and sighT <= 1) and math.sin(sighT * math.pi) or 0
	local breathe = math.sin(now * 1.15)

	for name, j in pairs(joints) do
		local want = target[name]
		if name == "Waist" then
			want += Vector3.new(breathe * 1.2 + sigh * 5, 0, 0)
		elseif name == "Neck" then
			if lookTarget then want += Vector3.new(pitch, yaw, 0) else want += Vector3.new(sigh * 6, 0, 0) end
		elseif waving and name == "RightShoulder" then
			want += Vector3.new(0, 0, 16 * math.sin(now * 10))
		elseif waving and name == "RightElbow" then
			want += Vector3.new(14 * math.sin(now * 10 + 0.9), 0, 0)
		elseif (name == "RightShoulder" or name == "LeftShoulder") and not waving then
			want += Vector3.new(sigh * 4, 0, 0)
		end
		j.angle += (want - j.angle) * k
		local a = j.angle
		j.motor.C0 = j.rest * CFrame.Angles(math.rad(a.X), math.rad(a.Y), math.rad(a.Z))
	end
end)
