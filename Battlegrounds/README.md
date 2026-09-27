# Battlegrounds Hub

A Roblox lobby for a battlegrounds game. The layout and HUD follow the basketball hub you showed me, reworked with a fighting theme. There are **no gamepasses and no Robux purchases**: everything is earned by playing.

## Try it

1. Download **`BattlegroundsHub.rbxl`** from this folder.
2. In Roblox Studio: **File → Open from File…** and pick it.
3. Press **Play**.

## What's in it

**The lobby**
- **SHOP** hall: every aura on display figures. The counter opens the shop.
- **RANKINGS** hall: global Top Level, Most Wins and Most KOs boards, plus a trophy.
- **ARENA** hall: the battle portal (joins the queue), a live queue board and a "how to battle" board.
- **Lucky Wheel** with a Void Aura grand prize, and the **AFK Chamber** that hands out free Lucky Spins.
- Daily Deal display, Hall of Fame statue (#1 player), Legend crown, Sensei with a game-plan board, a featured style poster and the training grounds door.
- A jumbotron showing the match status, plus graffiti walls, lockers, fire braziers and glowing floor cracks.

**The screen (HUD)**
- Level + XP bar, cash, spin counters, match status, and **Invite Friends**.
- Seven hexagon buttons: **STYLES** (roll fighting styles), **AWAKEN** (roll ultimates), **LOCKER** (auras and titles), **PLAY** (join the next battle; **EXTRA** below it has the training grounds), **SHOP**, **STATS** and **CODES**.

**Matches**
PLAY → intermission → **map vote** (Ruined City, Volcano Crater, Sky Dojo) → last fighter standing wins. KOs and wins pay cash and XP. Falling off a map counts as a KO for whoever hit you last.

**Earning (no Robux anywhere)**
- Cash: matches, KOs, wins, level-ups, the AFK Chamber, codes and the Lucky Wheel.
- Spins (STYLES/AWAKEN): 1 per level-up, codes, the Lucky Wheel, or buy them with cash.
- Lucky Spins (the wheel): a free one every 15 minutes you play, one every 5 minutes in the AFK Chamber, or buy them with cash.
- Starting codes: `RELEASE`, `BATTLEGROUNDS`, `FIGHTER`.

## Put it in your own game

**Option 1: use this place as your game.** Open it, then **File → Publish to Roblox As…** and pick your game. This replaces whatever is in that place now.

**Option 2: copy it into your existing place.** With both places open in Studio, copy these and paste each one into the same spot in your game:

| Copy this | Paste it into |
|---|---|
| `ServerScriptService > BattleHubServer` | `ServerScriptService` |
| `ReplicatedStorage > BattleHub` | `ReplicatedStorage` |
| `StarterPlayer > StarterPlayerScripts > BattleHubClient` | `StarterPlayer > StarterPlayerScripts` |

Those three are enough: the lobby, maps and training grounds are built automatically when the game starts. To see and edit them in Studio without pressing Play, also copy `Workspace > BattleHub`, `Workspace > TrainingGrounds` and `ServerStorage > BattleArenas`.

## Saving progress

Progress saves with DataStores. To save while testing in Studio, the game must be published and **Game Settings → Security → Enable Studio Access to API Services** must be on. Until then everything still works; you'll just see a message that saving is off.

## Changing things

- **Names, prices, rewards, timers, styles, awakenings, auras, titles, wheel prizes, maps:** `ReplicatedStorage > BattleHub > Config`
- **Codes:** `ServerScriptService > BattleHubServer > Codes` (server-only, so exploiters can't read them)
- **Maps:** `ServerStorage > BattleArenas`. Drag a map into Workspace to edit it, then drag it back. Each map needs a `Spawns` folder of parts and a `KillY` attribute (anyone who falls below that height is out).
- **The lobby:** edit `Workspace > BattleHub` directly. It's only rebuilt if it's missing.

## Adding your combat

The hub doesn't include fighting moves. When you add them:
- Read what the player picked: `player:GetAttribute("Style")` and `player:GetAttribute("Awakening")`.
- Give KO credit either way: put an `ObjectValue` named `creator` (Value = the attacker) inside the victim's Humanoid, or call `humanoid:SetAttribute("LastHitBy", attacker.UserId)`.
- The training dummies are real Humanoids with 1000 health, and they respawn after being knocked out.

---

## For developers

- `src/` is a [Rojo](https://rojo.space) project (`default.project.json`).
- `lune run tools/build.luau` builds `BattlegroundsHub.rbxl`: Rojo packs the scripts, then the lobby and maps are built with the same builder code the server uses. Needs [Lune](https://lune-org.github.io/docs) 0.10+ and Rojo 7.7+.
- `lune run tools/sim/run.luau studio|live|fresh` plays the game in a small fake Roblox engine (`tools/sim/`): joining, every menu, rolls, the shop, codes, the wheel, AFK rewards, full matches with KOs, saving/loading with session locks and DataStore outages. `fresh` starts from scripts only.
- Type checking: `luau-lsp analyze` with Roblox definitions and a Rojo sourcemap. The code is `--!strict`.
- `tools/preview/` renders the place (three.js) and the on-screen UI from simulator snapshots, for checking the look without Studio.
