--!strict
--[[
	Everything the client can ask for (buying, rolling, spinning, codes, queue,
	votes, teleports). The client only *asks*: prices, ownership and spins are
	always checked here, so exploiters can't give themselves anything.
]]

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("BattleHub")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local PlayerData = require(script.Parent:WaitForChild("PlayerData"))
local Context = require(script.Parent:WaitForChild("Context"))
local Rounds = require(script.Parent:WaitForChild("Rounds"))
local Codes = require(script.Parent:WaitForChild("Codes"))

export type Result = { [string]: any }

local Actions = {}

local rng = Random.new()
local handlers: { [string]: (Player, any) -> Result } = {}

local function fail(msg: string): Result
	return { ok = false, msg = msg }
end

local NOT_LOADED = "Your data is still loading, try again in a second."

-- Up to 12 requests at once, refilling at 6 per second.
local buckets: { [Player]: { tokens: number, last: number } } = {}
local function allow(player: Player): boolean
	local t = os.clock()
	local b = buckets[player]
	if not b then
		b = { tokens = 12, last = t }
		buckets[player] = b
	end
	b.tokens = math.min(12, b.tokens + (t - b.last) * 6)
	b.last = t
	if b.tokens < 1 then
		return false
	end
	b.tokens -= 1
	return true
end

local KINDS: { [string]: PlayerData.Kind } = {
	Style = "Styles",
	Awakening = "Awakenings",
	Aura = "Auras",
	Title = "Titles",
}

local function itemName(kind: PlayerData.Kind, id: string): string
	local list: { any } = if kind == "Styles"
		then Config.Styles
		elseif kind == "Awakenings" then Config.Awakenings
		elseif kind == "Auras" then Config.Auras
		else Config.Titles
	local item = Util.find(list, id)
	return if item then item.Name else id
end

----------------------------------------------------------------------------------

handlers.Snapshot = function(player)
	return { ok = true, profile = PlayerData.snapshot(player), savingOff = PlayerData.savingOffReason(player) }
end

handlers.Queue = function(player, want)
	if not PlayerData.get(player) then
		return fail(NOT_LOADED)
	end
	if Rounds.inMatch(player) then
		return fail("You're already in a match!")
	end
	local queued = Rounds.setQueued(player, if type(want) == "boolean" then want else nil)
	return {
		ok = true,
		queued = queued,
		msg = if queued then "You're in the queue for the next battle!" else "You left the queue.",
	}
end

handlers.Vote = function(player, choice)
	if type(choice) ~= "number" then
		return fail("Pick a map.")
	end
	local ok, msg = Rounds.vote(player, choice)
	return { ok = ok, msg = msg }
end

handlers.Roll = function(player, what)
	local list = if what == "Style" then Config.Styles elseif what == "Awakening" then Config.Awakenings else nil
	if not list then
		return fail("Unknown roll.")
	end
	local profile = PlayerData.get(player)
	if not profile then
		return fail(NOT_LOADED)
	end
	if profile.Spins < 1 then
		return fail("Out of spins! Level up, redeem codes, spin the Lucky Wheel or buy more in the SHOP.")
	end
	profile.Spins -= 1
	local index = Util.pickWeighted(Util.rarityWeights(list), rng:NextNumber())
	local item = list[index]
	local kind = (if what == "Style" then "Styles" else "Awakenings") :: PlayerData.Kind
	local isNew = PlayerData.grant(player, kind, item.Id)
	local refund = 0
	if not isNew then
		refund = Util.rarity(item.Rarity).DuplicateCash
		PlayerData.addCash(player, refund)
	end
	PlayerData.changed(player)
	return { ok = true, id = item.Id, new = isNew, refund = refund }
end

handlers.Equip = function(player, arg)
	if type(arg) ~= "table" or type(arg.Kind) ~= "string" or type(arg.Id) ~= "string" or #arg.Id > 64 then
		return fail("Bad request.")
	end
	local kind = KINDS[arg.Kind]
	if not kind then
		return fail("Bad request.")
	end
	if not PlayerData.equip(player, kind, arg.Id) then
		return fail("You don't own that yet.")
	end
	return { ok = true, msg = if arg.Id == "" then "Unequipped." else `Equipped {itemName(kind, arg.Id)}!` }
end

handlers.Buy = function(player, arg)
	if type(arg) ~= "table" or type(arg.Kind) ~= "string" or type(arg.Id) ~= "string" then
		return fail("Bad request.")
	end
	local profile = PlayerData.get(player)
	if not profile then
		return fail(NOT_LOADED)
	end
	if arg.Kind == "Bundle" then
		local bundle = Util.find(Config.Bundles, arg.Id)
		if not bundle then
			return fail("That isn't for sale.")
		end
		if not PlayerData.spend(player, bundle.Price) then
			return fail(`You need ${Util.comma(bundle.Price - profile.Cash)} more cash.`)
		end
		if bundle.Kind == "Spins" then
			PlayerData.addSpins(player, bundle.Amount)
		else
			PlayerData.addLuckySpins(player, bundle.Amount)
		end
		return { ok = true, msg = `Bought {bundle.Name}!` }
	end
	if arg.Kind ~= "Aura" and arg.Kind ~= "Title" then
		return fail("Bad request.")
	end
	local kind = KINDS[arg.Kind] :: PlayerData.Kind
	local price = Util.price(arg.Kind, arg.Id, Workspace:GetServerTimeNow())
	if not price then
		return fail("That can't be bought.")
	end
	if PlayerData.owns(player, kind, arg.Id) then
		return fail("You already own that.")
	end
	if not PlayerData.spend(player, price) then
		return fail(`You need ${Util.comma(price - profile.Cash)} more cash.`)
	end
	PlayerData.grant(player, kind, arg.Id)
	PlayerData.equip(player, kind, arg.Id)
	return { ok = true, msg = `Bought and equipped {itemName(kind, arg.Id)}!` }
end

handlers.SpinWheel = function(player)
	local profile = PlayerData.get(player)
	if not profile then
		return fail(NOT_LOADED)
	end
	if profile.LuckySpins < 1 then
		return fail("No Lucky Spins left! Chill in the AFK Chamber to earn free ones.")
	end
	profile.LuckySpins -= 1
	local weights = {}
	for i, prize in Config.WheelPrizes do
		weights[i] = prize.Weight
	end
	local index = Util.pickWeighted(weights, rng:NextNumber())
	local prize = Config.WheelPrizes[index]
	local msg = `You won {prize.Label}!`
	if prize.Kind == "Cash" then
		Context.give(player, { Cash = prize.Amount })
	elseif prize.Kind == "Spins" then
		Context.give(player, { Spins = prize.Amount })
	elseif prize.Kind == "XP" then
		Context.give(player, { XP = prize.Amount })
	elseif prize.Kind == "Aura" and prize.Id then
		if PlayerData.grant(player, "Auras", prize.Id) then
			if prize.BonusTitle then
				PlayerData.grant(player, "Titles", prize.BonusTitle)
			end
			msg = `GRAND PRIZE! You won the {itemName("Auras", prize.Id)}!`
			Context.notifyAll(`{player.DisplayName} won the {itemName("Auras", prize.Id)} on the Lucky Wheel!`, "Good")
		else
			Context.give(player, { Cash = prize.Amount })
			msg = `Grand prize again! You already own it, so here's ${Util.comma(prize.Amount)}.`
		end
	end
	PlayerData.changed(player)
	return { ok = true, index = index, label = prize.Label, msg = msg }
end

handlers.Redeem = function(player, text)
	if type(text) ~= "string" then
		return fail("Type a code first.")
	end
	local code = string.upper((string.gsub(text, "%s+", "")))
	if #code == 0 or #code > 40 then
		return fail("Type a code first.")
	end
	local profile = PlayerData.get(player)
	if not profile then
		return fail(NOT_LOADED)
	end
	local reward = Codes[code]
	if not reward then
		return fail("That code doesn't exist.")
	end
	if reward.Expires and os.time() > reward.Expires then
		return fail("That code has expired.")
	end
	if profile.Codes[code] then
		return fail("You already used that code.")
	end
	profile.Codes[code] = true
	local parts = {}
	if reward.Cash then
		table.insert(parts, "$" .. Util.comma(reward.Cash))
	end
	if reward.Spins then
		table.insert(parts, `{reward.Spins} Spins`)
	end
	if reward.LuckySpins then
		table.insert(parts, `{reward.LuckySpins} Lucky Spins`)
	end
	if reward.XP then
		table.insert(parts, `{reward.XP} XP`)
	end
	Context.give(player, { Cash = reward.Cash, Spins = reward.Spins, LuckySpins = reward.LuckySpins, XP = reward.XP })
	if reward.Title and PlayerData.grant(player, "Titles", reward.Title) then
		table.insert(parts, `the "{itemName("Titles", reward.Title)}" title`)
	end
	if reward.Aura and PlayerData.grant(player, "Auras", reward.Aura) then
		table.insert(parts, `the {itemName("Auras", reward.Aura)}`)
	end
	PlayerData.changed(player)
	return { ok = true, msg = "Code redeemed! You got " .. table.concat(parts, ", ") .. "." }
end

handlers.Train = function(player)
	if Rounds.inMatch(player) then
		return fail("Finish your match first!")
	end
	local training = Context.Training
	local spawn = training and training:FindFirstChild("Spawn")
	if not spawn or not spawn:IsA("BasePart") then
		return fail("The training grounds are closed.")
	end
	Context.teleport(player, spawn.CFrame + Vector3.new(0, 3, 0))
	return { ok = true, msg = "Welcome to the training grounds!" }
end

handlers.Lobby = function(player)
	if Rounds.inMatch(player) then
		return fail("Finish your match first!")
	end
	Context.teleport(player, Context.lobbyCFrame())
	return { ok = true }
end

----------------------------------------------------------------------------------

-- Runs one request. Used by the RemoteFunction (and by the tests).
function Actions.handle(player: Player, action: any, arg: any): Result
	if type(action) ~= "string" then
		return fail("Bad request.")
	end
	local handler = handlers[action]
	if not handler then
		return fail("Unknown action.")
	end
	if not allow(player) then
		return fail("Slow down!")
	end
	local ok, result = pcall(handler, player, arg)
	if not ok then
		warn(`[BattleHub] {action} failed for {player.Name}: {result}`)
		return fail("Something went wrong, try again.")
	end
	return result
end

function Actions.start(request: RemoteFunction)
	request.OnServerInvoke = function(player: Player, action: any, arg: any)
		return Actions.handle(player, action, arg)
	end
	Players.PlayerRemoving:Connect(function(player)
		buckets[player] = nil
	end)
end

return Actions
