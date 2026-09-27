--!strict
--[[
	Player progress: level, cash, spins, owned items and stats.

	Saved with DataStores. Each profile is "locked" to the server using it so
	two servers can never overwrite each other (e.g. when someone rejoins fast).
	If DataStores aren't available (Studio without API access, or Roblox is
	having trouble) the player still plays, but nothing is saved that session
	and they are told so.
]]

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))

local STORE_NAME = "BattleHub_Profiles_v1"
local LOCK_STALE = 30 * 60 -- a lock this old belongs to a server that crashed
local LOAD_ATTEMPTS = 6
local RETRY_DELAY = 4
local AUTOSAVE_EVERY = 90
local VERSION = 1

export type ItemSet = { [string]: boolean }

export type Profile = {
	Version: number,
	Level: number,
	XP: number,
	Cash: number,
	Spins: number,
	LuckySpins: number,
	Owned: { Styles: ItemSet, Awakenings: ItemSet, Auras: ItemSet, Titles: ItemSet },
	Equipped: { Style: string, Awakening: string, Aura: string, Title: string },
	Stats: { KOs: number, Wins: number, Matches: number, Deaths: number, PlayTime: number },
	Codes: ItemSet,
	FreeSpinClock: number,
}

-- One of "Styles", "Awakenings", "Auras", "Titles".
export type Kind = string

local PlayerData = {}

local profiles: { [Player]: Profile } = {}
local unsaved: { [Player]: boolean } = {} -- loaded in memory only; never written back
local releasing: { [number]: boolean } = {} -- userIds with a final save still running
local pushQueued: { [Player]: boolean } = {}
local changedCallbacks: { (Player, Profile) -> () } = {}
local loadedCallbacks: { (Player, Profile) -> () } = {}
local savedCallbacks: { (Player, Profile) -> () } = {}

local store: DataStore? = nil
local memoryReason: string? = nil
local jobId = if game.JobId ~= "" then game.JobId else "studio"

local function switchToMemory(reason: string)
	if store then
		warn(`[BattleHub] Saving is turned off: {reason}`)
	end
	store = nil
	memoryReason = reason
end

do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(STORE_NAME)
	end)
	if ok then
		store = result
	else
		switchToMemory(tostring(result))
	end
end

-- Errors that retrying won't fix.
local function isFatal(err: string): boolean
	local e = string.lower(err)
	return string.find(e, "studioaccesstoapisnotallowed", 1, true) ~= nil
		or string.find(e, "publish", 1, true) ~= nil
		or string.find(e, "not allowed", 1, true) ~= nil
		or string.find(e, "403", 1, true) ~= nil
end

----------------------------------------------------------------------------------
-- Defaults and cleaning up whatever comes back from the DataStore
----------------------------------------------------------------------------------

local KIND_LISTS: { [Kind]: { any } } = {
	Styles = Config.Styles,
	Awakenings = Config.Awakenings,
	Auras = Config.Auras,
	Titles = Config.Titles,
}
local ALL_KINDS: { Kind } = { "Styles", "Awakenings", "Auras", "Titles" }

-- The owned-item set for one kind (nil for an unknown kind).
local function ownedSet(p: Profile, kind: Kind): ItemSet?
	return (p.Owned :: any)[kind]
end

local function exists(kind: string, id: string): boolean
	local list = (KIND_LISTS :: any)[kind]
	return list ~= nil and Util.find(list, id) ~= nil
end

function PlayerData.defaults(): Profile
	return {
		Version = VERSION,
		Level = 1,
		XP = 0,
		Cash = Config.StartingCash,
		Spins = Config.StartingSpins,
		LuckySpins = Config.StartingLuckySpins,
		Owned = {
			Styles = { [Config.StartingStyle] = true },
			Awakenings = {},
			Auras = {},
			Titles = { [Config.StartingTitle] = true },
		},
		Equipped = { Style = Config.StartingStyle, Awakening = "", Aura = "", Title = Config.StartingTitle },
		Stats = { KOs = 0, Wins = 0, Matches = 0, Deaths = 0, PlayTime = 0 },
		Codes = {},
		FreeSpinClock = 0,
	}
end

local function whole(v: any, default: number, max: number?): number
	if type(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then
		return default
	end
	return math.clamp(math.floor(v), 0, max or 1e15)
end

local function itemSet(v: any, kind: string?): ItemSet
	local out: ItemSet = {}
	if type(v) == "table" then
		for k, x in v do
			if type(k) == "string" and x == true and (kind == nil or exists(kind, k)) then
				out[k] = true
			end
		end
	end
	return out
end

-- Turns saved data (possibly old, partial or garbage) into a valid profile.
function PlayerData.reconcile(data: any): Profile
	local p = PlayerData.defaults()
	if type(data) ~= "table" then
		return p
	end
	p.Level = math.max(1, whole(data.Level, 1, 100000))
	p.XP = whole(data.XP, 0)
	p.Cash = whole(data.Cash, p.Cash)
	p.Spins = whole(data.Spins, p.Spins)
	p.LuckySpins = whole(data.LuckySpins, p.LuckySpins)
	p.FreeSpinClock = whole(data.FreeSpinClock, 0, Config.FreeLuckySpinEvery)
	local owned = if type(data.Owned) == "table" then data.Owned else {}
	for _, kind in ALL_KINDS do
		local set = itemSet(owned[kind], kind)
		local starting: ItemSet = ownedSet(p, kind) or {}
		for id in starting do
			set[id] = true -- starting items are always owned
		end
		(p.Owned :: any)[kind] = set
	end
	local stats = if type(data.Stats) == "table" then data.Stats else {}
	for key in p.Stats do
		(p.Stats :: any)[key] = whole(stats[key], 0)
	end
	p.Codes = itemSet(data.Codes)
	local eq = if type(data.Equipped) == "table" then data.Equipped else {}
	local function equipped(field: string, kind: Kind, fallback: string): string
		local id = eq[field]
		local set = ownedSet(p, kind)
		if type(id) == "string" and (id == "" and fallback == "" or (set ~= nil and set[id] == true)) then
			return id
		end
		return fallback
	end
	p.Equipped.Style = equipped("Style", "Styles", Config.StartingStyle)
	p.Equipped.Awakening = equipped("Awakening", "Awakenings", "")
	p.Equipped.Aura = equipped("Aura", "Auras", "")
	p.Equipped.Title = equipped("Title", "Titles", Config.StartingTitle)
	-- Level titles you've earned.
	for _, title in Config.Titles do
		if title.UnlockLevel and p.Level >= title.UnlockLevel then
			p.Owned.Titles[title.Id] = true
		end
	end
	return p
end

----------------------------------------------------------------------------------
-- Loading and saving
----------------------------------------------------------------------------------

local function keyFor(userId: number): string
	return "u_" .. userId
end

local function load(player: Player): (Profile?, string?)
	local activeStore = store
	if not activeStore then
		return nil, memoryReason
	end
	local key = keyFor(player.UserId)
	local lastError = "unknown error"
	for attempt = 1, LOAD_ATTEMPTS do
		local locked = false
		local loaded: Profile? = nil
		local ok, err = pcall(function()
			activeStore:UpdateAsync(key, function(old: any)
				locked = false
				local record = if type(old) == "table" then old else {}
				local lock = record.Lock
				local heldElsewhere = type(lock) == "table"
					and lock.Job ~= jobId
					and type(lock.Time) == "number"
					and os.time() - lock.Time < LOCK_STALE
				if heldElsewhere and attempt < LOAD_ATTEMPTS then
					locked = true
					return nil -- another server is still saving; try again shortly
				end
				loaded = PlayerData.reconcile(record.Data)
				return { Data = loaded, Lock = { Job = jobId, Time = os.time() } }
			end)
		end)
		if ok and not locked and loaded then
			return loaded, nil
		end
		if not ok then
			lastError = tostring(err)
			if isFatal(lastError) then
				switchToMemory(lastError)
				return nil, lastError
			end
			warn(`[BattleHub] Loading {player.Name} failed (try {attempt}): {lastError}`)
		else
			lastError = "your data is still in use by another server"
		end
		if player.Parent == nil then
			return nil, "left"
		end
		task.wait(RETRY_DELAY)
	end
	return nil, lastError
end

local function save(player: Player, profile: Profile, release: boolean): boolean
	local activeStore = store
	if not activeStore or unsaved[player] then
		return false
	end
	local ok, err = pcall(function()
		activeStore:UpdateAsync(keyFor(player.UserId), function(old: any)
			local record = if type(old) == "table" then old else {}
			local lock = record.Lock
			if type(lock) == "table" and lock.Job ~= jobId then
				return nil -- another server took over this profile; never overwrite it
			end
			return { Data = profile, Lock = if release then nil else { Job = jobId, Time = os.time() } }
		end)
	end)
	if not ok then
		warn(`[BattleHub] Saving {player.Name} failed: {err}`)
		if isFatal(tostring(err)) then
			switchToMemory(tostring(err))
		end
		return false
	end
	for _, cb in savedCallbacks do
		task.spawn(cb, player, profile)
	end
	return true
end

-- Yields until the player's profile is ready. Returns nil if they left.
function PlayerData.load(player: Player): Profile?
	local waited = 0
	while releasing[player.UserId] and waited < 15 do
		task.wait(0.5) -- they rejoined this server before their last save finished
		waited += 0.5
	end
	local loaded, err = load(player)
	if err == "left" or player.Parent == nil then
		return nil
	end
	local profile: Profile
	if loaded then
		profile = loaded
	else
		profile = PlayerData.defaults()
		unsaved[player] = true
		if err and err ~= memoryReason then
			warn(`[BattleHub] Could not load {player.Name}: {err}`)
		end
	end
	profiles[player] = profile
	for _, cb in loadedCallbacks do
		task.spawn(cb, player, profile)
	end
	PlayerData.changed(player)
	return profile
end

function PlayerData.get(player: Player): Profile?
	return profiles[player]
end

-- True when this player's progress is being saved.
function PlayerData.isSaving(player: Player): boolean
	return store ~= nil and profiles[player] ~= nil and not unsaved[player]
end

-- Why saving is off (nil when it's on).
function PlayerData.savingOffReason(player: Player): string?
	if PlayerData.isSaving(player) then
		return nil
	end
	if memoryReason then
		if RunService:IsStudio() then
			return "Saving is off in Studio. Publish the game and turn on Game Settings > Security > Enable Studio Access to API Services."
		end
		return "Saving is unavailable right now. Your progress this session won't be saved."
	end
	return "Your data didn't load, so progress this session won't be saved. Rejoin to try again."
end

function PlayerData.release(player: Player)
	local profile = profiles[player]
	if not profile then
		return
	end
	releasing[player.UserId] = true
	save(player, profile, true)
	releasing[player.UserId] = nil
	profiles[player] = nil
	unsaved[player] = nil
	pushQueued[player] = nil
end

function PlayerData.saveNow(player: Player): boolean
	local profile = profiles[player]
	return profile ~= nil and save(player, profile, false)
end

----------------------------------------------------------------------------------
-- Change notifications
----------------------------------------------------------------------------------

function PlayerData.onChanged(cb: (Player, Profile) -> ())
	table.insert(changedCallbacks, cb)
end

function PlayerData.onLoaded(cb: (Player, Profile) -> ())
	table.insert(loadedCallbacks, cb)
end

function PlayerData.onSaved(cb: (Player, Profile) -> ())
	table.insert(savedCallbacks, cb)
end

-- Call after changing a profile. Listeners run once per frame at most.
function PlayerData.changed(player: Player)
	if pushQueued[player] then
		return
	end
	pushQueued[player] = true
	task.defer(function()
		pushQueued[player] = nil
		local profile = profiles[player]
		if not profile then
			return
		end
		for _, cb in changedCallbacks do
			cb(player, profile)
		end
	end)
end

-- What the client is allowed to see.
function PlayerData.snapshot(player: Player): { [string]: any }?
	local p = profiles[player]
	if not p then
		return nil
	end
	return {
		Level = p.Level,
		XP = p.XP,
		XPNeeded = Config.XPForLevel(p.Level),
		Cash = p.Cash,
		Spins = p.Spins,
		LuckySpins = p.LuckySpins,
		Owned = p.Owned,
		Equipped = p.Equipped,
		Stats = p.Stats,
		FreeSpinIn = Config.FreeLuckySpinEvery - p.FreeSpinClock,
		Saving = PlayerData.isSaving(player),
	}
end

----------------------------------------------------------------------------------
-- Changing progress (always server side)
----------------------------------------------------------------------------------

function PlayerData.addCash(player: Player, amount: number)
	local p = profiles[player]
	if p and amount ~= 0 then
		p.Cash = math.max(0, p.Cash + math.floor(amount))
		PlayerData.changed(player)
	end
end

-- Takes cash if the player has enough. Returns whether it worked.
function PlayerData.spend(player: Player, amount: number): boolean
	local p = profiles[player]
	if not p or amount < 0 or p.Cash < amount then
		return false
	end
	p.Cash -= amount
	PlayerData.changed(player)
	return true
end

function PlayerData.addSpins(player: Player, amount: number)
	local p = profiles[player]
	if p then
		p.Spins = math.max(0, p.Spins + amount)
		PlayerData.changed(player)
	end
end

function PlayerData.addLuckySpins(player: Player, amount: number)
	local p = profiles[player]
	if p then
		p.LuckySpins = math.max(0, p.LuckySpins + amount)
		PlayerData.changed(player)
	end
end

export type LevelUp = { Level: number, Cash: number, Spins: number, Titles: { string } }

-- Adds XP and handles level ups (rewards and level titles). Returns one entry per new level.
function PlayerData.addXP(player: Player, amount: number): { LevelUp }
	local p = profiles[player]
	local ups: { LevelUp } = {}
	if not p or amount <= 0 then
		return ups
	end
	p.XP += math.floor(amount)
	while p.XP >= Config.XPForLevel(p.Level) do
		p.XP -= Config.XPForLevel(p.Level)
		p.Level += 1
		local reward = Config.Rewards.LevelUp
		p.Cash += reward.Cash
		p.Spins += reward.Spins
		local titles = {}
		for _, title in Config.Titles do
			if title.UnlockLevel == p.Level and not p.Owned.Titles[title.Id] then
				p.Owned.Titles[title.Id] = true
				table.insert(titles, title.Name)
			end
		end
		table.insert(ups, { Level = p.Level, Cash = reward.Cash, Spins = reward.Spins, Titles = titles })
	end
	PlayerData.changed(player)
	return ups
end

function PlayerData.owns(player: Player, kind: Kind, id: string): boolean
	local p = profiles[player]
	local set = p and ownedSet(p, kind)
	return set ~= nil and set[id] == true
end

-- Gives an item. Returns false if it doesn't exist or is already owned.
function PlayerData.grant(player: Player, kind: Kind, id: string): boolean
	local p = profiles[player]
	local set = p and ownedSet(p, kind)
	if not p or not set or not exists(kind, id) or set[id] then
		return false
	end
	set[id] = true
	PlayerData.changed(player)
	return true
end

local EQUIP_FIELD: { [Kind]: string } = { Styles = "Style", Awakenings = "Awakening", Auras = "Aura", Titles = "Title" }

-- Equips an owned item ("" takes off an aura or awakening).
function PlayerData.equip(player: Player, kind: Kind, id: string): boolean
	local p = profiles[player]
	if not p then
		return false
	end
	local canBeEmpty = kind == "Auras" or kind == "Awakenings"
	if id == "" and not canBeEmpty then
		return false
	end
	local set = ownedSet(p, kind)
	if not set or (id ~= "" and not set[id]) then
		return false
	end
	(p.Equipped :: any)[EQUIP_FIELD[kind]] = id
	PlayerData.changed(player)
	return true
end

----------------------------------------------------------------------------------

function PlayerData.start()
	-- Autosave.
	task.spawn(function()
		while true do
			task.wait(AUTOSAVE_EVERY)
			for player, profile in profiles do
				if player.Parent then
					save(player, profile, false)
					task.wait(0.5)
				end
			end
		end
	end)
	-- Save everyone when the server shuts down.
	game:BindToClose(function()
		local pending = 0
		for player in profiles do
			pending += 1
			task.spawn(function()
				PlayerData.release(player)
				pending -= 1
			end)
		end
		local waited = 0
		while pending > 0 and waited < 25 do
			task.wait(0.25)
			waited += 0.25
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		PlayerData.release(player)
	end)
end

return PlayerData
