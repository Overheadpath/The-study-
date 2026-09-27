--[[
	BattleHub client: builds the HUD, menus, map vote and toasts, keeps them in
	sync with your profile and the match state, and animates the lobby.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SocialService = game:GetService("SocialService")
local Workspace = game:GetService("Workspace")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui") :: PlayerGui

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Remotes = Shared:WaitForChild("Remotes")
local RequestRemote = Remotes:WaitForChild("Request") :: RemoteFunction
local ProfileRemote = Remotes:WaitForChild("Profile") :: RemoteEvent
local NotifyRemote = Remotes:WaitForChild("Notify") :: RemoteEvent
local State = Shared:WaitForChild("State")

local UI = require(script:WaitForChild("UI"))
local Hud = require(script:WaitForChild("Hud"))
local Toasts = require(script:WaitForChild("Toasts"))
local Panels = require(script:WaitForChild("Panels"))
local MapVote = require(script:WaitForChild("MapVote"))
local World = require(script:WaitForChild("World"))

type Result = { [string]: any }

local function request(action: string, arg: any): Result
	local ok, result = pcall(function()
		return RequestRemote:InvokeServer(action, arg)
	end)
	if not ok then
		return { ok = false, msg = "Couldn't reach the server, try again." }
	end
	if type(result) ~= "table" then
		return { ok = false }
	end
	return result
end

-- Profile ------------------------------------------------------------------------

local profile: { [string]: any }? = nil
local held = false
local pending: { [string]: any }? = nil

local hud = Hud.new(playerGui)
local toasts = Toasts.new(playerGui)

local panels: Panels.Panels

local function apply(p: { [string]: any })
	local old = profile
	profile = p
	hud.setProfile(p)
	if old then
		if p.Cash > old.Cash then
			hud.bump("Cash")
		end
		if p.Level > old.Level then
			hud.bump("Level")
		end
		if p.Spins ~= old.Spins or p.LuckySpins ~= old.LuckySpins then
			hud.bump("Spins")
		end
	end
	if panels then
		panels.refresh()
	end
end

local function setProfile(p: { [string]: any })
	if held then
		pending = p
	else
		apply(p)
	end
end

-- While a roll or wheel spin animates, hold back HUD updates so the prize
-- isn't spoiled before the animation lands.
local function hold(on: boolean)
	held = on
	if not on and pending then
		local p = pending
		pending = nil
		apply(p)
	end
end

panels = Panels.new(playerGui, {
	request = request,
	profile = function()
		return profile
	end,
	toast = toasts.show,
	hold = hold,
	big = toasts.big,
})

local vote = MapVote.new(hud.Gui, State, request, toasts.show)

local function toggleQueue()
	if player:GetAttribute("InMatch") == true then
		toasts.show("You're already in a match!", "Info")
		return
	end
	local result = request("Queue", nil)
	if result.msg then
		toasts.show(result.msg, if result.ok then "Good" else "Bad")
	end
end

local world = World.new({
	state = State,
	request = request,
	profile = function()
		return profile
	end,
	toast = toasts.show,
	big = toasts.big,
	hold = hold,
	openPanel = panels.open,
	toggleQueue = toggleQueue,
})

ProfileRemote.OnClientEvent:Connect(function(p)
	if type(p) == "table" then
		setProfile(p)
	end
end)

NotifyRemote.OnClientEvent:Connect(function(notice)
	if type(notice) ~= "table" or type(notice.Text) ~= "string" then
		return
	end
	if notice.Kind == "LevelUp" then
		toasts.levelUp(notice.Text)
	else
		toasts.show(notice.Text, notice.Kind)
	end
end)

task.spawn(function()
	for _ = 1, 30 do
		if profile then
			return
		end
		local result = request("Snapshot", nil)
		if result.ok and type(result.profile) == "table" then
			if not profile then
				setProfile(result.profile)
			end
			return
		end
		task.wait(1)
	end
end)

-- Buttons ----------------------------------------------------------------------------

local function menuButton(name: string)
	hud.Buttons[name].Button.Activated:Connect(function()
		if panels.current() == name then
			panels.close()
		else
			panels.open(name, nil)
		end
	end)
end
for _, name in { "Styles", "Awaken", "Locker", "Shop", "Stats", "Codes" } do
	menuButton(name)
end
hud.Buttons.Play.Button.Activated:Connect(toggleQueue)
hud.Extra.Activated:Connect(function()
	panels.open("Extra", nil)
end)
hud.Invite.Activated:Connect(function()
	local ok, canInvite = pcall(function()
		return SocialService:CanSendGameInviteAsync(player)
	end)
	if ok and canInvite then
		pcall(function()
			SocialService:PromptGameInvite(player)
		end)
	else
		toasts.show("Invites aren't available right now.", "Info")
	end
end)

-- AFK chamber readout ---------------------------------------------------------------

local afkLabel = UI.text(hud.Gui, "", {
	Name = "Afk",
	Font = UI.Fonts.Heavy,
	Size = UDim2.fromOffset(300, 56),
	Position = UDim2.new(0, 16, 0.5, 0),
	AnchorPoint = Vector2.new(0, 0.5),
	Align = Enum.TextXAlignment.Left,
	Color = Color3.fromRGB(225, 190, 255),
	Stroke = 2,
})
afkLabel.Visible = false

-- Screen size ------------------------------------------------------------------------

local function rescale()
	local camera = Workspace.CurrentCamera
	if not camera then
		return
	end
	local viewport = camera.ViewportSize
	local scale = math.clamp(math.min(viewport.X / 1400, viewport.Y / 820), 0.5, 1)
	local topScale = hud.Top:FindFirstChildOfClass("UIScale")
	local bottomScale = hud.Bottom:FindFirstChildOfClass("UIScale")
	if topScale then
		topScale.Scale = scale
	end
	if bottomScale then
		bottomScale.Scale = scale
	end
	vote.setScale(scale)
	vote.Frame.Position = UDim2.new(0.5, 0, 0, 96 * scale)
	panels.setScale(scale)
	toasts.setScale(scale)
end

local watchedCamera: Camera? = nil
local function watchCamera()
	local camera = Workspace.CurrentCamera
	if camera and camera ~= watchedCamera then
		watchedCamera = camera
		camera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)
	end
	rescale()
end
Workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(watchCamera)
watchCamera()

-- Match state ----------------------------------------------------------------------------

local function refreshStatus()
	local status = tostring(State:GetAttribute("Status") or "")
	local detail = tostring(State:GetAttribute("Detail") or "")
	local endsAt = State:GetAttribute("EndsAt")
	local phase = State:GetAttribute("Phase")
	local left = if type(endsAt) == "number" and endsAt > 0 then endsAt - Workspace:GetServerTimeNow() else 0
	if left > 0 then
		local clock = string.format("%d:%02d", math.ceil(left) // 60, math.ceil(left) % 60)
		detail = if phase == "Match" then `{clock} • {State:GetAttribute("Alive") or 0} LEFT` else clock
	end
	hud.setStatus(status, detail)
	local statusTab = hud.Top:FindFirstChild("Status")
	if statusTab and statusTab:IsA("GuiObject") then
		statusTab.Visible = phase ~= "Vote" -- the vote cards have their own header
	end
	local mode = if player:GetAttribute("InMatch") == true
		then "InMatch"
		elseif player:GetAttribute("Queued") == true then "Queued"
		else "Play"
	hud.setPlay(mode)
	vote.update()
	world.update()
	if player:GetAttribute("InAfkChamber") == true then
		local spinIn = player:GetAttribute("AfkSpinIn")
		local seconds = if type(spinIn) == "number" then spinIn else 0
		afkLabel.Text = string.format("💤 AFK CHAMBER\nNext Lucky Spin in %d:%02d", seconds // 60, seconds % 60)
		afkLabel.Visible = true
	else
		afkLabel.Visible = false
	end
end

while true do
	refreshStatus()
	task.wait(0.25)
end
