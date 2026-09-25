
-- Per-character swim presentation; native Humanoid swimming controls movement.
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local character = script.Parent
local humanoid = character:WaitForChild("Humanoid")
local root = character:WaitForChild("HumanoidRootPart")
local ocean = workspace:WaitForChild("maap"):WaitForChild("oceon")
local animator = humanoid:WaitForChild("Animator")
humanoid:SetStateEnabled(Enum.HumanoidStateType.Swimming, true)
local tint = Instance.new("ColorCorrectionEffect")
tint.Name = "OceanUnderwaterTint"
tint.Enabled = false
tint.TintColor = Color3.fromRGB(190, 228, 236)
tint.Brightness = -0.025
tint.Contrast = 0.035
tint.Saturation = -0.08
tint.Parent = Lighting
local tracks = {}
local animations = {}
local joints = {}
local activeTrack
local wasSwimming = false
local cleaned = false
local connections = {}
local phase = 0
local originalPhysics = root.CustomPhysicalProperties
local currentPhysics = root.CurrentPhysicalProperties
local swimPhysics = PhysicalProperties.new(math.min(currentPhysics.Density, 0.7), currentPhysics.Friction, currentPhysics.Elasticity, currentPhysics.FrictionWeight, currentPhysics.ElasticityWeight)
if humanoid.RigType == Enum.HumanoidRigType.R15 then
 for name, id in {Stroke = "rbxassetid://507784897", Idle = "rbxassetid://507785072"} do
  local animation = Instance.new("Animation")
  animation.AnimationId = id
  table.insert(animations, animation)
  local ok, track = pcall(function() return animator:LoadAnimation(animation) end)
  if ok then
   track.Looped = true
   track.Priority = Enum.AnimationPriority.Action
   tracks[name] = track
  else
   warn("Ocean swim animation could not load:", name)
  end
 end
else
 local torso = character:WaitForChild("Torso")
 for _, name in {"Right Shoulder", "Left Shoulder", "Right Hip", "Left Hip"} do
  local joint = torso:FindFirstChild(name)
  if joint and joint:IsA("Motor6D") then joints[name] = joint end
 end
end
local function stopMotion()
 root.CustomPhysicalProperties = originalPhysics
 if activeTrack then activeTrack:Stop(0.2) activeTrack = nil end
 for _, joint in joints do joint.Transform = CFrame.identity end
end
local function cleanup()
 if cleaned then return end
 cleaned = true
 stopMotion()
 for _, connection in connections do connection:Disconnect() end
 for _, track in tracks do track:Destroy() end
 for _, animation in animations do animation:Destroy() end
 tint:Destroy()
end
table.insert(connections, RunService.PreSimulation:Connect(function(dt)
 if humanoid.Health <= 0 then cleanup() return end
 local swimming = humanoid:GetState() == Enum.HumanoidStateType.Swimming
 if swimming then
  if not wasSwimming then
   root.CustomPhysicalProperties = swimPhysics
   humanoid:UnequipTools()
  end
  local moving = humanoid.MoveDirection.Magnitude > 0.05 or root.AssemblyLinearVelocity.Magnitude > 2
  local desired = moving and tracks.Stroke or tracks.Idle
  if desired ~= activeTrack then
   if activeTrack then activeTrack:Stop(0.2) end
   activeTrack = desired
   if activeTrack then activeTrack:Play(0.2) end
  end
  if activeTrack then activeTrack:AdjustSpeed(moving and math.clamp(root.AssemblyLinearVelocity.Magnitude/10, 0.65, 1.5) or 1) end
  -- R6 has no equivalent R15 swim asset: apply a gentle alternating paddle.
  phase += dt * (moving and 5 or 2.5)
  for name, joint in joints do
   local side = name:find("Right") and 1 or -1
   local stroke = math.sin(phase + (side == 1 and 0 or math.pi))
   if name:find("Shoulder") then
    joint.Transform = CFrame.Angles(math.rad(-55 + stroke * (moving and 40 or 18)), 0, math.rad(side * 18))
   else
    joint.Transform = CFrame.Angles(math.rad(stroke * (moving and 22 or 9)), 0, 0)
   end
  end
 elseif wasSwimming then
  stopMotion()
 end
 wasSwimming = swimming
 local camera = workspace.CurrentCamera
 if camera then
  local p = camera.CFrame.Position
  local offset = ocean.CFrame:PointToObjectSpace(p)
  local surface = ocean:GetAttribute("WaterSurfaceY") or 0
  tint.Enabled = p.Y < surface - 0.5 and p.Y > surface - (ocean:GetAttribute("WaterDepth") or 48)
   and math.abs(offset.X) < (ocean:GetAttribute("WaterExtentX") or ocean.Size.X)/2 and math.abs(offset.Z) < (ocean:GetAttribute("WaterExtentZ") or ocean.Size.Z)/2
 end
end))
table.insert(connections, character:GetAttributeChangedSignal("OceanRescuedAt"):Connect(function()
 stopMotion()
 humanoid:ChangeState(Enum.HumanoidStateType.GettingUp)
 tint.Enabled = false
end))
table.insert(connections, humanoid.Died:Connect(cleanup))
table.insert(connections, script.Destroying:Connect(cleanup))
table.insert(connections, character.AncestryChanged:Connect(function(_, parent) if not parent then cleanup() end end))
