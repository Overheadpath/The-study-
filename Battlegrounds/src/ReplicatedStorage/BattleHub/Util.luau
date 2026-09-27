--!strict
-- Small helpers shared by the server, the client and the hub builder.

local Config = require(script.Parent.Config)

type RarityDef = Config.RarityDef
type AuraDef = Config.AuraDef
type EmitterDef = Config.EmitterDef

local Util = {}

-- 1234567 -> "1,234,567"
function Util.comma(n: number): string
	local whole = tostring(math.floor(math.abs(n)))
	local reversed = string.reverse(whole)
	local grouped = string.gsub(reversed, "(%d%d%d)", "%1,")
	local result = string.reverse(grouped)
	if string.sub(result, 1, 1) == "," then
		result = string.sub(result, 2)
	end
	if n < 0 then
		result = "-" .. result
	end
	return result
end

-- 75 -> "1:15"
function Util.clock(seconds: number): string
	local s = math.max(0, math.ceil(seconds))
	return string.format("%d:%02d", s // 60, s % 60)
end

-- 3700 -> "1h 1m", 125 -> "2m 5s"
function Util.duration(seconds: number): string
	local s = math.max(0, math.floor(seconds))
	local h = s // 3600
	local m = (s % 3600) // 60
	if h > 0 then
		return string.format("%dh %dm", h, m)
	end
	return string.format("%dm %ds", m, s % 60)
end

function Util.xpForLevel(level: number): number
	return Config.XPForLevel(level)
end

function Util.rarity(name: string): RarityDef
	for _, r in Config.Rarities do
		if r.Name == name then
			return r
		end
	end
	return Config.Rarities[1]
end

function Util.find<T>(list: { T }, id: string): T?
	for _, item in list do
		if (item :: any).Id == id then
			return item
		end
	end
	return nil
end

-- Picks an index from `weights` (all > 0). `roll` is a number in [0, 1).
function Util.pickWeighted(weights: { number }, roll: number): number
	local total = 0
	for _, w in weights do
		total += w
	end
	local target = roll * total
	local acc = 0
	for i, w in weights do
		acc += w
		if target < acc then
			return i
		end
	end
	return #weights
end

-- Chance (0-1) for each rarity to come up on a roll, taking into account which
-- rarities actually exist in `list`.
function Util.rarityWeights(list: { any }): { number }
	local weights = {}
	for i, item in list do
		-- Items share their rarity's weight evenly so adding more commons
		-- doesn't make legendaries rarer.
		local sameRarity = 0
		for _, other in list do
			if other.Rarity == item.Rarity then
				sameRarity += 1
			end
		end
		weights[i] = Util.rarity(item.Rarity).Weight / sameRarity
	end
	return weights
end

-- Which shop item is on sale today. Both server and client call this with the
-- server clock so they always agree.
export type DealItem = { Kind: "Aura" | "Title", Id: string }

function Util.dealOfTheDay(serverTime: number): DealItem?
	local pool: { DealItem } = {}
	for _, aura in Config.Auras do
		if aura.Price then
			table.insert(pool, { Kind = "Aura", Id = aura.Id })
		end
	end
	for _, title in Config.Titles do
		if title.Price then
			table.insert(pool, { Kind = "Title", Id = title.Id })
		end
	end
	if #pool == 0 then
		return nil
	end
	local day = math.floor(serverTime / 86400)
	return pool[(day * 7 + 3) % #pool + 1]
end

-- Price after today's discount (nil when the item can't be bought).
function Util.price(kind: "Aura" | "Title", id: string, serverTime: number): number?
	local base: number?
	if kind == "Aura" then
		local aura = Util.find(Config.Auras, id)
		base = aura and aura.Price
	else
		local title = Util.find(Config.Titles, id)
		base = title and title.Price
	end
	if not base then
		return nil
	end
	local deal = Util.dealOfTheDay(serverTime)
	if deal and deal.Kind == kind and deal.Id == id then
		return math.floor(base * (1 - Config.DailyDealDiscount) / 10 + 0.5) * 10
	end
	return base
end

local function sequence(colors: { Color3 }): ColorSequence
	if #colors == 1 then
		return ColorSequence.new(colors[1])
	end
	local keys = {}
	for i, c in colors do
		table.insert(keys, ColorSequenceKeypoint.new((i - 1) / (#colors - 1), c))
	end
	return ColorSequence.new(keys)
end

local function numbers(a: number, b: number): NumberSequence
	return NumberSequence.new({ NumberSequenceKeypoint.new(0, a), NumberSequenceKeypoint.new(1, b) })
end

-- Puts an aura's particle emitters on `part` (removing any previous ones with
-- the same name). Pass nil to just remove the aura.
function Util.applyAura(part: BasePart, aura: AuraDef?, name: string?)
	local tag = name or "HubAura"
	for _, child in part:GetChildren() do
		if child.Name == tag and child:IsA("ParticleEmitter") then
			child:Destroy()
		end
	end
	if not aura then
		return
	end
	for _, def: EmitterDef in aura.Emitters do
		local e = Instance.new("ParticleEmitter")
		e.Name = tag
		e.Texture = def.Texture
		e.Color = sequence(def.Colors)
		e.Size = numbers(def.Size[1], def.Size[2])
		local tr = def.Transparency or { 0, 1 }
		e.Transparency = numbers(tr[1], tr[2])
		e.Lifetime = NumberRange.new(def.Lifetime[1], def.Lifetime[2])
		e.Rate = def.Rate
		e.Speed = NumberRange.new(def.Speed[1], def.Speed[2])
		local spread = def.Spread or 30
		e.SpreadAngle = Vector2.new(spread, spread)
		e.Acceleration = def.Accel or Vector3.zero
		e.LightEmission = def.LightEmission or 0
		if def.RotSpeed then
			e.RotSpeed = NumberRange.new(def.RotSpeed[1], def.RotSpeed[2])
			e.Rotation = NumberRange.new(0, 360)
		end
		e.Drag = def.Drag or 0
		e.LockedToPart = def.Locked or false
		e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
		e.Parent = part
	end
end

return Util
