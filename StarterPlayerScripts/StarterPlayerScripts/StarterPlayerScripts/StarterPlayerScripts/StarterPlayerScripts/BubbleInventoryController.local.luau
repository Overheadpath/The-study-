
local Players=game:GetService("Players")
local StarterGui=game:GetService("StarterGui")
local UIS=game:GetService("UserInputService")
local GuiService=game:GetService("GuiService")
local RunService=game:GetService("RunService")
local SoundService=game:GetService("SoundService")
local player=Players.LocalPlayer
local pg=player:WaitForChild("PlayerGui")
local system=game.ReplicatedStorage:WaitForChild("FishingSystem")
local Theme=require(system.BubbleTheme)
local Items=require(system.ItemPresentation)
local Config=require(system.Config)
local make=Theme.New
local gui=make("ScreenGui","BubbleInventory",pg,{ResetOnSpawn=false,DisplayOrder=30,ZIndexBehavior=Enum.ZIndexBehavior.Sibling})
pg:SetAttribute("CustomInventoryActive",true)
if pg:GetAttribute("CatchNotices")==nil then pg:SetAttribute("CatchNotices",true) end
local C={Surface=Color3.fromRGB(235,242,237),Soft=Color3.fromRGB(205,225,226),Muted=Color3.fromRGB(164,201,210),Navy=Color3.fromRGB(27,67,85),Inner=Color3.fromRGB(42,95,117)}
local function label(parent,name,txt,x,y,w,h,size,dark)
 local v=make("TextLabel",name,parent,{Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(w,h),Text=txt,BackgroundTransparency=1,TextSize=size or 16,TextXAlignment=Enum.TextXAlignment.Left,TextWrapped=true})
 Theme.Text(v)
 if dark then v.TextColor3=Theme.Ink v.BubbleText.Enabled=false elseif size and size<=16 then v.BubbleText.Transparency=0.65 end
 return v
end
local function button(parent,name,txt,x,y,w,h,color,size)
 local v=make("TextButton",name,parent,{Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(w,h),Text=txt,TextSize=size or 17,BorderSizePixel=0})
 Theme.Button(v,color or Theme.Mint) return v
end
local function frame(parent,name,x,y,w,h,color)
 local v=make("Frame",name,parent,{Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(w,h),BackgroundColor3=color or C.Inner,BorderSizePixel=0})
 Theme.Corner(v,9) return v
end
local function view(parent,name,x,y,w,h)
 return make("ViewportFrame",name,parent,{Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(w,h),BackgroundTransparency=1})
end
local function line(parent,x,y,w,h,color)
 return make("Frame","Line",parent,{Position=UDim2.fromOffset(x,y),Size=UDim2.fromOffset(w,h),BackgroundColor3=color or Theme.Cream,BorderSizePixel=0})
end
local function icon(parent,kind)
 local f=make("Frame","Icon",parent,{Position=UDim2.fromOffset(9,10),Size=UDim2.fromOffset(23,23),BackgroundTransparency=1})
 if kind=="Backpack" then
  local a=frame(f,"Body",3,6,17,16,Theme.Cream) Theme.Corner(a,4)
  local b=frame(f,"Handle",8,1,7,7,Theme.Cream) Theme.Corner(b,3)
  line(f,6,15,11,2,Theme.Ink)
 elseif kind=="Index" then
  frame(f,"Page",1,3,10,18,Theme.Cream) frame(f,"Page",13,3,10,18,Theme.Cream)
  line(f,11,3,2,20,Theme.Ink)
 elseif kind=="Shop" then
  frame(f,"Store",4,10,17,12,Theme.Cream)
  line(f,1,4,23,6,Theme.Cream) line(f,11,15,5,7,Theme.Ink)
 else
  for i=0,2 do line(f,1,5+i*7,22,2,Theme.Cream) frame(f,"Slider",4+(i%2)*10,2+i*7,4,7,Theme.Gold) end
 end
end
-- Compact persistent HUD.
local hud=make("Frame","MainHUD",gui,{Position=UDim2.fromOffset(18,12),Size=UDim2.fromOffset(226,213),BackgroundTransparency=1})
local hudScale=make("UIScale","ResponsiveScale",hud,{Scale=1})
local wallet=frame(hud,"Wallet",0,0,226,86,C.Navy) Theme.Border(wallet,2)
label(wallet,"CurrencyLabel","COINS",14,7,150,16,12)
local money=label(wallet,"Money","$0",14,24,198,29,27) money.TextColor3=Theme.Gold
local rodLabel=label(wallet,"Rod","No rod equipped",14,57,198,19,13) rodLabel.TextColor3=C.Muted
local nav={}
for i,name in {"Backpack","Shop","Index","Settings"} do
 local x=((i-1)%2)*116 local y=94+math.floor((i-1)/2)*46
 local b=button(hud,name,"",x,y,110,40,({Theme.Purple,Theme.Mint,Theme.Gold,Color3.fromRGB(101,173,195)})[i])
 icon(b,name)
 label(b,"Label",name,38,3,69,33,14)
 nav[name]=b
end
local status=label(hud,"FishingStatus","Ready for the next catch",2,189,224,20,13)
local hotbar=make("Frame","Hotbar",gui,{AnchorPoint=Vector2.new(0.5,1),Position=UDim2.new(0.5,0,1,-12),Size=UDim2.fromOffset(542,72),BackgroundTransparency=1})
local hotScale=make("UIScale","ResponsiveScale",hotbar,{Scale=1})
local bag=button(hotbar,"OpenBackpack","BAG",468,0,74,70,Theme.Purple,16)
label(bag,"Shortcut","B",7,3,18,15,10)
-- One collection window, shared by backpack and index.
local window=make("Frame","CollectionWindow",gui,{AnchorPoint=Vector2.new(0.5,0.5),Position=UDim2.fromScale(0.5,0.48),Size=UDim2.fromOffset(840,514),BorderSizePixel=0,Visible=false})
Theme.Panel(window)
local windowScale=make("UIScale","ResponsiveScale",window,{Scale=1})
local title=label(window,"Title","",22,12,670,39,29) Theme.RainbowText(title,"YOUR BACKPACK")
local subtitle=label(window,"Subtitle","Your catches, companions, and fishing gear.",23,51,735,21,14) subtitle.TextColor3=C.Soft
local close=button(window,"Close","×",790,17,31,31,Theme.Pink,22)
line(window,20,77,800,1,Color3.fromRGB(96,148,167))
local tabs={}
for i,name in Items.Categories do
 tabs[name]=button(window,name,name,20+(i-1)*105,91,97,34,C.Inner,16)
end
local search=make("TextBox","Search",window,{Position=UDim2.fromOffset(20,139),Size=UDim2.fromOffset(310,34),Text="",PlaceholderText="Search your collection…",ClearTextOnFocus=false,TextSize=15,Font=Theme.Font,TextColor3=Theme.Ink,PlaceholderColor3=Color3.fromRGB(94,120,128),BackgroundColor3=C.Surface,BorderSizePixel=0,TextXAlignment=Enum.TextXAlignment.Left})
Theme.Corner(search,8)
make("UIPadding","Padding",search,{PaddingLeft=UDim.new(0,12),PaddingRight=UDim.new(0,8)})
local sortButton=button(window,"Sort","Sort: newest",342,139,193,34,C.Inner,15)
local progress=frame(window,"ProgressTrack",20,92,515,5,C.Navy)
local progressFill=frame(progress,"Fill",0,0,0,5,Theme.Mint)
progress.Visible=false
local indexFilter=button(window,"IndexFilter","All fish",342,139,193,34,C.Inner,15) indexFilter.Visible=false
local list=make("ScrollingFrame","Items",window,{Position=UDim2.fromOffset(20,187),Size=UDim2.fromOffset(519,270),BackgroundTransparency=1,BorderSizePixel=0,CanvasSize=UDim2.fromOffset(0,0),AutomaticCanvasSize=Enum.AutomaticSize.Y,ScrollBarThickness=4,ScrollBarImageColor3=C.Muted})
make("UIGridLayout","Grid",list,{CellSize=UDim2.fromOffset(163,124),CellPadding=UDim2.fromOffset(9,10),SortOrder=Enum.SortOrder.LayoutOrder})
local empty=label(window,"Empty","",48,251,460,88,20)
empty.TextXAlignment=Enum.TextXAlignment.Center
local footer=label(window,"Footer","",22,473,512,23,13) footer.TextColor3=C.Soft
local detail=frame(window,"Details",556,92,264,403,C.Surface)
local detailTitle=label(detail,"Name","Select an item",16,13,230,45,23,true)
local rarity=label(detail,"Rarity","",16,60,230,20,13,true)
local detailView=view(detail,"Preview",15,88,234,133)
local description=label(detail,"Description","Choose a card to see its details.",16,228,232,45,15,true)
local facts=label(detail,"Facts","",16,277,232,60,14,true)
local equipButton=button(detail,"Equip","EQUIP",16,349,232,38,Theme.Mint,18)
equipButton.Visible=false
-- Settings and market directions use smaller, focused windows.
local function smallWindow(name,heading,height)
 local v=make("Frame",name,gui,{AnchorPoint=Vector2.new(0.5,0.5),Position=UDim2.fromScale(0.5,0.48),Size=UDim2.fromOffset(490,height),BorderSizePixel=0,Visible=false})
 Theme.Panel(v)
 make("UIScale","ResponsiveScale",v,{Scale=1})
 local t=label(v,"Title","",20,14,405,37,26) Theme.RainbowText(t,heading)
 button(v,"Close","×",442,16,29,29,Theme.Pink,22)
 return v
end
local settings=smallWindow("Settings","MAKE YOURSELF AT HOME",290)
label(settings,"Intro","A few small comforts for your fishing session.",22,56,445,27,14)
local settingsButtons={}
for i,spec in {{"Motion","Menu motion","Soft transitions and button movement"},{"Ambience","Ambient sound","Wind and background ambience"},{"Notices","Catch popups","Show a card when you land a fish"}} do
 local y=96+(i-1)*59
 label(settings,spec[1].."Label",spec[2],22,y,305,24,18)
 label(settings,spec[1].."Help",spec[3],22,y+24,315,19,12).TextColor3=C.Soft
 settingsButtons[spec[1]]=button(settings,spec[1],"ON",363,y+4,105,35,Theme.Mint,16)
end
local developer=smallWindow("Developer","ANGLER LAB",540)
label(developer,"Intro","Developer tools · session inventory",22,56,445,24,13)
local devFish=button(developer,"FishTab","SPAWN FISH",22,90,217,34,Theme.Gold,15)
local devRods=button(developer,"RodsTab","SELECT ROD",251,90,217,34,C.Inner,15)
local devList=make("ScrollingFrame","Catalog",developer,{Position=UDim2.fromOffset(22,137),Size=UDim2.fromOffset(446,248),BackgroundTransparency=1,BorderSizePixel=0,AutomaticCanvasSize=Enum.AutomaticSize.Y,CanvasSize=UDim2.new(),ScrollBarThickness=4,ScrollBarImageColor3=C.Muted})
make("UIGridLayout","Grid",devList,{CellSize=UDim2.fromOffset(214,105),CellPadding=UDim2.fromOffset(10,9),SortOrder=Enum.SortOrder.LayoutOrder})
local devName=label(developer,"Selection","",22,394,445,25,19)
local devInfo=label(developer,"Info","",22,423,445,61,12)
devInfo.TextColor3=C.Soft
local devApply=button(developer,"Apply","SPAWN FISH",22,494,446,33,Theme.Mint,16)
local devStatus=label(developer,"Status","",22,475,445,17,11)
local devOpen=button(settings,"DeveloperTools","DEVELOPER TOOLS",22,284,446,36,Theme.Purple,15)
devOpen.Visible=false
local devMode="Fish"
local selectedDevFish=Config.Fish[1].Id
local selectedDevRod="Coastal"
local guide=smallWindow("MarketGuide","FINN'S FISH MARKET",287)
label(guide,"Intro","A good catch deserves a fair price.",22,58,445,28,16)
label(guide,"How","Bring your fish to the market in the hub. Sell a single held fish or your whole basket.",22,105,445,61,17)
local distanceLabel=label(guide,"Distance","",22,177,445,25,15)
local trackButton=button(guide,"Track","SHOW ME THE WAY",22,221,446,42,Theme.Mint,18)
local waypoint
local notice=frame(gui,"Notice",0,0,370,47,C.Navy)
notice.AnchorPoint=Vector2.new(0.5,0) notice.Position=UDim2.new(0.5,0,0,18) notice.Visible=false
Theme.Border(notice,2)
local noticeText=label(notice,"Text","",12,5,346,37,16) noticeText.TextXAlignment=Enum.TextXAlignment.Center
local noticeToken=0
local function notify(text)
 noticeToken+=1 local token=noticeToken noticeText.Text=text notice.Visible=true Theme.Pop(notice)
 task.delay(3.5,function() if token==noticeToken then notice.Visible=false end end)
end
local tools,slots,toolSignals={},{},{}
local characterConnections,backpackConnections={},{}
local mode="Backpack"
local category="Fish"
local sortMode=1
local sortNames={"newest","value","name"}
local indexMode=1
local indexNames={"All fish","Discovered","Undiscovered"}
local selectedTool,selectedFish
local scheduled=false
local refresh
local function menuOpen()
 local m=pg:FindFirstChild("FishingMenu") return m and m.Enabled
end
local function fishingHUD() return pg:FindFirstChild("FishingHUD") end
local function dismissAll()
 window.Visible=false settings.Visible=false guide.Visible=false developer.Visible=false
 local f=fishingHUD() if f then f.FishMarket.Visible=false end
 gui:SetAttribute("BackpackOpen",false)
 if GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(gui) then GuiService.SelectedObject=nil end
end
local function syncModal()
 local f=fishingHUD()
 gui:SetAttribute("BackpackOpen",window.Visible or settings.Visible or guide.Visible or developer.Visible)
 if f and (window.Visible or settings.Visible or guide.Visible or developer.Visible) then f.ReelPanel.Visible=false f.CatchCard.Visible=false end
end
local function schedule()
 if scheduled then return end scheduled=true task.defer(function() scheduled=false if refresh then refresh() end end)
end
local function openCollection(which)
 if menuOpen() then return end
 dismissAll() mode=which
 window.Visible=true search.Text=""
 if mode=="Index" and not selectedFish then selectedFish=Config.Fish[1].Id end
 syncModal() system.Action:FireServer("Cancel") Theme.Pop(window) schedule()
 if UIS.GamepadEnabled then GuiService.SelectedObject=close end
end
local function openSmall(w)
 if menuOpen() then return end
 dismissAll() w.Visible=true syncModal() system.Action:FireServer("Cancel") Theme.Pop(w)
 if UIS.GamepadEnabled then GuiService.SelectedObject=w.Close end
end
local function getRecord(id)
 local folder=player:FindFirstChild("FishDiscoveries") return folder and folder:FindFirstChild(id)
end
local function equip(tool)
 if menuOpen() or not tool or not tool.Parent then return end
 local c=player.Character local h=c and c:FindFirstChildOfClass("Humanoid")
 if not h or h.Health<=0 then return end
 if tool.Parent==c then h:UnequipTools() else h:EquipTool(tool) end
 local f=fishingHUD()
 if f and f.FishMarket.Visible then task.delay(0.2,function() system.Action:FireServer("Shop") end) end
end
local function clearDetail()
 detailTitle.Text="Your collection" rarity.Text="" description.Text="Choose an item to see its details."
 facts.Text="" equipButton.Visible=false Items.Clear(detailView)
end
local function itemDetail(tool)
 if not tool or not table.find(tools,tool) then clearDetail() return end
 local data=Items.Data(tool)
 detailTitle.Text=data.Name rarity.Text=string.upper(data.Rarity).."  /  "..data.Category
 rarity.TextColor3=Items.Colors[data.Rarity] and Items.Colors[data.Rarity]:Lerp(Theme.Ink,0.45) or Theme.Ink
 Items.Preview(detailView,tool,false)
 description.Text=data.Description~="" and data.Description or "Ready for your next fishing trip."
 local rows={"Quantity  ×"..data.Quantity}
if data.Category=="Rods" then
 local rod=Config.GetRod(tool:GetAttribute("RodId"))
 if rod then local pool=Config.CatchPool(rod.Id) rows={"Tier  "..rod.Tier,"Catch pool  "..#pool.." fish","Equip to use this catch pool"} end
end

 if data.Weight then table.insert(rows,string.format("Weight  %.2f kg",data.Weight)) end
 if data.Value then table.insert(rows,"Sell value  $"..data.Value) end
 if (tool:GetAttribute("ZoneMultiplier") or 1)>1 then table.insert(rows,"Atlantic bonus  ×1.2") end
 if data.Mutation then table.insert(rows,"Mutation  "..tostring(data.Mutation)) end
 facts.Text=table.concat(rows,"\n")
 equipButton.Visible=true
 local equipped=player.Character and tool.Parent==player.Character
 equipButton.Text=equipped and "UNEQUIP" or "EQUIP"
 equipButton.BackgroundColor3=equipped and Theme.Gold or Theme.Mint
end
local function indexDetail(id)
 local fish=Items.Fish(id)
 if not fish then clearDetail() return end
 local record=getRecord(id)
 Items.Preview(detailView,id,not record)
 equipButton.Visible=false
 if not record then
  detailTitle.Text="Undiscovered fish" rarity.Text="A NEW DISCOVERY AWAITS"
  rarity.TextColor3=Theme.Ink
  description.Text="Catch this fish to reveal its name, habitat, and field notes."
  facts.Text="Keep exploring the water.\nYour first catch unlocks this entry."
 else
  detailTitle.Text=fish.Name rarity.Text=string.upper(fish.Rarity).."  /  DISCOVERED"
  rarity.TextColor3=Items.Colors[fish.Rarity]:Lerp(Theme.Ink,0.45)
  description.Text=fish.Description
  facts.Text=string.format("%s\nBest  %.2f kg  ·  Caught %d\nTypical value  $%d–$%d",fish.Habitat,record:GetAttribute("BestWeight") or 0,record:GetAttribute("CatchCount") or 1,math.floor(fish.BaseValue*0.8+0.5),math.floor(fish.BaseValue*1.2+0.5))
 end
end
local function card(parent,name,order,accent)
 local b=button(parent,name,"",0,0,163,124,C.Surface)
 b.LayoutOrder=order b.BubbleBorder.Thickness=1 b.BubbleBorder.Color=Color3.fromRGB(120,171,185)
 local accentLine=line(b,9,8,145,3,accent or Theme.Mint) accentLine.Size=UDim2.new(1,-18,0,3)
 return b
end
local function renderCollection()
 local savedScroll=list.CanvasPosition
 task.defer(function() if list.Parent then list.CanvasPosition=savedScroll end end)
 for _,v in list:GetChildren() do if v:IsA("GuiObject") then v:Destroy() end end
 if not window.Visible then return end
 local isIndex=mode=="Index"
 for _,v in tabs do v.Visible=not isIndex end
 progress.Visible=isIndex indexFilter.Visible=isIndex sortButton.Visible=not isIndex
 search.PlaceholderText=isIndex and "Search discovered fish…" or "Search "..category:lower().."…"
 Theme.RainbowText(title,isIndex and "FISH INDEX" or "YOUR BACKPACK")
 local q=search.Text:lower() local count=0
 if isIndex then
  local discovered=0
  for _,fish in Config.Fish do if getRecord(fish.Id) then discovered+=1 end end
  subtitle.Text=string.format("%d of %d discovered  ·  Every first catch has a story.",discovered,#Config.Fish)
  progressFill.Size=UDim2.new(discovered/math.max(#Config.Fish,1),0,1,0)
  footer.Text="Discoveries stay in your index after selling."
  for i,fish in Config.Fish do
   local known=getRecord(fish.Id)~=nil
   if (indexMode==1 or indexMode==2 and known or indexMode==3 and not known) and (q=="" or known and fish.Name:lower():find(q,1,true)) then
    count+=1
    local b=card(list,"Fish"..i,count,known and fish.Color or C.Muted)
    local thumb=view(b,"Preview",8,14,139,64) thumb.Size=UDim2.new(1,-16,0,64) Items.Preview(thumb,fish.Id,not known)
    local name=label(b,"Name",known and fish.Name or "???",10,81,143,22,16,true)
    name.Size=UDim2.new(1,-20,0,22) name.TextScaled=true make("UITextSizeConstraint","TextLimit",name,{MinTextSize=10,MaxTextSize=16}) name.TextXAlignment=Enum.TextXAlignment.Center
    local state=label(b,"State",known and "DISCOVERED" or "UNDISCOVERED",10,104,143,16,10,true)
    state.Size=UDim2.new(1,-20,0,16) state.TextSize=9 state.TextXAlignment=Enum.TextXAlignment.Center state.TextColor3=known and Color3.fromRGB(48,121,97) or Color3.fromRGB(104,126,137)
    if selectedFish==fish.Id then b.BubbleBorder.Color=Theme.Gold b.BubbleBorder.Thickness=3 end
    b.Activated:Connect(function() selectedFish=fish.Id renderCollection() end)
   end
  end
  indexDetail(selectedFish)
  empty.Text="No entries match this view.\nA new catch might change that."
 else
  subtitle.Text="Your catches, companions, and fishing gear."
  for name,b in tabs do b.BackgroundColor3=name==category and Theme.Gold or C.Inner end
  local filtered={}
  for _,tool in tools do if Items.Category(tool)==category and Items.Name(tool):lower():find(q,1,true) then table.insert(filtered,tool) end end
  table.sort(filtered,function(a,b)
   if sortMode==2 then
    local av,bv=a:GetAttribute("SellValue") or 0,b:GetAttribute("SellValue") or 0
    if av~=bv then return av>bv end
   elseif sortMode==3 then
    local an,bn=Items.Name(a),Items.Name(b) if an~=bn then return an<bn end
   end
   return (table.find(tools,a) or 0)>(table.find(tools,b) or 0)
  end)
  for i,tool in filtered do
   count+=1 local data=Items.Data(tool)
   local b=card(list,"Item"..i,i,Items.Colors[data.Rarity])
   local thumb=view(b,"Preview",8,13,139,64) thumb.Size=UDim2.new(1,-16,0,64) Items.Preview(thumb,tool,false)
   local quantity=label(b,"Quantity","×"..data.Quantity,124,16,31,16,11,true) quantity.Position=UDim2.new(1,-36,0,16)
   local name=label(b,"Name",data.Name,10,80,143,23,15,true) name.Size=UDim2.new(1,-20,0,22) name.TextScaled=true make("UITextSizeConstraint","TextLimit",name,{MinTextSize=10,MaxTextSize=16}) name.TextXAlignment=Enum.TextXAlignment.Center
   local secondary=data.Value and ("$"..data.Value.."  ·  "..string.format("%.2f kg",data.Weight or 0)) or data.Rarity
   local info=label(b,"Info",secondary,6,104,143,16,11,true) info.Size=UDim2.new(1,-12,0,16) info.TextSize=10 info.TextXAlignment=Enum.TextXAlignment.Center
   if player.Character and tool.Parent==player.Character then
    local equipped=label(b,"Equipped","EQUIPPED",9,13,93,16,9,true) equipped.TextColor3=Color3.fromRGB(47,121,97)
   end
   if selectedTool==tool then b.BubbleBorder.Color=Theme.Gold b.BubbleBorder.Thickness=3 end
   b.Activated:Connect(function() selectedTool=tool renderCollection() end)
  end
  footer.Text=string.format("%d %s item%s  ·  Select a card for details",count,category:lower(),count==1 and "" or "s")
  if selectedTool and Items.Category(selectedTool)==category then itemDetail(selectedTool) else clearDetail() end
  local messages={
   Fish="Your next catch belongs here.\nEquip your rod and head to the water.",
   Pets="No companions in your collection yet.\nOwned pets will appear here.",
   Rods="No rods match this search.",
   Bait="No bait in your collection yet.\nOwned bait will appear here.",
   Equipment="No equipment in your collection yet.\nYour other fishing gear will appear here."
  }
  empty.Text=q~="" and "No matching items.\nTry a different name or category." or messages[category]
 end
 empty.Visible=count==0
end
local function renderHotbar()
 for _,v in slots do v:Destroy() end slots={}
 for i=1,6 do
  local tool=tools[i]
  if tool then
   local data=Items.Data(tool)
   local b=button(hotbar,"Slot"..i,"",(i-1)*78,0,70,70,C.Surface)
   Items.Preview(view(b,"Preview",7,8,56,36),tool,false)
   local key=label(b,"Key",tostring(i),5,3,16,12,10,true)
   local name=label(b,"Name",data.Category=="Rods" and data.Name:gsub(" Rod$","") or data.Name,3,43,64,15,10,true)
   name.TextScaled=true make("UITextSizeConstraint","Limit",name,{MinTextSize=8,MaxTextSize=10})
   name.TextXAlignment=Enum.TextXAlignment.Center
   if data.Value then label(b,"Value","$"..data.Value,3,57,64,12,10,true).TextXAlignment=Enum.TextXAlignment.Center end
   b.BubbleBorder.Color=player.Character and tool.Parent==player.Character and Theme.Gold or C.Navy
   b.BubbleBorder.Thickness=player.Character and tool.Parent==player.Character and 3 or 1.5
   b.Activated:Connect(function() equip(tool) end) slots[i]=b
  else
   local b=frame(hotbar,"Slot"..i,(i-1)*78,0,70,70,C.Navy)
   b.BackgroundTransparency=0.16 Theme.Border(b,1.5)
   label(b,"Key",tostring(i),5,3,16,12,10).TextTransparency=0.3 slots[i]=b
  end
 end
end
refresh=function()
 local found={} local bp=player:FindFirstChildOfClass("Backpack")
 for _,parent in {bp,player.Character} do if parent then for _,t in parent:GetChildren() do if t:IsA("Tool") then found[t]=true end end end end
 for i=#tools,1,-1 do if not found[tools[i]] then
  local t=tools[i] if toolSignals[t] then toolSignals[t]:Disconnect() toolSignals[t]=nil end
  if selectedTool==t then selectedTool=nil end table.remove(tools,i)
 end end
 for t in found do if not table.find(tools,t) then
  if Items.Category(t)=="Rods" then table.insert(tools,1,t) else table.insert(tools,t) end
  toolSignals[t]=t.AttributeChanged:Connect(schedule)
 end end
 local heldRod
 for _,t in tools do if player.Character and t.Parent==player.Character and Items.Category(t)=="Rods" then heldRod=t break end end
 rodLabel.Text=heldRod and ("Equipped  ·  "..Items.Name(heldRod)) or "No rod equipped"
 renderHotbar() renderCollection()
end
local function connectContainer(parent,connections)
 for _,c in connections do c:Disconnect() end table.clear(connections)
 if parent then table.insert(connections,parent.ChildAdded:Connect(schedule)) table.insert(connections,parent.ChildRemoved:Connect(schedule)) end
 schedule()
end
player.CharacterAdded:Connect(function(c) connectContainer(c,characterConnections) dismissAll() end)
player.ChildAdded:Connect(function(c) if c:IsA("Backpack") then connectContainer(c,backpackConnections) end end)
connectContainer(player.Character,characterConnections)
connectContainer(player:FindFirstChildOfClass("Backpack"),backpackConnections)
local function discoveries(folder)
 for _,v in folder:GetChildren() do v.AttributeChanged:Connect(schedule) end
 folder.ChildAdded:Connect(function(v) v.AttributeChanged:Connect(schedule) schedule() end)
 folder.ChildRemoved:Connect(schedule) schedule()
end
if player:FindFirstChild("FishDiscoveries") then discoveries(player.FishDiscoveries) end
player.ChildAdded:Connect(function(v) if v.Name=="FishDiscoveries" then discoveries(v) end end)
local function updateMoney()
 local n=player:GetAttribute("FishingCoins") or 0
 local formatted=tostring(math.floor(n)):reverse():gsub("(%d%d%d)","%1,"):reverse():gsub("^,","")
 money.Text="$"..formatted
end
updateMoney() player:GetAttributeChangedSignal("FishingCoins"):Connect(updateMoney)
for name,b in tabs do b.Activated:Connect(function() category=name selectedTool=nil search.Text="" schedule() end) end
sortButton.Activated:Connect(function() sortMode=sortMode%3+1 sortButton.Text="Sort: "..sortNames[sortMode] schedule() end)
indexFilter.Activated:Connect(function() indexMode=indexMode%3+1 indexFilter.Text=indexNames[indexMode] schedule() end)
search:GetPropertyChangedSignal("Text"):Connect(schedule)
equipButton.Activated:Connect(function() equip(selectedTool) end)
close.Activated:Connect(dismissAll)
settings.Close.Activated:Connect(dismissAll) guide.Close.Activated:Connect(dismissAll)
bag.Activated:Connect(function() if window.Visible and mode=="Backpack" then dismissAll() else openCollection("Backpack") end end)
nav.Backpack.Activated:Connect(function() openCollection("Backpack") end)
nav.Index.Activated:Connect(function() openCollection("Index") end)
nav.Settings.Activated:Connect(function() openSmall(settings) end)
local function renderDev()
 local savedScroll=devList.CanvasPosition
 task.defer(function() if devList.Parent then devList.CanvasPosition=savedScroll end end)
 for _,v in devList:GetChildren() do if v:IsA("GuiObject") then v:Destroy() end end
 local fishMode=devMode=="Fish"
 devFish.BackgroundColor3=fishMode and Theme.Gold or C.Inner
 devRods.BackgroundColor3=fishMode and C.Inner or Theme.Gold
 for i,d in fishMode and Config.Fish or Config.Rods do
  local id=d.Id
  local b=button(devList,id,"",0,0,214,105,C.Surface)
  b.LayoutOrder=i
  local thumb=view(b,"Preview",6,9,85,65)
  Items.Preview(thumb,fishMode and id or system.RodPreviews:FindFirstChild(id),false)
  local title=label(b,"ItemName",d.Name,94,10,113,38,14,true)
  local meta=label(b,"Meta",fishMode and (d.Rarity.."\n~$"..d.BaseValue) or ("Tier "..d.Tier.."\n"..#Config.CatchPool(id).." fish"),94,51,113,38,12,true)
  label(b,"Tier","TIER "..d.Tier,8,82,196,17,10,true)
  b.BubbleBorder.Color=(fishMode and selectedDevFish==id or not fishMode and selectedDevRod==id) and Theme.Gold or C.Muted
  b.BubbleBorder.Thickness=(fishMode and selectedDevFish==id or not fishMode and selectedDevRod==id) and 3 or 1
  b.Activated:Connect(function() if fishMode then selectedDevFish=id else selectedDevRod=id end devStatus.Text="" renderDev() end)
 end
 if fishMode then
  local d=Config.GetFish(selectedDevFish)
  devName.Text=d.Name.."  ·  Tier "..d.Tier
  local rods={} for _,r in Config.Rods do if (r.Weights[d.Id] or 0)>0 then table.insert(rods,r.Name) end end
  devInfo.Text=string.format("%s\n%.2f–%.2f kg · Typical value $%d–$%d\nCaught with: %s",d.Description,d.MinWeight,d.MaxWeight,math.floor(d.BaseValue*.8+.5),math.floor(d.BaseValue*1.2+.5),table.concat(rods,", "))
  devApply.Text="SPAWN ONE FISH"
 else
  local d=Config.GetRod(selectedDevRod)
  devName.Text=d.Name.."  ·  Tier "..d.Tier
  local pool,total=Config.CatchPool(d.Id) local lines={}
  for i,entry in pool do
   local t=entry.Fish.Name.." "..string.format("%g%%",entry.Weight/total*100)
   if i%2==0 then lines[#lines]=lines[#lines].."  /  "..t else table.insert(lines,t) end
  end
  devInfo.Text=table.concat(lines,"\n")
  devApply.Text="EQUIP "..string.upper(d.Name)
 end
end
local function syncDevAccess()
 local allowed=player:GetAttribute("CanUseFishingDevTools")==true
 devOpen.Visible=allowed settings.Size=UDim2.fromOffset(490,allowed and 340 or 290)
 if not allowed then developer.Visible=false syncModal() end
 local size=workspace.CurrentCamera.ViewportSize
 settings.ResponsiveScale.Scale=math.min(1,(size.X-24)/490,(size.Y-90)/settings.Size.Y.Offset)
end
player:GetAttributeChangedSignal("CanUseFishingDevTools"):Connect(syncDevAccess)
syncDevAccess()
devOpen.Activated:Connect(function()
 if player:GetAttribute("CanUseFishingDevTools")~=true then return end
 openSmall(developer) devStatus.Text="" renderDev()
end)
developer.Close.Activated:Connect(dismissAll)
devFish.Activated:Connect(function() devMode="Fish" devStatus.Text="" renderDev() end)
devRods.Activated:Connect(function() devMode="Rods" devStatus.Text="" renderDev() end)
local devDebounce=0
devApply.Activated:Connect(function()
 if player:GetAttribute("CanUseFishingDevTools")~=true or os.clock()<devDebounce then return end
 devDebounce=os.clock()+.3
 system.DevAction:FireServer(devMode=="Fish" and "SpawnFish" or "EquipRod",devMode=="Fish" and selectedDevFish or selectedDevRod)
end)
system.DevResult.OnClientEvent:Connect(function(ok,message)
 devStatus.Text=message devStatus.TextColor3=ok and Theme.Mint or Theme.Pink schedule()
end)
local function merchantDistance()
 local c=player.Character local r=c and c:FindFirstChild("HumanoidRootPart")
 local marker,distance=nil,math.huge
 if r then for _,v in game:GetService("CollectionService"):GetTagged("FishMerchant") do
  if v:IsA("BasePart") and v:IsDescendantOf(workspace) then local d=(r.Position-v.Position).Magnitude if d<distance then marker=v distance=d end end
 end end
 return marker,distance
end
local function openShop()
 if menuOpen() then return end
 local character=player.Character local root=character and character:FindFirstChild("HumanoidRootPart")
 if root then
  for _,marker in game:GetService("CollectionService"):GetTagged("RodMerchant") do
   if marker:IsA("BasePart") and marker:IsDescendantOf(workspace) and (root.Position-marker.Position).Magnitude<=15 then
    dismissAll() system.TradeAction:FireServer("OpenRods") return
   end
  end
 end
 local _,distance=merchantDistance()

 if distance<=15 then dismissAll() system.Action:FireServer("Shop") else openSmall(guide) end
end
nav.Shop.Activated:Connect(openShop)
trackButton.Activated:Connect(function()
 local marker,distance=merchantDistance()
 if not marker then notify("The market is currently unavailable.") return end
 if distance<=15 then dismissAll() system.Action:FireServer("Shop") return end
 if waypoint then waypoint:Destroy() waypoint=nil trackButton.Text="SHOW ME THE WAY" return end
 waypoint=make("BillboardGui","MarketWaypoint",pg,{Adornee=marker,Size=UDim2.fromOffset(155,47),StudsOffset=Vector3.new(0,4,0),AlwaysOnTop=true})
 local t=label(waypoint,"Label","FISH MARKET",0,0,155,47,16) t.TextXAlignment=Enum.TextXAlignment.Center t.TextColor3=Theme.Gold
 notify("Market marked. Follow the sign above Finn's stall.")
 dismissAll()
end)
local ambience=Instance.new("SoundGroup") ambience.Name="FishingAmbienceMix" ambience.Parent=SoundService
local function mix(sound)
 if sound:IsA("Sound") and (sound.Name:lower():find("wind") or sound.Name:lower():find("ambien")) then sound.SoundGroup=ambience end
end
for _,v in SoundService:GetDescendants() do mix(v) end SoundService.DescendantAdded:Connect(mix)
settingsButtons.Motion.Activated:Connect(function()
 local reduce=not pg:GetAttribute("ReduceMotion") pg:SetAttribute("ReduceMotion",reduce)
 settingsButtons.Motion.Text=reduce and "OFF" or "ON" settingsButtons.Motion.BackgroundColor3=reduce and Theme.Purple or Theme.Mint
end)
settingsButtons.Ambience.Activated:Connect(function()
 ambience.Volume=ambience.Volume==0 and 1 or 0
 settingsButtons.Ambience.Text=ambience.Volume==0 and "OFF" or "ON"
 settingsButtons.Ambience.BackgroundColor3=ambience.Volume==0 and Theme.Purple or Theme.Mint
end)
settingsButtons.Notices.Activated:Connect(function()
 local enabled=not pg:GetAttribute("CatchNotices") pg:SetAttribute("CatchNotices",enabled)
 settingsButtons.Notices.Text=enabled and "ON" or "OFF" settingsButtons.Notices.BackgroundColor3=enabled and Theme.Mint or Theme.Purple
end)
local keys={Enum.KeyCode.One,Enum.KeyCode.Two,Enum.KeyCode.Three,Enum.KeyCode.Four,Enum.KeyCode.Five,Enum.KeyCode.Six}
UIS.InputBegan:Connect(function(input,processed)
 if processed or UIS:GetFocusedTextBox() or menuOpen() then return end
 if input.KeyCode==Enum.KeyCode.B or input.KeyCode==Enum.KeyCode.Backquote or input.KeyCode==Enum.KeyCode.ButtonY then
  if window.Visible and mode=="Backpack" then dismissAll() else openCollection("Backpack") end
 elseif input.KeyCode==Enum.KeyCode.I then openCollection("Index")
 else local n=table.find(keys,input.KeyCode) if n then equip(tools[n]) end end
end)
local function hideDefault() pcall(function() StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack,false) end) end
local function syncMenu()
 local open=menuOpen() hud.Visible=not open hotbar.Visible=not open notice.Visible=false
 if open then dismissAll() else hideDefault() end
end
local function attachMenu(m)
 if m.Name=="FishingMenu" and m:IsA("ScreenGui") then m:GetPropertyChangedSignal("Enabled"):Connect(syncMenu) syncMenu() end
end
pg.ChildAdded:Connect(attachMenu) if pg:FindFirstChild("FishingMenu") then attachMenu(pg.FishingMenu) end
hideDefault()
local function attachFishing(f)
 if f.Name~="FishingHUD" then return end
 task.spawn(function()
  local market=f:WaitForChild("FishMarket",10)
  if market then market:GetPropertyChangedSignal("Visible"):Connect(function()
   if market.Visible then window.Visible=false settings.Visible=false guide.Visible=false developer.Visible=false syncModal() end
  end) end
 end)
end
pg.ChildAdded:Connect(attachFishing) if fishingHUD() then attachFishing(fishingHUD()) end
system.Update.OnClientEvent:Connect(function(kind,data)
 local states={Idle="Ready for the next catch",Waiting="Line in the water",Bite="Fish on! Hook it!",Reeling="Reel when the marker is green",Caught="Catch landed!"}
 if states[kind] then status.Text=states[kind] status.TextColor3=kind=="Bite" and Theme.Gold or Theme.Cream end
 if kind=="Caught" then
  schedule()
  if data.newDiscovery then notify("New discovery! Your fish index has a new entry.") end
 elseif kind=="Sold" and data.count>0 then notify(string.format("Sold %d fish  ·  +$%d",data.count,data.value)) end
end)
local function resize()
 local size=workspace.CurrentCamera.ViewportSize
 local compact=size.X<650
window.Size=UDim2.fromOffset(compact and 370 or 840,compact and 580 or 514)
windowScale.Scale=math.min(1,(size.X-20)/(compact and 370 or 840),(size.Y-108)/(compact and 580 or 514))
title.Size=UDim2.fromOffset(compact and 297 or 670,39)
title.TextSize=compact and 25 or 29
title.Position=UDim2.fromOffset(compact and 14 or 22,12)
close.Position=UDim2.fromOffset(compact and 326 or 790,17)
subtitle.Size=UDim2.fromOffset(compact and 338 or 735,21)
subtitle.Position=UDim2.fromOffset(compact and 14 or 23,51)
subtitle.TextSize=compact and 12 or 14
window.Line.Size=UDim2.fromOffset(compact and 330 or 800,1)
for i,name in Items.Categories do
 tabs[name].Position=UDim2.fromOffset((compact and 14 or 20)+(i-1)*(compact and 69 or 105),compact and 88 or 91)
 tabs[name].Size=UDim2.fromOffset(compact and 64 or 97,34)
 tabs[name].TextSize=compact and 12 or 16
end
search.Position=UDim2.fromOffset(compact and 14 or 20,compact and 134 or 139)
search.Size=UDim2.fromOffset(compact and 186 or 310,34)
search.TextSize=compact and 13 or 15
for _,control in {sortButton,indexFilter} do
 control.Position=UDim2.fromOffset(compact and 208 or 342,compact and 134 or 139)
 control.Size=UDim2.fromOffset(compact and 148 or 193,34)
 control.TextSize=compact and 13 or 15
end
progress.Size=UDim2.fromOffset(compact and 338 or 515,5)
progress.Position=UDim2.fromOffset(compact and 14 or 20,92)
list.Position=UDim2.fromOffset(compact and 14 or 20,compact and 180 or 187)
list.Size=UDim2.fromOffset(compact and 342 or 519,compact and 212 or 270)
list.Grid.CellSize=UDim2.fromOffset(compact and 105 or 163,124)
list.Grid.CellPadding=UDim2.fromOffset(compact and 9 or 9,10)
detail.Position=UDim2.fromOffset(compact and 14 or 556,compact and 404 or 92)
detail.Size=UDim2.fromOffset(compact and 342 or 264,compact and 150 or 403)
detailTitle.Position=UDim2.fromOffset(compact and 120 or 16,compact and 8 or 13)
detailTitle.Size=UDim2.fromOffset(compact and 210 or 230,compact and 33 or 45)
detailTitle.TextSize=compact and 19 or 23
rarity.Position=UDim2.fromOffset(compact and 120 or 16,compact and 40 or 60)
rarity.Size=UDim2.fromOffset(compact and 210 or 230,20) rarity.TextSize=compact and 10 or 13
detailView.Position=UDim2.fromOffset(compact and 8 or 15,compact and 24 or 88)
detailView.Size=UDim2.fromOffset(compact and 104 or 234,compact and 100 or 133)
description.Visible=not compact
facts.Position=UDim2.fromOffset(compact and 120 or 16,compact and 63 or 277)
facts.Size=UDim2.fromOffset(compact and 210 or 232,compact and 47 or 60)
facts.TextSize=compact and 11 or 14
equipButton.Position=UDim2.fromOffset(compact and 120 or 16,compact and 113 or 349)
equipButton.Size=UDim2.fromOffset(compact and 210 or 232,compact and 29 or 38)
equipButton.TextSize=compact and 14 or 18
footer.Position=UDim2.fromOffset(compact and 14 or 22,compact and 559 or 473)
footer.Size=UDim2.fromOffset(compact and 338 or 512,compact and 17 or 23)
footer.TextSize=compact and 11 or 13
empty.Position=UDim2.fromOffset(compact and 25 or 48,compact and 223 or 251)
empty.Size=UDim2.fromOffset(compact and 320 or 460,88)
empty.TextSize=compact and 17 or 20

 if size.Y<500 and not compact then
 window.Size=UDim2.fromOffset(650,300)
 windowScale.Scale=math.min(1,(size.X-20)/650,(size.Y-58)/300)
 title.Position=UDim2.fromOffset(14,5) title.Size=UDim2.fromOffset(565,30) title.TextSize=23
 close.Position=UDim2.fromOffset(605,9)
 subtitle.Position=UDim2.fromOffset(14,36) subtitle.Size=UDim2.fromOffset(580,20) subtitle.TextSize=12
 window.Line.Position=UDim2.fromOffset(14,61) window.Line.Size=UDim2.fromOffset(622,1)
 for i,name in Items.Categories do tabs[name].Position=UDim2.fromOffset(14+(i-1)*73,72) tabs[name].Size=UDim2.fromOffset(67,28) tabs[name].TextSize=12 end
 search.Position=UDim2.fromOffset(14,108) search.Size=UDim2.fromOffset(202,29) search.TextSize=12
 for _,control in {sortButton,indexFilter} do control.Position=UDim2.fromOffset(224,108) control.Size=UDim2.fromOffset(147,29) control.TextSize=12 end
 progress.Position=UDim2.fromOffset(14,78) progress.Size=UDim2.fromOffset(357,5)
 list.Position=UDim2.fromOffset(14,145) list.Size=UDim2.fromOffset(360,124) list.Grid.CellSize=UDim2.fromOffset(110,124)
 detail.Position=UDim2.fromOffset(390,72) detail.Size=UDim2.fromOffset(246,211)
 detailTitle.Position=UDim2.fromOffset(12,5) detailTitle.Size=UDim2.fromOffset(222,27) detailTitle.TextSize=19
 rarity.Position=UDim2.fromOffset(12,33) rarity.Size=UDim2.fromOffset(222,16) rarity.TextSize=11
 detailView.Position=UDim2.fromOffset(12,51) detailView.Size=UDim2.fromOffset(222,69)
 description.Visible=false
 facts.Position=UDim2.fromOffset(12,121) facts.Size=UDim2.fromOffset(222,52) facts.TextSize=11
 equipButton.Position=UDim2.fromOffset(12,176) equipButton.Size=UDim2.fromOffset(222,28) equipButton.TextSize=14
 footer.Position=UDim2.fromOffset(14,274) footer.Size=UDim2.fromOffset(360,17) footer.TextSize=10
 empty.Position=UDim2.fromOffset(25,164) empty.Size=UDim2.fromOffset(335,83) empty.TextSize=16
else
 window.Line.Position=UDim2.fromOffset(20,77)
end
for _,v in {settings,guide,developer} do v.ResponsiveScale.Scale=math.min(1,(size.X-24)/490,(size.Y-90)/v.Size.Y.Offset) end
 hotScale.Scale=math.min(1,(size.X-20)/542)
 hudScale.Scale=size.X<650 and 0.78 or 1
 if size.Y<500 then hudScale.Scale=0.72 end
 notice.Size=UDim2.fromOffset(math.min(370,size.X-24),47) noticeText.Size=UDim2.new(1,-24,1,-10)
end
resize() workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(resize)
local step=0
RunService.Heartbeat:Connect(function(dt)
 step+=dt if step<0.25 then return end step=0
 if guide.Visible or waypoint then
  local marker,distance=merchantDistance()
  distanceLabel.Text=marker and distance<math.huge and string.format("Market distance  ·  %d studs",math.floor(distance)) or "The market is currently unavailable."
  trackButton.Text=distance<=15 and "OPEN MARKET" or waypoint and "CLEAR MARKET MARKER" or "SHOW ME THE WAY"
  if waypoint then
   if not marker or distance==math.huge or distance<12 then waypoint:Destroy() waypoint=nil
   else waypoint.Label.Text="FISH MARKET\n"..math.floor(distance).." studs" end
  end
 end
end)
schedule()
