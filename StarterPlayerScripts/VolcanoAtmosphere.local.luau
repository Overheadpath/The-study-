-- Cinderwake: presentation only. No damage, stamina, character or quest logic.
local RunService = game:GetService("RunService")
-- (the island can sit inside a model: look for it anywhere, for a minute)
local root
do
 local t0 = os.clock()
 while not root and os.clock() - t0 < 60 do
  root = workspace:FindFirstChild("VolcanoIsland", true)
  if not root then task.wait(1) end
 end
end
if not root then return end
local random = Random.new()
local emitters, lights, beams, zones = {}, {}, {}, {}
local function register(obj)
 if obj:IsA("ParticleEmitter") and obj:GetAttribute("BaseRate")~=nil then
  emitters[obj]={rate=obj:GetAttribute("BaseRate"),distance=obj:GetAttribute("CullDistance") or 230,nextBurst=os.clock()+random:NextNumber(2,9)}
 elseif obj:IsA("PointLight") and obj:GetAttribute("BaseBrightness") then
  lights[obj]={brightness=obj:GetAttribute("BaseBrightness"),phase=random:NextNumber(0,40)}
 elseif obj:IsA("Beam") then beams[obj]=true
 elseif obj:IsA("BasePart") and obj:GetAttribute("ZoneId") then zones[obj]=true end
end
for _,obj in ipairs(root:GetDescendants()) do register(obj) end
root.DescendantAdded:Connect(register)
root.DescendantRemoving:Connect(function(obj) emitters[obj]=nil; lights[obj]=nil; beams[obj]=nil; zones[obj]=nil end)
local color=Instance.new("ColorCorrectionEffect")
color.Name="CinderwakeLocalWarmth"; color.Enabled=false
local bloom=Instance.new("BloomEffect")
bloom.Name="CinderwakeLavaBloom"; bloom.Intensity=.12; bloom.Size=17; bloom.Threshold=1.5; bloom.Enabled=false
local blur=Instance.new("BlurEffect")
blur.Name="CinderwakeSubtleHeatHaze"; blur.Size=0; blur.Enabled=false
-- Lava bombs: now and then a few glowing rocks are thrown up out of the crater lake,
-- cool as they fly and land on the slopes with a puff of smoke. Only near the island,
-- a few at a time, never touching anything (purely something to look at).
local bombs = {}
local nextBomb = os.clock() + 3
local castParams = RaycastParams.new()
castParams.FilterType = Enum.RaycastFilterType.Include
castParams.FilterDescendantsInstances = { root }
local function crater()
 local lake = root:FindFirstChild("CraterLake", true)
 return lake and lake:IsA("BasePart") and lake.Position or nil
end
local function puff(position)
 local holder = Instance.new("Attachment")
 holder.WorldPosition = position
 holder.Parent = workspace.Terrain
 local smoke = Instance.new("ParticleEmitter")
 smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
 smoke.Color = ColorSequence.new(Color3.fromRGB(150, 140, 136))
 smoke.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1.5), NumberSequenceKeypoint.new(1, 5) })
 smoke.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.35), NumberSequenceKeypoint.new(1, 1) })
 smoke.Lifetime = NumberRange.new(1, 1.8)
 smoke.Speed = NumberRange.new(3, 7)
 smoke.SpreadAngle = Vector2.new(60, 60)
 smoke.Rate = 0
 smoke.Parent = holder
 local sparks = Instance.new("ParticleEmitter")
 sparks.Texture = "rbxasset://textures/particles/sparkles_main.dds"
 sparks.Color = ColorSequence.new(Color3.fromRGB(255, 190, 90), Color3.fromRGB(255, 100, 30))
 sparks.LightEmission = 1
 sparks.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 0.05) })
 sparks.Lifetime = NumberRange.new(0.4, 0.9)
 sparks.Speed = NumberRange.new(8, 16)
 sparks.SpreadAngle = Vector2.new(70, 70)
 sparks.Acceleration = Vector3.new(0, -30, 0)
 sparks.Rate = 0
 sparks.Parent = holder
 smoke:Emit(6)
 sparks:Emit(10)
 task.delay(2.2, function() holder:Destroy() end)
end
local function throw(from)
 local size = random:NextNumber(1.6, 3.2)
 local rock = Instance.new("Part")
 rock.Name = "LavaBomb"
 rock.Size = Vector3.new(size, size * random:NextNumber(0.7, 1), size * random:NextNumber(0.75, 1.05))
 rock.Material = Enum.Material.Neon
 rock.Color = Color3.fromRGB(255, 120, 30)
 rock.Anchored = true
 rock.CanCollide = false
 rock.CanQuery = false
 rock.CanTouch = false
 rock.CastShadow = false
 local trail = Instance.new("ParticleEmitter")
 trail.Texture = "rbxasset://textures/particles/smoke_main.dds"
 trail.Color = ColorSequence.new(Color3.fromRGB(120, 110, 108))
 trail.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, size * 0.6), NumberSequenceKeypoint.new(1, size * 1.8) })
 trail.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.45), NumberSequenceKeypoint.new(1, 1) })
 trail.Lifetime = NumberRange.new(0.8, 1.4)
 trail.Speed = NumberRange.new(0.5, 1.5)
 trail.Rate = 22
 trail.LockedToPart = false
 trail.Parent = rock
 local a = random:NextNumber(0, math.pi * 2)
 local out = random:NextNumber(10, 28)
 local start = from + Vector3.new(random:NextNumber(-6, 6), 1, random:NextNumber(-6, 6))
 rock.CFrame = CFrame.new(start)
 rock.Parent = workspace
 table.insert(bombs, {
  part = rock, trail = trail, p = start, age = 0,
  v = Vector3.new(math.cos(a) * out, random:NextNumber(52, 78), math.sin(a) * out),
  spin = CFrame.Angles(random:NextNumber(-4, 4), random:NextNumber(-4, 4), random:NextNumber(-4, 4)),
  rot = CFrame.Angles(random:NextNumber(0, 6), random:NextNumber(0, 6), random:NextNumber(0, 6)),
 })
end
local function stepBombs(dt, camPos)
 local lake = crater()
 if lake and #bombs < 8 and os.clock() > nextBomb and (lake - camPos).Magnitude < 900 then
  local reduced = false
  pcall(function() reduced = game:GetService("Players").LocalPlayer.PlayerGui:GetAttribute("ReduceMotion") == true end)
  nextBomb = os.clock() + random:NextNumber(2.5, 6) * (reduced and 2 or 1)
  for _ = 1, random:NextInteger(1, reduced and 1 or 3) do throw(lake) end
 end
 for i = #bombs, 1, -1 do
  local b = bombs[i]
  b.age += dt
  local v0 = b.v
  b.v += Vector3.new(0, -62 * dt, 0)
  local nextP = b.p + (v0 + b.v) * 0.5 * dt
  local hit = b.v.Y < 0 and workspace:Raycast(b.p, nextP - b.p, castParams)
  b.rot = b.rot * CFrame.Angles(b.spin:ToEulerAnglesXYZ()) :Lerp(CFrame.identity, 1 - dt)
  -- cooling: bright lava to dark rock over its flight
  local cool = math.clamp((b.age - 0.6) / 1.6, 0, 1)
  b.part.Color = Color3.fromRGB(255, 120, 30):Lerp(Color3.fromRGB(96, 70, 60), cool)
  if cool >= 1 and b.part.Material ~= Enum.Material.Plastic then b.part.Material = Enum.Material.Plastic end
  if hit or b.age > 9 or nextP.Y < -4 then
   if hit then puff(hit.Position) end
   b.part:Destroy()
   table.remove(bombs, i)
  else
   b.p = nextP
   b.part.CFrame = CFrame.new(nextP) * b.rot
  end
 end
end

local elapsed, warmth=0,0
local connection
connection=RunService.Heartbeat:Connect(function(dt)
 local cam = workspace.CurrentCamera
 if cam and root.Parent then stepBombs(dt, cam.CFrame.Position) end
 elapsed+=dt
 if elapsed<.1 then return end
 local step=elapsed; elapsed=0
 local camera=workspace.CurrentCamera
 if not camera then return end
 if not root.Parent then
  color:Destroy(); bloom:Destroy(); blur:Destroy(); connection:Disconnect()
  for _, b in ipairs(bombs) do b.part:Destroy() end
  table.clear(bombs)
  return
 end
 color.Parent=camera; bloom.Parent=camera; blur.Parent=camera
 local position=camera.CFrame.Position
 local desired,priority=0,0
 for part in pairs(zones) do
  local p=part.CFrame:PointToObjectSpace(position); local size=part.Size/2
  if math.abs(p.X)<size.X and math.abs(p.Y)<size.Y and math.abs(p.Z)<size.Z then
   local rank=part:GetAttribute("Priority") or 0
   if rank>priority then priority=rank; desired=({.2,.4,.7,1})[rank] or 0 end
  end
 end
 warmth+=(desired-warmth)*math.min(1,step*2)
 color.Enabled=warmth>.005; bloom.Enabled=color.Enabled; blur.Enabled=warmth>.62
 color.TintColor=Color3.new(1,1-warmth*.09,1-warmth*.17)
 color.Saturation=-warmth*.1; color.Contrast=warmth*.09; color.Brightness=-warmth*.015
 bloom.Intensity=.1+warmth*.14
 -- Subpixel softening and rising wisps imply heat without obscuring navigation.
 -- Roblox has no general-purpose scene refraction shader exposed to this script.
 blur.Size=math.max(0,warmth-.62)*(.6+.2*math.sin(os.clock()*1.6))
 for emitter,data in pairs(emitters) do
  local holder=emitter.Parent
  local location=holder:IsA("BasePart") and holder.Position or holder:IsA("Attachment") and holder.WorldPosition
  if location then
   local distance=(location-position).Magnitude; local enabled=distance<data.distance
   emitter.Enabled=enabled
   local fade=math.clamp((data.distance-distance)/55,0,1)
   emitter.Rate=data.rate*fade
   if emitter:GetAttribute("Burst") and os.clock()>data.nextBurst then
    data.nextBurst=os.clock()+random:NextNumber(4,13)
    if enabled then emitter:Emit(random:NextInteger(4,9)) end
   end
  end
 end
 for light,data in pairs(lights) do
  local holder=light.Parent
  if holder:IsA("BasePart") then
   local distance=(holder.Position-position).Magnitude
   light.Enabled=distance<160
   if light.Enabled then light.Brightness=data.brightness*(.91+.055*math.sin(os.clock()*4+data.phase)+.035*math.noise(os.clock()*3,data.phase)) end
  end
 end
 for beam in pairs(beams) do
  if beam.Attachment0 then beam.Enabled=(beam.Attachment0.WorldPosition-position).Magnitude<310 end
 end
end)
