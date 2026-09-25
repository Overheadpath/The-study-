
local Players=game:GetService("Players")
local ReplicatedStorage=game:GetService("ReplicatedStorage")
local HttpService=game:GetService("HttpService")
local RunService=game:GetService("RunService")
local rootFolder=ReplicatedStorage:WaitForChild("FishingSystem")
local Config=require(rootFolder.Config)
local Zones=require(rootFolder.FishingZones)
local remote=rootFolder.Action
local update=rootFolder.Update
local models=rootFolder:WaitForChild("FishModels")
local ocean=workspace.maap.oceon
local function getMerchant()
 return workspace:FindFirstChild("SellPromptPart",true)
end
local effects=Instance.new("Folder") effects.Name="FishingEffects" effects.Parent=workspace
local sessions, inventories, balances, lastAction={}, {}, {}, {}
local random=Random.new()
local devAllowed=require(game.ServerStorage.FishingDevAccess)
local rodTemplates=game.ServerStorage:WaitForChild("FishingRods")
local ownedRods,lastDev={},{}
local infiniteMoney={}
local function hasInfiniteMoney(p)
 return infiniteMoney[p]==true and devAllowed(p)
end
local function syncCoins(p)
 p:SetAttribute("FishingCoins",hasInfiniteMoney(p) and 1000000000 or balances[p])
end
-- Server-only wallet bridge for permanent island purchases.
local wallet=Instance.new("BindableFunction")
wallet.Name="FishingWallet"
wallet.OnInvoke=function(p,action,amount)
 if not inventories[p] or balances[p]==nil then return false end
 if action=="Read" then return hasInfiniteMoney(p) and 1000000000 or balances[p] end
 if typeof(amount)~="number" or amount~=amount or amount<=0 or amount%1~=0 or amount>1000000000 then return false end
 if action=="Debit" then
  if hasInfiniteMoney(p) then return true end
  if balances[p]<amount then return false end
  balances[p]-=amount
 elseif action=="Credit" then balances[p]+=amount
 else return false end
 syncCoins(p)
 return true
end
wallet.Parent=game.ServerStorage
local function now() return workspace:GetServerTimeNow() end
local function send(p,kind,data) update:FireClient(p,kind,data) end
local function count(t) local n=0 for _ in t do n+=1 end return n end
local function clear(p,message)
 local s=sessions[p]
 if s then
  sessions[p]=nil
  if s.effects then s.effects:Destroy() end
  if s.attachment then s.attachment:Destroy() end
 end
 if message then send(p,"Idle",{text=message}) end
end
local function characterState(p)
 local c=p.Character
 local h=c and c:FindFirstChildOfClass("Humanoid")
 local r=c and c:FindFirstChild("HumanoidRootPart")
 return c,h,r
end
local function equippedRod(p)
 local c,h,r=characterState(p)
 local tool=c and c:FindFirstChild("fishingrod")
 if not h or h.Health<=0 or not r or h:GetState()==Enum.HumanoidStateType.Swimming then return end
 if not tool or not tool:IsA("Tool") or not tool:FindFirstChild("Handle") or not Config.GetRod(tool:GetAttribute("RodId")) then return end
 return tool,r
end
local function dataFor(id)
 for _,d in Config.Fish do if d.Id==id then return d end end
end
local function makeTool(p,id,entry)
 local d=dataFor(entry.species)
 local template=models:FindFirstChild(entry.species)
 if not template then return end
 local tool=Instance.new("Tool")
 tool.Name=d.Name
 tool.CanBeDropped=false
 tool.ToolTip=string.format("%s | %.2f kg | Sell for $%d",d.Name,entry.weight,entry.value)
 tool:SetAttribute("CatchId",id)
 tool:SetAttribute("SpeciesId",entry.species)
 tool:SetAttribute("ItemCategory","Fish")
 tool:SetAttribute("Rarity",d.Rarity or "Common")
 tool:SetAttribute("Quantity",1)
 tool:SetAttribute("SellValue",entry.value)
 tool:SetAttribute("WeightKg",entry.weight)
 tool:SetAttribute("CatchZone",entry.zone or "Coastal")
 tool:SetAttribute("ZoneMultiplier",entry.multiplier or 1)
 tool:SetAttribute("BaseSellValue",entry.baseValue or entry.value)
 local model=template:Clone()
 model.Name="Fish"
 model.Parent=tool
 model:PivotTo(CFrame.identity)
 local handle=Instance.new("Part")
 handle.Name="Handle" handle.Size=Vector3.new(0.25,0.25,0.25)
 handle.Transparency=1 handle.CanCollide=false handle.CanTouch=false handle.Massless=true handle.Parent=tool
 for _,v in model:GetDescendants() do
  if v:IsA("BasePart") then
   v.Anchored=false v.CanCollide=false v.CanTouch=false v.CanQuery=false v.Massless=true
  end
 end
 -- One pivot joint gives the catch a gentle wiggle without altering its geometry.
 local joint=Instance.new("Motor6D")
 joint.Name="FishWiggle" joint.Part0=handle joint.Part1=model.PrimaryPart joint.C0=CFrame.new(0,0,-0.5) joint.Parent=handle
 local tag=Instance.new("BillboardGui")
 tag.Name="CatchValue" tag.Size=UDim2.fromOffset(180,44) tag.StudsOffset=Vector3.new(0,1.2,0)
 tag.MaxDistance=18 tag.AlwaysOnTop=false tag.Parent=handle
 local label=Instance.new("TextLabel")
 label.Size=UDim2.fromScale(1,1) label.BackgroundTransparency=1
 label.Font=Enum.Font.FredokaOne label.TextSize=15 label.TextColor3=Color3.fromRGB(255,242,194)
 label.TextStrokeColor3=Color3.fromRGB(24,55,65) label.TextStrokeTransparency=0.2
 label.Text=string.format("%s\n$%d  ·  %.2f kg",d.Name,entry.value,entry.weight) label.Parent=tag
 tool.Grip=CFrame.new(0,-0.15,-0.55)*CFrame.Angles(0,math.rad(90),0)
 tool.Parent=p:WaitForChild("Backpack")
 return tool
end
local function summary(p)
 local n,total=0,0
 for _,entry in inventories[p] or {} do n+=1 total+=entry.value end
 local heldValue,heldName=0,nil
 local c=p.Character
 if c then for _,t in c:GetChildren() do
  local entry=t:IsA("Tool") and inventories[p] and inventories[p][t:GetAttribute("CatchId")]
  if entry then heldValue=entry.value heldName=t.Name break end
 end end
 return {count=n,total=total,heldValue=heldValue,heldName=heldName}
end
local function nearbyTrade(p,tag)
 local _,h,r=characterState(p) if not h or h.Health<=0 or not r then return end
 local nearest,distance=nil,26 -- reaches the whole shop circle
 for _,marker in game:GetService("CollectionService"):GetTagged(tag) do
  if marker:IsA("BasePart") and marker:IsDescendantOf(workspace) and (marker:GetAttribute("TradeZone")~="Atlantic" or p:GetAttribute("AtlanticUnlocked")==true) then
   local d=(r.Position-marker.Position).Magnitude
   if d<=distance then nearest=marker distance=d end
  end
 end
 return nearest
end
local function nearMerchant(p) return nearbyTrade(p,"FishMerchant") end
local function award(p,forcedSpecies,isDev)
 if not inventories[p] or count(inventories[p])>=Config.Capacity then clear(p,"Your backpack is full. Sell a few fish to Finn.") return end
 local session=sessions[p]
 local d=isDev and Config.GetFish(forcedSpecies) or (session and Config.RollFish(session.rodId,random))
 if not d then clear(p,"Equip a valid fishing rod and cast again.") return end
 local weight=math.floor(random:NextNumber(d.MinWeight,d.MaxWeight)*100+0.5)/100
 local value=math.max(1,math.floor(d.BaseValue*(0.8+0.4*(weight-d.MinWeight)/(d.MaxWeight-d.MinWeight))+0.5))
 local baseValue=value
 local zone=not isDev and session and session.zone or {Id="Coastal",Multiplier=1}
 value=math.max(1,math.floor(baseValue*zone.Multiplier+.5))
 local id=HttpService:GenerateGUID(false)
 local entry={species=d.Id,weight=weight,value=value,baseValue=baseValue,zone=zone.Id,multiplier=zone.Multiplier}
 local tool=makeTool(p,id,entry)
 if not tool then clear(p,"The catch slipped away. Try again.") return end
 inventories[p][id]=entry
 if isDev then tool:SetAttribute("DevSpawned",true) end
 local discoveries=p:FindFirstChild("FishDiscoveries")
 local record=discoveries and discoveries:FindFirstChild(d.Id)
 local isNew=record==nil
 if discoveries then
  if not record then
   record=Instance.new("Folder") record.Name=d.Id
   record:SetAttribute("CatchCount",0) record:SetAttribute("BestWeight",0)
   record.Parent=discoveries
  end
  record:SetAttribute("CatchCount",(record:GetAttribute("CatchCount") or 0)+1)
  record:SetAttribute("BestWeight",math.max(record:GetAttribute("BestWeight") or 0,weight))
  record:SetAttribute("BestValue",math.max(record:GetAttribute("BestValue") or 0,value))
 end
 local landedAt=sessions[p] and sessions[p].target
 clear(p)
 send(p,"Caught",{name=d.Name,species=d.Id,weight=weight,value=value,newDiscovery=isNew,position=landedAt,rarity=d.Rarity,devSpawned=isDev==true,zone=entry.zone,multiplier=entry.multiplier})
 return tool
end
local function startCast(p,target)
 if sessions[p] then return end
 local tool,r=equippedRod(p)
 if not tool then return end
 if count(inventories[p] or {})>=Config.Capacity then send(p,"Idle",{text="Backpack full — sell some fish to Finn."}) return end
 if typeof(target)~="Vector3" or target.X~=target.X or target.Y~=target.Y or target.Z~=target.Z or math.abs(target.X)>100000 or math.abs(target.Y)>100000 or math.abs(target.Z)>100000 then return end
 local y=ocean:GetAttribute("WaterSurfaceY") or 0
 target=Vector3.new(target.X,y,target.Z)
 local horizontal=Vector3.new(target.X-r.Position.X,0,target.Z-r.Position.Z)
 if horizontal.Magnitude<Config.MinCast or horizontal.Magnitude>Config.MaxCast then send(p,"Idle",{text="Aim at water a little closer to the dock."}) return end
 local params=RaycastParams.new()
 params.FilterType=Enum.RaycastFilterType.Exclude params.FilterDescendantsInstances={p.Character,effects}
 params.IgnoreWater=false
 local water=workspace:Raycast(target+Vector3.new(0,6,0),Vector3.new(0,-12,0),params)
 if not water or water.Material~=Enum.Material.Water then send(p,"Idle",{text="Aim at the ocean to cast."}) return end
 local tip=tool.Handle:FindFirstChild("RodTip")
 local start=tip and tip.WorldPosition or r.Position+Vector3.new(0,1.5,0)
 local blocked=workspace:Raycast(start,target-start,params)
 if blocked and blocked.Material~=Enum.Material.Water and (blocked.Position-target).Magnitude>1 then send(p,"Idle",{text="Move to the edge for a clear cast."}) return end
 local container=Instance.new("Folder") container.Name="Cast_"..p.UserId
 local bobber=Instance.new("Part") bobber.Name="Float" bobber.Shape=Enum.PartType.Ball
 bobber.Size=Vector3.new(0.48,0.65,0.48) bobber.Color=Color3.fromRGB(237,110,84)
 bobber.Material=Enum.Material.SmoothPlastic bobber.Anchored=true bobber.CanCollide=false bobber.CanTouch=false bobber.CanQuery=false bobber.Position=start bobber.Parent=container
 local white=Instance.new("Part") white.Name="FloatBand" white.Size=Vector3.new(0.5,0.15,0.5) white.Shape=Enum.PartType.Ball
 white.Color=Color3.fromRGB(255,245,214) white.Anchored=true white.CanCollide=false white.CanTouch=false white.CanQuery=false white.Parent=container
 local att=Instance.new("Attachment") att.Name="CastTip" att.CFrame=tip and tip.CFrame or CFrame.new(4.95,0.8,-0.1) att.Parent=tool.Handle
 local endAtt=Instance.new("Attachment") endAtt.Name="LineEnd" endAtt.Parent=bobber
 local line=Instance.new("Beam") line.Name="FishingLine" line.Attachment0=att line.Attachment1=endAtt
 line.Width0=0.025 line.Width1=0.018 line.FaceCamera=true line.Color=ColorSequence.new(Color3.fromRGB(227,236,225))
 line.Transparency=NumberSequence.new(0.2) line.Segments=40 line.CurveSize0=1.5 line.Parent=container
 -- Nature's Rod casts a thin living vine instead of plain line: a green strand
 -- with a finer brown one twisting along it, and a wooden seed-pod float
 if tool:GetAttribute("LineStyle")=="Vine" then
  line.Width0=0.04 line.Width1=0.028 line.Transparency=NumberSequence.new(0.05)
  line.Color=ColorSequence.new({ColorSequenceKeypoint.new(0,Color3.fromRGB(72,112,48)),ColorSequenceKeypoint.new(0.18,Color3.fromRGB(96,140,58)),ColorSequenceKeypoint.new(0.36,Color3.fromRGB(70,106,46)),ColorSequenceKeypoint.new(0.55,Color3.fromRGB(104,146,62)),ColorSequenceKeypoint.new(0.74,Color3.fromRGB(78,116,50)),ColorSequenceKeypoint.new(1,Color3.fromRGB(92,132,56))})
  local strand=Instance.new("Beam") strand.Name="VineStrand" strand.Attachment0=att strand.Attachment1=endAtt
  strand.Width0=0.018 strand.Width1=0.014 strand.FaceCamera=true strand.Segments=40 strand.CurveSize0=1.5
  strand.Color=ColorSequence.new(Color3.fromRGB(110,78,48),Color3.fromRGB(92,66,40)) strand.Transparency=NumberSequence.new(0.1)
  strand.Parent=container
  bobber.Color=Color3.fromRGB(118,86,52) bobber.Material=Enum.Material.Wood
  white.Color=Color3.fromRGB(112,160,68)
 end
 local t=now()
 container:SetAttribute("CastStart",start) container:SetAttribute("CastTarget",target)
 container:SetAttribute("CastTime",t) container:SetAttribute("FlightDuration",math.clamp(horizontal.Magnitude/70,.65,1.1))
 container:SetAttribute("Phase","Waiting") container:SetAttribute("Progress",0)
 bobber.Position=target+Vector3.new(0,.18,0) white.Position=bobber.Position-Vector3.new(0,.09,0)
 container.Parent=effects
 local s={tool=tool,zone=Zones.ForCatch(r.Position,target),rodId=tool:GetAttribute("RodId"),start=start,target=target,created=t,biteAt=t+random:NextNumber(3.5,6.5),phase="Waiting",effects=container,bobber=bobber,band=white,attachment=att,lastPull=0}
 sessions[p]=s
 send(p,"Waiting",{text=s.zone.Multiplier>1 and "Atlantic waters · 1.2× fish value" or "Line cast… watch the float."})
end
remote.OnServerEvent:Connect(function(p,action,arg)
 if type(action)~="string" or not inventories[p] then return end
 local t=now()
 if t-(lastAction[p] or 0)<0.12 then return end
 lastAction[p]=t
 if action=="Cast" then startCast(p,arg)
 elseif action=="Cancel" then clear(p,"")
 elseif action=="Pull" then
  local s=sessions[p] if not s or not equippedRod(p) then return end
  if s.phase=="Bite" then
   if t>s.deadline then clear(p,"It got away! Cast again.") return end
   s.phase="Reeling" s.effects:SetAttribute("Phase","Reeling") s.reelStart=t s.deadline=t+15 s.progress=0 s.misses=0
   send(p,"Reeling",{started=t,progress=0,misses=0})
  elseif s.phase=="Reeling" then
   if t>s.deadline or t-s.lastPull<0.32 then return end
   s.lastPull=t
   local phase=((t-s.reelStart)/Config.ReelPeriod)%1
   local cursor=1-math.abs(2*phase-1)
   if cursor>=Config.ReelTargetMin-0.055 and cursor<=Config.ReelTargetMax+0.055 then s.progress+=1 else s.misses+=1 end
   s.effects:SetAttribute("Progress",s.progress)
   s.effects:SetAttribute("PullTime",t)
   if s.progress>=3 then award(p)
   elseif s.misses>=3 then clear(p,"The fish slipped the hook. Try again!")
   else send(p,"Reeling",{started=s.reelStart,progress=s.progress,misses=s.misses}) end
  end
 elseif action=="Shop" then if nearMerchant(p) then clear(p,"") send(p,"Shop",summary(p)) end
 elseif action=="SellAll" or action=="SellHeld" or action=="SellFish" then
  if not nearMerchant(p) then send(p,"Idle",{text="Visit Finn at the fish market to sell."}) return end
  local ids={}
  if action=="SellAll" then for id in inventories[p] do ids[id]=true end
  elseif action=="SellFish" then if typeof(arg)=="string" and inventories[p][arg] then ids[arg]=true end
  else
   local c=p.Character
   if c then for _,tool in c:GetChildren() do
    local id=tool:IsA("Tool") and tool:GetAttribute("CatchId")
    if id and inventories[p][id] then ids[id]=true end
   end end
  end
  local total,n=0,0
  for id in ids do local entry=inventories[p][id] if entry then total+=entry.value n+=1 inventories[p][id]=nil end end
  for _,parent in {p:FindFirstChild("Backpack"),p.Character} do
   for _,tool in parent and parent:GetChildren() or {} do if tool:IsA("Tool") and ids[tool:GetAttribute("CatchId")] then tool:Destroy() end end
  end
  balances[p]+=total syncCoins(p)
  send(p,"Sold",{count=n,value=total})
  send(p,"Shop",summary(p))
 end
end)

-- Development tools use the same fish-grant path as real catches.
local function giveRod(p,id,equipNow)
 local template=rodTemplates:FindFirstChild(id)
 if not template or not Config.GetRod(id) then return end
 local bp=p:FindFirstChildOfClass("Backpack")
 local c=p.Character local h=c and c:FindFirstChildOfClass("Humanoid")
 if not bp or not h or h.Health<=0 then return end
 local tool
 for _,parent in {bp,c} do for _,v in parent:GetChildren() do
  if v:IsA("Tool") and v:GetAttribute("RodId")==id then tool=v break end
 end end
 if not tool then tool=template:Clone() tool.Name="fishingrod" tool.Parent=bp end
 if equipNow then clear(p,"") h:EquipTool(tool) end
 return tool
end
rootFolder.DevAction.OnServerEvent:Connect(function(p,action,id)
 if not devAllowed(p) or not inventories[p] then return end
 if typeof(action)~="string" or typeof(id)~="string" then return end
 local t=now() if t-(lastDev[p] or 0)<.2 then return end lastDev[p]=t
 local result=rootFolder.DevResult
 if action=="InfiniteMoney" then
  if id~="On" and id~="Off" then return end
  infiniteMoney[p]=id=="On"
  p:SetAttribute("InfiniteFishingMoney",infiniteMoney[p])
  syncCoins(p)
  result:FireClient(p,true,infiniteMoney[p] and "Infinite money enabled for this session." or "Infinite money off. Original balance restored.")
 elseif action=="SpawnFish" then
  local fish=Config.GetFish(id)
  if not fish then result:FireClient(p,false,"Unknown fish.") return end
  if count(inventories[p])>=Config.Capacity then result:FireClient(p,false,"Backpack full (40 fish).") return end
  local _,h=characterState(p) if not h or h.Health<=0 then result:FireClient(p,false,"Wait for your character to respawn.") return end
  local tool=award(p,id,true)
  result:FireClient(p,tool~=nil,tool and ("Spawned "..fish.Name.." in your backpack.") or "Could not spawn this fish.")
 elseif action=="EquipRod" then
  local rod=Config.GetRod(id)
  if not rod then result:FireClient(p,false,"Unknown rod.") return end
  local tool=giveRod(p,id,true)
  if tool then ownedRods[p][id]=true end
  result:FireClient(p,tool~=nil,tool and (rod.Name.." equipped.") or "Wait for your character to respawn.")
 end
end)


local tradeAction=rootFolder:WaitForChild("TradeAction")
local tradeUpdate=rootFolder:WaitForChild("TradeUpdate")
local lastTrade,lastOpen={},{}
-- open=true only when the server itself opens the shop (a Browse rods prompt);
-- the rod stall's circle opens its window on the client and this only refreshes it
local function showRods(p,message,open)
 tradeUpdate:FireClient(p,{owned=ownedRods[p] or {Coastal=true},coins=balances[p] or 0,message=message,open=open==true})
end
tradeAction.OnServerEvent:Connect(function(p,action,id)
 if not inventories[p] then return end
 if not nearbyTrade(p,"RodMerchant") then
  if action=="BuyRod" or action=="EquipRod" then showRods(p,"Step up to the counter to buy.") end
  return
 end
 local t=now()
 -- opening has its own throttle, so a quick buy right after the window pops is never dropped
 if action=="OpenRods" then if t-(lastOpen[p] or 0)<.2 then return end lastOpen[p]=t clear(p,"") showRods(p) return end
 if t-(lastTrade[p] or 0)<.25 then return end lastTrade[p]=t
 if action~="BuyRod" and action~="EquipRod" then return end
 local d=typeof(id)=="string" and Config.GetRod(id)
 if not d then return end
 if ownedRods[p][id] then
  local tool=giveRod(p,id,true)
  showRods(p,tool and (d.Name.." equipped.") or "Wait for your character to respawn.")
  return
 end
 if action=="EquipRod" then showRods(p,"Buy this rod first.") return end
 local price=d.Price
 if typeof(price)~="number" or price<0 then return end
 if not hasInfiniteMoney(p) and balances[p]<price then showRods(p,"You need $"..price.." for the "..d.Name..".") return end
 -- No yielding between checking funds, granting the tool and recording ownership.
 local tool=giveRod(p,id,true)
 if not tool then showRods(p,"Wait for your character to respawn.") return end
 if not hasInfiniteMoney(p) then balances[p]-=price end syncCoins(p)
 ownedRods[p][id]=true
 showRods(p,d.Name.." purchased and equipped!")
end)
local rodPrompts=setmetatable({},{__mode="k"})
local function bindRodPrompt(v)
 if not v:IsA("ProximityPrompt") or v.Name~="BrowseRods" or rodPrompts[v] then return end
 rodPrompts[v]=true
 v.Triggered:Connect(function(p) if inventories[p] and nearbyTrade(p,"RodMerchant") then clear(p,"") showRods(p,"",true) end end)
end
for _,v in workspace:GetDescendants() do bindRodPrompt(v) end workspace.DescendantAdded:Connect(bindRodPrompt)
Players.PlayerRemoving:Connect(function(p) lastTrade[p]=nil lastOpen[p]=nil end)

local connectedPrompts=setmetatable({},{__mode="k"})
local function connectPrompt(prompt)
 if not prompt:IsA("ProximityPrompt") or prompt.Name~="SellFish" or connectedPrompts[prompt] then return end
 connectedPrompts[prompt]=true
 prompt.Triggered:Connect(function(p)
  if nearMerchant(p) then clear(p,"") send(p,"Shop",summary(p)) end
 end)
end
for _,v in workspace:GetDescendants() do connectPrompt(v) end
workspace.DescendantAdded:Connect(connectPrompt)
local function setup(p)
 inventories[p]={} balances[p]=0 p:SetAttribute("FishingCoins",0) p:SetAttribute("InfiniteFishingMoney",false)
 ownedRods[p]={Coastal=true} p:SetAttribute("CanUseFishingDevTools",devAllowed(p))
 local discoveries=Instance.new("Folder")
 discoveries.Name="FishDiscoveries"
 discoveries.Parent=p
 p.CharacterAdded:Connect(function(c)
  clear(p,"")
  local backpack=p:WaitForChild("Backpack")
  local h=c:WaitForChild("Humanoid")
  h.Died:Connect(function() clear(p,"") end)
  task.wait(0.3)
  if p.Character~=c then return end
  for id,entry in inventories[p] or {} do makeTool(p,id,entry) end
  for id in ownedRods[p] or {} do giveRod(p,id,false) end
 end)
end
Players.PlayerAdded:Connect(setup)
for _,p in Players:GetPlayers() do setup(p) end
Players.PlayerRemoving:Connect(function(p) clear(p) inventories[p]=nil balances[p]=nil lastAction[p]=nil ownedRods[p]=nil lastDev[p]=nil infiniteMoney[p]=nil end)
local elapsed=0
RunService.Heartbeat:Connect(function(dt)
 elapsed+=dt if elapsed<0.05 then return end elapsed=0
 local t=now()
 for p,s in sessions do
  local tool,r=equippedRod(p)
  if tool~=s.tool or not r or (r.Position-s.target).Magnitude>Config.MaxCast+12 then clear(p,"Cast cancelled.")
  elseif s.phase=="Waiting" and t>=s.biteAt then
   s.phase="Bite" s.effects:SetAttribute("Phase","Bite") s.deadline=t+3
   send(p,"Bite",{text="BITE! Hook it!",deadline=s.deadline})
  elseif s.deadline and t>s.deadline then clear(p,"The fish got away. Cast again!")
  end

 end
end)
