--!strict
-- Shows what players have equipped: aura particles on their character and a
-- title + level tag over their head. Also keeps the lobby's Daily Deal display
-- in sync with today's discounted item.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))

local Cosmetics = {}

local TAG_NAME = "HubTag"

local function makeLabel(parent: Instance, name: string, font: Enum.Font, size: UDim2, position: UDim2): TextLabel
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 1
	label.Size = size
	label.Position = position
	label.TextScaled = true
	label.FontFace = Font.fromEnum(font)
	label.TextColor3 = Color3.new(1, 1, 1)
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 1.5
	stroke.Color = Color3.new(0, 0, 0)
	stroke.Parent = label
	label.Parent = parent
	return label
end

local function tagFor(head: BasePart): BillboardGui
	local existing = head:FindFirstChild(TAG_NAME)
	if existing and existing:IsA("BillboardGui") then
		return existing
	end
	local tag = Instance.new("BillboardGui")
	tag.Name = TAG_NAME
	tag.Adornee = head
	tag.Size = UDim2.new(7, 0, 1.5, 0)
	tag.StudsOffset = Vector3.new(0, 3.3, 0)
	tag.MaxDistance = 70
	tag.LightInfluence = 0
	makeLabel(tag, "Title", Enum.Font.Bangers, UDim2.fromScale(1, 0.58), UDim2.fromScale(0, 0))
	makeLabel(tag, "Info", Enum.Font.GothamBlack, UDim2.fromScale(1, 0.38), UDim2.fromScale(0, 0.62))
	tag.Parent = head
	return tag
end

-- Re-applies the aura and head tag for a player's current character.
function Cosmetics.refresh(player: Player)
	local profile = PlayerData.get(player)
	local character = player.Character
	if not profile or not character then
		return
	end
	local root = character:FindFirstChild("HumanoidRootPart")
	local auraId = profile.Equipped.Aura
	if root and root:IsA("BasePart") and root:GetAttribute("HubAuraId") ~= auraId then
		-- only rebuild the particles when the aura actually changes
		root:SetAttribute("HubAuraId", auraId)
		local aura = if auraId ~= "" then Util.find(Config.Auras, auraId) else nil
		Util.applyAura(root, aura, "HubAura")
	end
	local head = character:FindFirstChild("Head")
	if head and head:IsA("BasePart") then
		local tag = tagFor(head)
		local title = Util.find(Config.Titles, profile.Equipped.Title)
		local style = Util.find(Config.Styles, profile.Equipped.Style)
		local titleLabel = tag:FindFirstChild("Title") :: TextLabel
		local info = tag:FindFirstChild("Info") :: TextLabel
		titleLabel.Text = if title then string.upper(title.Name) else ""
		titleLabel.TextColor3 = if title then title.Color else Color3.new(1, 1, 1)
		info.Text = `LV {profile.Level}` .. (if style then " • " .. string.upper(style.Name) else "")
		info.TextColor3 = Color3.fromRGB(255, 215, 90)
	end
end

-- Mirrors the equipped items on the Player as attributes so any of your own
-- scripts (combat, abilities...) can read them: player:GetAttribute("Style").
function Cosmetics.publish(player: Player)
	local profile = PlayerData.get(player)
	if not profile then
		return
	end
	player:SetAttribute("Level", profile.Level)
	player:SetAttribute("Style", profile.Equipped.Style)
	player:SetAttribute("Awakening", profile.Equipped.Awakening)
	player:SetAttribute("Aura", profile.Equipped.Aura)
	player:SetAttribute("Title", profile.Equipped.Title)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then
		local folder = Instance.new("Folder")
		folder.Name = "leaderstats"
		local level = Instance.new("IntValue")
		level.Name = "Level"
		level.Parent = folder
		local kos = Instance.new("IntValue")
		kos.Name = "KOs"
		kos.Parent = folder
		folder.Parent = player
		stats = folder
	end
	assert(stats)
	local level = stats:FindFirstChild("Level")
	if level and level:IsA("IntValue") then
		level.Value = profile.Level
	end
	local kos = stats:FindFirstChild("KOs")
	if kos and kos:IsA("IntValue") then
		kos.Value = profile.Stats.KOs
	end
end

-- Lobby display for today's deal (Showcase > DealFigure).
function Cosmetics.updateDeal(hub: Model)
	local showcase = hub:FindFirstChild("Showcase")
	local figure = showcase and showcase:FindFirstChild("DealFigure")
	local torso = figure and figure:FindFirstChild("Torso")
	if not torso or not torso:IsA("BasePart") then
		return
	end
	local now = Workspace:GetServerTimeNow()
	local deal = Util.dealOfTheDay(now)
	if not deal then
		return
	end
	local name, price, base
	if deal.Kind == "Aura" then
		local aura = Util.find(Config.Auras, deal.Id)
		Util.applyAura(torso, aura, "DealAura")
		name, base = aura and aura.Name, aura and aura.Price
	else
		Util.applyAura(torso, nil, "DealAura")
		local title = Util.find(Config.Titles, deal.Id)
		name, base = title and `"{title.Name}" Title`, title and title.Price
	end
	price = Util.price(deal.Kind, deal.Id, now)
	local plate = torso:FindFirstChild("Plate")
	if plate and name and price and base then
		local title = plate:FindFirstChild("Title")
		local subtitle = plate:FindFirstChild("Subtitle")
		if title and title:IsA("TextLabel") then
			title.Text = string.upper(name)
		end
		if subtitle and subtitle:IsA("TextLabel") then
			subtitle.Text = `ON SALE: ${Util.comma(price)} (was ${Util.comma(base)})`
		end
	end
end

function Cosmetics.start(hub: Model)
	local function watch(player: Player)
		player.CharacterAdded:Connect(function(character)
			character:WaitForChild("HumanoidRootPart", 10)
			character:WaitForChild("Head", 10)
			Cosmetics.refresh(player)
		end)
	end
	for _, player in Players:GetPlayers() do
		watch(player)
	end
	Players.PlayerAdded:Connect(watch)
	PlayerData.onChanged(function(player)
		Cosmetics.publish(player)
		Cosmetics.refresh(player)
	end)
	-- The deal changes at midnight UTC; checking every minute is plenty.
	task.spawn(function()
		while true do
			Cosmetics.updateDeal(hub)
			task.wait(60)
		end
	end)
end

return Cosmetics
