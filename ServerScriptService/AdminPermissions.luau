-- AdminPermissions
-- THE list of who has admin powers in Fishing Simulator, and the only place that
-- decides it. The admin commands, the admin hat and the developer tools all ask
-- this module; no other script keeps its own list of UserIds.
--
-- It lives in ServerScriptService, so clients can never read or change it, and it
-- goes by numeric UserId (names can be changed, UserIds cannot).
--
--   Developer - every command, including permanent bans, and the developer tools
--   Admin     - moderation: freeze, kick, timed bans, bring/goto, heal, ...
--   Player    - no admin powers at all
--
-- To add someone: put their UserId in the right list below (the name is only a
-- note for you). The game's owner is always a Developer.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local AdminPermissions = {}

AdminPermissions.Levels = { Player = 0, Admin = 1, Developer = 2 }
AdminPermissions.Names = { [0] = "Player", [1] = "Admin", [2] = "Developer" }
local L = AdminPermissions.Levels

AdminPermissions.Developers = {
	-- [123456789] = "SomeDeveloper",
}

AdminPermissions.Admins = {
	-- [123456789] = "SomeModerator",
}

-- In a Studio test everyone is a Developer, so every command can be tried. Set this
-- to "Admin" or "Player" to try the game at that level instead (only in Studio;
-- a live server always uses the lists above).
AdminPermissions.StudioLevel = "Developer"

local cache = {}

local function compute(player)
	if RunService:IsStudio() then
		-- (a server-side attribute, so a client cannot give itself a level)
		local test = player:GetAttribute("AdminTestLevel")
		return L[test] or L[AdminPermissions.StudioLevel] or L.Developer
	end
	if game.CreatorType == Enum.CreatorType.User and player.UserId == game.CreatorId then return L.Developer end
	if AdminPermissions.Developers[player.UserId] then return L.Developer end
	if game.CreatorType == Enum.CreatorType.Group then
		local ok, rank = pcall(function() return player:GetRankInGroup(game.CreatorId) end)
		if ok and type(rank) == "number" and rank >= 255 then return L.Developer end -- the group's owner
		-- (the group could not be asked: not remembered, so the next check asks again)
		if not ok then return AdminPermissions.Admins[player.UserId] and L.Admin or L.Player, true end
	end
	if AdminPermissions.Admins[player.UserId] then return L.Admin end
	return L.Player
end

-- the player's level (0 Player, 1 Admin, 2 Developer)
function AdminPermissions.levelOf(player)
	if typeof(player) ~= "Instance" or not player:IsA("Player") then return L.Player end
	local c = cache[player]
	if c == nil or RunService:IsStudio() then
		local unsure
		c, unsure = compute(player)
		cache[player] = (not unsure) and c or nil
	end
	return c
end

function AdminPermissions.isAdmin(player) return AdminPermissions.levelOf(player) >= L.Admin end
function AdminPermissions.isDeveloper(player) return AdminPermissions.levelOf(player) >= L.Developer end
function AdminPermissions.nameOf(level) return AdminPermissions.Names[level] or "Player" end

Players.PlayerRemoving:Connect(function(p) cache[p] = nil end)

return AdminPermissions
