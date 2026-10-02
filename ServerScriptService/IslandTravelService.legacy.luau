
local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
local DataStoreService=game:GetService("DataStoreService")
local HttpService=game:GetService("HttpService")
local system=game.ReplicatedStorage.FishingSystem
local Zones=require(system.FishingZones)
local Purchase=require(game.ServerStorage.AtlanticPurchase)
local wallet=game.ServerStorage:WaitForChild("FishingWallet")
local remote=system.AtlanticTravel
local store=DataStoreService:GetDataStore("FishingIslandUnlocks_v1")
local gates=workspace.maap:WaitForChild("IslandTravel")
local lastTravel,busy,loading,lastLoad,lastRequest={},{},{},{},{}
local function updateZone(p)
 local c=p.Character local r=c and c:FindFirstChild("HumanoidRootPart")
 local atlantic=r and Zones.Contains(r.Position) and p:GetAttribute("AtlanticUnlocked")==true
 p:SetAttribute("FishingZone",atlantic and "Atlantic" or "Coastal")
 p:SetAttribute("FishZoneMultiplier",atlantic and 1.2 or 1)
end
local function loadUnlock(p)
 if loading[p] or p:GetAttribute("AtlanticAccessLoaded") then return end
 if os.clock()-(lastLoad[p] or -10)<5 then return end
 loading[p]=true lastLoad[p]=os.clock()
 local ok,record=pcall(function() return store:GetAsync("Player_"..p.UserId) end)
 if p.Parent then
  if ok then
   p:SetAttribute("AtlanticUnlocked",type(record)=="table" and record.AtlanticUnlocked==true)
   p:SetAttribute("AtlanticAccessLoaded",true)
   p:SetAttribute("AtlanticAccessError",false)
  else
   p:SetAttribute("AtlanticAccessError",true)
   warn("[Atlantic] Could not read permanent unlock; no purchases allowed until saving is available.")
  end
 end
 loading[p]=nil
end
local function readyCharacter(p)
 local c=p.Character local h=c and c:FindFirstChildOfClass("Humanoid") local r=c and c:FindFirstChild("HumanoidRootPart")
 if not h or h.Health<=0 or not r then return end
 return c,h,r
end
local function relocate(p,destination)
 local c,h=readyCharacter(p) if not c then return end
 h:UnequipTools() h.Sit=false c:PivotTo(destination.Arrival.CFrame)
 for _,v in c:GetDescendants() do if v:IsA("BasePart") then v.AssemblyLinearVelocity=Vector3.zero v.AssemblyAngularVelocity=Vector3.zero end end
 h:ChangeState(Enum.HumanoidStateType.GettingUp)
 c:SetAttribute("IslandTravelAt",workspace:GetServerTimeNow())
 updateZone(p)
end
local function near(p,source)
 local _,_,r=readyCharacter(p)
 return r and (r.Position-source.TravelPad.Position).Magnitude<=12
end
local function travel(p,source,destination)
 if not near(p,source) then return end
 local t=os.clock() if t-(lastTravel[p] or -10)<2 then return end
 lastTravel[p]=t relocate(p,destination)
end
local function requestEntry(p)
 if not near(p,gates.ToAtlantic) or busy[p] then return end
 if p:GetAttribute("AtlanticUnlocked") then travel(p,gates.ToAtlantic,gates.ToCoastal) return end
 if not p:GetAttribute("AtlanticAccessLoaded") then task.spawn(loadUnlock,p) end
 remote:FireClient(p,"Offer",{price=Purchase.Price,balance=wallet:Invoke(p,"Read") or 0,loaded=p:GetAttribute("AtlanticAccessLoaded")==true})
end
gates.ToAtlantic.TravelPad.TravelPrompt.Triggered:Connect(requestEntry)
gates.ToCoastal.TravelPad.TravelPrompt.Triggered:Connect(function(p) travel(p,gates.ToCoastal,gates.ToAtlantic) end)
remote.OnServerEvent:Connect(function(p,action)
 if action~="Purchase" or busy[p] or not near(p,gates.ToAtlantic) then return end
 local t=os.clock() if t-(lastRequest[p] or -10)<.5 then return end lastRequest[p]=t
 if p:GetAttribute("AtlanticUnlocked") then travel(p,gates.ToAtlantic,gates.ToCoastal) remote:FireClient(p,"Unlocked") return end
 if not p:GetAttribute("AtlanticAccessLoaded") then
  task.spawn(loadUnlock,p)
  remote:FireClient(p,"Error",{text="Permanent saving is unavailable. No coins were spent. Please try again."})
  return
 end
 busy[p]=true remote:FireClient(p,"Saving")
 local id=HttpService:GenerateGUID(false)
 local ok,reason=Purchase.Run(
  function(amount) return wallet:Invoke(p,"Debit",amount)==true end,
  function(amount) return wallet:Invoke(p,"Credit",amount) end,
  function(purchaseId)
   return store:UpdateAsync("Player_"..p.UserId,function(old)
    if type(old)=="table" and old.AtlanticUnlocked==true then return old end
    local record=type(old)=="table" and old or {}
    record.AtlanticUnlocked=true record.UnlockedAt=os.time() record.PricePaid=Purchase.Price record.PurchaseId=purchaseId
    return record
   end)
  end,id)
 busy[p]=nil
 if not p.Parent then return end
 if ok then
  p:SetAttribute("AtlanticUnlocked",true)
  remote:FireClient(p,"Unlocked")
  if near(p,gates.ToAtlantic) then travel(p,gates.ToAtlantic,gates.ToCoastal) end
 else
  remote:FireClient(p,"Error",{text=reason=="funds" and "You need $40,000 to unlock Atlantic Hub." or "Your unlock could not be saved. Your coins were returned. Try again."})
 end
end)
local function setup(p)
 p:SetAttribute("AtlanticUnlocked",false) p:SetAttribute("AtlanticAccessLoaded",false) p:SetAttribute("AtlanticAccessError",false)
 task.spawn(loadUnlock,p)
end
Players.PlayerAdded:Connect(setup)
for _,p in Players:GetPlayers() do setup(p) end
local elapsed=0
RunService.Heartbeat:Connect(function(dt)
 elapsed+=dt if elapsed<.3 then return end elapsed=0
 for _,p in Players:GetPlayers() do
  local _,_,r=readyCharacter(p)
  if r and Zones.Contains(r.Position) and p:GetAttribute("AtlanticUnlocked")~=true then
   relocate(p,gates.ToAtlantic)
   remote:FireClient(p,"Locked",{text="Unlock Atlantic Hub for $40,000 at the travel gate."})
  end
  updateZone(p)
 end
end)
Players.PlayerRemoving:Connect(function(p) lastTravel[p]=nil lastLoad[p]=nil lastRequest[p]=nil end)
