-- RadioService
-- The Radio is a Game Pass (GameplayConfig.Radio.GamePassId), so ownership is
-- Roblox's to remember: we ask MarketplaceService on join, prompt the real
-- purchase sheet from the shop, and hand the tool over when it goes through.
-- Clicking the equipped radio plays or pauses its music for everyone nearby.

local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local ServerStorage = game:GetService("ServerStorage")

local system = game.ReplicatedStorage:WaitForChild("FishingSystem")
local G = require(system.GameplayConfig)
local remote = system:WaitForChild("RadioEvent")
local template = ServerStorage:WaitForChild("RadioTool")

local PASS = G.Radio.GamePassId

local function wire(tool)
	local handle = tool:WaitForChild("Handle")
	local music = handle:WaitForChild("Music")
	local trackIndex = 1
	local function load()
		local track = G.Radio.Tracks[trackIndex]
		if track then music.SoundId = track.SoundId; tool:SetAttribute("NowPlaying", track.Name) end
	end
	load()
	music.Looped = false
	-- click: play; click while playing: the next song; put it away: quiet
	local function play()
		if music.SoundId == "" then load() end
		music:Play()
		tool:SetAttribute("Playing", true)
	end
	local function nextTrack()
		trackIndex = trackIndex % math.max(#G.Radio.Tracks, 1) + 1
		load()
		play()
	end
	tool.Activated:Connect(function()
		if music.IsPlaying then nextTrack() else play() end
	end)
	music.Ended:Connect(function()
		if tool:GetAttribute("Playing") then nextTrack() end
	end)
	tool.Unequipped:Connect(function() music:Pause(); tool:SetAttribute("Playing", false) end)
end

local function give(player)
	local character = player.Character
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then return end
	for _, parent in ipairs({ backpack, character }) do
		if parent and parent:FindFirstChild("Radio") then return end
	end
	local tool = template:Clone()
	tool.Name = "Radio"
	wire(tool)
	tool.Parent = backpack
end

local function refresh(player)
	local owns = false
	if PASS and PASS > 0 then
		local ok, result = pcall(function() return MarketplaceService:UserOwnsGamePassAsync(player.UserId, PASS) end)
		owns = ok and result == true
	end
	player:SetAttribute("OwnsRadio", owns)
	if owns then give(player) end
end

remote.OnServerEvent:Connect(function(player, action)
	if action ~= "Prompt" then return end
	if player:GetAttribute("OwnsRadio") then give(player) return end
	if not PASS or PASS <= 0 then
		remote:FireClient(player, "Error", "The Radio is not on sale yet.")
		return
	end
	pcall(function() MarketplaceService:PromptGamePassPurchase(player, PASS) end)
end)

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
	if passId ~= PASS or not purchased then return end
	player:SetAttribute("OwnsRadio", true)
	give(player)
	remote:FireClient(player, "Purchased", "The Radio is yours. Find it in your backpack.")
end)

local function setup(player)
	player:SetAttribute("OwnsRadio", false)
	player.CharacterAdded:Connect(function()
		task.wait(0.5)
		if player:GetAttribute("OwnsRadio") then give(player) end
	end)
	task.spawn(refresh, player)
end
Players.PlayerAdded:Connect(setup)
for _, p in ipairs(Players:GetPlayers()) do setup(p) end
