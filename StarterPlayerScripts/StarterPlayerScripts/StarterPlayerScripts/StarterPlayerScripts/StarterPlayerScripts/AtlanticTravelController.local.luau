
local Players=game:GetService("Players")
local player=Players.LocalPlayer
local pg=player:WaitForChild("PlayerGui")
local system=game.ReplicatedStorage:WaitForChild("FishingSystem")
local Theme=require(system.BubbleTheme)
local remote=system:WaitForChild("AtlanticTravel")
local gui=Instance.new("ScreenGui") gui.Name="AtlanticTravelUI" gui.ResetOnSpawn=false gui.DisplayOrder=45 gui.Parent=pg
local panel=Instance.new("Frame") panel.Name="UnlockWindow" panel.AnchorPoint=Vector2.new(.5,.5) panel.Position=UDim2.fromScale(.5,.48) panel.Size=UDim2.fromOffset(430,285) panel.Visible=false panel.Parent=gui Theme.Panel(panel)
local scale=Instance.new("UIScale") scale.Parent=panel
local function text(name,value,x,y,w,h,size)
 local t=Instance.new("TextLabel") t.Name=name t.Text=value t.Position=UDim2.fromOffset(x,y) t.Size=UDim2.fromOffset(w,h) t.BackgroundTransparency=1 t.TextSize=size t.TextWrapped=true t.Parent=panel Theme.Text(t) return t
end
local title=text("Title","",20,14,390,37,25) Theme.RainbowText(title,"UNLOCK ATLANTIC")
text("Description","A snowy island with 1.2× fish value.\nPay once. Keep access permanently.",23,62,384,50,17)
local price=text("Price","$40,000",23,118,384,35,29) price.TextColor3=Theme.Gold
local status=text("Status","",23,164,384,51,14)
local function button(name,value,x,width,color)
 local b=Instance.new("TextButton") b.Name=name b.Text=value b.Position=UDim2.fromOffset(x,230) b.Size=UDim2.fromOffset(width,37) b.TextSize=17 b.Parent=panel Theme.Button(b,color) return b
end
local cancel=button("Cancel","NOT YET",23,138,Theme.Purple)
local buy=button("Buy","UNLOCK",173,234,Theme.Mint)
local saving=false
local errorText
local function refresh()
 local coins=player:GetAttribute("FishingCoins") or 0
 local loaded=player:GetAttribute("AtlanticAccessLoaded")==true
 buy.Active=not saving and loaded and coins>=40000
 buy.Text=saving and "SAVING..." or coins<40000 and "NEED $40,000" or "UNLOCK & TRAVEL"
 buy.BackgroundColor3=buy.Active and Theme.Mint or Theme.Blue
 if errorText then status.Text=errorText
 elseif saving then status.Text="Saving your permanent unlock..."
 elseif not loaded then status.Text=player:GetAttribute("AtlanticAccessError") and (game:GetService("RunService"):IsStudio() and "Saving unavailable. Enable Studio API access to test permanent unlocks." or "Saving is temporarily unavailable. Please try again shortly.") or "Checking your saved unlock..."
 elseif coins<40000 then status.Text=string.format("You have $%d · Earn $%d more.",coins,40000-coins)
 else status.Text=string.format("You have $%d. Future visits are free.",coins) end
end
local function close() panel.Visible=false gui:SetAttribute("Open",false) end
cancel.Activated:Connect(close)
buy.Activated:Connect(function()
 if not buy.Active or saving then return end
 saving=true errorText=nil refresh() remote:FireServer("Purchase")
end)
local notice=text("TravelNotice","",0,0,430,35,15) notice.Parent=gui notice.AnchorPoint=Vector2.new(.5,0) notice.Position=UDim2.new(.5,0,0,43) notice.Visible=false
local token=0
local function showNotice(message)
 token+=1 local current=token notice.Text=message notice.Visible=true
 task.delay(4,function() if token==current then notice.Visible=false end end)
end
remote.OnClientEvent:Connect(function(kind,data)
 data=data or {}
 if kind=="Offer" then
  if saving then return end
  errorText=nil panel.Visible=true gui:SetAttribute("Open",true) Theme.Pop(panel) refresh()
 elseif kind=="Saving" then saving=true refresh()
 elseif kind=="Unlocked" then saving=false close() showNotice("ATLANTIC UNLOCKED · Yours to visit forever!")
 elseif kind=="Error" then saving=false errorText=data.text refresh()
 elseif kind=="Locked" then showNotice(data.text) end
end)
for _,attr in {"FishingCoins","AtlanticAccessLoaded","AtlanticAccessError"} do player:GetAttributeChangedSignal(attr):Connect(refresh) end
local gate=workspace:WaitForChild("maap"):WaitForChild("IslandTravel"):WaitForChild("ToAtlantic")
local gatePad=gate:WaitForChild("TravelPad")
local gatePrompt=gatePad:WaitForChild("TravelPrompt")
local gateSign=gatePad:WaitForChild("DestinationSign"):WaitForChild("Subtitle")
local function updatePrompt()
 local unlocked=player:GetAttribute("AtlanticUnlocked")==true
 gatePrompt.ActionText=unlocked and "Enter Atlantic" or "Unlock · $40,000"
 gateSign.Text=unlocked and "UNLOCKED · 1.2× FISH VALUE" or "$40,000 ONCE · 1.2× FISH VALUE"
end
player:GetAttributeChangedSignal("AtlanticUnlocked"):Connect(updatePrompt) updatePrompt()
player.CharacterAdded:Connect(close)
local function resize()
 local size=workspace.CurrentCamera.ViewportSize
 scale.Scale=math.min(1,(size.X-24)/430,(size.Y-80)/285)
 notice.Size=UDim2.new(.8,0,0,40)
end
resize() workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(resize)
