-- AdminService
-- The admin commands. Everything happens here, on the server:
--
--   a command arrives (typed in chat, or in the admin panel)
--   -> who sent it is known from the server's own side (the chat's TextSource, the
--      remote's player), never from anything the client says about itself
--   -> their level comes from AdminPermissions (UserIds, ServerScriptService)
--   -> the command's own level, the target's rank and the arguments are checked
--   -> only then does anything happen
--
-- A client that fires the remote by hand gets exactly what typing the command gets:
-- nothing, unless the server itself has them as an admin.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")
local TextService = game:GetService("TextService")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")
local MessagingService = game:GetService("MessagingService")

local Perm = require(script.Parent:WaitForChild("AdminPermissions"))
local L = Perm.Levels
local system = ReplicatedStorage:WaitForChild("FishingSystem")

---------------------------------------------------------------- remotes

local function remote(name)
	local r = system:FindFirstChild(name)
	if not (r and r:IsA("RemoteEvent")) then
		r = Instance.new("RemoteEvent")
		r.Name = name
		r.Parent = system
	end
	return r
end
local commandRemote = remote("AdminCommand") -- client -> server: a command line from the admin panel
local adminEvent = remote("AdminEvent") -- server -> client: results, the command list, announcements

---------------------------------------------------------------- limits

local SPEED_MIN, SPEED_MAX = 4, 100
local MAX_LINE = 300
local RATE_WINDOW, RATE_MAX = 10, 12 -- commands per window per admin
local ADMIN_MAX_BAN = 30 * 86400 -- admins may ban for up to 30 days; developers without limit
local KICK_DEFAULT = "You have been kicked by an administrator."

---------------------------------------------------------------- bans

-- a store of their own: player data is never read or written here
local banStore
do
	local ok, store = pcall(function() return DataStoreService:GetDataStore("FishingAdminBans_v1") end)
	if ok then banStore = store end
end
local bans = {} -- [userId] = record (this server's copy; the store is the truth across servers)
local function banKey(userId) return "Ban_" .. tostring(userId) end

local storeOff = false -- DataStores refused outright (Studio with API access off): stop asking
local function storeCall(fn)
	if not banStore or storeOff then return false, "no DataStore" end
	local lastErr
	for attempt = 1, 3 do
		local ok, res = pcall(fn)
		if ok then return true, res end
		lastErr = tostring(res)
		if lastErr:find("StudioAccessToApisNotAllowed") or lastErr:find("not allowed") then storeOff = true break end
		task.wait(attempt)
	end
	return false, lastErr
end

local function banActive(rec)
	return type(rec) == "table" and (rec.permanent == true or (type(rec.expires) == "number" and rec.expires > os.time()))
end

local function formatLeft(seconds)
	if seconds >= 86400 then local d = math.floor(seconds / 86400 + 0.5) return d .. (d == 1 and " day" or " days") end
	if seconds >= 3600 then local h = math.floor(seconds / 3600 + 0.5) return h .. (h == 1 and " hour" or " hours") end
	local m = math.max(1, math.floor(seconds / 60 + 0.5))
	return m .. (m == 1 and " minute" or " minutes")
end

local function banMessage(rec)
	local how = rec.permanent and "permanently" or ("for " .. formatLeft(rec.expires - os.time()))
	local text = "You are banned from Fishing Simulator " .. how .. "."
	if rec.reason and rec.reason ~= "" then text ..= "\nReason: " .. rec.reason end
	return text
end

-- is this user banned? (this server first, then the store). Returns rec, readOk.
local function lookupBan(userId)
	local rec = bans[userId]
	local readOk = true
	if rec == nil then
		local ok, res = storeCall(function() return banStore:GetAsync(banKey(userId)) end)
		readOk = ok
		if ok then
			rec = (type(res) == "table" and res.banned ~= false) and res or false
			bans[userId] = rec
		end
	end
	if rec and not banActive(rec) then return nil, readOk end -- served its time
	return rec or nil, readOk
end

-- writes merge into what is there (never a blind overwrite), and tag the user for data requests
local pendingWrites = 0
local function saveBan(userId, change)
	pendingWrites += 1
	local ok = storeCall(function()
		return banStore:UpdateAsync(banKey(userId), function(old)
			local rec = type(old) == "table" and old or {}
			for k, v in pairs(change) do rec[k] = v end
			rec.v = 1
			return rec, { userId }
		end)
	end)
	pendingWrites -= 1
	return ok
end
game:BindToClose(function()
	local t0 = os.clock()
	while pendingWrites > 0 and os.clock() - t0 < 15 do task.wait(0.25) end
end)

-- a ban made in one server kicks the player out of any other server at once
local BAN_TOPIC = "FishingAdminBan"

local function checkBan(player)
	local rec, readOk = lookupBan(player.UserId)
	if rec and player.Parent then player:Kick(banMessage(rec)) return end
	-- the list could not be read: let them in (an outage must never lock everyone out)
	-- and look again in the background for a few minutes
	if not readOk and not storeOff then
		task.spawn(function()
			for _ = 1, 6 do
				task.wait(30)
				if not player.Parent then return end
				local r, ok = lookupBan(player.UserId)
				if r then player:Kick(banMessage(r)) return end
				if ok then return end
			end
		end)
	end
end
Players.PlayerAdded:Connect(checkBan)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(checkBan, p) end

-- (subscribing waits on the network: never hold up the rest of this script for it)
task.spawn(function()
	pcall(function()
		MessagingService:SubscribeAsync(BAN_TOPIC, function(message)
			local data = message.Data
			if type(data) ~= "table" or type(data.userId) ~= "number" then return end
			bans[data.userId] = nil -- read it fresh
			local p = Players:GetPlayerByUserId(data.userId)
			if p then
				local rec = lookupBan(data.userId)
				if rec then p:Kick(banMessage(rec)) end
			end
		end)
	end)
end)

---------------------------------------------------------------- text

-- anything an admin writes that others will read goes through Roblox's filter
local function filterFor(fromPlayer, text, toPlayer)
	local ok, res = pcall(function()
		local r = TextService:FilterStringAsync(text, fromPlayer.UserId, Enum.TextFilterContext.PublicChat)
		if toPlayer then return r:GetNonChatStringForUserAsync(toPlayer.UserId) end
		return r:GetNonChatStringForBroadcastAsync()
	end)
	if ok and type(res) == "string" then return res end
	return nil
end

---------------------------------------------------------------- players

local function inCutscene(p)
	return p:GetAttribute("IntroState") == "Playing" or p:GetAttribute("IntroParked") == true
end

local function rootOf(p)
	local c = p.Character
	local h = c and c:FindFirstChildOfClass("Humanoid")
	local r = c and c:FindFirstChild("HumanoidRootPart")
	if h and r and h.Health > 0 then return r, h, c end
	return nil
end

-- out of any seat (a boat) before being moved or held
local function unseat(humanoid)
	if humanoid and humanoid.SeatPart then
		local weld = humanoid.SeatPart:FindFirstChild("SeatWeld")
		humanoid.Sit = false
		if weld then weld:Destroy() end
	end
end

-- moves a player the way the game's own travel and rescue do: tools away, out of any
-- seat, the destination streamed in, then set down still
local function relocate(p, humanoid, cf)
	pcall(function() humanoid:UnequipTools() end)
	unseat(humanoid)
	pcall(function() p:RequestStreamAroundAsync(cf.Position, 3) end)
	local c = p.Character
	if not c then return end
	c:PivotTo(cf)
	for _, part in ipairs(c:GetDescendants()) do
		if part:IsA("BasePart") then part.AssemblyLinearVelocity = Vector3.zero part.AssemblyAngularVelocity = Vector3.zero end
	end
end

-- may the actor use a command on this player? (never on someone of their own rank or above, except themselves)
local function isOwner(p) return game.CreatorType == Enum.CreatorType.User and p.UserId == game.CreatorId and p.UserId > 0 end
local function canTarget(actor, target)
	if actor == target then return true end
	if isOwner(target) then return false end
	return Perm.levelOf(actor) > Perm.levelOf(target)
end

-- "all", "me", "others", or a name (username or display name, a unique start of one is
-- enough unless exactOnly). "@Name" means that username exactly, even "@All".
local function findPlayers(actor, word, allowMany, exactOnly)
	if not word or word == "" then return nil, "Say which player." end
	local forced = word:sub(1, 1) == "@" and #word > 1
	if forced then word = word:sub(2) end
	local w = word:lower()
	if forced then
		for _, p in ipairs(Players:GetPlayers()) do
			if p.Name:lower() == w then return { p } end
		end
		return nil, "No player in this server has the username \"" .. word .. "\"."
	end
	if w == "me" then return { actor } end
	if w == "all" or w == "everyone" or w == "others" then
		if not allowMany then return nil, "This command takes one player, not \"" .. word .. "\"." end
		local list = {}
		for _, p in ipairs(Players:GetPlayers()) do
			if w ~= "others" or p ~= actor then table.insert(list, p) end
		end
		return list, nil, true
	end
	local byName, exact, starts = {}, {}, {}
	for _, p in ipairs(Players:GetPlayers()) do
		local n, d = p.Name:lower(), p.DisplayName:lower()
		if n == w then table.insert(byName, p)
		elseif d == w then table.insert(exact, p)
		elseif n:sub(1, #w) == w or d:sub(1, #w) == w then table.insert(starts, p) end
	end
	local found = #byName > 0 and byName or #exact > 0 and exact or starts
	if exactOnly and found == starts and #starts > 0 then
		local names = {}
		for _, p in ipairs(starts) do table.insert(names, p.Name) end
		return nil, "Did you mean " .. table.concat(names, ", ") .. "? This command needs the exact name."
	end
	if #found == 0 then return nil, "No player in this server matches \"" .. word .. "\"." end
	if #found > 1 then
		local names = {}
		for _, p in ipairs(found) do table.insert(names, p.Name) end
		return nil, "\"" .. word .. "\" matches more than one player: " .. table.concat(names, ", ") .. "."
	end
	return found
end

-- a user id for a name, whether or not they are in this server (for bans). Only an
-- exact name counts here: a ban must never land on someone whose name merely starts
-- the same way, or on a stranger when the name is ambiguous.
-- "@Name" skips everything but the exact username (for someone not in this server whose
-- username is another player's display name here).
local function findUser(actor, word)
	if not word then return nil end
	local forced = word:sub(1, 1) == "@" and #word > 1
	if forced then word = word:sub(2) end
	local w = word:lower()
	if not forced then
		if w == "me" then return actor.UserId, actor.Name, actor end
		if w == "all" or w == "everyone" or w == "others" then return nil, "This command takes one player, not \"" .. word .. "\"." end
	end
	local byDisplay, starts = {}, {}
	for _, p in ipairs(Players:GetPlayers()) do
		if p.Name:lower() == w then return p.UserId, p.Name, p end
		if not forced then
			if p.DisplayName:lower() == w then table.insert(byDisplay, p)
			elseif p.Name:lower():sub(1, #w) == w or p.DisplayName:lower():sub(1, #w) == w then table.insert(starts, p) end
		end
	end
	if not forced then
		-- chat shows display names, so the player here with that name is the one meant
		if #byDisplay == 1 then return byDisplay[1].UserId, byDisplay[1].Name, byDisplay[1] end
		if #byDisplay > 1 then return nil, "More than one player here is called \"" .. word .. "\"; use their username." end
		if #starts > 0 then
			local names = {}
			for _, p in ipairs(starts) do table.insert(names, p.Name) end
			return nil, "Did you mean " .. table.concat(names, ", ") .. "? Use the exact username, or @" .. word .. " for someone who is not in this server."
		end
	end
	if not word:match("^[%w_]+$") then return nil end
	local ok, id = pcall(function() return Players:GetUserIdFromNameAsync(word) end)
	if ok and type(id) == "number" and id > 0 then
		local here = Players:GetPlayerByUserId(id)
		return id, here and here.Name or word, here
	end
	return nil
end

---------------------------------------------------------------- state that outlives a respawn

local frozen = {} -- [userId] = true
local anchoredByUs = setmetatable({}, { __mode = "k" }) -- [character] = true

local function applyFreeze(p)
	local root, humanoid, character = rootOf(p)
	if not root then return end
	unseat(humanoid)
	root.AssemblyLinearVelocity = Vector3.zero
	if not root.Anchored then
		root.Anchored = true
		anchoredByUs[character] = true
	end
	p:SetAttribute("AdminFrozen", true)
end
local function releaseFreeze(p)
	p:SetAttribute("AdminFrozen", nil)
	local c = p.Character
	local root = c and c:FindFirstChild("HumanoidRootPart")
	if root and anchoredByUs[c] then
		anchoredByUs[c] = nil
		-- (never let go of a root something else is holding: the opening cutscene parks players)
		if not inCutscene(p) then root.Anchored = false end
	end
end

local function onCharacter(p, character)
	-- flying ends with a respawn; a freeze and a changed speed do not
	p:SetAttribute("AdminFly", nil)
	if frozen[p.UserId] then
		character:WaitForChild("HumanoidRootPart", 10)
		task.wait(0.2)
		if frozen[p.UserId] and p.Character == character then applyFreeze(p) end
	end
end

---------------------------------------------------------------- the commands

-- each: name, minimum level, usage, what it does, argument pattern, run(ctx) -> ok, message
-- argument kinds: "players" (a player, all, me), "player", "user" (also offline, for bans),
-- "word", "rest" (everything left, for reasons and messages)
local COMMANDS = {}
local function command(def) table.insert(COMMANDS, def) COMMANDS[def.name] = def end

local function many(ctx, list, verb, fn)
	local done, skipped, busy = {}, 0, 0
	for _, p in ipairs(list) do
		if not canTarget(ctx.actor, p) then skipped += 1
		elseif ctx.def.cutsceneSafe ~= true and inCutscene(p) and p ~= ctx.actor then busy += 1
		elseif fn(p) ~= false then table.insert(done, p.Name) end
	end
	if #done == 0 then
		if busy > 0 and skipped == 0 and #list == 1 then return false, list[1].Name .. " is watching the opening cutscene; try again in a minute." end
		if skipped > 0 and #list == 1 then return false, "You cannot use that on " .. list[1].Name .. " (their rank is the same as yours or higher)." end
		return false, "Nobody was " .. verb .. "."
	end
	local text = (#done == 1 and done[1] or (#done .. " players")) .. " " .. verb .. "."
	if skipped > 0 then text ..= " Skipped " .. skipped .. " of your rank or higher." end
	if busy > 0 then text ..= " Skipped " .. busy .. " in the opening cutscene." end
	return true, text
end

command({ name = "freeze", level = L.Admin, allNotSelf = true, usage = "/freeze <player | all>", desc = "Hold a player in place (lasts through a respawn).",
	args = { "players" }, run = function(ctx)
		return many(ctx, ctx.players, "frozen", function(p) frozen[p.UserId] = true applyFreeze(p) end)
	end })
command({ name = "unfreeze", level = L.Admin, usage = "/unfreeze <player | all>", desc = "Let a frozen player move again.",
	args = { "players" }, cutsceneSafe = true, run = function(ctx)
		return many(ctx, ctx.players, "unfrozen", function(p) frozen[p.UserId] = nil releaseFreeze(p) end)
	end })
command({ name = "fly", level = L.Admin, usage = "/fly", desc = "Fly: Space to rise, Q to sink, Shift for speed.",
	args = {}, run = function(ctx)
		if not rootOf(ctx.actor) then return false, "Wait until you have respawned." end
		if inCutscene(ctx.actor) then return false, "Wait until the opening cutscene has finished." end
		if frozen[ctx.actor.UserId] then return false, "You are frozen." end
		local _, h = rootOf(ctx.actor)
		unseat(h)
		ctx.actor:SetAttribute("AdminFly", true)
		return true, "Flying. Type /unfly to land."
	end })
command({ name = "unfly", level = L.Admin, usage = "/unfly", desc = "Stop flying.",
	args = {}, run = function(ctx)
		ctx.actor:SetAttribute("AdminFly", nil)
		return true, "Landed."
	end })
command({ name = "speed", level = L.Admin, usage = "/speed <" .. SPEED_MIN .. "-" .. SPEED_MAX .. " | reset>", desc = "Your own walking speed (normal is 20).",
	args = { "word" }, run = function(ctx)
		local w = ctx.words[1]
		if w == nil then return false, "Usage: /speed <" .. SPEED_MIN .. "-" .. SPEED_MAX .. "> or /speed reset" end
		if w:lower() == "reset" then
			ctx.actor:SetAttribute("AdminSpeed", nil)
			return true, "Speed back to normal."
		end
		local n = tonumber(w)
		if not n or n ~= n or n == math.huge or n == -math.huge then return false, "\"" .. w .. "\" is not a number." end
		n = math.floor(n + 0.5)
		if n < SPEED_MIN or n > SPEED_MAX then return false, "Speed must be between " .. SPEED_MIN .. " and " .. SPEED_MAX .. "." end
		ctx.actor:SetAttribute("AdminSpeed", n)
		return true, "Speed set to " .. n .. "."
	end })
command({ name = "kill", level = L.Admin, allNotSelf = true, usage = "/kill <player | all>", desc = "Knock a player out; they respawn.",
	args = { "players" }, run = function(ctx)
		return many(ctx, ctx.players, "knocked out", function(p)
			local _, h = rootOf(p)
			if not h then return false end
			h.Health = 0
		end)
	end })
command({ name = "heal", level = L.Admin, usage = "/heal <player | all>", desc = "Restore a player's health.",
	args = { "players" }, cutsceneSafe = true, run = function(ctx)
		return many(ctx, ctx.players, "healed", function(p)
			local _, h = rootOf(p)
			if not h then return false end
			h.Health = h.MaxHealth
		end)
	end })
command({ name = "respawn", level = L.Admin, allNotSelf = true, usage = "/respawn <player | all>", desc = "Respawn a player at the spawn.",
	args = { "players" }, run = function(ctx)
		return many(ctx, ctx.players, "respawned", function(p) task.spawn(function() p:LoadCharacter() end) end)
	end })
command({ name = "bring", level = L.Admin, usage = "/bring <player | all>", desc = "Bring a player to you.",
	args = { "players" }, run = function(ctx)
		local myRoot = rootOf(ctx.actor)
		if not myRoot then return false, "Wait until you have respawned." end
		local i = 0
		return many(ctx, ctx.players, "brought to you", function(p)
			if p == ctx.actor then return false end
			local root, h = rootOf(p)
			if not root then return false end
			i += 1
			-- a ring round the admin, a few studs out
			local a = i * 2.39996
			relocate(p, h, myRoot.CFrame * CFrame.new(math.cos(a) * 4, 0.5, math.sin(a) * 4 - 1))
		end)
	end })
command({ name = "goto", level = L.Admin, usage = "/goto <player>", desc = "Go to a player.",
	args = { "player" }, cutsceneSafe = true, run = function(ctx)
		local target = ctx.players[1]
		if target == ctx.actor then return false, "You are already here." end
		if inCutscene(target) then return false, target.Name .. " is watching the opening cutscene." end
		local root = rootOf(target)
		local myRoot, myHum = rootOf(ctx.actor)
		if not root or not myRoot then return false, "One of you has not respawned yet." end
		relocate(ctx.actor, myHum, root.CFrame * CFrame.new(0, 0.5, 4))
		return true, "Went to " .. target.Name .. "."
	end })
command({ name = "kick", level = L.Admin, exactOnly = true, usage = "/kick <player> [reason]", desc = "Remove a player from this server.",
	args = { "player", "rest" }, run = function(ctx)
		local target = ctx.players[1]
		if target == ctx.actor then return false, "You cannot kick yourself." end
		if not canTarget(ctx.actor, target) then return false, "You cannot kick " .. target.Name .. " (their rank is the same as yours or higher)." end
		local text = KICK_DEFAULT
		if ctx.rest ~= "" then
			local clean = filterFor(ctx.actor, ctx.rest, target)
			if not clean then return false, "The reason could not be checked by the text filter; try again." end
			text ..= "\nReason: " .. clean
		end
		target:Kick(text)
		return true, "Kicked " .. target.Name .. "."
	end })

-- 10m, 1h, 1d, 7d, 30d, 2w or permanent -> seconds (0 = permanent)
local UNITS = { s = 1, m = 60, h = 3600, d = 86400, w = 604800 }
local function parseDuration(word)
	if not word then return nil end
	local w = word:lower()
	if w == "perm" or w == "permanent" or w == "forever" then return 0 end
	local n, unit = w:match("^(%d+)([smhdw])$")
	n = tonumber(n)
	if not n or n <= 0 then return nil end
	local secs = n * UNITS[unit]
	if secs < 60 or secs > 10 * 365 * 86400 then return nil end
	return secs
end

command({ name = "ban", level = L.Admin, usage = "/ban <player | @username> <time> [reason]",
	desc = "Time: 10m, 1h, 1d, 7d, 30d or permanent.",
	args = { "user", "word", "rest" }, run = function(ctx)
		local userId, name, online = ctx.userId, ctx.userName, ctx.online
		local secs = parseDuration(ctx.words[1])
		if secs == nil then return false, "How long? Use 10m, 1h, 1d, 7d, 30d or permanent." end
		if userId == ctx.actor.UserId then return false, "You cannot ban yourself." end
		if online and not canTarget(ctx.actor, online) then return false, "You cannot ban " .. name .. " (their rank is the same as yours or higher)." end
		if Perm.Developers[userId] or Perm.Admins[userId] then
			if Perm.levelOf(ctx.actor) < L.Developer or Perm.Developers[userId] then return false, "You cannot ban a member of the team." end
		end
		local level = Perm.levelOf(ctx.actor)
		if level < L.Developer and (secs == 0 or secs > ADMIN_MAX_BAN) then return false, "Admins can ban for up to 30 days; ask a developer for longer." end
		local reason = ""
		if ctx.rest ~= "" then
			reason = filterFor(ctx.actor, ctx.rest, nil)
			if not reason then return false, "The reason could not be checked by the text filter; try again." end
		end
		local rec = { permanent = secs == 0, expires = secs > 0 and os.time() + secs or nil, reason = reason,
			by = ctx.actor.UserId, byName = ctx.actor.Name, name = name, at = os.time() }
		if userId == game.CreatorId and game.CreatorType == Enum.CreatorType.User then return false, "You cannot ban the game's owner." end
		if level < L.Developer then
			local cur = lookupBan(userId)
			if cur and (cur.permanent or (cur.expires or 0) > rec.expires) then
				return false, name .. " already has a longer ban; only a developer can shorten it."
			end
		end
		bans[userId] = rec
		rec.banned = true
		local saved = saveBan(userId, rec)
		if online then online:Kick(banMessage(rec)) end
		if saved then pcall(function() MessagingService:PublishAsync(BAN_TOPIC, { userId = userId }) end) end
		local how = secs == 0 and "permanently" or ("for " .. formatLeft(secs))
		if not saved then return true, "Banned " .. name .. " " .. how .. " in THIS server only: the ban list could not be saved (DataStores are off in Studio or unavailable)." end
		return true, "Banned " .. name .. " " .. how .. "."
	end })
command({ name = "unban", level = L.Admin, usage = "/unban <username | @username>", desc = "Lift a ban (the player can be offline).",
	args = { "user" }, run = function(ctx)
		local userId, name = ctx.userId, ctx.userName
		local rec, readOk = lookupBan(userId)
		if rec and rec.permanent and Perm.levelOf(ctx.actor) < L.Developer then return false, "Only a developer can lift a permanent ban." end
		if not rec and not readOk and not storeOff then return false, "The ban list could not be read just now; try again in a moment." end
		if not rec then return true, name .. " was not banned." end
		bans[userId] = false
		local saved = saveBan(userId, { banned = false, liftedBy = ctx.actor.UserId, liftedAt = os.time() })
		if not saved then return true, "Unbanned " .. name .. " in this server only: the ban list could not be saved." end
		-- (other servers drop their copy and read the lifted record)
		pcall(function() MessagingService:PublishAsync(BAN_TOPIC, { userId = userId }) end)
		return true, "Unbanned " .. name .. "."
	end })
command({ name = "announce", level = L.Admin, usage = "/announce <message>", desc = "A message to everyone in the server.",
	args = { "rest" }, run = function(ctx)
		if ctx.rest == "" then return false, "Usage: /announce <message>" end
		if (utf8.len(ctx.rest) or #ctx.rest) > 200 then return false, "Keep announcements under 200 characters." end
		local clean = filterFor(ctx.actor, ctx.rest, nil)
		if not clean then return false, "The message could not be checked by the text filter; try again." end
		adminEvent:FireAllClients("Announce", { text = clean, from = ctx.actor.DisplayName })
		return true, "Announced."
	end })
command({ name = "hat", level = L.Admin, usage = "/hat", desc = "Take the admin hat off, or put it back on.",
	args = {}, run = function(ctx)
		local off = ctx.actor:GetAttribute("AdminHatOff") == true
		ctx.actor:SetAttribute("AdminHatOff", not off)
		return true, off and "Admin hat on." or "Admin hat off."
	end })
command({ name = "help", level = L.Admin, aliases = { "adminhelp", "ahelp", "commands" }, usage = "/help", desc = "Open this list.",
	args = {}, run = function(ctx)
		ctx.openPanel = true
		return true, nil
	end })

-- the list an admin's panel shows: only what their level may use
local function commandList(player)
	local level = Perm.levelOf(player)
	local list = {}
	for _, def in ipairs(COMMANDS) do
		if level >= def.level then table.insert(list, { name = def.name, usage = def.usage, desc = def.desc }) end
	end
	return { level = level, levelName = Perm.nameOf(level), commands = list }
end

---------------------------------------------------------------- running a line

local recent = {} -- [player] = { times }
local warned = {}

local function reply(player, ok, text, via)
	if text then adminEvent:FireClient(player, "Result", { ok = ok, text = text, chat = via == "chat" }) end
end

local function finish(player, ok, text, via) reply(player, ok, text, via) return ok, text end
local function run(player, line, via)
	if typeof(player) ~= "Instance" or not player:IsA("Player") or not player.Parent then return end
	if type(line) ~= "string" then return end
	local level = Perm.levelOf(player)
	-- (the length first: nothing longer is looked at, so a huge string costs nothing)
	if #line > MAX_LINE * 4 then return end
	if (utf8.len(line) or #line) > MAX_LINE then
		if level >= L.Admin then return finish(player, false, "That line is too long (" .. MAX_LINE .. " characters at most).", via) end
		return
	end
	line = (line:gsub("%c", " ")):match("^%s*(.-)%s*$")
	if line == "" then return end
	if line:sub(1, 1) ~= "/" then line = "/" .. line end

	if level < L.Admin then
		-- a normal player: nothing runs. (Said once to someone who typed a command; a
		-- hand-fired remote just gets ignored, with a note in the server log.)
		if not warned[player] then
			warned[player] = true
			warn(("[Admin] refused %q from %s (%d): not an admin (%s)"):format(line:sub(1, 60), player.Name, player.UserId, via))
		end
		if via == "chat" then reply(player, false, "You do not have permission to use admin commands.", via) end
		return false, "You do not have permission to use admin commands."
	end

	local now = os.clock()
	local times = recent[player] or {}
	recent[player] = times
	while times[1] and now - times[1] > RATE_WINDOW do table.remove(times, 1) end
	if #times >= RATE_MAX then return finish(player, false, "Slow down a little.", via) end
	table.insert(times, now)

	local words = {}
	for w in line:gmatch("%S+") do table.insert(words, w) end
	local name = table.remove(words, 1):sub(2):lower()
	local def = COMMANDS[name]
	if not def then
		for _, d in ipairs(COMMANDS) do
			for _, a in ipairs(d.aliases or {}) do if a == name then def = d end end
		end
	end
	if not def then return finish(player, false, "Unknown command /" .. name .. ". Type /help for the list.", via) end
	if level < def.level then return finish(player, false, "Your rank cannot use /" .. def.name .. ".", via) end

	-- the arguments, in the command's own order; "rest" takes whatever is left, spaces and all
	local ctx = { actor = player, def = def, words = {}, rest = "" }
	local i = 1
	for _, kind in ipairs(def.args) do
		local w = words[i]
		if kind == "players" or kind == "player" then
			local list, err, isAll = findPlayers(player, w, kind == "players", def.exactOnly == true)
			if not list then return finish(player, false, (w and err or ("Usage: " .. def.usage)), via) end
			if isAll and def.allNotSelf then
				-- ("all" means everyone else for the commands that would stop the admin too)
				for k = #list, 1, -1 do if list[k] == player then table.remove(list, k) end end
				if #list == 0 then return finish(player, false, "There is nobody else in the server.", via) end
			end
			ctx.players = list
			i += 1
		elseif kind == "user" then
			if not w then return finish(player, false, "Usage: " .. def.usage, via) end
			local id, uname, online = findUser(player, w)
			if not id then return finish(player, false, uname or ("No Roblox user called \"" .. w .. "\" was found (use their exact username)."), via) end
			ctx.userId, ctx.userName, ctx.online = id, uname, online
			i += 1
		elseif kind == "word" then
			table.insert(ctx.words, w)
			i += 1
		elseif kind == "rest" then
			local restWords = {}
			for k = i, #words do table.insert(restWords, words[k]) end
			ctx.rest = table.concat(restWords, " ")
			i = #words + 1
		end
	end

	local ok, success, message = pcall(def.run, ctx)
	if not ok then
		warn("[Admin] /" .. def.name .. " failed: " .. tostring(success))
		return finish(player, false, "Something went wrong running /" .. def.name .. ".", via)
	end
	print(("[Admin] %s (%s) ran: %s -> %s"):format(player.Name, Perm.nameOf(level), line:sub(1, 120), tostring(message)))
	if ctx.openPanel then adminEvent:FireClient(player, "Commands", commandList(player), true) end
	reply(player, success, message, via)
	return success, message
end

commandRemote.OnServerEvent:Connect(function(player, line) run(player, line, "panel") end)

-- chat: one TextChatCommand per command. Its Triggered event fires here on the
-- server with the sender's TextSource, so who typed it comes from Roblox, not the client.
-- (Roblox's own chat commands keep their names: /help is theirs, admins get the panel from it)
local RESERVED = { help = true, ["?"] = true, e = true, emote = true, t = true, team = true, w = true, whisper = true,
	m = true, mute = true, um = true, unmute = true, clear = true, cls = true, console = true, version = true, v = true, intro = true }
do
	local folder = Instance.new("Folder")
	folder.Name = "FishingAdminCommands"
	for _, def in ipairs(COMMANDS) do
		local names = { def.name }
		for _, a in ipairs(def.aliases or {}) do table.insert(names, a) end
		for _, n in ipairs(names) do
			-- (/help is Roblox's own chat help; the admin client opens the panel on it too)
			if RESERVED[n] then
				if n ~= "help" then warn("[Admin] /" .. n .. " is one of Roblox's own chat commands; it only works from the Admin panel") end
			else
				local c = Instance.new("TextChatCommand")
				c.Name = "Admin_" .. n
				c.PrimaryAlias = "/" .. n
				pcall(function() c.AutocompleteVisible = false end)
				c.Triggered:Connect(function(source, text)
					local p = source and Players:GetPlayerByUserId(source.UserId)
					if p then run(p, text, "chat") end
				end)
				c.Parent = folder
			end
		end
	end
	folder.Parent = TextChatService
	local ok, version = pcall(function() return TextChatService.ChatVersion end)
	if ok and version ~= Enum.ChatVersion.TextChatService then
		warn("[Admin] typed admin commands need TextChatService (ChatVersion is " .. tostring(version) .. "); only the Admin panel works")
	end
end

---------------------------------------------------------------- joining

local function onPlayer(player)
	local level = Perm.levelOf(player)
	player.CharacterAdded:Connect(function(c) onCharacter(player, c) end)
	if player.Character then task.spawn(onCharacter, player, player.Character) end
	-- the opening cutscene parks the character (anchored) and, for a frozen player,
	-- hands it back still held: from then on that hold is the freeze's
	player:GetAttributeChangedSignal("IntroState"):Connect(function()
		if player:GetAttribute("IntroState") ~= "Done" or not frozen[player.UserId] then return end
		local c = player.Character
		if c then anchoredByUs[c] = true end
		applyFreeze(player)
	end)
	if level >= L.Admin then
		task.delay(2, function()
			if player.Parent then adminEvent:FireClient(player, "Commands", commandList(player), false) end
		end)
	end
end
Players.PlayerAdded:Connect(onPlayer)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(onPlayer, p) end
-- the admin client asks for its list when it starts (it may start after the push above)
local asked = {}
Players.PlayerRemoving:Connect(function(p) recent[p] = nil warned[p] = nil asked[p] = nil end)
adminEvent.OnServerEvent:Connect(function(player, kind)
	if os.clock() - (asked[player] or 0) < 2 then return end
	asked[player] = os.clock()
	if kind == "GetCommands" and Perm.isAdmin(player) then
		adminEvent:FireClient(player, "Commands", commandList(player), false)
	end
end)

-- (in Studio only: lets a test run a line as any player, to try the checks without chat)
if RunService:IsStudio() then
	local test = Instance.new("BindableFunction")
	test.Name = "AdminTest"
	test.OnInvoke = function(player, line) return run(player, line, "test") end
	test.Parent = game:GetService("ServerStorage")
end
