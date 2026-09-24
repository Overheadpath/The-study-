
local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
local Zones=require(game.ReplicatedStorage.FishingSystem.FishingZones)
local gates=workspace.maap:WaitForChild("IslandTravel")
local lastTravel={}
local function updateZone(p)
 local c=p.Character local r=c and c:FindFirstChild("HumanoidRootPart")
 local atlantic=r and Zones.Contains(r.Position)
 p:SetAttribute("FishingZone",atlantic and "Atlantic" or "Coastal")
 p:SetAttribute("FishZoneMultiplier",atlantic and 1.2 or 1)
end
local function connect(source,destination)
 source.TravelPad.TravelPrompt.Triggered:Connect(function(p)
  local c=p.Character local h=c and c:FindFirstChildOfClass("Humanoid") local r=c and c:FindFirstChild("HumanoidRootPart")
  if not h or h.Health<=0 or not r or (r.Position-source.TravelPad.Position).Magnitude>12 then return end
  local t=os.clock() if t-(lastTravel[p] or -10)<2 then return end lastTravel[p]=t
  h:UnequipTools() h.Sit=false
  c:PivotTo(destination.Arrival.CFrame)
  for _,v in c:GetDescendants() do if v:IsA("BasePart") then v.AssemblyLinearVelocity=Vector3.zero v.AssemblyAngularVelocity=Vector3.zero end end
  h:ChangeState(Enum.HumanoidStateType.GettingUp)
  c:SetAttribute("IslandTravelAt",workspace:GetServerTimeNow())
  updateZone(p)
 end)
end
connect(gates.ToAtlantic,gates.ToCoastal)
connect(gates.ToCoastal,gates.ToAtlantic)
local elapsed=0
RunService.Heartbeat:Connect(function(dt)
 elapsed+=dt if elapsed<.3 then return end elapsed=0
 for _,p in Players:GetPlayers() do updateZone(p) end
end)
Players.PlayerRemoving:Connect(function(p) lastTravel[p]=nil end)
