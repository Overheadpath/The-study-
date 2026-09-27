--!strict
--[[
	Codes players can type into the CODES menu. Each code works once per player.
	This file is server-only, so exploiters can't read the list.

	Rewards you can give: Cash, Spins, LuckySpins, XP, Title (an id from
	Config.Titles) and Aura (an id from Config.Auras).
	Expires is optional: os.time({ year = 2026, month = 12, day = 31 }) stops the
	code working after that date (UTC).
	Codes are not case sensitive.
]]

export type Reward = {
	Cash: number?,
	Spins: number?,
	LuckySpins: number?,
	XP: number?,
	Title: string?,
	Aura: string?,
	Expires: number?,
}

local Codes: { [string]: Reward } = {
	RELEASE = { Cash = 1000, Spins = 3 },
	BATTLEGROUNDS = { LuckySpins = 2 },
	FIGHTER = { Cash = 500, Title = "Scrapper" },
}

return Codes
