-- DesertTravelService
-- Two-way travel between the hub and the desert island. Same pads, same
-- 12-stud reach and 2-second cooldown as the Atlantic gates, but free: there
-- is no unlock on the desert yet. Add one here when it gets a price.

local Players = game:GetService("Players")

local gates = workspace:WaitForChild("maap"):WaitForChild("IslandTravel")
local toDesert = gates:WaitForChild("ToDesert")
local fromDesert = gates:WaitForChild("DesertReturn")

local REACH = 12
local COOLDOWN = 2
local lastTravel = {}

local function readyCharacter(player)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not humanoid or humanoid.Health <= 0 or not root then return end
	return character, humanoid, root
end

local function near(player, gate)
	local _, _, root = readyCharacter(player)
	return root and (root.Position - gate.TravelPad.Position).Magnitude <= REACH
end

local function relocate(player, destination)
	local character, humanoid = readyCharacter(player)
	if not character then return end
	humanoid:UnequipTools()
	humanoid.Sit = false
	character:PivotTo(destination.Arrival.CFrame)
	for _, part in character:GetDescendants() do
		if part:IsA("BasePart") then
			part.AssemblyLinearVelocity = Vector3.zero
			part.AssemblyAngularVelocity = Vector3.zero
		end
	end
	humanoid:ChangeState(Enum.HumanoidStateType.GettingUp)
	character:SetAttribute("IslandTravelAt", workspace:GetServerTimeNow())
end

local function travel(player, source, destination)
	if not near(player, source) then return end
	local now = os.clock()
	if now - (lastTravel[player] or -10) < COOLDOWN then return end
	lastTravel[player] = now
	relocate(player, destination)
end

toDesert.TravelPad.TravelPrompt.Triggered:Connect(function(player)
	travel(player, toDesert, fromDesert)
end)
fromDesert.TravelPad.TravelPrompt.Triggered:Connect(function(player)
	travel(player, fromDesert, toDesert)
end)

Players.PlayerRemoving:Connect(function(player) lastTravel[player] = nil end)
