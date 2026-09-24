-- TradingController
-- Routes the traders' server replies into the one shared ShopWindow:
--   Finn's fish market: the server's "Shop" quote opens the market (Fish mode,
--   the same window as the rod stall), "Sold" puts the result in it.
--   The rod stall: TradeUpdate replies only refresh the rod shop, which the
--   stall's circle has already opened on the client (RodShop.local). They open
--   it themselves only when the server opened the shop (a Browse rods prompt).

local Players = game:GetService("Players")
local player = Players.LocalPlayer
local system = game.ReplicatedStorage:WaitForChild("FishingSystem")
local ShopWindow = require(system:WaitForChild("ShopWindow"))

-- after a sale the server sends "Sold" and then a fresh "Shop" quote (in that
-- order, on the same remote): that quote only refreshes the market, so it can
-- never re-open a window the player has just closed or walked away from
local refreshNext = false

system:WaitForChild("TradeUpdate").OnClientEvent:Connect(function(data)
	if type(data) ~= "table" then return end
	if data.open then
		ShopWindow.Open("Rods", { owned = data.owned, message = data.message or "" }, "remote")
	else
		ShopWindow.Update("Rods", { owned = data.owned, message = data.message })
	end
end)

system:WaitForChild("Update").OnClientEvent:Connect(function(kind, data)
	if kind == "Shop" then
		local refreshOnly = refreshNext
		refreshNext = false
		if refreshOnly or ShopWindow.Mode() == "Fish" then
			ShopWindow.Update("Fish", { quote = data })
		else
			ShopWindow.Open("Fish", { quote = data, message = "" }, "market")
		end
	elseif kind == "Sold" and type(data) == "table" then
		refreshNext = true
		ShopWindow.SetMessage(data.count > 0 and ("Sold " .. data.count .. " for $" .. data.value .. "!") or "No fish selected.", "Fish")
	end
end)

player.CharacterAdded:Connect(function()
	if ShopWindow.Mode() == "Fish" then ShopWindow.Close() end
end)
