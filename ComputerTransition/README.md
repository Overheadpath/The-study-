# Computer transition (3D room → 2D games)

Makes the step from the 3D room into the 2D games feel natural. When the player presses **USE** at the computer:

1. They walk over to the chair (the camera stays in normal third person).
2. They turn and sit down. Roblox's own sit animation plays and the player lowers smoothly into the chair instead of snapping into it.
3. Once they're seated, the camera glides up over their head and settles in front of the monitor until the screen fills the view.
4. The screen fades into your existing 2D game screen in about a third of a second.

Quitting the 2D game plays the same thing backwards. The camera comes back out of the monitor and the player stands up on the spot they sat down from.

The 3D room, the computer and the 2D games themselves are not changed.

## Put it in your game

| File here | In Roblox Studio |
|---|---|
| `ReplicatedStorage/ComputerTransition.luau` | a **ModuleScript** named `ComputerTransition` in **ReplicatedStorage** |
| `ServerScriptService/ComputerSeatService.legacy.luau` | a **Script** named `ComputerSeatService` in **ServerScriptService** |

Create each one in Studio with that name, and paste the file's contents into it.

## What the computer model needs

- **A Seat on the chair.** If the chair doesn't have one, insert a `Seat` part, size it to the cushion, set its Transparency to 1 and make sure the chair is Anchored. The Seat's front has to face the monitor. If Output warns that the Seat faces away from the screen, rotate it 180°.
- **The screen part named `Screen`.** This is the part the monitor's picture is on (`Display` or `Monitor` also work, or any part with a SurfaceGui on it). The camera ends up square in front of this part.

The chair can be inside the computer model or next to it; the script uses the Seat closest to the screen.

## Hook it into your USE code

This goes in a **LocalScript**. Wherever pressing USE currently opens the 2D game straight away, wrap that code:

```lua
local ComputerTransition = require(game.ReplicatedStorage:WaitForChild("ComputerTransition"))

prompt.Triggered:Connect(function()
	ComputerTransition.enter(computerModel, function()
		gameGui.Enabled = true -- your existing code that opens the 2D game
	end)
end)
```

And wherever the player quits the 2D game:

```lua
ComputerTransition.leave(function()
	gameGui.Enabled = false -- your existing code that closes the 2D game
end)
```

If a server Script handles your USE prompt and then tells the player's LocalScript to open the game, put `enter` in that LocalScript, around the line that opens the game.

## Good to know

- Everyone else in the server sees the player sitting in the chair.
- If someone else is already in the chair, or the Seat or Screen can't be found, USE opens the game straight away like before. A missing part also puts a warning in Output.
- If the player dies at the computer, their camera and controls go back to normal.
- Timings and distances are at the top of `ComputerTransition`: walk speed, sit time, camera time, fade time (set it to `0` for a straight cut) and how far from the chair the player stands to sit down.
