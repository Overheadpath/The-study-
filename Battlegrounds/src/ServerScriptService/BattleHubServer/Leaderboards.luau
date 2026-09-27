--!strict
-- Global top-10 boards in the RANKINGS hall (level, wins, KOs) plus the Hall of
-- Fame statue. Uses OrderedDataStores; when those aren't available (Studio
-- without API access) the boards show the players in this server instead.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Util = require(ReplicatedStorage:WaitForChild("BattleHub"):WaitForChild("Util"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local REFRESH_EVERY = 60

type Board = {
	Key: string,
	Store: OrderedDataStore?,
	Score: (PlayerData.Profile) -> number,
	Show: (number) -> string,
}

-- Level boards sort by level first, then XP (both fit in one whole number).
local function levelScore(p: PlayerData.Profile): number
	return p.Level * 1000000 + math.min(p.XP, 999999)
end

local boards: { Board } = {
	{
		Key = "Level",
		Score = levelScore,
		Show = function(v)
			return "LV " .. (v // 1000000)
		end,
	},
	{
		Key = "Wins",
		Score = function(p)
			return p.Stats.Wins
		end,
		Show = function(v)
			return Util.comma(v)
		end,
	},
	{
		Key = "KOs",
		Score = function(p)
			return p.Stats.KOs
		end,
		Show = function(v)
			return Util.comma(v)
		end,
	},
}

local Leaderboards = {}
local nameCache: { [number]: string } = {}
local lastWritten: { [string]: number } = {}

local function nameOf(userId: number): string
	local player = Players:GetPlayerByUserId(userId)
	if player then
		return player.DisplayName
	end
	if nameCache[userId] then
		return nameCache[userId]
	end
	local ok, name = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	local result = if ok and type(name) == "string" then name else "Player"
	nameCache[userId] = result
	return result
end

local function setRow(boardPart: Instance?, index: number, name: string, value: string)
	local gui = boardPart and boardPart:FindFirstChildOfClass("SurfaceGui")
	local rows = gui and gui:FindFirstChild("Rows")
	local row = rows and rows:FindFirstChild("Row" .. index)
	if not row then
		return
	end
	local nameLabel = row:FindFirstChild("Name")
	local valueLabel = row:FindFirstChild("Value")
	if nameLabel and nameLabel:IsA("TextLabel") then
		nameLabel.Text = name
	end
	if valueLabel and valueLabel:IsA("TextLabel") then
		valueLabel.Text = value
	end
end

type Entry = { UserId: number, Value: number }

local function fetch(board: Board): { Entry }?
	local entries: { Entry } = {}
	local ordered = board.Store
	if ordered then
		local ok, pages = pcall(function()
			return ordered:GetSortedAsync(false, 10)
		end)
		if ok and pages then
			local page = pages:GetCurrentPage()
			for _, item in page do
				local userId = tonumber(item.key)
				if userId and type(item.value) == "number" then
					table.insert(entries, { UserId = userId, Value = item.value })
				end
			end
			return entries
		end
		local err = string.lower(tostring(pages))
		local fatal = string.find(err, "studioaccesstoapisnotallowed", 1, true)
			or string.find(err, "publish", 1, true)
			or string.find(err, "not allowed", 1, true)
			or string.find(err, "403", 1, true)
		if not fatal then
			return nil -- a hiccup: keep showing the old rows and try again later
		end
		board.Store = nil -- DataStores are off: show this server's players instead
	end
	for _, player in Players:GetPlayers() do
		local profile = PlayerData.get(player)
		if profile then
			table.insert(entries, { UserId = player.UserId, Value = board.Score(profile) })
		end
	end
	table.sort(entries, function(a, b)
		return a.Value > b.Value
	end)
	return entries
end

function Leaderboards.refresh(hub: Model)
	local hall = hub:FindFirstChild("RankingsHall")
	local folder = hall and hall:FindFirstChild("Boards")
	for _, board in boards do
		local entries = fetch(board)
		if entries then
			local part = folder and folder:FindFirstChild("Board_" .. board.Key)
			for i = 1, 10 do
				local e = entries[i]
				if e then
					setRow(part, i, nameOf(e.UserId), board.Show(e.Value))
				else
					setRow(part, i, "---", "")
				end
			end
			if board.Key == "Level" then
				local showcase = hub:FindFirstChild("Showcase")
				local statue = showcase and showcase:FindFirstChild("HallOfFame")
				local torso = statue and statue:FindFirstChild("Torso")
				local plate = torso and torso:FindFirstChild("Plate")
				local subtitle = plate and plate:FindFirstChild("Subtitle")
				if subtitle and subtitle:IsA("TextLabel") then
					subtitle.Text = if entries[1] then `#1 LEVEL: {nameOf(entries[1].UserId)}` else "#1 LEVEL: ---"
				end
			end
		end
	end
end

-- Writes a player's scores (only the ones that changed since last time).
function Leaderboards.record(player: Player, profile: PlayerData.Profile)
	for _, board in boards do
		local ordered = board.Store
		if ordered then
			local value = board.Score(profile)
			local key = board.Key .. ":" .. player.UserId
			if lastWritten[key] ~= value then
				local ok = pcall(function()
					ordered:SetAsync(tostring(player.UserId), value)
				end)
				if ok then
					lastWritten[key] = value
				end
			end
		end
	end
end

function Leaderboards.start(hub: Model)
	for _, board in boards do
		local ok, store = pcall(function()
			return DataStoreService:GetOrderedDataStore("BattleHub_" .. board.Key)
		end)
		board.Store = if ok then store else nil
	end
	PlayerData.onSaved(function(player, profile)
		if PlayerData.isSaving(player) then
			Leaderboards.record(player, profile)
		end
	end)
	task.spawn(function()
		while true do
			Leaderboards.refresh(hub)
			task.wait(REFRESH_EVERY)
		end
	end)
end

return Leaderboards
