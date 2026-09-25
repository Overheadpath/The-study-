# Sea Server Finder

A Chrome extension that finds low-ping Roblox servers in **any place of a game**,
including Blox Fruits' **Second Sea** and **Third Sea**, which the normal Roblox
server list never shows.

## Install (Chrome, Edge, Brave, Opera GX)

1. Download this repo: on GitHub click **Code → Download ZIP**, then unzip it.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and pick the `extensions/sea-server-finder` folder.
5. Pin the extension (puzzle-piece icon → pin) so its wave icon stays in the toolbar.

## Use

1. Log in to roblox.com and open a game page (for Blox Fruits the extension
   shows **First / Second / Third Sea** buttons).
2. Click **Server Finder** in the bottom-right corner, or the wave icon in the toolbar.
3. Pick a Sea. The servers load straight away, sorted by **Best ping**.
4. Press **Check locations** to look up where the top 15 servers are. The
   **Your est.** column then shows roughly what *your* ping would be, based on
   the distance from you. Sort by **Your est. ping** to get the closest first.
   Press it again to check the next 15.
5. Press **Join** to open Roblox straight into that server.
6. Or press **Copy ID** to copy the server's **Job ID**, then paste it into the
   game's own server join (Blox Fruits has one in-game). This is the way to go
   when a game blocks joining a Sea straight from the website.

Other games work too: open their page, or type any place ID into the box.

## What the numbers mean

| Column | Where it comes from | How exact |
|---|---|---|
| **Ping** | Roblox: the average ping of the players already in the server | A guide; far-away players can make a close server look slow |
| **Your est.** | Distance from you to the server's location | An estimate; your real ping also depends on your internet and Wi-Fi |
| **Location** | The server's address, looked up with ipwho.is | Usually the right city/country |

## Good to know

- **Joining a Sea directly** only works if the game allows it. If Blox Fruits
  blocks it, **Check locations** will say so and **Join** may put you in the
  First Sea instead. Use **Copy ID** and the in-game server join instead.
- **Rate limits:** Roblox slows down anyone who asks for too many servers. If
  you see "rate-limiting", wait a minute.
- **Privacy:** to find a server's address the extension asks Roblox the same
  thing the Play button asks. It only keeps the address; the join ticket in
  Roblox's answer is never saved or sent anywhere. Server addresses and your
  own IP are sent to ipwho.is to look up locations.
- The extension never plays the game or changes anything inside Roblox. It only
  helps you pick which server to join.
