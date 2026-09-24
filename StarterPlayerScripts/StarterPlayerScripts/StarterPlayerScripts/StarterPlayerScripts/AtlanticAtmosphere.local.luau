
-- Snow exists only on this client and is cleared as soon as the player leaves Atlantic.
local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
local player=Players.LocalPlayer
local Zones=require(game.ReplicatedStorage.FishingSystem.FishingZones)
local gui=Instance.new("ScreenGui") gui.Name="AtlanticZoneHUD" gui.ResetOnSpawn=false gui.DisplayOrder=18 gui.Parent=player:WaitForChild("PlayerGui")
local label=Instance.new("TextLabel")
label.Name="ZoneBadge" label.AnchorPoint=Vector2.new(.5,0) label.Position=UDim2.new(.5,0,0,10) label.Size=UDim2.new(.65,0,0,25)
label.BackgroundTransparency=1 label.Font=Enum.Font.FredokaOne label.TextSize=16 label.TextColor3=Color3.fromRGB(219,245,255) label.TextStrokeColor3=Color3.fromRGB(39,79,103) label.TextStrokeTransparency=.12
label.Text="ATLANTIC HUB  ·  1.2× FISH VALUE" label.Visible=false label.Parent=gui
local emitterPart=Instance.new("Part") emitterPart.Name="AtlanticLocalSnow" emitterPart.Size=Vector3.new(64,.2,64) emitterPart.Transparency=1 emitterPart.Anchored=true emitterPart.CanCollide=false emitterPart.CanTouch=false emitterPart.CanQuery=false emitterPart.Parent=workspace
local emitter=Instance.new("ParticleEmitter") emitter.Name="Snowfall"
emitter.Texture="rbxasset://textures/particles/sparkles_main.dds"
emitter.Color=ColorSequence.new(Color3.fromRGB(246,252,255))
emitter.Size=NumberSequence.new({NumberSequenceKeypoint.new(0,.10),NumberSequenceKeypoint.new(.5,.15),NumberSequenceKeypoint.new(1,.08)})
emitter.Transparency=NumberSequence.new({NumberSequenceKeypoint.new(0,1),NumberSequenceKeypoint.new(.12,.18),NumberSequenceKeypoint.new(.85,.24),NumberSequenceKeypoint.new(1,1)})
emitter.Lifetime=NumberRange.new(4.5,6) emitter.Speed=NumberRange.new(5,7)
emitter.EmissionDirection=Enum.NormalId.Bottom emitter.SpreadAngle=Vector2.new(6,6)
emitter.Acceleration=Vector3.new(.15,-.35,.08) emitter.Rotation=NumberRange.new(0,360) emitter.RotSpeed=NumberRange.new(-30,30)
emitter.LightEmission=.1 emitter.LightInfluence=.25 emitter.Rate=70 emitter.Enabled=false emitter.Parent=emitterPart
local wasInside=false local elapsed=0
RunService.Heartbeat:Connect(function(dt)
 elapsed+=dt if elapsed<.15 then return end elapsed=0
 local c=player.Character local r=c and c:FindFirstChild("HumanoidRootPart")
 local menu=player.PlayerGui:FindFirstChild("FishingMenu")
 local inside=r and Zones.Contains(r.Position) and not (menu and menu.Enabled) or false
 label.Visible=inside
 emitter.Enabled=inside
 if inside then
  local center=Zones.Atlantic.Center
  local x=math.clamp(r.Position.X,center.X-79,center.X+79)
  local z=math.clamp(r.Position.Z,center.Z-60,center.Z+60)
  emitterPart.Position=Vector3.new(x,36,z)
  emitter.Rate=player.PlayerGui:GetAttribute("ReduceMotion") and 35 or 70
 elseif wasInside then emitter:Clear() end
 wasInside=inside
end)
script.Destroying:Connect(function() emitterPart:Destroy() gui:Destroy() end)
