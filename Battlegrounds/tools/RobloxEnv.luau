--[[
	Runs Roblox ModuleScripts/Scripts from a place file inside Lune.

	Lune's roblox library gives us real Instances (with property validation
	against Roblox's reflection database) and the Roblox datatypes. This file
	adds what Luau code in a place expects on top of that: `game`, `workspace`,
	`script`, a `require` that accepts ModuleScripts, and a few Instance
	methods Lune doesn't have (WaitForChild).
]]

local roblox = require("@lune/roblox")
local luau = require("@lune/luau")

local DATATYPES = {
	"Axes",
	"BrickColor",
	"CFrame",
	"Color3",
	"ColorSequence",
	"ColorSequenceKeypoint",
	"Content",
	"Enum",
	"Faces",
	"Font",
	"Instance",
	"NumberRange",
	"NumberSequence",
	"NumberSequenceKeypoint",
	"PhysicalProperties",
	"Ray",
	"Rect",
	"Region3",
	"Region3int16",
	"UDim",
	"UDim2",
	"Vector2",
	"Vector2int16",
	"Vector3",
	"Vector3int16",
}

-- Lune's CFrame.lookAt flips the Z part of the look direction (Roblox's does
-- not), so scripts get a CFrame table with a correct lookAt. Everything else
-- (new, Angles, fromMatrix, ...) is Lune's own and matches Roblox.
local RealCFrame = roblox.CFrame
local function lookAt(at, target, up)
	local look = target - at
	if look.Magnitude < 1e-9 then
		return RealCFrame.new(at)
	end
	look = look.Unit
	local right = look:Cross(up or roblox.Vector3.yAxis)
	if right.Magnitude < 1e-6 then
		right = look:Cross(roblox.Vector3.zAxis)
		if right.Magnitude < 1e-6 then
			right = look:Cross(roblox.Vector3.xAxis)
		end
	end
	right = right.Unit
	return RealCFrame.fromMatrix(at, right, right:Cross(look).Unit, -look)
end
local CFrameShim = setmetatable({ lookAt = lookAt }, { __index = RealCFrame })

local installed = false
local function installInstanceExtras()
	if installed then
		return
	end
	installed = true
	-- (pcall: the test harness may already have registered its own version)
	pcall(roblox.implementMethod, "Instance", "WaitForChild", function(self, name: string, _timeout: number?)
		local child = self:FindFirstChild(name)
		if not child then
			error(`WaitForChild: {self:GetFullName()}.{name} does not exist`, 2)
		end
		return child
	end)
end

local Env = {}

export type Env = {
	game: any,
	require: (any) -> any,
	run: (any) -> ...any,
	makeEnv: (any) -> { [string]: any },
	globals: { [string]: any },
}

function Env.new(game: any, extraGlobals: { [string]: any }?): Env
	installInstanceExtras()
	local cache: { [string]: any } = {}
	local loading: { [string]: boolean } = {}
	local self = {} :: Env
	self.game = game
	self.globals = extraGlobals or {}

	function self.makeEnv(scriptInstance: any)
		local env: { [string]: any } = {
			game = game,
			workspace = game:GetService("Workspace"),
			script = scriptInstance,
		}
		for _, name in DATATYPES do
			env[name] = (roblox :: any)[name]
		end
		env.CFrame = CFrameShim
		for k, v in self.globals do
			env[k] = v
		end
		env.require = function(target)
			return self.require(target)
		end
		return env
	end

	function self.require(target: any)
		assert(typeof(target) == "Instance" and target:IsA("ModuleScript"), "require() expects a ModuleScript")
		local key = target:GetDebugId()
		if cache[key] ~= nil then
			return cache[key]
		end
		assert(not loading[key], `require loop at {target:GetFullName()}`)
		loading[key] = true
		local chunk = luau.load(target.Source, {
			debugName = target:GetFullName(),
			environment = self.makeEnv(target),
		})
		local result = chunk()
		loading[key] = nil
		assert(result ~= nil, `{target:GetFullName()} did not return a value`)
		cache[key] = result
		return result
	end

	function self.run(scriptInstance: any)
		local chunk = luau.load(scriptInstance.Source, {
			debugName = scriptInstance:GetFullName(),
			environment = self.makeEnv(scriptInstance),
		})
		return chunk()
	end

	return self
end

return Env
