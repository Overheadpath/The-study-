--!strict
-- Keeps the training dummies standing: a knocked-out dummy is swapped for a
-- fresh one after a few seconds.

local Training = {}

local RESPAWN_DELAY = 3

local function watch(folder: Instance, dummy: Instance)
	if not dummy:IsA("Model") then
		return
	end
	local humanoid = dummy:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end
	local template = dummy:Clone()
	humanoid.Died:Connect(function()
		task.wait(RESPAWN_DELAY)
		local fresh = template:Clone()
		dummy:Destroy()
		fresh.Parent = folder
		watch(folder, fresh)
	end)
end

function Training.start(grounds: Instance?)
	local folder = grounds and grounds:FindFirstChild("Dummies")
	if not folder then
		return
	end
	for _, dummy in folder:GetChildren() do
		watch(folder, dummy)
	end
end

return Training
