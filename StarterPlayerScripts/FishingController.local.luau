
local Players=game:GetService("Players")
local ReplicatedStorage=game:GetService("ReplicatedStorage")
local RunService=game:GetService("RunService")
local TweenService=game:GetService("TweenService")
local UserInputService=game:GetService("UserInputService")
local ContextActionService=game:GetService("ContextActionService")
local player=Players.LocalPlayer
local folder=ReplicatedStorage:WaitForChild("FishingSystem")
local Config=require(folder.Config)
local remote=folder.Action
local update=folder.Update
local mouse=player:GetMouse()
local gui=Instance.new("ScreenGui")
gui.Name="FishingHUD" gui.ResetOnSpawn=false gui.DisplayOrder=25 gui.Parent=player:WaitForChild("PlayerGui")
local ink=Color3.fromRGB(28,53,61)
local cream=Color3.fromRGB(247,242,222)
local function make(class,name,parent,props)
 local v=Instance.new(class) v.Name=name for k,x in props do v[k]=x end v.Parent=parent return v
end
local function round(v,r) make("UICorner","Corner",v,{CornerRadius=UDim.new(0,r or 8)}) end
local function label(name,parent,text,pos,size,textSize)
 return make("TextLabel",name,parent,{BackgroundTransparency=1,Text=text,Position=pos,Size=size,Font=Enum.Font.FredokaOne,TextSize=textSize or 16,TextColor3=cream,TextWrapped=true})
end
local function button(name,parent,text,pos,size)
 local b=make("TextButton",name,parent,{Text=text,Position=pos,Size=size,Font=Enum.Font.FredokaOne,TextSize=20,TextColor3=ink,BackgroundColor3=Color3.fromRGB(229,202,143),BorderSizePixel=0,AutoButtonColor=true})
 round(b) return b
end
local hint=label("Hint",gui,"",UDim2.new(0.5,-230,0.12,0),UDim2.fromOffset(460,38),16)
hint.TextStrokeTransparency=0.35 hint.TextStrokeColor3=ink
local panel=make("Frame","ReelPanel",gui,{AnchorPoint=Vector2.new(0.5,1),Position=UDim2.new(0.5,0,1,-100),Size=UDim2.fromOffset(360,135),BackgroundColor3=ink,BackgroundTransparency=0.06,BorderSizePixel=0,Visible=false})
round(panel,10)
local instructions=label("Instructions",panel,"",UDim2.fromOffset(10,9),UDim2.fromOffset(340,30),15)
local meter=make("Frame","Meter",panel,{Position=UDim2.fromOffset(25,48),Size=UDim2.fromOffset(310,15),BackgroundColor3=Color3.fromRGB(63,82,88),BorderSizePixel=0,Visible=false})
round(meter,4)
make("Frame","SweetSpot",meter,{Position=UDim2.fromScale(Config.ReelTargetMin,0),Size=UDim2.fromScale(Config.ReelTargetMax-Config.ReelTargetMin,1),BackgroundColor3=Color3.fromRGB(116,207,152),BorderSizePixel=0})
local cursor=make("Frame","Cursor",meter,{AnchorPoint=Vector2.new(0.5,0.5),Position=UDim2.fromScale(0,0.5),Size=UDim2.fromOffset(4,23),BackgroundColor3=cream,BorderSizePixel=0})
local actionButton=button("Action",panel,"CAST",UDim2.fromOffset(87,79),UDim2.fromOffset(186,42))
local cancel=button("Cancel",panel,"×",UDim2.fromOffset(321,5),UDim2.fromOffset(29,27))
cancel.TextSize=21 cancel.BackgroundTransparency=1 cancel.TextColor3=cream
local toast=make("Frame","CatchCard",gui,{AnchorPoint=Vector2.new(0.5,0),Position=UDim2.fromScale(0.5,0.18),Size=UDim2.fromOffset(340,150),BackgroundColor3=ink,BorderSizePixel=0,Visible=false})
round(toast,10)
local viewport=make("ViewportFrame","FishView",toast,{Position=UDim2.fromOffset(8,8),Size=UDim2.fromOffset(134,134),BackgroundTransparency=1,Ambient=Color3.fromRGB(210,210,210),LightColor=Color3.new(1,1,1),LightDirection=Vector3.new(-1,-1,-1)})
local catchTitle=label("FishName",toast,"",UDim2.fromOffset(142,22),UDim2.fromOffset(190,42),20)
catchTitle.Font=Enum.Font.FredokaOne
local catchValue=label("Value",toast,"",UDim2.fromOffset(142,70),UDim2.fromOffset(190,60),15)
local shop=make("Frame","FishMarket",gui,{AnchorPoint=Vector2.new(0.5,0.5),Position=UDim2.fromScale(0.5,0.5),Size=UDim2.fromOffset(420,330),BackgroundColor3=ink,BorderSizePixel=0,Visible=false})
round(shop,12)
label("Title",shop,"FINN'S FISH MARKET",UDim2.fromOffset(24,18),UDim2.fromOffset(340,40),24).Font=Enum.Font.FredokaOne
label("Subtitle",shop,"Fresh catches. Fair prices.",UDim2.fromOffset(24,61),UDim2.fromOffset(372,25),15)
local shopText=label("Offer",shop,"",UDim2.fromOffset(24,100),UDim2.fromOffset(372,57),17)
local sellAll=button("SellAll",shop,"SELL ALL",UDim2.fromOffset(24,177),UDim2.fromOffset(372,48))
local sellHeld=button("SellHeld",shop,"SELL HELD FISH",UDim2.fromOffset(24,237),UDim2.fromOffset(372,44))
sellHeld.BackgroundColor3=Color3.fromRGB(155,198,184)
local close=button("Close",shop,"×",UDim2.fromOffset(374,12),UDim2.fromOffset(32,32))
close.BackgroundTransparency=1 close.TextColor3=cream
label("Footnote",shop,"Equip a fish from your slots to sell it individually.",UDim2.fromOffset(18,292),UDim2.fromOffset(384,24),12)
for _,frame in {panel,toast,shop} do make("UIScale","ResponsiveScale",frame,{Scale=1}) end
local function resize()
 local size=workspace.CurrentCamera.ViewportSize
 panel.ResponsiveScale.Scale=math.min(1,(size.X-24)/360)
 toast.ResponsiveScale.Scale=math.min(1,(size.X-24)/340)
 shop.ResponsiveScale.Scale=math.min(1,(size.X-24)/420,(size.Y-60)/330)
 hint.Size=UDim2.new(0.9,0,0,40) hint.Position=UDim2.fromScale(0.05,0.12)
end
resize()
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(resize)
local Theme=require(folder:WaitForChild("BubbleTheme"))
Theme.StyleHUD(gui)
local FX=require(folder:WaitForChild("FishingPresentation"))
local Audio=require(folder:WaitForChild("GameAudio"))
local pips={}
for i=1,3 do
 pips[i]=make("Frame","ReelStep"..i,meter,{Position=UDim2.new(.5,(i-2)*24-9,0,-11),Size=UDim2.fromOffset(18,5),BackgroundColor3=Color3.fromRGB(93,133,147),BorderSizePixel=0}) round(pips[i],2)
end
local feedback=label("ReelFeedback",panel,"",UDim2.new(0,0,0,-31),UDim2.new(1,0,0,25),21)
feedback.TextStrokeTransparency=.2 feedback.TextStrokeColor3=ink
local lastProgress,lastMisses=0,0
local feedbackToken=0
local function reelFeedback(text,color)
 feedbackToken+=1 local token=feedbackToken
 feedback.Text=text feedback.TextColor3=color feedback.TextTransparency=0
 if not player.PlayerGui:GetAttribute("ReduceMotion") then
  feedback.Position=UDim2.new(0,0,0,-24)
  TweenService:Create(feedback,TweenInfo.new(.22,Enum.EasingStyle.Back,Enum.EasingDirection.Out),{Position=UDim2.new(0,0,0,-36)}):Play()
 end
 task.delay(.65,function() if token==feedbackToken then TweenService:Create(feedback,TweenInfo.new(.2),{TextTransparency=1}):Play() end end)
end
local state="Idle"
local reelStarted=0
local equipped
local nextInput=0
local messageUntil=0
local toastUntil=0
local preview
local viewCamera=Instance.new("Camera") viewCamera.CFrame=CFrame.new(0,0,6) viewCamera.Parent=viewport viewport.CurrentCamera=viewCamera
local function menuOpen()
 local m=player.PlayerGui:FindFirstChild("FishingMenu")
 local inventory=player.PlayerGui:FindFirstChild("BubbleInventory")
 local travel=player.PlayerGui:FindFirstChild("AtlanticTravelUI")
 local trading=player.PlayerGui:FindFirstChild("TradingUI")
 local shopWin=player.PlayerGui:FindFirstChild("ShopWindow")
 local robux=player.PlayerGui:FindFirstChild("RobuxShop")
 return (m and m.Enabled) or (inventory and inventory:GetAttribute("BackpackOpen")) or (travel and travel:GetAttribute("Open")) or (trading and trading:GetAttribute("Open")) or (shopWin and shopWin:GetAttribute("Open")) or (robux and robux:GetAttribute("Open"))
end
local function showHint(text,duration)
 hint.Text=text or "" messageUntil=os.clock()+(duration or 4)
end
local function refreshIdle()
 panel.Visible=equipped~=nil and not shop.Visible and not menuOpen()
 meter.Visible=false cancel.Visible=false
 panel.Size=UDim2.fromOffset(360,96)
 actionButton.Position=UDim2.fromOffset(87,43)
 instructions.Text="Aim at open water"
 actionButton.Text="CAST"
end
local function targetPosition(center)
 local camera=workspace.CurrentCamera
 local ray
 if center or UserInputService.TouchEnabled then
  ray=camera:ViewportPointToRay(camera.ViewportSize.X/2,camera.ViewportSize.Y/2)
 else ray=mouse.UnitRay end
 local surface=workspace.maap.oceon:GetAttribute("WaterSurfaceY") or 0
 if ray.Direction.Y < -0.015 then
  local distance=(surface-ray.Origin.Y)/ray.Direction.Y
  if distance>0 then return ray.Origin+ray.Direction*distance end
 end
 local c=player.Character
 local r=c and c:FindFirstChild("HumanoidRootPart")
 if r then
  local look=camera.CFrame.LookVector
  local flat=Vector3.new(look.X,0,look.Z)
  if flat.Magnitude<0.01 then flat=r.CFrame.LookVector end
  return r.Position+flat.Unit*40
 end
end
local AnglerMotion=require(folder:WaitForChild("AnglerMotion"))
local grips=setmetatable({},{__mode="k"})
local motionId=0
local gripTween
local function rodMotion(casting)
 AnglerMotion.Pulse(casting and "Cast" or "Pull")
 if not equipped or player.PlayerGui:GetAttribute("ReduceMotion") then return end
 local tool=equipped
 grips[tool]=grips[tool] or tool.Grip
 local original=grips[tool]
 motionId+=1 local token=motionId
 if gripTween then gripTween:Cancel() end
 local function pose(offset,duration,style)
  if token~=motionId or not tool.Parent then return end
  gripTween=TweenService:Create(tool,TweenInfo.new(duration,style or Enum.EasingStyle.Quad,Enum.EasingDirection.Out),{Grip=original*offset}) gripTween:Play()
 end
 pose(CFrame.Angles(0,0,casting and .50 or -.23),casting and .18 or .09)
 task.delay(casting and .18 or .09,function()
  if token~=motionId then return end
  pose(CFrame.Angles(0,0,casting and -.65 or .07),casting and .19 or .12)
  task.delay(casting and .19 or .12,function() pose(CFrame.identity,.24,Enum.EasingStyle.Sine) end)
 end)
end
local function activate(center)
 if not equipped or shop.Visible or menuOpen() or os.clock()<nextInput then return end
 nextInput=os.clock()+0.2
 if state=="Idle" then
  local target=targetPosition(center)
  if target then remote:FireServer("Cast",target) end
 elseif state=="Bite" or state=="Reeling" then remote:FireServer("Pull") rodMotion() end
end
actionButton.Activated:Connect(function() activate(true) end)
cancel.Activated:Connect(function() remote:FireServer("Cancel") state="Idle" refreshIdle() end)
close.Activated:Connect(function() shop.Visible=false refreshIdle() end)
sellAll.Activated:Connect(function() remote:FireServer("SellAll") end)
sellHeld.Activated:Connect(function() remote:FireServer("SellHeld") end)
ContextActionService:BindAction("FishingPull",function(_,inputState)
 if inputState==Enum.UserInputState.Begin and equipped and not shop.Visible and not menuOpen() then activate(true) return Enum.ContextActionResult.Sink end
 return Enum.ContextActionResult.Pass
end,false,Enum.KeyCode.ButtonR2)
local bound=setmetatable({},{__mode="k"})
local function watchTool(tool)
 if not tool:IsA("Tool") or tool.Name~="fishingrod" or bound[tool] then return end
 bound[tool]=true
 tool.Activated:Connect(function() activate(false) end)
 tool.Equipped:Connect(function()
  grips[tool]=grips[tool] or tool.Grip
  equipped=tool state="Idle" refreshIdle() showHint("Click the water to cast. Wait for a bite, then hook it.",5)
 end)
 tool.Unequipped:Connect(function()
  if equipped==tool then motionId+=1 if gripTween then gripTween:Cancel() end if grips[tool] then tool.Grip=grips[tool] end equipped=nil state="Idle" panel.Visible=false remote:FireServer("Cancel") end
 end)
end
local function characterAdded(c)
 equipped=nil state="Idle" panel.Visible=false shop.Visible=false
 for _,v in c:GetChildren() do watchTool(v) end
 c.ChildAdded:Connect(watchTool)
end
player.CharacterAdded:Connect(characterAdded)
if player.Character then characterAdded(player.Character) end
local backpack=player:WaitForChild("Backpack")
for _,tool in backpack:GetChildren() do watchTool(tool) end
backpack.ChildAdded:Connect(watchTool)
-- Backpack instances are replaced on respawn.
player.ChildAdded:Connect(function(child)
 if child:IsA("Backpack") then
  for _,tool in child:GetChildren() do watchTool(tool) end
  child.ChildAdded:Connect(watchTool)
 end
end)
local function showPreview(species)
 for _,v in viewport:GetChildren() do if v:IsA("Model") then v:Destroy() end end
 local template=folder.FishModels:FindFirstChild(species)
 if not template then return end
 preview=template:Clone() preview.Parent=viewport preview:PivotTo(CFrame.Angles(0,0.2,0))
 viewCamera.CFrame=CFrame.lookAt(Vector3.new(0,0,3.8),Vector3.zero)
end
update.OnClientEvent:Connect(function(kind,data)
 data=data or {}
 if kind=="Shop" then
  shop.Visible=false panel.Visible=false
 elseif kind=="Sold" then
  -- the market window says it already when it is open
  local shop=player.PlayerGui:FindFirstChild("ShopWindow")
  if shop and shop:GetAttribute("Open") and shop:GetAttribute("Mode")=="Fish" then return end
  showHint(data.count>0 and string.format("Sold %d fish for $%d. Thanks, angler!",data.count,data.value) or "No fish selected to sell.",4)
 elseif kind=="Caught" then
  Audio.Play("Catch")
  FX.Land(data)
  if not data.devSpawned then AnglerMotion.Pulse("Catch") end
  reelFeedback("CATCH LANDED!",Theme.Gold)
  for _,pip in pips do pip.BackgroundColor3=Theme.Mint end
  state="Idle" refreshIdle()
  catchTitle.Text=data.name
  catchValue.Text=string.format("%.2f kg  ·  $%d\n%s",data.weight,data.value,(data.multiplier or 1)>1 and "Atlantic catch · 1.2× value" or "Added to your slots")
  showPreview(data.species)
  Theme.Pop(toast)
  toast.Visible=player.PlayerGui:GetAttribute("CatchNotices")~=false toastUntil=os.clock()+4.5
  showHint("Nice catch! Bring it to Finn at the fish market.",4)
 elseif kind=="Idle" then
  state="Idle" refreshIdle()
  if data.text~="" then showHint(data.text,4) end
 elseif kind=="Waiting" then
  rodMotion(true) lastProgress=0 lastMisses=0 feedback.Text=""
  for _,pip in pips do pip.BackgroundColor3=Color3.fromRGB(93,133,147) end
  state=kind panel.Visible=true cancel.Visible=true meter.Visible=false
  panel.Size=UDim2.fromOffset(360,96)
  actionButton.Position=UDim2.fromOffset(87,43)
  instructions.Text="Watch the float…" actionButton.Text="WAITING…" showHint(data.text,3)
 elseif kind=="Bite" then
  state=kind panel.Visible=true meter.Visible=false cancel.Visible=true
  panel.Size=UDim2.fromOffset(360,96)
  actionButton.Position=UDim2.fromOffset(87,43)
  instructions.Text="A fish is biting!" actionButton.Text="HOOK!"
  showHint("BITE! Click or tap HOOK!",3)
  reelFeedback("FISH ON!",Theme.Gold)
  Theme.Pop(panel)
 elseif kind=="Reeling" then
  if data.progress>lastProgress then reelFeedback(data.progress==2 and "ONE MORE!" or "NICE PULL!",Theme.Mint)
  elseif data.misses>lastMisses then reelFeedback("WAIT FOR GREEN",Theme.Pink)
  elseif state=="Bite" then reelFeedback("HOOKED!",Theme.Gold) end
  lastProgress=data.progress lastMisses=data.misses
  for i,pip in pips do pip.BackgroundColor3=i<=data.progress and Theme.Mint or Color3.fromRGB(93,133,147) end
  state=kind reelStarted=data.started panel.Visible=true meter.Visible=true cancel.Visible=true
  panel.Size=UDim2.fromOffset(360,135)
  actionButton.Position=UDim2.fromOffset(87,79)
  instructions.Text=string.format("Pull in green  ·  %d/3  ·  misses %d/3",data.progress,data.misses)
  actionButton.Text="REEL!"
 end
 gui:SetAttribute("FishingState",state)
 gui:SetAttribute("ReelStarted",reelStarted)
end)
local wiggles={}
local function scan(v)
 if v:IsA("Motor6D") and (v.Name=="FishWiggle" or v.Name=="FishTailWag") then wiggles[v]=true end
end
for _,v in workspace:GetDescendants() do scan(v) end
workspace.DescendantAdded:Connect(scan)
workspace.DescendantRemoving:Connect(function(v) wiggles[v]=nil end)
RunService.PreSimulation:Connect(function(dt)
 AnglerMotion.Step(player.Character,state,equipped,dt,player.PlayerGui:GetAttribute("ReduceMotion"))
 local t=os.clock()
 for joint in wiggles do
  if joint.Parent then joint.Transform=joint.Name=="FishTailWag" and CFrame.Angles(0,math.sin(t*6)*0.22,0) or CFrame.Angles(math.sin(t*3.5)*0.055,math.sin(t*5)*0.13,math.sin(t*2)*0.04) end
 end
end)
RunService.RenderStepped:Connect(function()
 if state=="Reeling" then
  local phase=((workspace:GetServerTimeNow()-reelStarted)/Config.ReelPeriod)%1
  cursor.Position=UDim2.fromScale(1-math.abs(2*phase-1),0.5)
 end
 if os.clock()>messageUntil then hint.Text="" end
 if toast.Visible and os.clock()>toastUntil then toast.Visible=false end
 if toast.Visible and preview and not player.PlayerGui:GetAttribute("ReduceMotion") then preview:PivotTo(CFrame.Angles(0,math.sin(os.clock()*2)*0.25,math.sin(os.clock()*3)*0.06)) end
 if menuOpen() then panel.Visible=false hint.Text=""
 elseif state=="Idle" and equipped and not shop.Visible and not panel.Visible then refreshIdle() end
 if shop.Visible then
  local c=player.Character
  local r=c and c:FindFirstChild("HumanoidRootPart")
  local merchant=workspace:FindFirstChild("SellPromptPart",true)
  if not r or not merchant or (r.Position-merchant.Position).Magnitude>18 then shop.Visible=false refreshIdle() end
 end
end)
