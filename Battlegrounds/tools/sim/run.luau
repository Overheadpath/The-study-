--[[
	Plays BattleHub inside the fake engine (tools/sim/Sim.luau) and checks that
	everything works: joining, the HUD, every menu, rolling, buying, codes, the
	Lucky Wheel, queueing, map votes, full matches with KOs, AFK rewards,
	saving/loading with session locks, leaderboards and training dummies.

	Usage (from the Battlegrounds folder, after `lune run tools/build.luau`):
		lune run tools/sim/run.luau studio   -- Studio-style: DataStores off, solo matches allowed
		lune run tools/sim/run.luau live     -- live-server style: DataStores on, 2+ players
]]

local process = require("@lune/process")
local roblox = require("@lune/roblox")

local Sim = require("./Sim")
local S = Sim.Scheduler

local mode = "studio"
local uiDir: string? = nil
for i, arg in process.args do
	if arg == "studio" or arg == "live" or arg == "fresh" then
		mode = arg
	elseif arg == "--ui" then
		uiDir = process.args[i + 1]
	end
end

-- Saves what Alice's screen looks like (rendered later by tools/preview).
local function snap(player: any, name: string)
	if uiDir then
		Sim.dumpGui(player, `{uiDir}/{name}.json`)
	end
end

local failures = 0
local passes = 0

local function check(cond: any, message: string)
	if cond then
		passes += 1
	else
		failures += 1
		print("\27[31mFAIL\27[0m " .. message)
	end
end

local function section(name: string)
	print("\27[36m== " .. name .. " ==\27[0m")
end

local function find(root: any, path: string): any
	local node = root
	for name in string.gmatch(path, "[^%.]+") do
		if not node then
			return nil
		end
		node = node:FindFirstChild(name)
	end
	return node
end

local function textOf(root: any, path: string): string?
	local node = find(root, path)
	return node and node.Text
end

local function buttonWithLabel(root: any, label: string): any
	for _, d in root:GetDescendants() do
		if d:IsA("TextButton") then
			local l = d:FindFirstChild("Label")
			if l and l.Text == label then
				return d
			end
		end
	end
	return nil
end

local function toastTexts(player: any): { string }
	local out = {}
	local toasts = find(player, "PlayerGui.BattleHubToasts.Stack")
	for _, d in (if toasts then toasts:GetDescendants() else {}) do
		if d.Name == "Message" then
			table.insert(out, d.Text)
		end
	end
	return out
end

local function sawToast(player: any, needle: string): boolean
	for _, text in toastTexts(player) do
		if string.find(string.lower(text), string.lower(needle), 1, true) then
			return true
		end
	end
	return false
end

local function serverModule(name: string): any
	local server = Sim.game:GetService("ServerScriptService"):FindFirstChild("BattleHubServer")
	return Sim.serverEnv.require(server:FindFirstChild(name))
end

local function profileOf(player: any): any
	return serverModule("PlayerData").get(player)
end

local function state(name: string): any
	local st = find(Sim.game:GetService("ReplicatedStorage"), "BattleHub.State")
	return st and st:GetAttribute(name)
end

local function waitFor(cond: () -> boolean, timeout: number): boolean
	local waited = 0
	while waited < timeout do
		if cond() then
			return true
		end
		S.run(0.25)
		waited += 0.25
	end
	return cond()
end

local function hudButton(player: any, name: string): any
	return find(player, `PlayerGui.BattleHubHud.Bottom.{name}.Hit`)
end

local function menus(player: any): any
	return find(player, "PlayerGui.BattleHubMenus")
end

local function rootOf(player: any): any
	local c = player.Character
	return c and c:FindFirstChild("HumanoidRootPart")
end

local function moveTo(player: any, position: any)
	local root = rootOf(player)
	root.CFrame = roblox.CFrame.new(position)
	Sim.syncPosition(root)
end

local Config: any

---------------------------------------------------------------------------------------------------
section(`boot ({mode})`)
Sim.load("BattlegroundsHub.rbxl")
if mode == "fresh" then
	-- Scripts only, like pasting them into an existing game: everything must be built at runtime.
	for _, name in { "BattleHub", "TrainingGrounds" } do
		local existing = Sim.Workspace:FindFirstChild(name)
		if existing then
			existing:Destroy()
		end
	end
	local maps = Sim.game:GetService("ServerStorage"):FindFirstChild("BattleArenas")
	if maps then
		maps:Destroy()
	end
end
Sim.isStudio = mode ~= "live"
Sim.dataStoreError = if mode ~= "live" then "502: StudioAccessToApisNotAllowed: API services rejected request" else nil

if mode == "live" then
	-- A profile still locked by a server that "just" closed: loading must wait, then take over.
	Sim.stores["BattleHub_Profiles_v1"] = {
		u_303 = {
			Data = {
				Level = 7,
				XP = 10,
				Cash = 4321,
				Owned = { Styles = { Brawler = true, Ninja = true } },
				Equipped = { Style = "Ninja" },
			},
			Lock = { Job = "other-server", Time = Sim.baseTime },
		},
		u_404 = {
			Data = {
				Level = "banana",
				Cash = -50,
				Owned = { Auras = { Fake = true, Frost = true } },
				Equipped = { Aura = "Fake", Title = "Nope" },
			},
		},
	}
end

Sim.startServer()
S.run(1)
check(#S.errors == 0, "server boots without errors")
local shared = Sim.game:GetService("ReplicatedStorage"):FindFirstChild("BattleHub")
Config = Sim.serverEnv.require(shared:FindFirstChild("Config"))
check(find(shared, "Remotes.Request") ~= nil, "Request remote created")
check(find(shared, "State") ~= nil, "State created")

local alice = Sim.addPlayer("Alice", 101)
S.run(3)
check(#S.errors == 0, "player joins without errors")
local hud = find(alice, "PlayerGui.BattleHubHud")
check(hud ~= nil, "HUD built")
check(textOf(hud, "Top.Level.Inner.Value") == "Level 1", "level shows 1")
check(textOf(hud, "Top.Cash.Inner.Value") == "$500", "cash shows $500")
check(textOf(hud, "Top.Pills.Spins.Value") == "🎟️ 3 SPINS", "spins pill shows 3")
check(textOf(hud, "Top.Pills.Lucky.Value") == "🎡 1 LUCKY", "lucky pill shows 1")
check(alice.Character ~= nil, "character spawned")
snap(alice, "01_hud")
check(alice:GetAttribute("Style") == "Brawler", "Style attribute published")
check(find(alice, "leaderstats.Level") ~= nil, "leaderstats created")
local head = alice.Character and alice.Character:FindFirstChild("Head")
check(head and head:FindFirstChild("HubTag") ~= nil, "overhead tag on the character")
if mode ~= "live" then
	check(sawToast(alice, "Saving is off in Studio"), "told that saving is off in Studio")
else
	check(not sawToast(alice, "saving"), "no saving warning on a live server")
end

if mode == "fresh" then
	section("runtime build")
	check(Sim.Workspace:FindFirstChild("BattleHub") ~= nil, "hub built at runtime")
	check(Sim.Workspace:FindFirstChild("TrainingGrounds") ~= nil, "training grounds built at runtime")
	local maps = Sim.game:GetService("ServerStorage"):FindFirstChild("BattleArenas")
	check(maps ~= nil and #maps:GetChildren() == 3, "three maps built into ServerStorage")
	check(find(Sim.Workspace, "BattleHub.LuckyWheel.Wheel") ~= nil, "wheel exists")
	Sim.click(hudButton(alice, "Shop"))
	S.run(0.5)
	check(menus(alice).Enabled, "shop opens")
	Sim.click(hudButton(alice, "Play"))
	check(
		waitFor(function()
			return state("Phase") == "Match"
		end, 60),
		"a match starts on the runtime-built maps"
	)
	check(rootOf(alice).Position.X > 1000, "teleported onto the map")
	print(`\n{mode}: errors {#S.errors}, warnings {#Sim.warnings}, passed {passes}, failed {failures}`)
	process.exit(if failures == 0 and #S.errors == 0 then 0 else 1)
end

---------------------------------------------------------------------------------------------------
section("menus open and close")
for _, name in { "Styles", "Awaken", "Locker", "Shop", "Stats", "Codes" } do
	Sim.click(hudButton(alice, name))
	S.run(0.5)
	local m = menus(alice)
	check(m.Enabled, name .. " menu opens")
	check(#find(m, "Window.Body"):GetChildren() > 0, name .. " menu has content")
	Sim.click(find(m, "Window.Header.Close"))
	S.run(0.2)
	check(not m.Enabled, name .. " menu closes")
end
Sim.click(find(alice, "PlayerGui.BattleHubHud.Bottom.Extra"))
S.run(0.3)
check(menus(alice).Enabled and textOf(menus(alice), "Window.Header.Title") == "✨ EXTRA", "EXTRA menu opens")
Sim.click(find(menus(alice), "Window.Header.Close"))
S.run(0.2)
check(#S.errors == 0, "no errors from menus")

---------------------------------------------------------------------------------------------------
section("rolling styles and awakenings")
Sim.click(hudButton(alice, "Styles"))
S.run(0.3)
local roll = find(menus(alice), "Window.Body.Feature.Roll")
check(roll ~= nil, "ROLL button exists")
Sim.click(roll)
S.run(4)
local p = profileOf(alice)
check(p.Spins == 2, "a roll costs one spin (now " .. tostring(p.Spins) .. ")")
local ownedStyles = 0
for _ in p.Owned.Styles do
	ownedStyles += 1
end
check(ownedStyles >= 1, "styles owned after roll: " .. ownedStyles)
check(textOf(hud, "Top.Pills.Spins.Value") == "🎟️ 2 SPINS", "HUD updated after the roll animation")
snap(alice, "02_styles")
Sim.click(find(menus(alice), "Window.Header.Close"))
S.run(0.2)
Sim.click(hudButton(alice, "Awaken"))
S.run(0.3)
Sim.click(find(menus(alice), "Window.Body.Feature.Roll"))
S.run(4)
local anyAwakening = next(profileOf(alice).Owned.Awakenings) ~= nil
check(anyAwakening, "rolled an awakening")
-- equip it from the grid
local equip = buttonWithLabel(find(menus(alice), "Window.Body"), "EQUIP")
if equip then
	Sim.click(equip)
	S.run(1)
	check(profileOf(alice).Equipped.Awakening ~= "", "equipped the awakening")
	check(alice:GetAttribute("Awakening") == profileOf(alice).Equipped.Awakening, "Awakening attribute updated")
else
	check(false, "EQUIP button for the new awakening")
end
Sim.click(find(menus(alice), "Window.Header.Close"))
S.run(0.2)
-- out of spins
profileOf(alice).Spins = 0
serverModule("PlayerData").changed(alice)
S.run(0.5)
Sim.click(hudButton(alice, "Styles"))
S.run(0.3)
Sim.click(find(menus(alice), "Window.Body.Feature.Roll"))
S.run(1)
check(sawToast(alice, "Out of spins"), "rolling with no spins is refused")
Sim.click(find(menus(alice), "Window.Header.Close"))
S.run(0.2)

---------------------------------------------------------------------------------------------------
section("shop: cash only")
Sim.click(hudButton(alice, "Shop"))
S.run(0.3)
Sim.click(find(menus(alice), "Window.Body.Tabs.Auras"))
S.run(0.3)
local golden = buttonWithLabel(find(menus(alice), "Window.Body"), "$20,000")
check(golden ~= nil, "Golden Aura costs $20,000")
Sim.click(golden)
S.run(0.5)
check(sawToast(alice, "more cash"), "can't buy without enough cash")
serverModule("PlayerData").addCash(alice, 25000)
S.run(0.5)
golden = buttonWithLabel(find(menus(alice), "Window.Body"), "$20,000")
Sim.click(golden)
S.run(0.6)
p = profileOf(alice)
check(p.Owned.Auras.Golden == true, "bought the Golden Aura")
check(p.Equipped.Aura == "Golden", "and it's equipped")
check(p.Cash == 500 + 25000 - 20000 or p.Cash < 25500, "cash was taken: $" .. p.Cash)
local root = rootOf(alice)
local emitters = 0
for _, c in root:GetChildren() do
	if c.Name == "HubAura" then
		emitters += 1
	end
end
check(emitters > 0, "aura particles on the character")
check(buttonWithLabel(find(menus(alice), "Window.Body"), "OWNED") ~= nil, "shop shows OWNED")
snap(alice, "03_shop")
Sim.click(find(menus(alice), "Window.Body.Tabs.Spins"))
S.run(0.3)
local spinsBefore = profileOf(alice).Spins
Sim.click(buttonWithLabel(find(menus(alice), "Window.Body"), "$750"))
S.run(0.6)
check(profileOf(alice).Spins == spinsBefore + 1, "bought a spin with cash")
Sim.click(find(menus(alice), "Window.Header.Close"))
S.run(0.2)
-- server refuses a fake purchase request straight from a client
local Actions = serverModule("Actions")
local fake = Actions.handle(alice, "Buy", { Kind = "Aura", Id = "Void" })
check(fake.ok == false, "the wheel-only Void Aura can't be bought")
local bogus = Actions.handle(alice, "Equip", { Kind = "Style", Id = "VoidWalker" })
check(bogus.ok == false or profileOf(alice).Owned.Styles.VoidWalker, "can't equip a style you don't own")

---------------------------------------------------------------------------------------------------
section("codes")
Sim.click(hudButton(alice, "Codes"))
S.run(0.3)
local box = find(menus(alice), "Window.Body.BoxFrame.CodeBox")
local cashBefore = profileOf(alice).Cash
box.Text = "  release "
Sim.click(find(menus(alice), "Window.Body.Redeem"))
S.run(0.6)
check(profileOf(alice).Cash == cashBefore + 1000, "RELEASE gives $1,000")
box.Text = "RELEASE"
Sim.click(find(menus(alice), "Window.Body.Redeem"))
S.run(0.6)
check(
	string.find(textOf(menus(alice), "Window.Body.Message") or "", "already used", 1, true) ~= nil,
	"codes only work once"
)
box.Text = "NOTACODE"
Sim.click(find(menus(alice), "Window.Body.Redeem"))
S.run(0.6)
check(
	string.find(textOf(menus(alice), "Window.Body.Message") or "", "doesn't exist", 1, true) ~= nil,
	"unknown codes are rejected"
)
box.Text = "fighter"
Sim.click(find(menus(alice), "Window.Body.Redeem"))
S.run(0.6)
check(profileOf(alice).Owned.Titles.Scrapper == true, "FIGHTER gives the Scrapper title")
snap(alice, "04_codes")
Sim.click(hudButton(alice, "Locker"))
S.run(0.3)
snap(alice, "05_locker")
Sim.click(hudButton(alice, "Stats"))
S.run(0.3)
snap(alice, "06_stats")
Sim.click(hudButton(alice, "Codes"))
S.run(0.3)
Sim.click(find(menus(alice), "Window.Header.Close"))
S.run(0.2)

---------------------------------------------------------------------------------------------------
section("lucky wheel")
local wheelPrompt = find(Sim.Workspace, "BattleHub.LuckyWheel.Base.HubPrompt")
check(wheelPrompt ~= nil, "wheel prompt exists")
local slice = find(Sim.Workspace, "BattleHub.LuckyWheel.Wheel.Rim")
local before = slice and slice.CFrame
local luckyBefore = profileOf(alice).LuckySpins
local cashBeforeWheel = profileOf(alice).Cash
Sim.triggerPrompt(alice, wheelPrompt)
S.run(0.5)
check(textOf(hud, "Top.Pills.Lucky.Value") == `🎡 {luckyBefore} LUCKY`, "HUD waits for the wheel to stop")
S.run(7)
check(profileOf(alice).LuckySpins == luckyBefore - 1, "a spin uses a Lucky Spin")
check(textOf(hud, "Top.Pills.Lucky.Value") == `🎡 {luckyBefore - 1} LUCKY`, "HUD updated after the wheel stopped")
check(slice and before and (slice.CFrame.Position - before.Position).Magnitude > 0.01, "the wheel turned")
snap(alice, "07_wheel_prize")
check(#S.errors == 0, "no errors from the wheel")
local _ = cashBeforeWheel
Sim.triggerPrompt(alice, wheelPrompt)
S.run(1)
check(sawToast(alice, "No Lucky Spins"), "no spins left message")

---------------------------------------------------------------------------------------------------
section("afk chamber")
local zone = find(Sim.Workspace, "BattleHub.AfkChamber.AfkZone")
check(zone ~= nil, "AFK zone exists")
moveTo(alice, zone.CFrame.Position)
local luckyAfk = profileOf(alice).LuckySpins
local cashAfk = profileOf(alice).Cash
S.run(Config.Afk.LuckySpinEvery + 2)
check(profileOf(alice).LuckySpins >= luckyAfk + 1, "AFK chamber gives a Lucky Spin")
check(
	profileOf(alice).Cash
		>= cashAfk + Config.Afk.CashAmount * math.floor(Config.Afk.LuckySpinEvery / Config.Afk.CashEvery),
	"AFK chamber gives cash"
)
check(alice:GetAttribute("InAfkChamber") == true, "client knows you're in the chamber")
check(find(alice, "PlayerGui.BattleHubHud.Afk").Visible == true, "AFK readout visible")
moveTo(alice, roblox.Vector3.new(0, 104, 0))
S.run(1.5)
check(alice:GetAttribute("InAfkChamber") == false, "leaving the chamber is noticed")

---------------------------------------------------------------------------------------------------
section("training grounds")
local trainResult = Actions.handle(alice, "Train", nil)
check(trainResult.ok, "Train request works")
local trainSpawn = find(Sim.Workspace, "TrainingGrounds.Spawn")
check((rootOf(alice).Position - trainSpawn.CFrame.Position).Magnitude < 10, "teleported to the training grounds")
local dummies = find(Sim.Workspace, "TrainingGrounds.Dummies")
local firstDummy = dummies:GetChildren()[1]
local count = #dummies:GetChildren()
firstDummy:FindFirstChildOfClass("Humanoid").Health = 0
S.run(5)
if not (#dummies:GetChildren() == count and firstDummy.Parent == nil) then
	print(
		"  debug: count",
		count,
		"now",
		#dummies:GetChildren(),
		"first parent",
		firstDummy.Parent,
		"name",
		firstDummy.Name
	)
	for _, d in dummies:GetChildren() do
		local h = d:FindFirstChildOfClass("Humanoid")
		print("   ", d.Name, h and pcall(function()
			return h.Health
		end))
	end
end
check(#dummies:GetChildren() == count and firstDummy.Parent == nil, "a knocked-out dummy is replaced")
local lobbyResult = Actions.handle(alice, "Lobby", nil)
check(lobbyResult.ok, "back to the lobby")
S.run(0.5)

---------------------------------------------------------------------------------------------------
section("level ups")
local ups = serverModule("PlayerData").addXP(alice, 60000)
S.run(1)
p = profileOf(alice)
check(#ups > 10 and p.Level > 20, "lots of XP gives lots of levels (level " .. p.Level .. ")")
check(p.Owned.Titles.Veteran == (p.Level >= 25), "Veteran title unlocks at level 25")
check(textOf(hud, "Top.Level.Inner.Value") == "Level " .. p.Level, "HUD level updated")
snap(alice, "08_level_up")

---------------------------------------------------------------------------------------------------
section("rate limiting")
local slowed = 0
for _ = 1, 40 do
	local r = Actions.handle(alice, "Snapshot", nil)
	if r.msg == "Slow down!" then
		slowed += 1
	end
end
check(slowed > 0, "spamming requests gets throttled")
S.run(3)

---------------------------------------------------------------------------------------------------
if mode == "studio" then
	section("solo match in Studio")
	Sim.click(hudButton(alice, "Play"))
	S.run(1)
	check(alice:GetAttribute("Queued") == true, "PLAY queues you")
	check(textOf(hud, "Bottom.Play.Label") == "QUEUED ✓", "PLAY shows QUEUED")
	check(
		waitFor(function()
			return state("Phase") == "Vote"
		end, Config.Rounds.IntermissionTime + 5),
		"map vote starts after intermission"
	)
	S.run(0.6)
	local vote = find(hud, "MapVote")
	check(vote.Visible, "map vote cards are shown")
	Sim.click(find(vote, "Option2"))
	S.run(0.6)
	check(state("Votes2") == 1, "vote counted on card 2")
	snap(alice, "09_map_vote")
	local chosen = string.split(state("Options"), ",")[2]
	check(
		waitFor(function()
			return state("Phase") == "Match"
		end, Config.Rounds.VoteTime + 5),
		"match starts after the vote"
	)
	check(state("Arena") == chosen, "the voted map was picked (" .. tostring(state("Arena")) .. ")")
	check(find(Sim.Workspace, "BattleArena") ~= nil, "map loaded into Workspace")
	check(alice:GetAttribute("InMatch") == true, "player is in the match")
	check(rootOf(alice).Position.X > 1000, "player was teleported to the map")
	check(textOf(hud, "Bottom.Play.Label") == "IN MATCH", "PLAY shows IN MATCH")
	S.run(4)
	check(state("Status") == "FIGHT!", "FIGHT! after the countdown")
	local jumbo = find(Sim.Workspace, "BattleHub.Center.Jumbotron.Screen1.SurfaceFront.Phase")
	check(jumbo and jumbo.Text == "FIGHT!", "jumbotron shows the match status")
	check(
		waitFor(function()
			return state("Phase") == "Results"
		end, Config.Rounds.MatchTime + 5),
		"match ends when time runs out"
	)
	check(state("Status") == "TIME'S UP!", "solo survivor: TIME'S UP")
	check(
		waitFor(function()
			return state("Phase") ~= "Results"
		end, Config.Rounds.ResultsTime + 3),
		"results end"
	)
	check(find(Sim.Workspace, "BattleArena") == nil, "map removed after the match")
	check(alice:GetAttribute("InMatch") == false, "no longer in a match")
	check(rootOf(alice).Position.X < 200, "back in the lobby")
	check(profileOf(alice).Stats.Matches == 1, "match counted")
else
	section("two-player match with a KO")
	local bob = Sim.addPlayer("Bob", 202)
	S.run(3)
	check(profileOf(bob) ~= nil, "Bob loaded")
	Sim.click(hudButton(alice, "Play"))
	S.run(1)
	check(state("Phase") == "Waiting" or state("Phase") == "Intermission", "one fighter isn't enough on a live server")
	Sim.click(hudButton(bob, "Play"))
	check(
		waitFor(function()
			return state("Phase") == "Vote"
		end, Config.Rounds.IntermissionTime + 5),
		"vote starts with two fighters"
	)
	Sim.click(find(bob, "PlayerGui.BattleHubHud.MapVote.Option3"))
	Sim.click(find(alice, "PlayerGui.BattleHubHud.MapVote.Option3"))
	S.run(1)
	check(state("Votes3") == 2, "both votes counted")
	check(
		waitFor(function()
			return state("Phase") == "Match"
		end, Config.Rounds.VoteTime + 5),
		"match starts"
	)
	S.run(1)
	check(bob:GetAttribute("InMatch") and alice:GetAttribute("InMatch"), "both fighters in")
	check(bob:GetAttribute("Queued") == false, "queue clears when the match starts")
	-- Alice knocks Bob out (the usual "creator" tag combat scripts leave behind).
	local humanoid = bob.Character:FindFirstChildOfClass("Humanoid")
	local tag = roblox.Instance.new("ObjectValue")
	tag.Name = "creator"
	tag.Value = alice
	tag.Parent = humanoid
	local aliceCash = profileOf(alice).Cash
	humanoid.Health = 0
	check(
		waitFor(function()
			return state("Phase") == "Results"
		end, 3),
		"match ends when one fighter is left"
	)
	check(state("Status") == "ALICE WINS!", "Alice wins: " .. tostring(state("Status")))
	S.run(1)
	local pa, pb = profileOf(alice), profileOf(bob)
	check(pa.Stats.KOs == 1 and pa.Stats.Wins == 1, "Alice has 1 KO and 1 win")
	check(pb.Stats.Deaths == 1 and pb.Stats.Matches == 1, "Bob has 1 death and 1 match")
	check(pa.Cash >= aliceCash + Config.Rewards.KO.Cash + Config.Rewards.Win.Cash, "KO and win paid out")
	check(sawToast(alice, "K.O.!"), "Alice was told about the KO")
	check(sawToast(bob, "knocked you out"), "Bob was told who KO'd him")
	check(
		waitFor(function()
			return find(Sim.Workspace, "BattleArena") == nil
		end, Config.Rounds.ResultsTime + 3),
		"map removed"
	)
	S.run(6)
	check(bob.Character and rootOf(bob).Position.X < 200, "Bob respawned in the lobby")

	section("falling off the map")
	Sim.click(hudButton(alice, "Play"))
	Sim.click(hudButton(bob, "Play"))
	check(
		waitFor(function()
			return state("Phase") == "Match"
		end, Config.Rounds.IntermissionTime + Config.Rounds.VoteTime + 10),
		"second match starts"
	)
	S.run(1)
	local map = find(Sim.Workspace, "BattleArena")
	local killY = map:GetAttribute("KillY")
	bob.Character:FindFirstChildOfClass("Humanoid"):SetAttribute("LastHitBy", alice.UserId)
	moveTo(bob, roblox.Vector3.new(rootOf(bob).Position.X, killY - 5, rootOf(bob).Position.Z))
	check(
		waitFor(function()
			return state("Phase") == "Results"
		end, 3),
		"falling below the map knocks you out"
	)
	S.run(1)
	check(profileOf(alice).Stats.KOs == 2, "the last hitter gets the KO for a fall")
	check(
		waitFor(function()
			return state("Phase") ~= "Results"
		end, Config.Rounds.ResultsTime + 3),
		"round loop continues"
	)

	section("leaving mid-queue and saving")
	Sim.click(hudButton(alice, "Play"))
	S.run(0.5)
	local savedCash = profileOf(bob).Cash
	Sim.removePlayer(bob)
	S.run(2)
	local record = Sim.stores["BattleHub_Profiles_v1"]["u_202"]
	check(record and record.Data.Cash == savedCash, "Bob's cash saved when he left")
	check(record and record.Lock == nil, "Bob's session lock released")
	local bob2 = Sim.addPlayer("Bob", 202)
	S.run(3)
	check(profileOf(bob2) and profileOf(bob2).Cash == savedCash, "Bob's cash loaded when he came back")
	check(profileOf(bob2).Stats.KOs == 0 and profileOf(bob2).Stats.Deaths == 2, "Bob's stats loaded")

	section("session lock and bad data")
	local carol = Sim.addPlayer("Carol", 303)
	S.run(10)
	check(profileOf(carol) == nil, "Carol waits while another server holds her data")
	check(
		waitFor(function()
			return profileOf(carol) ~= nil
		end, 40),
		"Carol's data loads once the old lock is taken over"
	)
	check(profileOf(carol).Cash == 4321 and profileOf(carol).Equipped.Style == "Ninja", "Carol's saved data is intact")
	local dave = Sim.addPlayer("Dave", 404)
	S.run(3)
	local pd = profileOf(dave)
	check(pd.Level == 1 and pd.Cash == 0, "garbage saved values are cleaned (level 1, cash 0)")
	check(pd.Owned.Auras.Fake == nil and pd.Owned.Auras.Frost == true, "unknown items dropped, real ones kept")
	check(pd.Equipped.Aura == "" and pd.Equipped.Title == "Rookie", "invalid equips reset")

	section("autosave, leaderboards and shutdown")
	S.run(95)
	local aliceRecord = Sim.stores["BattleHub_Profiles_v1"]["u_101"]
	check(
		aliceRecord and aliceRecord.Data.Stats.Wins == profileOf(alice).Stats.Wins and profileOf(alice).Stats.Wins == 2,
		"autosave wrote Alice's progress (2 wins)"
	)
	check(
		aliceRecord and aliceRecord.Lock and aliceRecord.Lock.Job ~= nil,
		"Alice's profile is locked to this server while she plays"
	)
	check(Sim.ordered["BattleHub_Wins"] and Sim.ordered["BattleHub_Wins"]["101"] == 2, "wins leaderboard updated")
	S.run(61)
	local row = find(Sim.Workspace, "BattleHub.RankingsHall.Boards.Board_Wins.SurfaceFront.Rows.Row1.Name")
	check(row and row.Text == "Alice", "Alice tops the wins board: " .. tostring(row and row.Text))
	local fame = find(Sim.Workspace, "BattleHub.Showcase.HallOfFame.Torso.Plate.Subtitle")
	check(
		fame and string.find(fame.Text, "#1 LEVEL", 1, true) ~= nil and not string.find(fame.Text, "---", 1, true),
		"Hall of Fame names the top level: " .. tostring(fame and fame.Text)
	)
	-- a temporary DataStore outage doesn't break anything
	Sim.dataStoreError = "500: Internal Server Error"
	S.run(95)
	Sim.dataStoreError = nil
	check(profileOf(alice) ~= nil, "still playing through a DataStore outage")
	Sim.shutdown()
	aliceRecord = Sim.stores["BattleHub_Profiles_v1"]["u_101"]
	check(aliceRecord and aliceRecord.Lock == nil, "shutdown saves and releases everyone")
end

---------------------------------------------------------------------------------------------------
section("deal of the day display")
local plate = find(Sim.Workspace, "BattleHub.Showcase.DealFigure.Torso.Plate.Subtitle")
check(
	plate and string.find(plate.Text, "ON SALE", 1, true) ~= nil,
	"deal display shows a price: " .. tostring(plate and plate.Text)
)

check(#S.errors == 0, "no script errors during the whole run")
local unexpectedWarnings = 0
for _, w in Sim.warnings do
	local expected = string.find(w, "Saving is turned off", 1, true)
		or string.find(w, "Saving", 1, true) and string.find(w, "failed", 1, true)
		or string.find(w, "Loading Carol", 1, true)
	if not expected then
		unexpectedWarnings += 1
		print("  unexpected warning: " .. w)
	end
end
check(unexpectedWarnings == 0, "no unexpected warnings")

print(`\n{mode}: errors {#S.errors}, warnings {#Sim.warnings}, passed {passes}, failed {failures}`)
process.exit(if failures == 0 and #S.errors == 0 then 0 else 1)
