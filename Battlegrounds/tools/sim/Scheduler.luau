--[[
	Virtual-time scheduler for running Roblox scripts inside Lune.

	Provides a `task` library (spawn / defer / delay / wait / cancel) and
	Roblox-style signals. Time only moves when the test calls `run(seconds)`,
	so hours of gameplay take milliseconds and every run is repeatable.

	Every coroutine has an "owner": "server" or a Player instance. Client
	scripts run in threads owned by their player; that's how the fake
	network knows who is calling InvokeServer and what LocalPlayer is.
]]

local Scheduler = {}

Scheduler.now = 0
Scheduler.errors = {} :: { string }
Scheduler.traceErrors = true

type Item = { time: number, seq: number, thread: thread, args: { any }?, n: number }

local queue: { Item } = {}
local seq = 0
local owners: { [thread]: any } = setmetatable({}, { __mode = "k" }) :: any
local cancelled: { [thread]: boolean } = setmetatable({}, { __mode = "k" }) :: any
local tickers: { () -> () } = {}

function Scheduler.owner(): any
	local co = coroutine.running()
	return owners[co] or "server"
end

local function push(time: number, thread: thread, args: { any }?, n: number)
	seq += 1
	table.insert(queue, { time = time, seq = seq, thread = thread, args = args, n = n })
end

local function report(thread: thread, err: any)
	local message = debug.traceback(thread, tostring(err))
	table.insert(Scheduler.errors, message)
	if Scheduler.traceErrors then
		print("\27[31m[script error]\27[0m " .. message)
	end
end

local function resume(thread: thread, ...: any)
	if cancelled[thread] or coroutine.status(thread) == "dead" then
		return
	end
	local ok, err = coroutine.resume(thread, ...)
	if not ok then
		report(thread, err)
	end
end

local function newThread(fn: (...any) -> ...any, owner: any): thread
	local co = coroutine.create(fn)
	owners[co] = owner
	return co
end

function Scheduler.spawnAs(owner: any, fn: any, ...: any): thread
	local co = if type(fn) == "thread" then fn else newThread(fn, owner)
	if type(fn) == "thread" and owners[co] == nil then
		owners[co] = owner
	end
	resume(co, ...)
	return co
end

function Scheduler.deferAs(owner: any, fn: any, ...: any): thread
	local co = if type(fn) == "thread" then fn else newThread(fn, owner)
	push(Scheduler.now, co, table.pack(...), select("#", ...))
	return co
end

-- The `task` library scripts see.
Scheduler.task = {
	spawn = function(fn: any, ...: any): thread
		return Scheduler.spawnAs(Scheduler.owner(), fn, ...)
	end,
	defer = function(fn: any, ...: any): thread
		return Scheduler.deferAs(Scheduler.owner(), fn, ...)
	end,
	delay = function(seconds: number?, fn: any, ...: any): thread
		local co = if type(fn) == "thread" then fn else newThread(fn, Scheduler.owner())
		push(Scheduler.now + math.max(seconds or 0, 0), co, table.pack(...), select("#", ...))
		return co
	end,
	wait = function(seconds: number?): number
		local co = coroutine.running()
		local start = Scheduler.now
		push(Scheduler.now + math.max(seconds or 0, 1 / 60), co, nil, 0)
		coroutine.yield()
		return Scheduler.now - start
	end,
	cancel = function(thread: thread)
		cancelled[thread] = true
	end,
}

-- Called every simulated frame (physics, Heartbeat, RenderStepped...).
function Scheduler.onTick(fn: () -> ())
	table.insert(tickers, fn)
end

local FRAME = 1 / 20
local nextFrame = 0

-- Advances virtual time by `seconds`, running everything that becomes due.
function Scheduler.run(seconds: number)
	local target = Scheduler.now + seconds
	while true do
		local best: number? = nil
		for i, item in queue do
			if
				best == nil
				or item.time < queue[best].time
				or (item.time == queue[best].time and item.seq < queue[best].seq)
			then
				best = i
			end
		end
		local nextTime = if best then queue[best].time else math.huge
		if nextFrame <= target and nextFrame <= nextTime then
			Scheduler.now = math.max(Scheduler.now, nextFrame)
			nextFrame += FRAME
			for _, fn in tickers do
				local ok, err = pcall(fn)
				if not ok then
					table.insert(Scheduler.errors, "[tick] " .. tostring(err))
					print("\27[31m[tick error]\27[0m " .. tostring(err))
				end
			end
		elseif best and nextTime <= target then
			local item = table.remove(queue, best) :: Item
			Scheduler.now = math.max(Scheduler.now, item.time)
			if item.args then
				resume(item.thread, table.unpack(item.args, 1, item.n))
			else
				resume(item.thread)
			end
		else
			break
		end
	end
	Scheduler.now = target
end

----------------------------------------------------------------------------------
-- Signals
----------------------------------------------------------------------------------

export type Connection = { Connected: boolean, Owner: any, Disconnect: (Connection) -> () }

local Signal = {}
Signal.__index = Signal

function Signal.new(name: string?)
	return setmetatable({ Name = name or "Signal", connections = {}, waiting = {} }, Signal)
end

function Signal:Connect(fn: (...any) -> ())
	local conn = { Connected = true, Owner = Scheduler.owner(), Fn = fn }
	function conn:Disconnect()
		self.Connected = false
	end
	table.insert(self.connections, conn)
	if self.onConnect then
		self.onConnect(conn)
	end
	return conn
end

function Signal:Once(fn: (...any) -> ())
	local conn
	conn = self:Connect(function(...)
		conn:Disconnect()
		fn(...)
	end)
	return conn
end

function Signal:Wait(): ...any
	local co = coroutine.running()
	table.insert(self.waiting, co)
	return coroutine.yield()
end

-- Handlers run deferred, like Roblox's default SignalBehavior. `filter`
-- (optional) decides which connection owners receive this firing.
function Signal:FireFiltered(filter: ((any) -> boolean)?, ...: any)
	for _, conn in table.clone(self.connections) do
		if conn.Connected and (filter == nil or filter(conn.Owner)) then
			Scheduler.deferAs(conn.Owner, conn.Fn, ...)
		end
	end
	local waiting = self.waiting
	self.waiting = {}
	for _, co in waiting do
		push(Scheduler.now, co, table.pack(...), select("#", ...))
	end
end

function Signal:Fire(...: any)
	self:FireFiltered(nil, ...)
end

function Signal:HasConnections(): boolean
	for _, conn in self.connections do
		if conn.Connected then
			return true
		end
	end
	return false
end

Scheduler.Signal = Signal

return Scheduler
