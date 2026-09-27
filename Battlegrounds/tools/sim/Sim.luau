--[[
	A small fake Roblox engine for testing BattleHub inside Lune.

	Loads the built place, then adds what Lune's roblox library doesn't have:
	events, services (Players, RunService, DataStoreService, TweenService...),
	a fake network between server and clients (RemoteEvent / RemoteFunction
	with copied arguments and a little latency), characters that spawn, die and
	respawn, and DataStores that insist on JSON-safe data.

	Nothing here is shipped to Roblox; it's only for the tests in run.luau.
]]

local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local Scheduler = require("./Scheduler")
local Env = require("../RobloxEnv")

local Instance = roblox.Instance
local Vector3 = roblox.Vector3
local Vector2 = roblox.Vector2
local CFrame = roblox.CFrame

local Sim = {}
Sim.Scheduler = Scheduler
Sim.warnings = {} :: { string }
Sim.isStudio = true
Sim.baseTime = 1790000000 -- a fixed "server clock" start (2026)
Sim.latency = 0.03
Sim.dataStoreError = nil :: string?
Sim.dataStoreDelay = 0.05
Sim.printScripts = false

----------------------------------------------------------------------------------
-- Signals on instances
----------------------------------------------------------------------------------

local signals: { [string]: any } = {}

function Sim.signal(inst: any, name: string): any
	local key = inst:GetDebugId() .. "|" .. name
	local s = signals[key]
	if not s then
		s = Scheduler.Signal.new(name)
		signals[key] = s
	end
	return s
end

local EVENTS: { [string]: { string } } = {
	Instance = {
		"ChildAdded",
		"ChildRemoved",
		"DescendantAdded",
		"DescendantRemoving",
		"AncestryChanged",
		"Destroying",
		"AttributeChanged",
		"Changed",
	},
	GuiButton = { "Activated", "MouseButton1Click", "MouseButton1Down", "MouseButton1Up", "MouseButton2Click" },
	GuiObject = { "MouseEnter", "MouseLeave", "InputBegan", "InputEnded", "InputChanged" },
	TextBox = { "FocusLost", "Focused" },
	Humanoid = { "Died", "HealthChanged", "StateChanged" },
	Players = { "PlayerAdded", "PlayerRemoving" },
	Player = { "CharacterAdded", "CharacterRemoving", "CharacterAppearanceLoaded" },
	RunService = { "Heartbeat", "RenderStepped", "Stepped", "PreSimulation", "PostSimulation" },
	ProximityPromptService = { "PromptTriggered", "PromptShown", "PromptHidden" },
	ProximityPrompt = { "Triggered", "TriggerEnded", "PromptShown", "PromptHidden" },
	RemoteEvent = { "OnClientEvent", "OnServerEvent" },
	BindableEvent = { "Event" },
	BasePart = { "Touched", "TouchEnded" },
}
for className, names in EVENTS do
	for _, name in names do
		roblox.implementProperty(className, name, function(inst)
			return Sim.signal(inst, name)
		end)
	end
end

roblox.implementMethod("Instance", "GetPropertyChangedSignal", function(inst, prop: string)
	return Sim.signal(inst, "Changed:" .. prop)
end)
roblox.implementMethod("Instance", "GetAttributeChangedSignal", function(inst, attr: string)
	return Sim.signal(inst, "Attribute:" .. attr)
end)

----------------------------------------------------------------------------------
-- Loading the place and building script environments
----------------------------------------------------------------------------------

local game: any
local serverEnv: any
local Players: any
local Workspace: any

-- Deep copy, the way values cross Roblox's network.
local function copy(value: any, seen: { [any]: any }?): any
	if type(value) ~= "table" then
		return value
	end
	local s = seen or {}
	if s[value] then
		return s[value]
	end
	local out = {}
	s[value] = out
	for k, v in value do
		out[copy(k, s)] = copy(v, s)
	end
	return out
end
Sim.copy = copy

local fakeOs = setmetatable({
	time = function(t: any?): number
		if t then
			return os.time(t)
		end
		return Sim.baseTime + math.floor(Scheduler.now)
	end,
	clock = function(): number
		return Scheduler.now
	end,
}, { __index = os })

local RandomShim = {
	new = function(_seed: number?)
		local r = {}
		function r:NextNumber(a: number?, b: number?): number
			local lo, hi = a or 0, b or 1
			return lo + (hi - lo) * math.random()
		end
		function r:NextInteger(a: number, b: number): number
			return math.random(a, b)
		end
		return r
	end,
}

local TweenInfoShim = {
	new = function(time: number?, style: any?, direction: any?, ...: any)
		return { Time = time or 1, EasingStyle = style, EasingDirection = direction }
	end,
}

local function globals(): { [string]: any }
	return {
		task = Scheduler.task,
		os = fakeOs,
		Random = RandomShim,
		TweenInfo = TweenInfoShim,
		warn = function(...: any)
			local parts = {}
			for i = 1, select("#", ...) do
				table.insert(parts, tostring((select(i, ...))))
			end
			local text = table.concat(parts, " ")
			table.insert(Sim.warnings, text)
			print("\27[33m[warn]\27[0m " .. text)
		end,
		print = function(...: any)
			if Sim.printScripts then
				print("[script]", ...)
			end
		end,
	}
end

-- A stand-in for an Instance that overrides some members (used for the
-- per-client `game` and `Players` so LocalPlayer is right for each client).
local function proxy(inst: any, overrides: { [string]: any }): any
	return setmetatable({}, {
		__index = function(_, key)
			local o = overrides[key]
			if o ~= nil then
				return o
			end
			local value = inst[key]
			if type(value) == "function" then
				return function(self, ...)
					return value(if self == nil then inst else inst, ...)
				end
			end
			return value
		end,
		__newindex = function(_, key, value)
			inst[key] = value
		end,
		__tostring = function()
			return tostring(inst)
		end,
	})
end

function Sim.load(placePath: string)
	math.randomseed(12345)
	game = roblox.deserializePlace(fs.readFile(placePath))
	game.JobId = ""
	Players = game:GetService("Players")
	Workspace = game:GetService("Workspace")
	Sim.game = game
	Sim.Players = Players
	Sim.Workspace = Workspace
	serverEnv = Env.new(game, globals())
	Sim.serverEnv = serverEnv
	local camera = Instance.new("Camera")
	camera.ViewportSize = Vector2.new(1920, 1080)
	camera.CFrame = CFrame.new(0, 110, 30)
	camera.Parent = Workspace
	Workspace.CurrentCamera = camera
	return game
end

function Sim.clientEnv(player: any): any
	local playersProxy = proxy(Players, { LocalPlayer = player })
	local gameProxy = proxy(game, {
		GetService = function(_, name: string)
			if name == "Players" then
				return playersProxy
			end
			return game:GetService(name)
		end,
	})
	return Env.new(gameProxy, globals())
end

----------------------------------------------------------------------------------
-- Services
----------------------------------------------------------------------------------

roblox.implementMethod("Instance", "WaitForChild", function(inst, name: string, timeout: number?)
	local child = inst:FindFirstChild(name)
	if child then
		return child
	end
	local limit = timeout or 5
	local waited = 0
	while waited < limit do
		Scheduler.task.wait(0.1)
		waited += 0.1
		child = inst:FindFirstChild(name)
		if child then
			return child
		end
	end
	if timeout then
		return nil
	end
	error(`Infinite yield: {inst:GetFullName()}:WaitForChild("{name}")`, 2)
end)

roblox.implementMethod("DataModel", "BindToClose", function(_, fn)
	Sim.closeCallbacks = Sim.closeCallbacks or {}
	table.insert(Sim.closeCallbacks, fn)
end)

roblox.implementMethod("Workspace", "GetServerTimeNow", function()
	return Sim.baseTime + Scheduler.now
end)

roblox.implementMethod("RunService", "IsStudio", function()
	return Sim.isStudio
end)
roblox.implementMethod("RunService", "IsServer", function()
	return Scheduler.owner() == "server"
end)
roblox.implementMethod("RunService", "IsClient", function()
	return Scheduler.owner() ~= "server"
end)

roblox.implementMethod("Players", "GetPlayers", function(inst)
	local list = {}
	for _, child in inst:GetChildren() do
		if child:IsA("Player") then
			table.insert(list, child)
		end
	end
	return list
end)
roblox.implementMethod("Players", "GetPlayerByUserId", function(inst, userId: number)
	for _, child in inst:GetChildren() do
		if child:IsA("Player") and child.UserId == userId then
			return child
		end
	end
	return nil
end)
roblox.implementMethod("Players", "GetNameFromUserIdAsync", function(_, userId: number)
	Scheduler.task.wait(0.05)
	return "User" .. userId
end)
roblox.implementMethod("Player", "RequestStreamAroundAsync", function() end)
roblox.implementMethod("Player", "Kick", function(player, message)
	table.insert(Sim.warnings, `kicked {player.Name}: {message}`)
end)

roblox.implementMethod("SocialService", "CanSendGameInviteAsync", function()
	return false
end)
roblox.implementMethod("SocialService", "PromptGameInvite", function() end)

-- Tweens jump straight to their end values (we test logic, not animation).
roblox.implementMethod("TweenService", "Create", function(_, inst, _info, props)
	local completed = Scheduler.Signal.new("Completed")
	local tween = { Completed = completed, PlaybackState = "Begin" }
	function tween:Play()
		for key, value in props do
			inst[key] = value
		end
		completed:Fire("Completed")
	end
	function tween:Cancel() end
	function tween:Pause() end
	return tween
end)

-- Models: pivot = PrimaryPart (or first part). Parts keep a readable Position.
local function firstPart(model: any): any
	if model.PrimaryPart then
		return model.PrimaryPart
	end
	return model:FindFirstChildWhichIsA("BasePart", true)
end
local function syncPosition(part: any)
	part.Position = part.CFrame.Position
end
Sim.syncPosition = syncPosition
roblox.implementMethod("Model", "GetPivot", function(model)
	local part = firstPart(model)
	return if part then part.CFrame else CFrame.new()
end)
roblox.implementMethod("Model", "PivotTo", function(model, target)
	local part = firstPart(model)
	if not part then
		return
	end
	local delta = target * part.CFrame:Inverse()
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CFrame = delta * d.CFrame
			syncPosition(d)
		end
	end
end)
roblox.implementMethod("BasePart", "PivotTo", function(part, target)
	part.CFrame = target
	syncPosition(part)
end)
roblox.implementMethod("BasePart", "GetPivot", function(part)
	return part.CFrame
end)

----------------------------------------------------------------------------------
-- DataStores (with JSON checks and optional failures)
----------------------------------------------------------------------------------

Sim.stores = {} :: { [string]: { [string]: any } }
Sim.ordered = {} :: { [string]: { [string]: number } }
Sim.dataStoreCalls = 0

local function dsCall()
	Sim.dataStoreCalls += 1
	if Sim.dataStoreDelay > 0 then
		Scheduler.task.wait(Sim.dataStoreDelay)
	end
	if Sim.dataStoreError then
		error(Sim.dataStoreError, 3)
	end
end

local function checkJson(value: any, where: string)
	local ok, err = pcall(serde.encode, "json", value)
	if not ok then
		error(`{where}: value is not JSON-safe: {err}`, 3)
	end
	-- Roblox also rejects mixed tables (array + dictionary) and non-string dictionary keys.
	local function walk(v: any, path: string)
		if type(v) ~= "table" then
			if type(v) == "number" and (v ~= v or v == math.huge or v == -math.huge) then
				error(`{where}: bad number at {path}`, 4)
			end
			assert(type(v) ~= "userdata" and type(v) ~= "function", `{where}: unsaveable value at {path}`)
			return
		end
		local hasArray, hasDict = false, false
		for k, child in v do
			if type(k) == "number" then
				hasArray = true
			elseif type(k) == "string" then
				hasDict = true
			else
				error(`{where}: bad key type at {path}`, 4)
			end
			walk(child, path .. "." .. tostring(k))
		end
		if hasArray and hasDict then
			error(`{where}: mixed table at {path}`, 4)
		end
	end
	walk(value, "root")
end

local function makeStore(name: string)
	Sim.stores[name] = Sim.stores[name] or {}
	local data = Sim.stores[name]
	local store = {}
	function store:GetAsync(key: string)
		dsCall()
		return copy(data[key])
	end
	function store:SetAsync(key: string, value: any)
		dsCall()
		checkJson(value, name .. "/" .. key)
		data[key] = copy(value)
	end
	function store:UpdateAsync(key: string, transform: (any, any) -> any)
		dsCall()
		local result = transform(copy(data[key]), nil)
		if result == nil then
			return nil
		end
		checkJson(result, name .. "/" .. key)
		data[key] = copy(result)
		return copy(result)
	end
	function store:RemoveAsync(key: string)
		dsCall()
		local old = data[key]
		data[key] = nil
		return old
	end
	return store
end

local function makeOrdered(name: string)
	Sim.ordered[name] = Sim.ordered[name] or {}
	local data = Sim.ordered[name]
	local store = {}
	function store:SetAsync(key: string, value: number)
		dsCall()
		assert(type(value) == "number" and value == math.floor(value), "OrderedDataStore values must be whole numbers")
		data[key] = value
	end
	function store:GetSortedAsync(ascending: boolean, pageSize: number)
		dsCall()
		local entries = {}
		for key, value in data do
			table.insert(entries, { key = key, value = value })
		end
		table.sort(entries, function(a, b)
			if ascending then
				return a.value < b.value
			end
			return a.value > b.value
		end)
		local page = {}
		for i = 1, math.min(pageSize, #entries) do
			page[i] = entries[i]
		end
		return {
			IsFinished = true,
			GetCurrentPage = function()
				return page
			end,
		}
	end
	return store
end

roblox.implementMethod("DataStoreService", "GetDataStore", function(_, name: string)
	return makeStore(name)
end)
roblox.implementMethod("DataStoreService", "GetOrderedDataStore", function(_, name: string)
	return makeOrdered(name)
end)

----------------------------------------------------------------------------------
-- Network
----------------------------------------------------------------------------------

local callbacks: { [string]: any } = {}
roblox.implementProperty("RemoteFunction", "OnServerInvoke", function(remote)
	return callbacks[remote:GetDebugId()]
end, function(remote, fn)
	callbacks[remote:GetDebugId()] = fn
end)

roblox.implementMethod("RemoteFunction", "InvokeServer", function(remote, ...: any)
	local caller = Scheduler.owner()
	assert(caller ~= "server", "InvokeServer called from the server")
	local args = copy(table.pack(...))
	local me = coroutine.running()
	Scheduler.task.delay(Sim.latency, function()
		Scheduler.spawnAs("server", function()
			local fn = callbacks[remote:GetDebugId()]
			local result
			if not fn then
				result = table.pack(false, "OnServerInvoke is not set")
			else
				result = table.pack(pcall(fn, caller, table.unpack(args, 1, args.n)))
			end
			Scheduler.task.delay(Sim.latency, function()
				Scheduler.spawnAs(caller, me, copy(result))
			end)
		end)
	end)
	local result = coroutine.yield()
	if not result[1] then
		error("server error: " .. tostring(result[2]), 2)
	end
	return table.unpack(result, 2, result.n)
end)

-- Events fired before a client connects are queued, like on Roblox.
local queued: { [string]: { { any } } } = {}

local function deliver(remote: any, player: any, args: { any })
	local signal = Sim.signal(remote, "OnClientEvent")
	local hasListener = false
	for _, conn in signal.connections do
		if conn.Connected and conn.Owner == player then
			hasListener = true
		end
	end
	if not hasListener then
		local key = remote:GetDebugId() .. "|" .. player:GetDebugId()
		queued[key] = queued[key] or {}
		table.insert(queued[key], args)
		signal.onConnect = function(conn)
			local k = remote:GetDebugId() .. "|" .. conn.Owner:GetDebugId()
			local pending = queued[k]
			if pending then
				queued[k] = nil
				for _, a in pending do
					Scheduler.deferAs(conn.Owner, conn.Fn, table.unpack(a, 1, a.n))
				end
			end
		end
		return
	end
	signal:FireFiltered(function(owner)
		return owner == player
	end, table.unpack(args, 1, args.n))
end

roblox.implementMethod("RemoteEvent", "FireClient", function(remote, player, ...: any)
	local args = copy(table.pack(...))
	Scheduler.task.delay(Sim.latency, function()
		if player.Parent then
			deliver(remote, player, args)
		end
	end)
end)
roblox.implementMethod("RemoteEvent", "FireAllClients", function(remote, ...: any)
	local args = copy(table.pack(...))
	Scheduler.task.delay(Sim.latency, function()
		for _, player in Players:GetPlayers() do
			deliver(remote, player, args)
		end
	end)
end)
roblox.implementMethod("RemoteEvent", "FireServer", function(remote, ...: any)
	local caller = Scheduler.owner()
	local args = copy(table.pack(...))
	Scheduler.task.delay(Sim.latency, function()
		Sim.signal(remote, "OnServerEvent"):FireFiltered(function(owner)
			return owner == "server"
		end, caller, table.unpack(args, 1, args.n))
	end)
end)

----------------------------------------------------------------------------------
-- Players and characters
----------------------------------------------------------------------------------

-- Keyed by debug id: Lune may hand out a fresh userdata for the same Instance.
local dead: { [string]: boolean } = {}
Sim.respawnTime = 5

local function part(parent: any, name: string, size: any, cf: any): any
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Anchored = false
	syncPosition(p)
	p.Parent = parent
	return p
end

function Sim.spawnCharacter(player: any): any
	local old = player.Character
	if old then
		old:Destroy()
	end
	local model = Instance.new("Model")
	model.Name = player.Name
	local spawn = player.RespawnLocation
	local cf = if spawn then spawn.CFrame + Vector3.new(0, 4, 0) else CFrame.new(0, 110, 0)
	local root = part(model, "HumanoidRootPart", Vector3.new(2, 2, 1), cf)
	part(model, "Torso", Vector3.new(2, 2, 1), cf)
	part(model, "Head", Vector3.new(2, 1, 1), cf * CFrame.new(0, 1.5, 0))
	model.PrimaryPart = root
	local humanoid = Instance.new("Humanoid")
	humanoid.MaxHealth = 100
	humanoid.Health = 100
	humanoid.Parent = model
	model.Parent = Workspace
	player.Character = model
	Sim.signal(player, "CharacterAdded"):Fire(model)
	return model
end

function Sim.addPlayer(name: string, userId: number): any
	local player = Instance.new("Player")
	player.Name = name
	player.DisplayName = name
	player.UserId = userId
	local gui = Instance.new("PlayerGui")
	gui.Parent = player
	local scripts = Instance.new("PlayerScripts")
	scripts.Parent = player
	player.Parent = Players
	Sim.signal(Players, "PlayerAdded"):Fire(player)
	-- Client scripts (StarterPlayerScripts are copied into PlayerScripts).
	local starter = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
	local env = Sim.clientEnv(player)
	for _, source in (if starter then starter:GetChildren() else {}) do
		local clone = source:Clone()
		clone.Parent = scripts
		if clone:IsA("LocalScript") then
			Scheduler.deferAs(player, function()
				env.run(clone)
			end)
		end
	end
	Scheduler.task.delay(0.5, function()
		if player.Parent then
			Sim.spawnCharacter(player)
		end
	end)
	return player
end

function Sim.removePlayer(player: any)
	Sim.signal(Players, "PlayerRemoving"):Fire(player)
	Scheduler.run(0.05)
	if player.Character then
		player.Character:Destroy()
	end
	player.Parent = nil
end

-- Per-frame work: fire Heartbeat/RenderStepped, notice deaths, respawn.
local tickCount = 0
Scheduler.onTick(function()
	local runService = game:GetService("RunService")
	local dt = 1 / 20
	Sim.signal(runService, "Heartbeat"):Fire(dt)
	Sim.signal(runService, "RenderStepped"):Fire(dt)
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health <= 0 and not dead[humanoid:GetDebugId()] then
			dead[humanoid:GetDebugId()] = true
			Sim.signal(humanoid, "Died"):Fire()
			Scheduler.task.delay(Sim.respawnTime, function()
				if player.Parent and player.Character == character then
					Sim.spawnCharacter(player)
				end
			end)
		end
	end
	-- Other humanoids (training dummies): checked twice a second.
	tickCount += 1
	if tickCount % 10 == 0 then
		for _, d in Workspace:GetDescendants() do
			if d:IsA("Humanoid") and not dead[d:GetDebugId()] then
				local ok, health = pcall(function()
					return d.Health
				end)
				local owner = d.Parent and Players:FindFirstChild(d.Parent.Name)
				if ok and health <= 0 and not owner then
					dead[d:GetDebugId()] = true
					Sim.signal(d, "Died"):Fire()
				end
			end
		end
	end
end)

function Sim.startServer()
	local script = game:GetService("ServerScriptService"):FindFirstChild("BattleHubServer")
	assert(script, "server script missing")
	Scheduler.spawnAs("server", function()
		serverEnv.run(script)
	end)
end

-- Runs a ProximityPrompt the way the local player would trigger it.
function Sim.triggerPrompt(player: any, prompt: any)
	local service = game:GetService("ProximityPromptService")
	Sim.signal(service, "PromptTriggered"):FireFiltered(function(owner)
		return owner == player
	end, prompt, player)
	Sim.signal(prompt, "Triggered"):FireFiltered(function(owner)
		return owner == "server"
	end, player)
end

-- "Clicks" a GUI button.
function Sim.click(button: any)
	for _, name in { "MouseButton1Down", "MouseButton1Up", "Activated", "MouseButton1Click" } do
		Sim.signal(button, name):Fire()
	end
end

----------------------------------------------------------------------------------
-- UI snapshots (for tools/preview's screen renderer)
----------------------------------------------------------------------------------

local function udim2(u: any): { number }
	return { u.X.Scale, u.X.Offset, u.Y.Scale, u.Y.Offset }
end
local function rgb3(c: any): { number }
	return { c.R, c.G, c.B }
end
local function safe(fn: () -> any): any
	local ok, value = pcall(fn)
	return if ok then value else nil
end

local function dumpObject(obj: any): any
	local node: { [string]: any } = { class = obj.ClassName, name = obj.Name, children = {} }
	if obj:IsA("GuiObject") then
		node.size = udim2(obj.Size)
		node.pos = udim2(obj.Position)
		node.anchor = { obj.AnchorPoint.X, obj.AnchorPoint.Y }
		node.rot = obj.Rotation
		node.bg = rgb3(obj.BackgroundColor3)
		node.bgT = obj.BackgroundTransparency
		node.visible = obj.Visible
		node.z = obj.ZIndex
		node.order = obj.LayoutOrder
		node.clip = safe(function()
			return obj.ClipsDescendants
		end)
		if obj:IsA("TextLabel") or obj:IsA("TextButton") or obj:IsA("TextBox") then
			node.text = obj.Text
			if obj:IsA("TextBox") and obj.Text == "" then
				node.text = obj.PlaceholderText
				node.placeholder = true
			end
			node.color = rgb3(if node.placeholder then obj.PlaceholderColor3 else obj.TextColor3)
			node.textT = obj.TextTransparency
			node.font = obj.FontFace.Family
			node.weight = obj.FontFace.Weight.Name
			node.xa = obj.TextXAlignment.Name
			node.ya = obj.TextYAlignment.Name
			node.wrap = obj.TextWrapped
			node.rich = obj.RichText
		end
	end
	for _, child in obj:GetChildren() do
		local c = child.ClassName
		if c == "UICorner" then
			node.corner = { child.CornerRadius.Scale, child.CornerRadius.Offset }
		elseif c == "UIStroke" then
			node.stroke = {
				color = rgb3(child.Color),
				thickness = child.Thickness,
				t = child.Transparency,
				mode = child.ApplyStrokeMode.Name,
			}
		elseif c == "UIGradient" then
			local keys = {}
			for _, k in child.Color.Keypoints do
				table.insert(keys, { k.Time, k.Value.R, k.Value.G, k.Value.B })
			end
			node.gradient = { keys = keys, rotation = child.Rotation }
		elseif c == "UIScale" then
			node.scale = child.Scale
		elseif c == "UIListLayout" then
			node.list = {
				dir = child.FillDirection.Name,
				pad = { child.Padding.Scale, child.Padding.Offset },
				h = child.HorizontalAlignment.Name,
				v = child.VerticalAlignment.Name,
			}
		elseif c == "UIGridLayout" then
			node.grid = { cell = udim2(child.CellSize), pad = udim2(child.CellPadding) }
		elseif c == "UIPadding" then
			node.padding = {
				child.PaddingTop.Offset,
				child.PaddingBottom.Offset,
				child.PaddingLeft.Offset,
				child.PaddingRight.Offset,
			}
		elseif c == "UITextSizeConstraint" then
			node.maxText = child.MaxTextSize
		elseif child:IsA("GuiObject") then
			table.insert(node.children, dumpObject(child))
		end
	end
	return node
end

-- Writes the player's enabled ScreenGuis to JSON.
function Sim.dumpGui(player: any, path: string)
	local guis = {}
	local playerGui = player:FindFirstChild("PlayerGui")
	for _, gui in playerGui:GetChildren() do
		if gui:IsA("ScreenGui") and gui.Enabled then
			local node = dumpObject(gui)
			node.display = gui.DisplayOrder
			table.insert(guis, node)
		end
	end
	local camera = Workspace.CurrentCamera
	fs.writeFile(
		path,
		serde.encode("json", {
			viewport = { camera.ViewportSize.X, camera.ViewportSize.Y },
			guis = guis,
		})
	)
end

-- Changes the fake screen size (fires the ViewportSize change like Roblox).
function Sim.setViewport(width: number, height: number)
	local camera = Workspace.CurrentCamera
	camera.ViewportSize = Vector2.new(width, height)
	Sim.signal(camera, "Changed:ViewportSize"):Fire()
end

function Sim.shutdown()
	for _, fn in Sim.closeCallbacks or {} do
		Scheduler.spawnAs("server", fn)
	end
	Scheduler.run(30)
end

return Sim
