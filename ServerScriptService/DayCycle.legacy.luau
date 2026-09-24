-- DayCycle
-- Server-side so every player shares one sky. Night is deliberately short and
-- moonlit rather than black -- this is a cosy fishing game, not a horror map.

local Lighting = game:GetService("Lighting")

local CYCLE = 900          -- seconds for a full 24h
local START_HOUR = 15      -- open on a warm afternoon
local STEP = 0.25          -- update 4x a second; Lighting replicates, so don't spam it

local DAY = {
	ambient = Color3.fromRGB(86, 93, 103),
	outdoor = Color3.fromRGB(124, 133, 144),
	fog = Color3.fromRGB(186, 215, 222),
	brightness = 2.0,
	haze = 1.15,
	decay = Color3.fromRGB(104, 140, 162),
}
local NIGHT = {
	ambient = Color3.fromRGB(47, 56, 78),
	outdoor = Color3.fromRGB(62, 76, 106),
	fog = Color3.fromRGB(46, 58, 86),
	brightness = 0.85,
	haze = 1.9,
	decay = Color3.fromRGB(46, 62, 104),
}
local DUSK = Color3.fromRGB(240, 168, 112)

local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
local grade = Lighting:FindFirstChild("HubGrade")

local function lerpC(a, b, t)
	return a:Lerp(b, t)
end

local start = os.clock()

while true do
	local elapsed = os.clock() - start
	local hour = (START_HOUR + (elapsed / CYCLE) * 24) % 24
	Lighting.ClockTime = hour

	-- 0 at midnight, 1 at noon, smooth in between
	local dayness = math.clamp((math.sin((hour / 24) * math.pi * 2 - math.pi / 2) + 1) / 2, 0, 1)
	-- sharpen it so dawn and dusk are quick and the day holds
	local d = dayness ^ 0.55

	Lighting.Ambient = lerpC(NIGHT.ambient, DAY.ambient, d)
	Lighting.OutdoorAmbient = lerpC(NIGHT.outdoor, DAY.outdoor, d)
	Lighting.FogColor = lerpC(NIGHT.fog, DAY.fog, d)
	Lighting.Brightness = NIGHT.brightness + (DAY.brightness - NIGHT.brightness) * d

	if atmosphere then
		atmosphere.Haze = NIGHT.haze + (DAY.haze - NIGHT.haze) * d
		atmosphere.Decay = lerpC(NIGHT.decay, DAY.decay, d)
		-- warm the horizon as the sun sits low, either end of the day
		local low = math.clamp(1 - math.abs(d - 0.42) / 0.30, 0, 1)
		atmosphere.Color = lerpC(Color3.fromRGB(202, 212, 218), DUSK, low * 0.75)
		atmosphere.Glare = 0.14 + low * 0.55
	end

	if grade then
		grade.TintColor = lerpC(Color3.fromRGB(196, 206, 244), Color3.fromRGB(255, 251, 244), d)
		grade.Saturation = 0.10 - (1 - d) * 0.10
	end

	-- anything that wants to know whether it's dark can read this
	Lighting:SetAttribute("Dayness", d)
	Lighting:SetAttribute("IsNight", d < 0.22)

	task.wait(STEP)
end
