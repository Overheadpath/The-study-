-- BoatController
-- Drives whichever boat this player is sitting at the helm of. The server
-- hands the boat's physics to the driver, so steering here is immediate; the
-- same BoatPhysics step the server uses for empty boats keeps it consistent.
-- Also relays the boat shed's stock to the shop window (which the shed opens
-- on the client; the server's Stock only refreshes it, so a late reply never
-- re-opens a window you have just closed).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local system = game.ReplicatedStorage:WaitForChild("FishingSystem")
local Theme = require(system:WaitForChild("BubbleTheme"))
local BoatPhysics = require(system:WaitForChild("BoatPhysics"))
local ShopWindow = require(system:WaitForChild("ShopWindow"))
local remote = system:WaitForChild("BoatEvent")

local player = Players.LocalPlayer
local pg = player:WaitForChild("PlayerGui")

remote.OnClientEvent:Connect(function(kind, data)
	if kind == "Stock" then ShopWindow.Update("Boats", data)
	elseif kind == "Message" then ShopWindow.SetMessage(data, "Boats") end
end)

-- a quiet hint the first few times you take the helm
local gui = Theme.New("ScreenGui", "BoatHUD", pg, { ResetOnSpawn = false, DisplayOrder = 31 })
local hint = Theme.New("TextLabel", "Hint", gui, {
	AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -124), Size = UDim2.fromOffset(360, 24),
	BackgroundTransparency = 1, Text = "W / S to row  ·  A / D to steer  ·  jump to hop out", TextSize = 16, TextTransparency = 1,
})
Theme.Text(hint, 16)
hint.BubbleText.Transparency = 1
local hintShown = 0
local function showHint()
	if hintShown >= 3 then return end
	hintShown += 1
	TweenService:Create(hint, TweenInfo.new(0.3), { TextTransparency = 0 }):Play()
	TweenService:Create(hint.BubbleText, TweenInfo.new(0.3), { Transparency = 0.12 }):Play()
	task.delay(4.5, function()
		TweenService:Create(hint, TweenInfo.new(0.6), { TextTransparency = 1 }):Play()
		TweenService:Create(hint.BubbleText, TweenInfo.new(0.6), { Transparency = 1 }):Play()
	end)
end

local driving, state = nil, nil
RunService.RenderStepped:Connect(function(dt)
	local c = player.Character
	local h = c and c:FindFirstChildOfClass("Humanoid")
	local seat = h and h.SeatPart
	local boat = seat and seat:IsA("VehicleSeat") and seat.Parent
	if boat and boat:GetAttribute("BoatId") and boat:GetAttribute("Driver") == player.UserId then
		if driving ~= boat then driving = boat; state = {}; showHint() end
		BoatPhysics.step(boat, state, seat.ThrottleFloat, seat.SteerFloat, dt)
	elseif driving then
		driving = nil; state = nil
	end
end)
