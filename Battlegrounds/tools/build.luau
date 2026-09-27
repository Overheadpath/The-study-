--[[
	Builds BattlegroundsHub.rbxl: the scripts from src/ (packed by Rojo) plus the
	lobby and battle maps, pre-built so you can see and edit them in Studio.

	Usage (from the Battlegrounds folder, with lune and rojo installed):
		lune run tools/build.luau
		lune run tools/build.luau -- --preview build/preview.json   (also dump parts for the preview renderer)
]]

local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local Env = require("./RobloxEnv")

assert(fs.isFile("default.project.json"), "run this from the Battlegrounds folder")
if not fs.isDir("build") then
	fs.writeDir("build")
end

local previewPath: string? = nil
for i, arg in process.args do
	if arg == "--preview" then
		previewPath = process.args[i + 1]
	end
end

local rojo = process.exec("rojo", { "build", "default.project.json", "--output", "build/scripts.rbxl" })
if not rojo.ok then
	error("rojo build failed:\n" .. rojo.stderr)
end

local game = roblox.deserializePlace(fs.readFile("build/scripts.rbxl"))
local env = Env.new(game)
local workspace = game:GetService("Workspace")
local server = game:GetService("ServerScriptService"):FindFirstChild("BattleHubServer")
assert(server, "BattleHubServer script missing")

local HubBuilder = env.require(server:FindFirstChild("HubBuilder"))
local ArenaBuilder = env.require(server:FindFirstChild("ArenaBuilder"))

local hub = HubBuilder.build(workspace)
ArenaBuilder.build(game:GetService("ServerStorage"), workspace)

-- Everything is anchored scenery; streaming would only make the far-away maps pop in late.
workspace.StreamingEnabled = false

local partCount = 0
for _, d in workspace:GetDescendants() do
	if d:IsA("BasePart") then
		partCount += 1
	end
end
print(`built {hub.Name}: {partCount} parts in Workspace`)

fs.writeFile("BattlegroundsHub.rbxl", roblox.serializePlace(game))
print("wrote BattlegroundsHub.rbxl")

-- Optional look-only copy with every script removed (safe to open anywhere).
for i, arg in process.args do
	if arg == "--scenery-only" then
		local copy = roblox.deserializePlace(roblox.serializePlace(game))
		for _, d in copy:GetDescendants() do
			if d:IsA("LuaSourceContainer") then
				d:Destroy()
			end
		end
		local out = process.args[i + 1]
		fs.writeFile(out, roblox.serializePlace(copy))
		print("wrote " .. out)
	end
end

----------------------------------------------------------------------------------
-- Optional: dump geometry + surface text for tools/preview (three.js renderer)
----------------------------------------------------------------------------------

if previewPath then
	local function vec(v): { number }
		return { v.X, v.Y, v.Z }
	end
	local function color(c): { number }
		return { c.R, c.G, c.B }
	end
	local function cframe(cf): { number }
		local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:GetComponents()
		return { x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 }
	end

	local parts = {}
	local ids = {}
	local guis = {}
	local lights = {}
	local emitters = {}
	local billboards = {}

	local function faceSize(part, face): (number, number)
		local s = part.Size
		if face == "Front" or face == "Back" then
			return s.X, s.Y
		elseif face == "Left" or face == "Right" then
			return s.Z, s.Y
		end
		return s.X, s.Z
	end

	local function gradientOf(obj)
		local g = obj:FindFirstChildOfClass("UIGradient")
		if not g then
			return nil
		end
		local keys = {}
		for _, k in g.Color.Keypoints do
			table.insert(keys, { k.Time, k.Value.R, k.Value.G, k.Value.B })
		end
		return { keys = keys, rotation = g.Rotation }
	end

	local function collectGui(root, width: number, height: number)
		local items = {}
		local function walk(obj, px: number, py: number, pw: number, ph: number)
			for _, child in obj:GetChildren() do
				if child:IsA("GuiObject") then
					local size = child.Size
					local pos = child.Position
					local w = pw * size.X.Scale + size.X.Offset
					local h = ph * size.Y.Scale + size.Y.Offset
					local x = px + pw * pos.X.Scale + pos.X.Offset - w * child.AnchorPoint.X
					local y = py + ph * pos.Y.Scale + pos.Y.Offset - h * child.AnchorPoint.Y
					local item: { [string]: any } = {
						kind = child.ClassName,
						x = x,
						y = y,
						w = w,
						h = h,
						rotation = child.Rotation,
						bg = color(child.BackgroundColor3),
						bgT = child.BackgroundTransparency,
						gradient = gradientOf(child),
					}
					if child:IsA("TextLabel") or child:IsA("TextButton") then
						local stroke = child:FindFirstChildOfClass("UIStroke")
						item.text = child.Text
						item.font = child.FontFace.Family
						item.color = color(child.TextColor3)
						item.textT = child.TextTransparency
						item.align = child.TextXAlignment.Name
						item.stroke = stroke and color(stroke.Color) or nil
						item.strokeW = stroke and stroke.Thickness or 0
					end
					table.insert(items, item)
					walk(child, x, y, w, h)
				end
			end
		end
		walk(root, 0, 0, width, height)
		return items
	end

	-- Maps live in ServerStorage at the same spot; spread them out for the preview.
	local offsets: { [string]: any } = {}
	local roots = { workspace }
	local maps = game:GetService("ServerStorage"):FindFirstChild("BattleArenas")
	if maps then
		for i, map in maps:GetChildren() do
			table.insert(roots, map)
			offsets[map:GetDebugId()] = roblox.Vector3.new(i * 700, 0, 0)
		end
	end
	local function offsetOf(inst)
		local cur = inst
		while cur do
			local o = offsets[cur:GetDebugId()]
			if o then
				return o
			end
			cur = cur.Parent
		end
		return roblox.Vector3.zero
	end
	local all = {}
	for _, root in roots do
		for _, d in root:GetDescendants() do
			table.insert(all, d)
		end
	end

	for _, d in all do
		if d:IsA("BasePart") then
			local shape = "Block"
			if d.ClassName == "Part" or d.ClassName == "SpawnLocation" or d.ClassName == "Seat" then
				shape = d.Shape.Name
			elseif d.ClassName == "WedgePart" then
				shape = "Wedge"
			end
			local mesh = d:FindFirstChildOfClass("SpecialMesh")
			table.insert(parts, {
				n = d.Name,
				s = shape,
				mesh = mesh and mesh.MeshType.Name or nil,
				size = vec(d.Size),
				cf = cframe(d.CFrame + offsetOf(d)),
				c = color(d.Color),
				m = d.Material.Name,
				t = d.Transparency,
			})
			ids[d:GetDebugId()] = #parts
		end
	end
	for _, d in all do
		if d:IsA("SurfaceGui") and d.Parent and d.Parent:IsA("BasePart") then
			local part = d.Parent
			local face = d.Face.Name
			local fw, fh = faceSize(part, face)
			local pps = if d.SizingMode.Name == "PixelsPerStud" then d.PixelsPerStud else (d.CanvasSize.X / fw)
			local width, height = fw * pps, fh * pps
			table.insert(guis, {
				part = ids[part:GetDebugId()],
				face = face,
				w = width,
				h = height,
				items = collectGui(d, width, height),
			})
		elseif d:IsA("BillboardGui") and d.Parent and d.Parent:IsA("BasePart") then
			local labels = {}
			for _, l in d:GetChildren() do
				if l:IsA("TextLabel") then
					table.insert(labels, { text = l.Text, color = color(l.TextColor3), font = l.FontFace.Family })
				end
			end
			table.insert(billboards, {
				pos = vec(d.Parent.CFrame.Position + offsetOf(d) + d.StudsOffset),
				size = { d.Size.X.Scale, d.Size.Y.Scale },
				labels = labels,
			})
		elseif (d:IsA("PointLight") or d:IsA("SurfaceLight")) and d.Parent and d.Parent:IsA("BasePart") then
			table.insert(
				lights,
				{
					pos = vec(d.Parent.CFrame.Position + offsetOf(d)),
					color = color(d.Color),
					range = d.Range,
					brightness = d.Brightness,
					kind = d.ClassName,
				}
			)
		elseif d:IsA("ParticleEmitter") and d.Parent and d.Parent:IsA("BasePart") then
			local key = d.Color.Keypoints[1].Value
			table.insert(
				emitters,
				{ pos = vec(d.Parent.CFrame.Position + offsetOf(d)), color = color(key), rate = d.Rate }
			)
		elseif d:IsA("Fire") and d.Parent and d.Parent:IsA("BasePart") then
			table.insert(
				emitters,
				{ pos = vec(d.Parent.CFrame.Position + offsetOf(d)), color = color(d.Color), rate = 60, fire = true }
			)
		end
	end
	local lighting = game:GetService("Lighting")
	fs.writeFile(
		previewPath,
		serde.encode("json", {
			parts = parts,
			guis = guis,
			lights = lights,
			emitters = emitters,
			billboards = billboards,
			ambient = color(lighting.Ambient),
		})
	)
	print(`wrote {previewPath}: {#parts} parts, {#guis} surface guis, {#lights} lights`)
end
