# 🧢 Beanie AI

**An AI chatbot that runs on your PC and edits your Roblox steal clips into TikTok-ready videos.**

You chat with Beanie ("make a W edit", "fail edit with a skull", "cut the loading screen"), and it
edits the clip for you: vertical 9:16 with a blurred background, slow-mo and zoom on the steal,
flashes, shakes, black-and-white freeze frames, captions, emoji stickers, sound effects and music.
Then it exports an HD video ready to post.

Everything runs on your own computer. The AI brain is a free model from [Ollama](https://ollama.com),
and nothing you say or edit is sent to the internet.

---

## Setup (Windows 10 or 11)

1. **Unzip** the `Beanie AI` folder somewhere easy, like your Desktop or Documents.
2. **Double-click `Start Beanie AI.bat`.**
   - If Windows says *"Windows protected your PC"*, click **More info → Run anyway**.
     (It says that for any file downloaded from the internet.)
   - The first time, it downloads its own copy of Python and the video tools (about 60 MB). This only
     happens once. It asks if you want a Desktop shortcut.
   - Beanie AI opens in your web browser. Keep the black window open while you edit; closing it quits.
3. **Give Beanie its AI brain.** Click **Set up AI** at the top right:
   1. **Get Ollama** (free), install it, and open it once.
   2. Click **Check again**, then **Download** next to **gemma3:4b** (3.3 GB).
      - Older or slower laptop? Pick **llama3.2:3b** instead (faster, but it can't "watch" clips).
      - Gaming PC with a good graphics card? **gemma3:12b** is the smartest.

Without the AI brain, Beanie still works in **basic mode**: clear commands like "cut out 0 to 3",
"zoom at 6" and "make a W edit" work, and the buttons do too.

## Recording your steals

- Press **Win + Alt + R** in Roblox to start recording, and again to stop.
- Even better: in **Windows Settings → Gaming → Captures**, turn on **Record what happened**. Then press
  **Win + Alt + G** right after a steal to save the last 30 seconds.
- Your recordings show up in Beanie automatically under **Recent recordings**. You can also drag any
  video onto the window.

## Editing

1. Pick a clip. Beanie looks at it and finds the loading screens, loud moments and big changes.
2. Pause at the steal and press **📍 Mark steal here** (or press **M**). With gemma3:4b you can also press
   **👀 Find the steal** and the AI watches the clip for you.
3. Tell Beanie what you want. A preview appears after every change.
4. Press **⬇️ Export HD video**. Videos go to **Videos → Beanie AI → Exports**.

### Things to say

| Say | What happens |
| --- | --- |
| `make a W edit` | Trims to the action, slow-mo + zoom + flash + boom on the steal, caption, victory sound |
| `make a fail edit` | Ends on the fail with a black & white freeze, zoom, big 💀 and a boom |
| `suspense edit` / `hype edit` | Ticking build-up and bass drop / loud and fast with an air horn |
| `cut the boring parts` | Removes loading screens, menus and parts where nothing moves |
| `cut out 0 to 3` / `trim from 3 to 12` | Cuts a part out / keeps only that part |
| `slow mo at 6` / `speed up 1 to 4` | Slow-motion around 6 s / fast-forward |
| `zoom at 6` / `shake at 6` / `flash at 6` | Punch-in zoom, screen shake, white flash |
| `freeze at 6 black and white` | Freeze frame |
| `add a skull at the end` / `🔥 at 3` | Emoji sticker |
| `add text "EZ STEAL" at the top` | Caption |
| `boom at 6` / `sad trombone at the end` | Sound effect (open **🔊 Sounds** to hear them all) |
| `make it vertical` / `crop it` / `square` | Video shape |
| `vibrant colors` / `black and white` / `retro` | Color style |
| `zoom here` / `skull here` | Uses the moment you paused on |
| `undo` / `start over` | Undo / clear the edit |

With the AI brain you can also just talk normally: "make the ending funnier", "the steal is when I grab
the pink one, make it dramatic", "what caption should I use?".

### Your own sounds and music

Put sound files (MP3, WAV...) in **Videos → Beanie AI → My Sounds** and songs in **My Music**. Then ask
for them by name: a file called `vine boom.mp3` works with "vine boom at 6".

## Problems?

- **The AI is slow.** The first answer takes longer while the brain wakes up. On a laptop without a
  graphics card, try **llama3.2:3b** in **Set up AI**. Clear commands are instant anyway.
- **"Ollama isn't running".** Open the Ollama app (it sits by the clock), then click **Check again**.
- **The video doesn't play in the browser.** Use Chrome or Edge.
- **Starting over from scratch.** Delete the `.python` folder next to `Start Beanie AI.bat` and start it again.

---

## For grown-ups and developers

- Python 3.9+ standard library only, plus [`imageio-ffmpeg`](https://pypi.org/project/imageio-ffmpeg/)
  for a bundled ffmpeg. Run it anywhere with `python -m beanie_ai` (Mac/Linux: `./start.sh`).
- The server listens on `127.0.0.1:7419` only; requests must name that host and every change needs an
  `X-Beanie` header, so other websites can't drive it.
- How an edit works: the chat message goes to the instant-command parser (`commands.py`) or to the local
  model through Ollama (`brain.py`), which must answer in a JSON shape Ollama enforces. The answer is a
  list of actions that `plan.py` checks and fixes before changing the edit plan. `render.py` turns the plan
  into one ffmpeg command. Captions and emoji are drawn by the browser (so emoji look right) and overlaid.
- Built-in sound effects are generated from math (`sfx.py`), so there are no copyrighted sounds.
- Tests: `python -m unittest discover -s tests` (the browser test needs `pip install playwright`).
  `python -m beanie_ai --selftest` makes a clip, edits, renders and exports it.
