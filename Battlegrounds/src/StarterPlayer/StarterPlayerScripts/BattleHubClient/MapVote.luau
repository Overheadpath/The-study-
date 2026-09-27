--!strict
-- The MAP VOTE cards shown at the top of the screen while voting is open.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local UI = require(script.Parent:WaitForChild("UI"))

local rgb = Color3.fromRGB

export type MapVote = {
	Frame: Frame,
	update: () -> (),
	setScale: (scale: number) -> (),
}

local MapVote = {}

function MapVote.new(
	parent: Instance,
	state: Instance,
	request: (string, any) -> { [string]: any },
	toast: (string, string?) -> ()
): MapVote
	local frame = UI.new("Frame", {
		Name = "MapVote",
		BackgroundTransparency = 1,
		Size = UDim2.fromOffset(800, 250),
		Position = UDim2.new(0.5, 0, 0, 96),
		AnchorPoint = Vector2.new(0.5, 0),
		Visible = false,
		Parent = parent,
	})
	local scale = UI.new("UIScale", { Parent = frame })
	local back = UI.new("Frame", {
		Name = "Back",
		Size = UDim2.new(1, 0, 0, 176),
		Position = UDim2.fromOffset(0, 66),
		BackgroundColor3 = rgb(14, 14, 20),
		BackgroundTransparency = 0.15,
		Parent = frame,
	})
	UI.corner(back, 14)
	UI.stroke(back, rgb(50, 50, 60), 3, true)
	UI.text(frame, "MAP VOTE", { Name = "Title", Size = UDim2.new(1, 0, 0, 36), Stroke = 3 })
	local timer = UI.text(frame, "VOTE ENDS IN 15", {
		Name = "Timer",
		Size = UDim2.new(1, 0, 0, 28),
		Position = UDim2.fromOffset(0, 34),
		Color = UI.Colors.Gold,
		Stroke = 3,
	})

	type Card = {
		Root: TextButton,
		Stroke: UIStroke,
		Count: TextLabel,
		Name: TextLabel,
		Icon: TextLabel,
		Art: UIGradient,
	}
	local cards: { Card } = {}
	local myVote = 0
	local optionsKey = ""
	for i = 1, 3 do
		local root = UI.new("TextButton", {
			Name = "Option" .. i,
			Text = "",
			AutoButtonColor = false,
			Size = UDim2.fromOffset(244, 154),
			Position = UDim2.fromOffset(18 + (i - 1) * 258, 77),
			BackgroundColor3 = Color3.new(1, 1, 1),
			Parent = frame,
		})
		UI.corner(root, 10)
		local stroke = UI.stroke(root, rgb(30, 30, 36), 4, true)
		local art = UI.gradient(root, { rgb(90, 90, 90), rgb(30, 30, 30) }, 45)
		local icon = UI.text(
			root,
			"",
			{
				Name = "Icon",
				Size = UDim2.fromOffset(84, 84),
				Position = UDim2.new(0.5, 0, 0.45, 0),
				AnchorPoint = Vector2.new(0.5, 0.5),
				Stroke = 0,
			}
		)
		local tag = UI.new(
			"Frame",
			{
				Name = "Number",
				Size = UDim2.fromOffset(52, 30),
				Position = UDim2.fromOffset(-6, -8),
				BackgroundColor3 = UI.Colors.Orange,
				Rotation = -4,
				Parent = root,
			}
		)
		UI.corner(tag, 6)
		UI.stroke(tag, rgb(60, 25, 0), 2, true)
		UI.text(
			tag,
			string.format("%02d", i),
			{ Size = UDim2.new(1, -6, 1, -4), Position = UDim2.fromOffset(3, 2), Stroke = 2 }
		)
		local name = UI.text(root, "", {
			Name = "MapName",
			Size = UDim2.new(1, -84, 0, 30),
			Position = UDim2.new(0, 10, 1, -8),
			AnchorPoint = Vector2.new(0, 1),
			Align = Enum.TextXAlignment.Left,
			Stroke = 3,
		})
		local bubble = UI.new("Frame", {
			Name = "Votes",
			Size = UDim2.fromOffset(58, 58),
			Position = UDim2.new(1, -8, 1, -8),
			AnchorPoint = Vector2.new(1, 1),
			BackgroundColor3 = UI.Colors.Gold,
			Parent = root,
		})
		UI.corner(bubble, 29)
		UI.stroke(bubble, rgb(90, 55, 0), 3, true)
		local count = UI.text(
			bubble,
			"0",
			{
				Name = "Count",
				Size = UDim2.new(1, -12, 1, -10),
				Position = UDim2.fromOffset(6, 5),
				Color = rgb(40, 25, 0),
				Stroke = 0,
			}
		)
		UI.bouncy(root)
		local index = i
		root.Activated:Connect(function()
			local result = request("Vote", index)
			if result.ok then
				myVote = index
				for j, c in cards do
					c.Stroke.Color = if j == myVote then Color3.new(1, 1, 1) else rgb(30, 30, 36)
				end
			elseif result.msg then
				toast(result.msg, "Bad")
			end
		end)
		cards[i] = { Root = root, Stroke = stroke, Count = count, Name = name, Icon = icon, Art = art }
	end

	local self = {} :: MapVote
	self.Frame = frame

	function self.update()
		local phase = state:GetAttribute("Phase")
		local options = state:GetAttribute("Options")
		local visible = phase == "Vote" and type(options) == "string" and options ~= ""
		frame.Visible = visible
		if not visible then
			myVote = 0
			return
		end
		assert(type(options) == "string")
		if options ~= optionsKey then
			optionsKey = options
			myVote = 0
		end
		local ids = string.split(options, ",")
		for i, c in cards do
			local id = ids[i]
			local arena = id and Util.find(Config.Arenas, id)
			c.Root.Visible = arena ~= nil
			if arena then
				c.Name.Text = arena.Name
				c.Icon.Text = arena.Icon
				c.Art.Color = ColorSequence.new(UI.lighten(arena.Color, 0.15), UI.darken(arena.Accent, 0.35))
				c.Count.Text = tostring(state:GetAttribute("Votes" .. i) or 0)
				c.Stroke.Color = if i == myVote then Color3.new(1, 1, 1) else rgb(30, 30, 36)
			end
		end
		local endsAt = state:GetAttribute("EndsAt")
		local left = if type(endsAt) == "number" then endsAt - Workspace:GetServerTimeNow() else 0
		timer.Text = "VOTE ENDS IN " .. tostring(math.max(0, math.ceil(left)))
	end

	function self.setScale(s)
		scale.Scale = s
	end

	return self
end

return MapVote
