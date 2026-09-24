
-- Ocean safety is server-owned. Tune RescueDepth on Workspace.maap.oceon.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ocean = workspace:WaitForChild("maap"):WaitForChild("oceon")
local spawn = workspace.maap.Hub.Village:WaitForChild("HubSpawn")
local elapsed = 0
local lastRescue = {}
Players.PlayerRemoving:Connect(function(player) lastRescue[player] = nil end)
RunService.Heartbeat:Connect(function(dt)
 elapsed += dt
 if elapsed < 0.2 then return end
 elapsed = 0
 local surface = ocean:GetAttribute("WaterSurfaceY") or 0
 local depth = ocean:GetAttribute("RescueDepth") or 22
 for _, player in Players:GetPlayers() do
  local character = player.Character
  local humanoid = character and character:FindFirstChildOfClass("Humanoid")
  local root = character and character:FindFirstChild("HumanoidRootPart")
  if root and humanoid and humanoid.Health > 0 then
   local offset = ocean.CFrame:PointToObjectSpace(root.Position)
   local inOcean = math.abs(offset.X) <= ocean.Size.X/2 + 4 and math.abs(offset.Z) <= ocean.Size.Z/2 + 4
   local tooDeep = inOcean and root.Position.Y < surface - depth
   local fellOutside = root.Position.Y < math.max(workspace.FallenPartsDestroyHeight + 40, surface - 65)
   if (tooDeep or fellOutside) and os.clock() - (lastRescue[player] or -10) > 2 then
    lastRescue[player] = os.clock()
    humanoid.Sit = false
    character:PivotTo(spawn.CFrame * CFrame.new(0, spawn.Size.Y/2 + humanoid.HipHeight + root.Size.Y/2 + 2, 0))
    for _, part in character:GetDescendants() do
     if part:IsA("BasePart") then
      part.AssemblyLinearVelocity = Vector3.zero
      part.AssemblyAngularVelocity = Vector3.zero
     end
    end
    character:SetAttribute("OceanRescuedAt", workspace:GetServerTimeNow())
   end
  end
 end
end)
