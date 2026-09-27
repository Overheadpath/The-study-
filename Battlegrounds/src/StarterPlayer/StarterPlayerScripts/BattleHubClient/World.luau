--!strict
-- Things in the 3D lobby that the client animates: the jumbotron and queue
-- board screens, the Lucky Wheel (idle turning + prize spin) and the
-- ProximityPrompts (shop counter, wheel, portal, sensei...).

local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))

export type Deps = {
	state: Instance,
	request: (string, any) -> { [string]: any },
	profile: () -> { [string]: any }?,
	toast: (string, string?) -> (),
	big: (string, string, Color3) -> (),
	hold: (boolean) -> (),
	openPanel: (string, string?) -> (),
	toggleQueue: () -> (),
}
export type World = {
	update: () -> (),
	spinWheel: () -> (),
}

local TAU = math.pi * 2
local IDLE_SPEED = 0.12 -- radians per second while nobody is spinning

local World = {}

local function setLabel(gui: Instance?, name: string, text: string)
	local label = gui and gui:FindFirstChild(name)
	if label and label:IsA("TextLabel") and label.Text ~= text then
		label.Text = text
	end
end

function World.new(deps: Deps): World
	local player = Players.LocalPlayer
	local hub: Instance? = nil
	local screens: { Instance } = {}
	local queueBoard: Instance? = nil

	-- The wheel: every part keeps its offset from the pivot so we can turn it.
	local wheelParts: { [BasePart]: CFrame } = {}
	local wheelPivot: CFrame? = nil
	local wheelModel: Model? = nil
	local angle = 0
	local spinning = false
	local lastScan = -math.huge

	local function findHub()
		local complete = hub ~= nil and hub.Parent ~= nil and wheelPivot ~= nil and #screens > 0 and queueBoard ~= nil
		if complete or os.clock() - lastScan < 2 then
			return
		end
		-- (With StreamingEnabled, bits of the lobby can arrive late, so keep looking.)
		lastScan = os.clock()
		hub = Workspace:FindFirstChild("BattleHub")
		screens = {}
		queueBoard = nil
		wheelParts = {}
		wheelPivot = nil
		wheelModel = nil
		if not hub then
			return
		end
		local center = hub:FindFirstChild("Center")
		local tron = center and center:FindFirstChild("Jumbotron")
		if tron then
			for _, part in tron:GetChildren() do
				if string.sub(part.Name, 1, 6) == "Screen" then
					local gui = part:FindFirstChildOfClass("SurfaceGui")
					if gui then
						table.insert(screens, gui)
					end
				end
			end
		end
		local hall = hub:FindFirstChild("ArenaHall")
		local board = hall and hall:FindFirstChild("QueueBoard")
		queueBoard = board and board:FindFirstChildOfClass("SurfaceGui")
		local area = hub:FindFirstChild("LuckyWheel")
		local wheel = area and area:FindFirstChild("Wheel")
		local pivot = wheel and wheel:GetAttribute("Pivot")
		if wheel and wheel:IsA("Model") and typeof(pivot) == "CFrame" then
			wheelModel = wheel
			wheelPivot = pivot
			for _, part in wheel:GetDescendants() do
				if part:IsA("BasePart") then
					wheelParts[part] = pivot:ToObjectSpace(part.CFrame)
				end
			end
		end
	end

	local function turnWheel(a: number)
		local pivot = wheelPivot
		if not pivot then
			return
		end
		local rotation = pivot * CFrame.Angles(0, 0, a)
		for part, offset in wheelParts do
			part.CFrame = rotation * offset
		end
	end

	local self = {} :: World

	local function timerText(): string
		local endsAt = deps.state:GetAttribute("EndsAt")
		if type(endsAt) ~= "number" or endsAt <= 0 then
			return ""
		end
		local left = endsAt - Workspace:GetServerTimeNow()
		return if left > 0 then Util.clock(left) else "0:00"
	end

	function self.update()
		findHub()
		local state = deps.state
		local status = tostring(state:GetAttribute("Status") or "")
		local detail = tostring(state:GetAttribute("Detail") or "")
		local timer = timerText()
		for _, gui in screens do
			setLabel(gui, "Phase", status)
			setLabel(gui, "Timer", if timer ~= "" then timer else "--")
			setLabel(gui, "Detail", detail)
		end
		if queueBoard then
			local phase = state:GetAttribute("Phase")
			setLabel(
				queueBoard,
				"Phase",
				if phase == "Match" then "BATTLE IN PROGRESS" elseif phase == "Vote" then "MAP VOTE" else "NEXT BATTLE"
			)
			setLabel(queueBoard, "Timer", if timer ~= "" then timer else "--")
			setLabel(queueBoard, "Queue", `IN QUEUE: {state:GetAttribute("Queued") or 0}`)
		end
	end

	function self.spinWheel()
		if spinning then
			return
		end
		local profile = deps.profile()
		if profile and profile.LuckySpins < 1 then
			deps.toast("No Lucky Spins left! Chill in the AFK Chamber to earn free ones.", "Bad")
			return
		end
		findHub()
		spinning = true
		deps.hold(true)
		local result = deps.request("SpinWheel", nil)
		if not result.ok then
			spinning = false
			deps.hold(false)
			deps.toast(result.msg or "Couldn't spin.", "Bad")
			return
		end
		local n = #Config.WheelPrizes
		local slice = TAU / n
		local index = tonumber(result.index) or 1
		local jitter = (math.random() - 0.5) * slice * 0.6
		-- Turning clockwise by `a` brings the slice at (index - 0.5) * slice to the pointer when a = -that.
		local target = -((index - 0.5) * slice + jitter)
		local start = angle
		local final = target + TAU * math.ceil((start + TAU * 5 - target) / TAU)
		local duration = 5
		local began = os.clock()
		while true do
			local t = math.min(1, (os.clock() - began) / duration)
			local eased = 1 - (1 - t) ^ 4
			angle = start + (final - start) * eased
			turnWheel(angle)
			if t >= 1 then
				break
			end
			RunService.RenderStepped:Wait()
		end
		angle = final % TAU
		local prize = Config.WheelPrizes[index]
		if prize and prize.Kind == "Aura" then
			deps.big("GRAND PRIZE!", result.msg or "", Color3.fromRGB(255, 200, 60))
		else
			deps.big(prize and prize.Label or "PRIZE!", "LUCKY WHEEL", Color3.fromRGB(255, 90, 200))
		end
		if result.msg then
			deps.toast(result.msg, "Reward")
		end
		task.wait(0.5)
		spinning = false
		deps.hold(false)
	end

	-- Slow idle turn when you're close enough to see it.
	RunService.RenderStepped:Connect(function(dt: number)
		if spinning or not wheelPivot or not wheelModel or not wheelModel.Parent then
			return
		end
		local camera = Workspace.CurrentCamera
		if camera and (camera.CFrame.Position - wheelPivot.Position).Magnitude < 160 then
			angle = (angle + dt * IDLE_SPEED) % TAU
			turnWheel(angle)
		end
	end)

	ProximityPromptService.PromptTriggered:Connect(function(prompt, who)
		if who ~= player then
			return
		end
		local action = prompt:GetAttribute("HubAction")
		if action == "OpenShop" then
			local item = prompt:GetAttribute("HubItem")
			deps.openPanel("Shop", if type(item) == "string" then item else nil)
		elseif action == "OpenStyles" then
			deps.openPanel("Styles", nil)
		elseif action == "SpinWheel" then
			self.spinWheel()
		elseif action == "Queue" then
			deps.toggleQueue()
		elseif action == "Train" or action == "Lobby" then
			local result = deps.request(action, nil)
			if result.msg then
				deps.toast(result.msg, if result.ok then "Good" else "Bad")
			end
		end
	end)

	return self
end

return World
