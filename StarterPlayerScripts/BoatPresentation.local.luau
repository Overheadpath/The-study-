local RunService=game:GetService("RunService")
local player=game.Players.LocalPlayer
local folder=workspace:WaitForChild("Boats")
local G=require(game.ReplicatedStorage.FishingSystem.GameplayConfig)
local tracked={}
local function track(boat)
 if tracked[boat] or not boat:IsA("Model") or not boat.PrimaryPart then return end
 local hull=boat.PrimaryPart
 local entry={hull=hull,joints={},wakes={},phase=0,power=0}
 for _,v in boat:GetDescendants() do
  if v:IsA("Motor6D") and (v.Name=="RowingJoint" or v.Name=="PropellerJoint") then table.insert(entry.joints,v) end
 end
 for _,side in {-1,1} do
  local a=Instance.new("Attachment") a.Name="WakeInner" a.Parent=hull
  local b=Instance.new("Attachment") b.Name="WakeOuter" b.Parent=hull
  local trail=Instance.new("Trail") trail.Name="BoatWake" trail.Attachment0=a trail.Attachment1=b
  trail.Color=ColorSequence.new(Color3.fromRGB(218,244,246))
  trail.Transparency=NumberSequence.new({NumberSequenceKeypoint.new(0,.48),NumberSequenceKeypoint.new(1,1)})
  trail.WidthScale=NumberSequence.new({NumberSequenceKeypoint.new(0,.6),NumberSequenceKeypoint.new(.5,1),NumberSequenceKeypoint.new(1,.15)})
  trail.Lifetime=1.5 trail.MinLength=.18 trail.FaceCamera=false trail.Enabled=false trail.Parent=hull
  table.insert(entry.wakes,{a=a,b=b,trail=trail,side=side})
 end
 tracked[boat]=entry
end
for _,b in folder:GetChildren() do track(b) end
folder.ChildAdded:Connect(track)
folder.ChildRemoved:Connect(function(b) tracked[b]=nil end)
RunService.PreSimulation:Connect(function(dt)
 local reduced=player.PlayerGui:GetAttribute("ReduceMotion")==true
 local root=player.Character and player.Character:FindFirstChild("HumanoidRootPart")
 for boat,e in tracked do
  if not boat.Parent or not e.hull.Parent then tracked[boat]=nil continue end
  local speed=Vector3.new(e.hull.AssemblyLinearVelocity.X,0,e.hull.AssemblyLinearVelocity.Z).Magnitude
  local seat=boat:FindFirstChild("DriverSeat")
  local occupied=seat and seat.Occupant~=nil
  local nearby=not root or (root.Position-e.hull.Position).Magnitude<250
  local power=occupied and math.clamp(speed/12,0,1) or 0
  e.power+=(power-e.power)*(1-math.exp(-dt*5))
  e.phase+=dt*(2+speed*.16)
  for _,joint in e.joints do
   if not joint.Parent then continue end
   if joint.Name=="RowingJoint" then
    local side=joint.C0.X>0 and 1 or -1
    local stroke=math.sin(e.phase)*.38*e.power
    local lift=math.max(0,math.cos(e.phase))*.18*e.power
    joint.Transform=CFrame.Angles(lift,side*(1.12+stroke),0)
   else
    joint.Transform=CFrame.Angles(0,0,(not reduced and nearby) and e.phase*12*e.power or 0)
   end
  end
  for _,w in e.wakes do
   local stern=e.hull.CFrame:PointToWorldSpace(Vector3.new(w.side*2.2,0,4.8))
   w.a.WorldPosition=Vector3.new(stern.X,G.BoatWaterY+.06,stern.Z)
   local outer=stern+e.hull.CFrame.RightVector*w.side*(.4+math.clamp(speed/28,0,1)*.9)
   w.b.WorldPosition=Vector3.new(outer.X,G.BoatWaterY+.06,outer.Z)
   w.trail.Enabled=nearby and not reduced and speed>2
  end
 end
end)
