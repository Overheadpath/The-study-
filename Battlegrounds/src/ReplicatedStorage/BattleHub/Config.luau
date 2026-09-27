--!strict
--[[
	BattleHub settings.

	Names, prices, rewards and timers for the whole hub live here, so you can
	change them without touching the scripts. There are no Robux purchases
	anywhere: everything is earned by playing or bought with in-game cash.

	Colours use Color3.fromRGB(red, green, blue), each 0-255.
]]

export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Mythic"

export type RarityDef = {
	Name: Rarity,
	Order: number,
	Color: Color3,
	Weight: number, -- how likely a roll lands on this rarity (bigger = more likely)
	DuplicateCash: number, -- cash you get back when you roll something you already own
}

export type EmitterDef = {
	Texture: string,
	Colors: { Color3 },
	Size: { number }, -- { start, finish }
	Transparency: { number }?, -- { start, finish }
	Lifetime: { number }, -- { min, max }
	Rate: number,
	Speed: { number }, -- { min, max }
	Spread: number?,
	Accel: Vector3?,
	LightEmission: number?,
	RotSpeed: { number }?, -- { min, max }
	Drag: number?,
	Locked: boolean?,
}

export type StyleDef = {
	Id: string,
	Name: string,
	Rarity: Rarity,
	Color: Color3,
	Icon: string,
	Blurb: string,
}

export type AuraDef = {
	Id: string,
	Name: string,
	Rarity: Rarity,
	Price: number?, -- nil = can't be bought (wheel prize only)
	Color: Color3,
	Icon: string,
	Blurb: string,
	Emitters: { EmitterDef },
}

export type TitleDef = {
	Id: string,
	Name: string,
	Rarity: Rarity,
	Price: number?, -- nil = can't be bought
	UnlockLevel: number?, -- given for free when you reach this level
	Color: Color3,
}

export type BundleDef = {
	Id: string,
	Name: string,
	Kind: "Spins" | "LuckySpins",
	Amount: number,
	Price: number,
	Icon: string,
	Color: Color3,
}

export type PrizeKind = "Cash" | "Spins" | "XP" | "Aura"

export type PrizeDef = {
	Kind: PrizeKind,
	Amount: number,
	Id: string?, -- aura id for Kind = "Aura"
	BonusTitle: string?, -- title given together with the aura
	Weight: number,
	Label: string,
	Color: Color3,
}

export type ArenaDef = {
	Id: string,
	Name: string,
	Blurb: string,
	Color: Color3,
	Accent: Color3,
	Icon: string,
}

local rgb = Color3.fromRGB

local FIRE = "rbxasset://textures/particles/fire_main.dds"
local SPARKLE = "rbxasset://textures/particles/sparkles_main.dds"
local SMOKE = "rbxasset://textures/particles/smoke_main.dds"

local Config = {}

Config.GameName = "BATTLEGROUNDS"
Config.HubTagline = "FIGHT. RANK UP. REPEAT."

-- Where the lobby and the battle maps are built (studs). Change these if they
-- overlap something else in your place.
Config.HubOrigin = Vector3.new(0, 100, 0)
Config.ArenaOrigin = Vector3.new(1600, 100, 0) -- where the voted map is loaded for a match
Config.TrainingOrigin = Vector3.new(0, 100, 900)

-- If true the builder also sets up Lighting (bloom, colour, time of day) for the neon look.
Config.SetUpLighting = true

-- Match flow ------------------------------------------------------------------

Config.Rounds = {
	IntermissionTime = 20,
	VoteTime = 15,
	MatchTime = 180,
	ResultsTime = 7,
	MinPlayers = 2,
	SoloInStudio = true, -- lets you test a match alone when you press Play in Studio
}

Config.Rewards = {
	Played = { XP = 60, Cash = 40 },
	KO = { XP = 40, Cash = 30 },
	Win = { XP = 200, Cash = 200 },
	LevelUp = { Cash = 150, Spins = 1 },
}

-- What a brand new player starts with.
Config.StartingCash = 500
Config.StartingSpins = 3
Config.StartingLuckySpins = 1

-- Free lucky spins: one for every FreeLuckySpinEvery seconds online, and a much
-- faster rate plus a little cash while standing in the AFK chamber.
Config.FreeLuckySpinEvery = 15 * 60
Config.Afk = {
	LuckySpinEvery = 5 * 60,
	CashEvery = 60,
	CashAmount = 25,
}

-- XP needed to go from `level` to `level + 1`.
function Config.XPForLevel(level: number): number
	return 100 + (level - 1) * 40
end

Config.DailyDealDiscount = 0.3 -- 30% off one shop item, changes every day

-- Rarities ----------------------------------------------------------------------

Config.Rarities = {
	{ Name = "Common", Order = 1, Color = rgb(185, 190, 205), Weight = 55, DuplicateCash = 100 },
	{ Name = "Rare", Order = 2, Color = rgb(60, 150, 255), Weight = 27, DuplicateCash = 250 },
	{ Name = "Epic", Order = 3, Color = rgb(175, 85, 255), Weight = 12, DuplicateCash = 600 },
	{ Name = "Legendary", Order = 4, Color = rgb(255, 190, 40), Weight = 5, DuplicateCash = 1500 },
	{ Name = "Mythic", Order = 5, Color = rgb(255, 45, 75), Weight = 1, DuplicateCash = 4000 },
} :: { RarityDef }

-- Fighting styles (STYLES button). Rolled with Spins. Your combat scripts can
-- read the equipped one with player:GetAttribute("Style").
Config.Styles = {
	{
		Id = "Brawler",
		Name = "Brawler",
		Rarity = "Common",
		Color = rgb(235, 125, 60),
		Icon = "👊",
		Blurb = "Fast fists and a faster temper.",
	},
	{
		Id = "Boxer",
		Name = "Boxer",
		Rarity = "Common",
		Color = rgb(225, 60, 60),
		Icon = "🥊",
		Blurb = "Jab, jab, cross. Repeat until they drop.",
	},
	{
		Id = "Bruiser",
		Name = "Bruiser",
		Rarity = "Common",
		Color = rgb(150, 150, 165),
		Icon = "🔨",
		Blurb = "Slow, heavy hits that crack the floor.",
	},
	{
		Id = "Kickboxer",
		Name = "Kickboxer",
		Rarity = "Rare",
		Color = rgb(255, 150, 40),
		Icon = "💥",
		Blurb = "Long kicks that keep enemies away.",
	},
	{
		Id = "Wrestler",
		Name = "Wrestler",
		Rarity = "Rare",
		Color = rgb(90, 170, 255),
		Icon = "💪",
		Blurb = "Grabs, slams and suplexes.",
	},
	{
		Id = "Ninja",
		Name = "Ninja",
		Rarity = "Epic",
		Color = rgb(125, 95, 225),
		Icon = "🌙",
		Blurb = "Vanish, reappear, strike from behind.",
	},
	{
		Id = "Swordsman",
		Name = "Swordsman",
		Rarity = "Epic",
		Color = rgb(200, 225, 255),
		Icon = "⚔️",
		Blurb = "One blade. Zero hesitation.",
	},
	{
		Id = "Monk",
		Name = "Monk",
		Rarity = "Legendary",
		Color = rgb(255, 200, 80),
		Icon = "☯️",
		Blurb = "Chi-powered palms that shake the ground.",
	},
	{
		Id = "DemonFist",
		Name = "Demon Fist",
		Rarity = "Legendary",
		Color = rgb(255, 40, 60),
		Icon = "👹",
		Blurb = "Borrowed power. Terrible price.",
	},
	{
		Id = "VoidWalker",
		Name = "Void Walker",
		Rarity = "Mythic",
		Color = rgb(155, 65, 255),
		Icon = "🌀",
		Blurb = "Master the void before it masters you.",
	},
} :: { StyleDef }

Config.StartingStyle = "Brawler"

-- The style shown on the big FEATURED poster in the lobby.
Config.FeaturedStyle = "VoidWalker"

-- Awakenings (AWAKEN button): your ultimate mode. Also rolled with Spins.
-- Read it with player:GetAttribute("Awakening").
Config.Awakenings = {
	{
		Id = "Adrenaline",
		Name = "Adrenaline",
		Rarity = "Common",
		Color = rgb(255, 95, 95),
		Icon = "💢",
		Blurb = "Hit faster the lower your health gets.",
	},
	{
		Id = "IronBody",
		Name = "Iron Body",
		Rarity = "Common",
		Color = rgb(170, 175, 195),
		Icon = "🛡️",
		Blurb = "Shrug off damage for a few seconds.",
	},
	{
		Id = "Berserk",
		Name = "Berserk",
		Rarity = "Rare",
		Color = rgb(220, 30, 45),
		Icon = "😈",
		Blurb = "Lose control. Hit twice as hard.",
	},
	{
		Id = "FlashStep",
		Name = "Flash Step",
		Rarity = "Rare",
		Color = rgb(120, 220, 255),
		Icon = "💨",
		Blurb = "Blink across the arena.",
	},
	{
		Id = "Inferno",
		Name = "Inferno",
		Rarity = "Epic",
		Color = rgb(255, 110, 30),
		Icon = "🔥",
		Blurb = "Every strike leaves the floor burning.",
	},
	{
		Id = "ThunderGod",
		Name = "Thunder God",
		Rarity = "Legendary",
		Color = rgb(255, 230, 80),
		Icon = "⚡",
		Blurb = "Lightning follows every combo.",
	},
	{
		Id = "Eclipse",
		Name = "Eclipse",
		Rarity = "Mythic",
		Color = rgb(120, 60, 200),
		Icon = "🌑",
		Blurb = "The lights go out. Only you can see.",
	},
} :: { StyleDef }

-- Auras: particle effects around your character. Bought in the SHOP with cash.
Config.Auras = {
	{
		Id = "Ember",
		Name = "Ember Aura",
		Rarity = "Common",
		Price = 1500,
		Color = rgb(255, 140, 50),
		Icon = "✨",
		Blurb = "Little sparks that follow you around.",
		Emitters = {
			{
				Texture = SPARKLE,
				Colors = { rgb(255, 200, 90), rgb(255, 90, 30) },
				Size = { 0.5, 0 },
				Lifetime = { 0.6, 1.1 },
				Rate = 30,
				Speed = { 1, 3 },
				Spread = 180,
				Accel = Vector3.new(0, 4, 0),
				LightEmission = 1,
			},
		},
	},
	{
		Id = "Frost",
		Name = "Frost Aura",
		Rarity = "Rare",
		Price = 4000,
		Color = rgb(140, 220, 255),
		Icon = "❄️",
		Blurb = "Cold enough to freeze a punch mid-air.",
		Emitters = {
			{
				Texture = SPARKLE,
				Colors = { rgb(220, 250, 255), rgb(90, 180, 255) },
				Size = { 0.6, 0.1 },
				Lifetime = { 0.8, 1.4 },
				Rate = 35,
				Speed = { 0.5, 2 },
				Spread = 180,
				Accel = Vector3.new(0, -1, 0),
				LightEmission = 0.8,
				RotSpeed = { -90, 90 },
			},
			{
				Texture = SMOKE,
				Colors = { rgb(200, 240, 255) },
				Size = { 1.5, 3 },
				Transparency = { 0.75, 1 },
				Lifetime = { 1, 1.6 },
				Rate = 8,
				Speed = { 0.5, 1 },
				Spread = 180,
				LightEmission = 0.3,
			},
		},
	},
	{
		Id = "Toxic",
		Name = "Toxic Aura",
		Rarity = "Rare",
		Price = 4000,
		Color = rgb(110, 255, 90),
		Icon = "☢️",
		Blurb = "Nobody wants to stand next to you.",
		Emitters = {
			{
				Texture = SMOKE,
				Colors = { rgb(140, 255, 90), rgb(40, 160, 40) },
				Size = { 1.2, 2.6 },
				Transparency = { 0.55, 1 },
				Lifetime = { 0.9, 1.5 },
				Rate = 14,
				Speed = { 1, 2 },
				Spread = 60,
				Accel = Vector3.new(0, 3, 0),
				LightEmission = 0.6,
			},
			{
				Texture = SPARKLE,
				Colors = { rgb(190, 255, 120) },
				Size = { 0.35, 0 },
				Lifetime = { 0.5, 0.9 },
				Rate = 20,
				Speed = { 2, 4 },
				Spread = 180,
				LightEmission = 1,
			},
		},
	},
	{
		Id = "Storm",
		Name = "Storm Aura",
		Rarity = "Epic",
		Price = 9000,
		Color = rgb(180, 140, 255),
		Icon = "⚡",
		Blurb = "Crackling lightning on every step.",
		Emitters = {
			{
				Texture = SPARKLE,
				Colors = { rgb(255, 255, 255), rgb(170, 120, 255) },
				Size = { 0.9, 0 },
				Lifetime = { 0.15, 0.35 },
				Rate = 60,
				Speed = { 6, 10 },
				Spread = 180,
				LightEmission = 1,
				RotSpeed = { -360, 360 },
			},
			{
				Texture = SMOKE,
				Colors = { rgb(120, 80, 255) },
				Size = { 2, 3.5 },
				Transparency = { 0.7, 1 },
				Lifetime = { 0.6, 1 },
				Rate = 10,
				Speed = { 0.5, 1 },
				Spread = 180,
				LightEmission = 1,
			},
		},
	},
	{
		Id = "Hellfire",
		Name = "Hellfire Aura",
		Rarity = "Epic",
		Price = 9000,
		Color = rgb(255, 60, 40),
		Icon = "🔥",
		Blurb = "Red flames that never go out.",
		Emitters = {
			{
				Texture = FIRE,
				Colors = { rgb(255, 170, 60), rgb(255, 40, 30), rgb(90, 0, 0) },
				Size = { 1.6, 0.3 },
				Transparency = { 0.2, 1 },
				Lifetime = { 0.5, 0.9 },
				Rate = 45,
				Speed = { 2, 4 },
				Spread = 25,
				Accel = Vector3.new(0, 6, 0),
				LightEmission = 0.9,
				RotSpeed = { -60, 60 },
			},
		},
	},
	{
		Id = "Golden",
		Name = "Golden Aura",
		Rarity = "Legendary",
		Price = 20000,
		Color = rgb(255, 210, 60),
		Icon = "👑",
		Blurb = "Shine like the champion you are.",
		Emitters = {
			{
				Texture = SPARKLE,
				Colors = { rgb(255, 245, 190), rgb(255, 190, 40) },
				Size = { 0.8, 0 },
				Lifetime = { 0.8, 1.4 },
				Rate = 45,
				Speed = { 1, 3 },
				Spread = 180,
				Accel = Vector3.new(0, 3, 0),
				LightEmission = 1,
				RotSpeed = { -120, 120 },
			},
			{
				Texture = SMOKE,
				Colors = { rgb(255, 220, 110) },
				Size = { 2.5, 4 },
				Transparency = { 0.8, 1 },
				Lifetime = { 0.8, 1.2 },
				Rate = 8,
				Speed = { 0.2, 0.6 },
				Spread = 180,
				LightEmission = 1,
			},
		},
	},
	{
		Id = "Void",
		Name = "Void Aura",
		Rarity = "Mythic",
		Price = nil, -- Lucky Wheel grand prize only
		Color = rgb(150, 60, 255),
		Icon = "🌀",
		Blurb = "Lucky Wheel grand prize. Can't be bought.",
		Emitters = {
			{
				Texture = SMOKE,
				Colors = { rgb(20, 0, 40), rgb(120, 40, 255) },
				Size = { 2.4, 0.4 },
				Transparency = { 0.3, 1 },
				Lifetime = { 0.7, 1.2 },
				Rate = 30,
				Speed = { 1, 2 },
				Spread = 180,
				Accel = Vector3.new(0, 2, 0),
				LightEmission = 0.4,
				RotSpeed = { -180, 180 },
			},
			{
				Texture = SPARKLE,
				Colors = { rgb(230, 190, 255), rgb(140, 60, 255) },
				Size = { 0.7, 0 },
				Lifetime = { 0.5, 1 },
				Rate = 35,
				Speed = { 3, 6 },
				Spread = 180,
				LightEmission = 1,
			},
		},
	},
} :: { AuraDef }

-- Titles shown above your head.
Config.Titles = {
	{ Id = "Rookie", Name = "Rookie", Rarity = "Common", Price = nil, UnlockLevel = 1, Color = rgb(200, 205, 215) },
	{ Id = "Scrapper", Name = "Scrapper", Rarity = "Common", Price = 1000, Color = rgb(230, 170, 120) },
	{ Id = "StreetKing", Name = "Street King", Rarity = "Rare", Price = 3000, Color = rgb(255, 150, 50) },
	{ Id = "Veteran", Name = "Veteran", Rarity = "Rare", Price = nil, UnlockLevel = 25, Color = rgb(120, 230, 140) },
	{ Id = "Unbreakable", Name = "Unbreakable", Rarity = "Epic", Price = 7500, Color = rgb(110, 180, 255) },
	{ Id = "Undefeated", Name = "The Undefeated", Rarity = "Legendary", Price = 15000, Color = rgb(255, 205, 60) },
	{ Id = "Legend", Name = "Legend", Rarity = "Legendary", Price = nil, UnlockLevel = 50, Color = rgb(255, 225, 120) },
	{ Id = "VoidTouched", Name = "Void Touched", Rarity = "Mythic", Price = nil, Color = rgb(185, 110, 255) },
} :: { TitleDef }

Config.StartingTitle = "Rookie"

-- Spin bundles in the SHOP (cash only).
Config.Bundles = {
	{
		Id = "Spin1",
		Name = "1 Spin",
		Kind = "Spins",
		Amount = 1,
		Price = 750,
		Icon = "🎟️",
		Color = rgb(175, 85, 255),
	},
	{
		Id = "Spin5",
		Name = "5 Spins",
		Kind = "Spins",
		Amount = 5,
		Price = 3400,
		Icon = "🎟️",
		Color = rgb(175, 85, 255),
	},
	{
		Id = "Lucky1",
		Name = "1 Lucky Spin",
		Kind = "LuckySpins",
		Amount = 1,
		Price = 1000,
		Icon = "🎡",
		Color = rgb(255, 70, 160),
	},
	{
		Id = "Lucky5",
		Name = "5 Lucky Spins",
		Kind = "LuckySpins",
		Amount = 5,
		Price = 4500,
		Icon = "🎡",
		Color = rgb(255, 70, 160),
	},
} :: { BundleDef }

-- Lucky Wheel slices, clockwise starting from the pointer at the top.
Config.WheelPrizes = {
	{ Kind = "Cash", Amount = 250, Weight = 22, Label = "$250", Color = rgb(215, 30, 45) },
	{ Kind = "Spins", Amount = 1, Weight = 18, Label = "1 SPIN", Color = rgb(125, 35, 190) },
	{ Kind = "Cash", Amount = 500, Weight = 16, Label = "$500", Color = rgb(215, 30, 45) },
	{ Kind = "XP", Amount = 300, Weight = 16, Label = "+300 XP", Color = rgb(125, 35, 190) },
	{ Kind = "Spins", Amount = 2, Weight = 12, Label = "2 SPINS", Color = rgb(215, 30, 45) },
	{ Kind = "Cash", Amount = 1000, Weight = 10, Label = "$1,000", Color = rgb(125, 35, 190) },
	{ Kind = "Spins", Amount = 5, Weight = 5, Label = "5 SPINS", Color = rgb(215, 30, 45) },
	{
		Kind = "Aura",
		Amount = 5000,
		Id = "Void",
		BonusTitle = "VoidTouched",
		Weight = 1,
		Label = "VOID AURA",
		Color = rgb(255, 190, 40),
	},
} :: { PrizeDef }
-- (If you already own the Void Aura, the grand prize pays out `Amount` cash instead.)

-- Battle maps players vote on.
Config.Arenas = {
	{
		Id = "RuinedCity",
		Name = "RUINED CITY",
		Blurb = "Fight through a broken downtown.",
		Color = rgb(95, 105, 125),
		Accent = rgb(255, 150, 40),
		Icon = "🏙️",
	},
	{
		Id = "VolcanoCrater",
		Name = "VOLCANO CRATER",
		Blurb = "Whatever you do, don't touch the lava.",
		Color = rgb(70, 30, 25),
		Accent = rgb(255, 85, 20),
		Icon = "🌋",
	},
	{
		Id = "SkyDojo",
		Name = "SKY DOJO",
		Blurb = "One wrong step and you fall forever.",
		Color = rgb(215, 170, 120),
		Accent = rgb(255, 95, 125),
		Icon = "⛩️",
	},
} :: { ArenaDef }

return Config
