local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local backRodTemplate = ReplicatedStorage:WaitForChild("fishingrodback")
local GripUtil = require(ReplicatedStorage:WaitForChild("GripUtil"))
local BACK_OFFSET = CFrame.new(0, 0.05, 0.55) * CFrame.Angles(math.rad(65), math.rad(25), 0)

local function getTorso(character)
	return character:FindFirstChild("UpperTorso") or character:FindFirstChild("Torso")
end

local function setBackRodVisible(backRod, visible)
	for _, child in backRod:GetDescendants() do
		if child:IsA("BasePart") then
			local original = child:GetAttribute("OriginalTransparency")
			if original == nil then
				original = child.Transparency
				child:SetAttribute("OriginalTransparency", original)
			end
			child.Transparency = visible and original or 1
		end
	end
end

local function weldBackRod(character, backRod)
	local torso = getTorso(character)
	local mainPart = backRod.PrimaryPart
	if not torso or not mainPart then
		return
	end

	backRod:PivotTo(torso.CFrame * BACK_OFFSET)

	for _, child in backRod:GetDescendants() do
		if child:IsA("BasePart") then
			child.Anchored = false
			child.CanCollide = false
			child.Massless = true
			if child ~= mainPart then
				local weld = Instance.new("WeldConstraint")
				weld.Part0 = mainPart
				weld.Part1 = child
				weld.Parent = mainPart
			end
		end
	end

	local mainWeld = Instance.new("Weld")
	mainWeld.Name = "BackRodMainWeld"
	mainWeld.Part0 = torso
	mainWeld.Part1 = mainPart
	mainWeld.C0 = torso.CFrame:ToObjectSpace(mainPart.CFrame)
	mainWeld.Parent = torso
end

local function cloneBackRod(character)
	local backRod = Instance.new("Model")
	backRod.Name = "fishingrodback_clone"

	local handlePart
	for _, child in backRodTemplate:GetChildren() do
		if child:IsA("BasePart") then
			local clone = child:Clone()
			clone.Parent = backRod
			if not handlePart then
				handlePart = clone
			end
		end
	end

	backRod.PrimaryPart = handlePart
	backRod.Parent = character
	weldBackRod(character, backRod)
	setBackRodVisible(backRod, true)
	return backRod
end

local function setupCharacter(player, character)
	local backRod = cloneBackRod(character)
	local connectedTools = {}

	local function connectTool(tool)
		if not tool:IsA("Tool") or tool.Name ~= "fishingrod" or connectedTools[tool] then
			return
		end
	connectedTools[tool] = true

		if tool.Grip == CFrame.new() then
			local handle = tool:FindFirstChild("Handle")
			if handle and handle:IsA("BasePart") then
				for _, part in tool:GetDescendants() do
					if part:IsA("BasePart") and part ~= handle then
						part.Anchored = false
						part.CanCollide = false
						part.Massless = true
						if part.AssemblyRootPart ~= handle.AssemblyRootPart then
							local weld = Instance.new("WeldConstraint")
							weld.Part0 = handle
							weld.Part1 = part
							weld.Parent = handle
						end
					end
				end
				tool.Grip = GripUtil.buildGrip(handle, "rod")
			end
		end

		tool.Equipped:Connect(function()
			setBackRodVisible(backRod, false)
		end)
		tool.Unequipped:Connect(function()
			setBackRodVisible(backRod, true)
		end)

		if tool.Parent == character then
			setBackRodVisible(backRod, false)
		end
	end

	local backpack = player:WaitForChild("Backpack")
	for _, child in ipairs(character:GetChildren()) do
		connectTool(child)
	end
	for _, child in ipairs(backpack:GetChildren()) do
		connectTool(child)
	end

	character.ChildAdded:Connect(connectTool)
	backpack.ChildAdded:Connect(function(child)
		connectTool(child)
		if child:IsA("Tool") and child.Name == "fishingrod" then
			setBackRodVisible(backRod, true)
		end
	end)
end

local function onPlayerAdded(player)
	player.CharacterAdded:Connect(function(character)
		setupCharacter(player, character)
	end)
	if player.Character then
		setupCharacter(player, player.Character)
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do
	onPlayerAdded(player)
end