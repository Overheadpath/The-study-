-- Script Sync: server Script
-- Builds the large rod advertisement display when the game starts.
-- Keep the complete stall model named "RodShopStand" in Workspace.

local function findStand()
	for _, item in workspace:GetDescendants() do
		if item:IsA("Model") and item.Name:lower() == "rodshopstand" then
			return item
		end
	end
end

local stand = findStand()
if not stand then
	warn("RodDisplaySpawner: no Model named RodShopStand was found in Workspace.")
	return
end

local previous = stand:FindFirstChild("RodDisplay")
if previous then
	previous:Destroy()
end

local display = Instance.new("Model")
display.Name = "RodDisplay"
display.Parent = stand

local standCF, standSize = stand:GetBoundingBox()
local boardHeight = math.clamp(standSize.Y * 0.67, 4.4, 6.2) * 1.40
local boardWidth = math.clamp(standSize.X * 0.16, 2.05, 2.7) * 1.40
local rodLength = boardHeight * 0.79

local function makePart(parent, name, size, cframe, color, material, shape)
	local item = Instance.new("Part")
	item.Name = name
	item.Anchored = true
	item.CanCollide = false
	item.CanQuery = false
	item.CastShadow = true
	item.Size = size
	item.CFrame = cframe
	item.Color = color
	item.Material = material or Enum.Material.SmoothPlastic
	if shape then item.Shape = shape end
	item.Parent = parent
	return item
end

local function addPlaque(board, title, subtitle, accent)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "PricePlaque"
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 42
	gui.Parent = board

	local name = Instance.new("TextLabel")
	name.BackgroundTransparency = 1
	name.Position = UDim2.fromScale(0.06, 0.08)
	name.Size = UDim2.fromScale(0.88, 0.46)
	name.Font = Enum.Font.GothamBold
	name.Text = title
	name.TextColor3 = accent
	name.TextScaled = true
	name.TextStrokeColor3 = Color3.fromRGB(29, 34, 26)
	name.TextStrokeTransparency = 0.50
	name.Parent = gui

	local detail = Instance.new("TextLabel")
	detail.BackgroundTransparency = 1
	detail.Position = UDim2.fromScale(0.06, 0.55)
	detail.Size = UDim2.fromScale(0.88, 0.28)
	detail.Font = Enum.Font.GothamMedium
	detail.Text = subtitle
	detail.TextColor3 = Color3.fromRGB(244, 235, 201)
	detail.TextScaled = true
	detail.Parent = gui
end

local function makeMount(parent, boardCF, accent)
	local board = makePart(parent, "DisplayBackboard", Vector3.new(boardWidth, boardHeight, 0.16), boardCF, Color3.fromRGB(73, 70, 47), Enum.Material.Wood)
	makePart(parent, "TopTrim", Vector3.new(boardWidth + 0.16, 0.12, 0.24), boardCF * CFrame.new(0, boardHeight / 2, 0), accent, Enum.Material.Wood)
	makePart(parent, "BottomTrim", Vector3.new(boardWidth + 0.16, 0.12, 0.24), boardCF * CFrame.new(0, -boardHeight / 2, 0), accent, Enum.Material.Wood)
	makePart(parent, "LeftTrim", Vector3.new(0.12, boardHeight + 0.16, 0.24), boardCF * CFrame.new(-boardWidth / 2, 0, 0), accent, Enum.Material.Wood)
	makePart(parent, "RightTrim", Vector3.new(0.12, boardHeight + 0.16, 0.24), boardCF * CFrame.new(boardWidth / 2, 0, 0), accent, Enum.Material.Wood)

	for _, y in {-boardHeight * 0.22, boardHeight * 0.27} do
		makePart(parent, "RodRest", Vector3.new(boardWidth * 0.64, 0.12, 0.24), boardCF * CFrame.new(0, y, -0.20), accent, Enum.Material.Metal)
		makePart(parent, "RestCapL", Vector3.new(0.12, 0.30, 0.18), boardCF * CFrame.new(-boardWidth * 0.32, y + 0.10, -0.22), accent, Enum.Material.Metal)
		makePart(parent, "RestCapR", Vector3.new(0.12, 0.30, 0.18), boardCF * CFrame.new(boardWidth * 0.32, y + 0.10, -0.22), accent, Enum.Material.Metal)
	end
	return board
end

local function makeBasicRod(parent, boardCF)
	local rodCF = boardCF * CFrame.new(0, 0, -0.31) * CFrame.Angles(0, 0, math.rad(101))
	local brown = Color3.fromRGB(92, 52, 31)
	local darkBrown = Color3.fromRGB(52, 30, 18)
	local brass = Color3.fromRGB(191, 142, 67)
	local cream = Color3.fromRGB(235, 218, 177)

	makePart(parent, "BasicRodShaft", Vector3.new(rodLength, 0.095, 0.095), rodCF, brown, Enum.Material.Wood, Enum.PartType.Cylinder)
	makePart(parent, "BasicRodGrip", Vector3.new(rodLength * 0.23, 0.16, 0.16), rodCF * CFrame.new(-rodLength * 0.40, 0, 0), darkBrown, Enum.Material.Wood, Enum.PartType.Cylinder)
	makePart(parent, "BasicRodButt", Vector3.new(0.20, 0.22, 0.22), rodCF * CFrame.new(-rodLength * 0.54, 0, 0), brass, Enum.Material.Metal, Enum.PartType.Ball)

	local reelCF = rodCF * CFrame.new(-rodLength * 0.15, -0.20, 0) * CFrame.Angles(0, math.rad(90), 0)
	makePart(parent, "BasicReel", Vector3.new(0.34, 0.34, 0.12), reelCF, brass, Enum.Material.Metal, Enum.PartType.Cylinder)
	makePart(parent, "BasicReelHub", Vector3.new(0.12, 0.12, 0.48), reelCF * CFrame.Angles(0, math.rad(90), 0), darkBrown, Enum.Material.Wood, Enum.PartType.Cylinder)
	for _, at in {-0.10, 0.10, 0.30, 0.47} do
		makePart(parent, "BasicGuide", Vector3.new(0.045, 0.18, 0.18), rodCF * CFrame.new(rodLength * at, 0, 0) * CFrame.Angles(0, math.rad(90), 0), brass, Enum.Material.Metal, Enum.PartType.Cylinder)
	end
	makePart(parent, "BasicLine", Vector3.new(rodLength * 0.38, 0.025, 0.025), rodCF * CFrame.new(rodLength * 0.25, -0.055, -0.015), cream, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder)
end

local function makeNatureRod(parent, boardCF)
	local rodCF = boardCF * CFrame.new(0, 0, -0.31) * CFrame.Angles(0, 0, math.rad(79))
	local deepGreen = Color3.fromRGB(29, 90, 50)
	local leafGreen = Color3.fromRGB(91, 164, 79)
	local moss = Color3.fromRGB(65, 116, 54)
	local gold = Color3.fromRGB(205, 174, 84)
	local glow = Color3.fromRGB(157, 255, 157)

	makePart(parent, "NatureRodShaft", Vector3.new(rodLength, 0.11, 0.11), rodCF, deepGreen, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder)
	makePart(parent, "NatureRodGrip", Vector3.new(rodLength * 0.25, 0.18, 0.18), rodCF * CFrame.new(-rodLength * 0.39, 0, 0), moss, Enum.Material.Wood, Enum.PartType.Cylinder)
	makePart(parent, "NatureRodButt", Vector3.new(0.25, 0.25, 0.25), rodCF * CFrame.new(-rodLength * 0.54, 0, 0), gold, Enum.Material.Metal, Enum.PartType.Ball)

	for _, at in {-0.31, -0.10, 0.12, 0.34} do
		makePart(parent, "NatureBinding", Vector3.new(0.07, 0.17, 0.17), rodCF * CFrame.new(rodLength * at, 0, 0), leafGreen, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder)
	end
	for i, at in ipairs({-0.22, 0.04, 0.27}) do
		local side = i % 2 == 0 and -1 or 1
		local leafCF = rodCF * CFrame.new(rodLength * at, side * 0.17, -0.02) * CFrame.Angles(0, math.rad(28 * side), math.rad(28 * side))
		makePart(parent, "LeafDecoration", Vector3.new(0.35, 0.12, 0.22), leafCF, leafGreen, Enum.Material.Grass, Enum.PartType.Ball)
	end

	local reelCF = rodCF * CFrame.new(-rodLength * 0.14, 0.20, 0) * CFrame.Angles(0, math.rad(90), 0)
	makePart(parent, "NatureReel", Vector3.new(0.36, 0.36, 0.13), reelCF, gold, Enum.Material.Metal, Enum.PartType.Cylinder)
	makePart(parent, "NatureReelHub", Vector3.new(0.13, 0.13, 0.50), reelCF * CFrame.Angles(0, math.rad(90), 0), deepGreen, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder)
	for _, at in {0.03, 0.22, 0.40, 0.50} do
		makePart(parent, "NatureGuide", Vector3.new(0.045, 0.18, 0.18), rodCF * CFrame.new(rodLength * at, 0, 0) * CFrame.Angles(0, math.rad(90), 0), gold, Enum.Material.Metal, Enum.PartType.Cylinder)
	end
	local gem = makePart(parent, "NatureSpiritStone", Vector3.new(0.25, 0.25, 0.25), rodCF * CFrame.new(-rodLength * 0.02, 0.16, -0.02), glow, Enum.Material.Neon, Enum.PartType.Ball)
	local light = Instance.new("PointLight")
	light.Color = glow
	light.Brightness = 0.85
	light.Range = 4
	light.Parent = gem
end

local y = standSize.Y * 0.08 + boardHeight * 0.10
local z = standSize.Z * -0.06
local x = standSize.X * 0.48
local up = standCF.UpVector
local leftPosition = (standCF * CFrame.new(-x, y, z)).Position
local rightPosition = (standCF * CFrame.new(x, y, z)).Position
local leftNormal = (standCF.RightVector + standCF.LookVector * 0.32).Unit
local rightNormal = (-standCF.RightVector + standCF.LookVector * 0.32).Unit
local leftBoardCF = CFrame.lookAt(leftPosition, leftPosition + leftNormal, up) * CFrame.Angles(0, math.rad(-18), 0)
local rightBoardCF = CFrame.lookAt(rightPosition, rightPosition + rightNormal, up) * CFrame.Angles(0, math.rad(18), 0)

local basic = Instance.new("Model")
basic.Name = "BasicRodDisplay"
basic.Parent = display
local basicBoard = makeMount(basic, leftBoardCF, Color3.fromRGB(143, 95, 48))
addPlaque(basicBoard, "BASIC ROD", "A trusty first cast", Color3.fromRGB(248, 220, 145))
makeBasicRod(basic, leftBoardCF)

local nature = Instance.new("Model")
nature.Name = "NaturesRodDisplay"
nature.Parent = display
local natureBoard = makeMount(nature, rightBoardCF, Color3.fromRGB(80, 137, 62))
addPlaque(natureBoard, "NATURE'S ROD", "Blessed by the island", Color3.fromRGB(174, 255, 161))
makeNatureRod(nature, rightBoardCF)

print("RodDisplaySpawner: built Basic Rod and Nature's Rod on " .. stand:GetFullName())
