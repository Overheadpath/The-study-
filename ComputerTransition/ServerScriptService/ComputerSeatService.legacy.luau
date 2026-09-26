-- ComputerSeatService
-- Puts players into the computer chair and gets them out again, for
-- ComputerTransition (the module in ReplicatedStorage that plays the walk, the sit
-- and the camera on the player's own screen). Taking the seat has to happen here on
-- the server so every player sees who is sitting at the computer.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local REACH = 10 -- how close to the seat a player has to be to sit down or get up (studs)

local remote = Instance.new("RemoteFunction")
remote.Name = "ComputerSeat"
remote.Parent = ReplicatedStorage

-- A disabled Seat is a game's way of stopping people sitting down just by bumping
-- into it; open it for this one sit and close it again once the player is up.
local function sit(seat, humanoid)
	if seat.Disabled then
		seat.Disabled = false
		local watch
		watch = seat:GetPropertyChangedSignal("Occupant"):Connect(function()
			if not seat.Occupant then
				watch:Disconnect()
				seat.Disabled = true
			end
		end)
		task.delay(1, function()
			if watch.Connected and not seat.Occupant then -- (the sit didn't take)
				watch:Disconnect()
				seat.Disabled = true
			end
		end)
	end
	seat:Sit(humanoid)
end

remote.OnServerInvoke = function(player, action, value)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = humanoid and humanoid.RootPart
	if not root or humanoid.Health <= 0 then return false end

	if action == "Sit" then
		local seat = value
		if typeof(seat) ~= "Instance" or not seat:IsA("Seat") or not seat:IsDescendantOf(workspace) then return false end
		if seat.Occupant == humanoid then return true end
		if seat.Occupant or (seat.Position - root.Position).Magnitude > REACH then return false end
		sit(seat, humanoid)
		return true
	elseif action == "Stand" then
		local seat = humanoid.SeatPart
		if not seat then return true end
		local weld = seat:FindFirstChild("SeatWeld")
		if weld then weld:Destroy() end
		humanoid.Sit = false
		-- back on their feet on the spot they sat down from
		if typeof(value) == "CFrame" and (value.Position - seat.Position).Magnitude <= REACH then
			root.CFrame = value
		end
		pcall(root.SetNetworkOwner, root, player)
		return true
	end
	return false
end
