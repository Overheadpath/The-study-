# 🎯 Beanie Pro v2.1

**The ultimate quality-of-life extension for Steal a Brainrot on Roblox**

Beanie Pro is a comprehensive Chrome extension designed to help players of "Steal a Brainrot" track, index, and automate repetitive tasks in a safe and legitimate way.

---

## 🎬 New in v2.1: the AI Editor

Beanie turns your steal recordings into TikTok / YouTube Shorts edits. Click the Beanie Pro icon, then
**🎬 AI Editor**. It opens in its own tab.

1. **Add a clip**: drop your recording in, or press **📂 Pick folder** once and choose your **Videos** folder
   (Windows Game Bar saves recordings in Videos → Captures). Beanie finds the loading screens, menus and loud moments.
2. **Tell Beanie what to do** in the chat: *make a W edit*, *fail edit*, *cut the boring parts*, *zoom at 6*,
   *slow mo here*, *add a skull at the end*, *boom at 6*, *add text "EZ STEAL" at the top*, *undo*…
   Or tap the quick buttons under the chat. Pause at the steal and press **📍 Mark steal here** so Beanie knows the moment.
3. **Watch the preview**: it updates instantly after every change.
4. **⬇️ Export video**: a 1080×1920 MP4 goes to **Downloads → Beanie Pro**, ready to post.

**The AI brain** (for chatting and edits in your own words) runs on your PC. Nothing leaves your computer.
Click **Set up AI** in the editor and pick one:

- **Chrome's built-in AI** (Gemini Nano): nothing to install. Chrome downloads it once (about 2 GB). It needs
  Chrome 138 or newer on Windows 10/11 or Mac, about 22 GB of free disk space, and a graphics card with more than
  4 GB of memory (or 16 GB of RAM).
- **Ollama** (free app from [ollama.com](https://ollama.com/download)): install it, then press **Download** next to
  `gemma3:4b` in Set up AI. It can also watch your clip and find the steal for you (**👀 Find the steal**).

Without an AI, clear commands and the quick buttons still work (Basic mode).

Everything happens inside Chrome: the video is read, edited and encoded with WebCodecs, using
[Mediabunny](https://mediabunny.dev) (`ai/vendor`, MPL-2.0). The editor's code is in `ai/`, its tests in `tests/`
(`node --test "tests/*.test.mjs"`, then `python -m unittest` in `tests/` with Playwright installed).

---

## ✨ New Features in v2.0

### 🏆 Brainrot Tracking
- **Badge Detection**: Automatically fetches all game badges (Brainrots) from Roblox
- **Ownership Tracking**: Shows which Brainrots you own vs missing
- **Completion Stats**: Real-time completion percentage display
- **Smart Notifications**: Desktop notifications when missing Brainrots are detected
- **Filter Options**: Toggle to show only owned or all Brainrots
- **Cache System**: Efficient caching with 10-minute TTL to reduce API calls

### 🤝 Bulk Friend Requests
- **Player Scanning**: Automatically scans all players across private servers
- **Unique Player Collection**: Tracks unique players to avoid duplicate requests
- **Bulk Send**: Send friend requests to all discovered players at once
- **Smart Filtering**: Automatically excludes existing friends
- **Rate Limiting**: Built-in delays to respect Roblox API limits
- **Progress Tracking**: Live counter of unique players found

### 👥 Mutuals Detection
- **Friend Network Analysis**: Scans your friends' friend lists
- **Mutual Count Display**: Shows how many mutual friends you share
- **Visual Badges**: Blue badges display mutual friend counts
- **Smart Sorting**: Friends with mutuals are prioritized in the list
- **Bulk Scanning**: Scan all friends at once with progress tracking

### 🔄 Auto-Refresh
- **Automated Scanning**: Automatically refresh server list every 3 minutes
- **Toggle Control**: Easy on/off toggle in Scanner tab
- **Smart Activation**: Only refreshes when Scanner tab is active
- **Persistent Setting**: Auto-refresh preference is saved

### 🔔 Enhanced Notifications
- **Desktop Notifications**: Chrome notifications for missing Brainrots
- **In-App Toasts**: Real-time feedback for all actions
- **Game Join Detection**: Content script monitors when you join servers
- **Background Service Worker**: Handles notifications even when popup is closed

---

## 📋 Core Features (v1.x)

### 🖥️ Server Scanner
- Scan private servers for the game
- Filter by player count, owner presence
- Pagination through all servers
- Quick join via deeplink or GameLauncher
- Recently joined tracking
- Server statistics (total, with players, safe servers)

### 👫 Friends Manager
- Complete friend list with avatars
- Access detection (who gives private server access)
- Bulk removal options
  - Remove selected friends
  - Remove all without access
  - Remove all with access
- Favorite system (starred friends are protected)
- Friend search functionality
- Friend request management

### 🎨 UI/UX
- Modern dark theme interface
- Background music with toggle (15% volume)
- Sound effects (clicks, completion)
- Toast notifications (Toastify)
- Smooth animations (Animate.css)
- Loading states and skeletons
- Rate limit handling

---

## 🚀 Installation

### Load Unpacked Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `BeanieMethod` folder (the folder that has `manifest.json` directly inside it; if Chrome says
   "Manifest file is missing", you picked the folder around it)
5. The extension icon should appear in your toolbar

Updating: replace the files in the same folder, then press ↻ on Beanie Pro in `chrome://extensions/`.
Your clips and settings stay.

### Permissions Required
- **tabs**: To interact with Roblox tabs (and to find the AI Editor tab)
- **scripting**: To inject join scripts
- **storage**: To save settings and cache
- **cookies**: To maintain Roblox session
- **notifications**: For desktop Brainrot alerts
- **downloads**: To save your edited videos to Downloads → Beanie Pro
- **unlimitedStorage**: To keep your clips in the AI Editor
- **declarativeNetRequest**: Lets the AI Editor talk to Ollama on your PC (only Beanie Pro's own requests to 127.0.0.1)
- **host_permissions**: Access to `*.roblox.com`, and to `127.0.0.1` / `localhost` for Ollama

---

## 📖 How to Use

### Scanner Tab
1. **First Load**: Extension scans all private servers (can be skipped)
2. **Browse Servers**: Use pagination buttons to explore servers
3. **Filters**:
   - Skip totals scan
   - Show/hide servers with owner inside
   - Only show servers with 1 player
   - Use deeplink for faster joins
   - Auto-refresh every 3 minutes
4. **Join Server**: Click "Join" button on any server card
5. **Safety**: ⚠️ warnings show dangerous servers (owner inside)

### Brainrots Tab
1. **Click "Refresh Brainrots"**: Loads all game badges
2. **View Stats**: See total, owned, missing, and completion %
3. **Filter**: Toggle "Show only owned Brainrots"
4. **Notifications**: Enable/disable missing Brainrot alerts
5. **Cache**: Clear cache to force fresh data fetch

### Friends Tab
1. **Auto-loads**: Friends list loads automatically
2. **Search**: Type to filter friends by name
3. **Access Badges**: Green = Has Access, Red = No Access
4. **Mutuals**: Click "Scan Mutuals" to analyze friend networks
5. **Star Friends**: Click ★ to favorite (protects from bulk removal)
6. **Select Friends**: Check boxes to select for removal
7. **Bulk Actions**:
   - Select All (skips favorites)
   - Remove Selected
   - Remove all without access
   - Remove all with access
   - Send requests to players (from scanned servers)

---

## 🎵 Music & Sounds

- **Background Music**: Toggle with button in header (audio.mp3)
- **Click Sound**: Plays on button clicks (sounds/click.mp3)
- **Done Sound**: Plays on task completion (sounds/done.mp3)
- **Volume**: Music at 15%, effects at 22-30%

---

## 💾 Storage & Caching

### What's Saved
- Last joined server (with timestamp)
- Favorite friends (starred)
- Settings preferences
- Brainrot cache (10-minute TTL)
- Server totals cache (10-minute TTL)

### Storage Type
- Chrome Storage API (preferred)
- Falls back to localStorage if unavailable

---

## 🔒 Privacy & Safety

### What This Extension Does
- **Reads public Roblox data**: Friends, badges, public servers
- **Uses official Roblox APIs**: No unauthorized access
- **Respects rate limits**: Built-in delays for all bulk operations
- **No hidden information**: Only accesses data you can see on Roblox

### What This Extension Does NOT Do
- ❌ Access private/hidden game data
- ❌ Exploit or modify the game
- ❌ Steal credentials or personal info
- ❌ Bypass Roblox security
- ❌ Use any unauthorized APIs

### Safety Features
- CSRF token handling for authenticated requests
- Rate limiting on all bulk operations
- Protected favorites system
- Confirmation dialogs for bulk actions
- Error handling for all API calls

---

## 🛠️ Technical Details

### Architecture
- **Manifest V3**: Latest Chrome extension format
- **Content Script**: Monitors game page for join events
- **Background Service Worker**: Handles notifications
- **Popup**: Main UI with 3 tabs

### APIs Used
- `games.roblox.com/v1/games/{placeId}/private-servers`
- `friends.roblox.com/v1/users/{userId}/friends`
- `users.roblox.com/v1/users/authenticated`
- `badges.roblox.com/v1/universes/{universeId}/badges`
- `badges.roblox.com/v1/users/{userId}/badges`
- `thumbnails.roblox.com/v1/users/avatar-headshot`

### Libraries
- **Howler.js**: Audio management
- **Toastify**: Toast notifications
- **Animate.css**: CSS animations

---

## 🐛 Troubleshooting

### Extension Not Loading
- Ensure you're logged into Roblox
- Check if extension is enabled in `chrome://extensions/`
- Reload the extension (click refresh icon)

### "Please log in to Roblox" Error
- Open Roblox.com in a tab
- Log in to your account
- Refresh the extension popup

### Rate Limit Errors (429)
- Extension automatically waits 5 seconds and retries
- Reduce bulk operation frequency
- Roblox has rate limits on their APIs

### Brainrots Not Loading
- Click "Clear Cache" then "Refresh Brainrots"
- Check if you're logged into Roblox
- Verify the game has badges available

### Auto-Refresh Not Working
- Check if checkbox is enabled
- Ensure you're on the Scanner tab
- Check browser console for errors

---

## 📝 Changelog

### v2.0.0 (Current)
- ✨ Added Brainrot tracking system
- ✨ Added bulk friend request functionality
- ✨ Added mutuals detection and display
- ✨ Added auto-refresh with 3-minute interval
- ✨ Added desktop notifications
- ✨ Added content script for game monitoring
- ✨ Added background service worker
- 🎨 New Brainrots tab with stats
- 🎨 Enhanced Friends tab with new actions
- 🎨 Mutual badges in friend cards
- 🎨 Unique player counter
- 🔧 Improved error handling
- 🔧 Better rate limiting

### v1.1.0
- Initial release
- Server scanner functionality
- Friends manager
- Basic UI and sounds

---

## 💡 Tips & Best Practices

1. **Favorite Important Friends**: Always star friends you want to keep
2. **Use Auto-Refresh**: Let the extension scan servers automatically
3. **Scan Mutuals Occasionally**: Helps identify valuable connections
4. **Enable Notifications**: Never miss a Brainrot opportunity
5. **Respect Rate Limits**: Don't spam bulk operations
6. **Clear Cache if Issues**: Fixes most data loading problems

---

## 📞 Support

### Common Questions

**Q: Is this allowed by Roblox?**
A: This extension only uses public Roblox APIs and doesn't exploit or modify the game. It's a quality-of-life tool.

**Q: Will I get banned?**
A: The extension doesn't violate Roblox ToS as it doesn't exploit, modify game files, or access unauthorized data.

**Q: Can I use this on other games?**
A: Currently hardcoded for "Steal a Brainrot" (PLACE_ID: 109983668079237). Modify `PLACE_ID` and `UNIVERSE_ID` in popup.js for other games.

**Q: Why do some features fail?**
A: Roblox has rate limits. The extension handles this gracefully with automatic retries.

**Q: Does this work on Firefox?**
A: Currently Chrome-only due to Manifest V3. Firefox version requires adaptation.

---

## 🔮 Future Enhancements

Potential features for future versions:
- [ ] Multiple game support
- [ ] Advanced filtering options
- [ ] Export/import friend lists
- [ ] Server history tracking
- [ ] Custom notification sounds
- [ ] Keyboard shortcuts
- [ ] Dark/light theme toggle
- [ ] Badge rarity indicators
- [ ] Friend activity tracking
- [ ] Custom auto-refresh intervals

---

## 📜 License

This extension is provided as-is for personal use. Not affiliated with or endorsed by Roblox Corporation.

---

## 👨‍💻 Development

Built with ❤️ for the Steal a Brainrot community

**Version**: 2.0.0  
**Last Updated**: February 2024  
**Minimum Chrome Version**: 88+

---

**Enjoy Beanie Pro! 🎯**
