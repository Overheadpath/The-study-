local player=game.Players.LocalPlayer
local pg=player:WaitForChild("PlayerGui")
local Audio=require(game.ReplicatedStorage.FishingSystem:WaitForChild("GameAudio"))
Audio.StartAmbient()
local bound=setmetatable({},{__mode="k"})
local function bind(v)
 if not v:IsA("GuiButton") or bound[v] then return end
 bound[v]=true
 local function hover()
  if not v.Active or not v.Visible then return end
  local p=v.Parent
  while p and p~=pg do
   if p:IsA("GuiObject") and not p.Visible or p:IsA("ScreenGui") and not p.Enabled then return end
   p=p.Parent
  end
  Audio.Play("Hover")
 end
 v.MouseEnter:Connect(hover)
 v.SelectionGained:Connect(hover)
end
for _,v in pg:GetDescendants() do bind(v) end
pg.DescendantAdded:Connect(bind)
