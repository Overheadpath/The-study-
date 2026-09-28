# Beanie Pro v2.0 - Testing Checklist

## ✅ Pre-Testing Setup
- [ ] Chrome browser installed
- [ ] Logged into Roblox.com in Chrome
- [ ] Extension loaded in `chrome://extensions/` with Developer Mode ON
- [ ] "Steal a Brainrot" game page open in a tab

---

## 🧪 Scanner Tab Tests

### Basic Functionality
- [ ] Extension popup opens when clicking icon
- [ ] Scanner tab is active by default
- [ ] Initial scan starts automatically (or shows cached data)
- [ ] Stats display: Total servers, Servers with players, Safe servers
- [ ] Page info shows: "Page 1 / X"

### Navigation
- [ ] "First Page" button loads first page
- [ ] "Next Page" button loads next page
- [ ] "Refresh Page" button reloads current page
- [ ] "Rescan Stats" button triggers new full scan
- [ ] Loading overlay appears during scans
- [ ] "Skip" button works in loading overlay

### Filters & Settings
- [ ] "Skip totals scan" checkbox works (skips scan on next load)
- [ ] "Show servers with owner inside" checkbox filters correctly
- [ ] "Only show servers with 1 player" checkbox filters correctly
- [ ] "Use deeplink" checkbox persists after reload
- [ ] "Auto-refresh (every 3 min)" checkbox enables timer
- [ ] Auto-refresh triggers automatically after 3 minutes
- [ ] Settings persist after closing and reopening popup

### Server Cards
- [ ] Server cards display: Name, Owner, Player count
- [ ] ⚠️ warning badge shows for servers with owner inside
- [ ] "Recently joined" badge appears after joining
- [ ] Timestamp updates every second on joined badge
- [ ] "Join" button works (opens game/deeplink)
- [ ] Recently joined server moves to top of list

### Rate Limiting
- [ ] Extension handles 429 errors gracefully
- [ ] Shows "Rate limited - retrying in 5s" message
- [ ] Automatically retries after delay

---

## 🏆 Brainrots Tab Tests

### Tab Navigation
- [ ] Brainrots tab button works
- [ ] Tab switches to Brainrots view
- [ ] Status message shows when no data loaded

### Badge Loading
- [ ] "Refresh Brainrots" button fetches badges
- [ ] Loading skeleton appears during fetch
- [ ] Stats display: Total, Owned, Missing, Completion %
- [ ] Badge cards render with icons
- [ ] Owned badges show green border + "✓ Owned"
- [ ] Missing badges show red border + "✗ Missing"

### Filters & Cache
- [ ] "Show only owned Brainrots" checkbox filters correctly
- [ ] "Notify when missing Brainrots detected" checkbox persists
- [ ] "Clear Cache" button clears cached data
- [ ] Stats reset to "—" after clearing cache
- [ ] Data loads from cache on subsequent opens (within 10 min)

### Notifications
- [ ] Desktop notification appears for missing Brainrots (if enabled)
- [ ] Notification shows count of missing badges
- [ ] Toast notification shows in popup

### Error Handling
- [ ] Shows error if not logged into Roblox
- [ ] Shows error if badges API fails
- [ ] Gracefully handles network errors

---

## 👥 Friends Tab Tests

### Basic Functionality
- [ ] Friends tab button works
- [ ] Friends list loads automatically
- [ ] Shows: Total Friends count
- [ ] Friend search box works
- [ ] Search filters by display name and username

### Friend Cards
- [ ] Avatar images load correctly
- [ ] Display names show
- [ ] "Has Access" badge shows (green) for access-givers
- [ ] "No Access" badge shows (red) for non-access-givers
- [ ] Star button works (toggles favorite)
- [ ] Starred friends show filled star (★)
- [ ] Checkboxes work (except on favorites - disabled)
- [ ] Selected count updates when checking boxes

### Sorting
- [ ] Friends with access appear first
- [ ] Favorites appear near top
- [ ] Online friends prioritized

### Bulk Friend Requests
- [ ] "Send Requests to Players" button works
- [ ] Scans servers and counts unique players
- [ ] Shows "Unique Players Found: X"
- [ ] Confirmation dialog appears
- [ ] Sends requests to all unique players
- [ ] Shows progress: "Sent X requests, Y failed"
- [ ] Filters out existing friends
- [ ] Handles rate limiting with delays

### Mutuals Scanning
- [ ] "Scan Mutuals" button works
- [ ] Shows progress: "Scanning mutuals... X/Y"
- [ ] Mutual badges appear on friend cards
- [ ] Mutual count displays (e.g., "5 Mutuals")
- [ ] Blue badge styling for mutuals
- [ ] Completion notification appears
- [ ] Takes time proportional to friend count

### Bulk Removal
- [ ] "Select All (Safe)" button selects all non-favorites
- [ ] Button text changes to "Unselect All" when active
- [ ] "Remove Selected" button works with confirmation
- [ ] Favorites cannot be selected (checkbox disabled)
- [ ] Clicking "Remove Selected" with 0 selected opens modal
- [ ] Modal shows 3 options:
  - [ ] "Remove All Without Access" works
  - [ ] "Remove All With Access" works
  - [ ] "Exit / Cancel" closes modal
- [ ] Confirmation dialogs appear for all bulk removals
- [ ] Friend count updates after removal
- [ ] Removed friends disappear from list

---

## 🎵 Audio & UI Tests

### Music & Sounds
- [ ] "🎵 Music: OFF" button in header
- [ ] Clicking toggles to "🎵 Music: ON"
- [ ] Background music plays (audio.mp3)
- [ ] Music volume is low (15%)
- [ ] Click sound plays on button clicks
- [ ] Done sound plays on completion
- [ ] Music preference persists

### Animations
- [ ] Popup fades in on open (animate__fadeIn)
- [ ] Server cards animate in (animate__fadeInUp)
- [ ] Tab transitions are smooth
- [ ] Loading spinner rotates
- [ ] Skeleton loaders shimmer

### Toast Notifications
- [ ] Info toasts (dark gray background)
- [ ] Success toasts (green tint)
- [ ] Warning toasts (orange tint)
- [ ] Error toasts (red tint)
- [ ] Toasts auto-dismiss after 2.5s
- [ ] Toasts appear bottom-right

### Responsive Design
- [ ] Popup width is 380px
- [ ] Content scrolls when needed
- [ ] Buttons are not cut off
- [ ] Text doesn't overflow
- [ ] All elements visible

---

## 🔧 Settings Persistence Tests

### On Popup Close/Reopen
- [ ] skipTotals setting persists
- [ ] showOwnerInside setting persists
- [ ] onlyOnePlayer setting persists
- [ ] useDeeplink setting persists
- [ ] autoRefresh setting persists
- [ ] notifyMissing setting persists
- [ ] Favorites list persists
- [ ] Last joined server persists
- [ ] Cached server totals persist (10 min)
- [ ] Cached Brainrot data persists (10 min)

### Auto-Refresh Behavior
- [ ] Enabled on load if setting was ON
- [ ] Disabled on load if setting was OFF
- [ ] Timer runs only when Scanner tab active
- [ ] Timer stops when switching tabs
- [ ] Notification appears on auto-refresh

---

## 🚨 Error Cases

### Not Logged Into Roblox
- [ ] Scanner shows "Open Roblox tab first" on join attempt
- [ ] Friends tab shows "Please log in to Roblox"
- [ ] Brainrots tab shows "Please log in to Roblox first"
- [ ] No crashes or console errors

### Network Errors
- [ ] Handles fetch failures gracefully
- [ ] Shows appropriate error messages
- [ ] Doesn't break UI
- [ ] Buttons re-enable after errors

### Rate Limiting (429)
- [ ] Detects 429 status
- [ ] Shows rate limit message
- [ ] Waits 5 seconds
- [ ] Retries automatically
- [ ] Doesn't spam API

### Invalid Data
- [ ] Handles empty server lists
- [ ] Handles empty friend lists
- [ ] Handles missing badge icons
- [ ] Handles undefined values

---

## 🔍 Background & Content Script Tests

### Content Script (content.js)
- [ ] Injected on Roblox game pages
- [ ] Detects game frame/iframe
- [ ] Sends message to background on game join
- [ ] Doesn't interfere with normal Roblox functionality

### Background Service Worker (background.js)
- [ ] Receives messages from content script
- [ ] Receives messages from popup
- [ ] Sends desktop notifications
- [ ] Notification shows correct count
- [ ] Notification has correct icon

### Extension Install/Update
- [ ] Logs "Beanie Pro installed!" on first install
- [ ] Logs "Beanie Pro updated to v2.0!" on update
- [ ] No errors in background service worker console

---

## 🎯 Integration Tests

### End-to-End Workflows

#### Workflow 1: Find and Join Server
1. [ ] Open extension
2. [ ] Wait for scan to complete
3. [ ] Apply filters (e.g., only 1 player)
4. [ ] Click "Join" on a server
5. [ ] Verify game launches/deeplink opens
6. [ ] Check "Recently joined" badge appears

#### Workflow 2: Track Brainrots
1. [ ] Switch to Brainrots tab
2. [ ] Click "Refresh Brainrots"
3. [ ] Verify stats are accurate
4. [ ] Enable "Show only owned"
5. [ ] Verify filtering works
6. [ ] Check notification for missing badges

#### Workflow 3: Bulk Friend Management
1. [ ] Switch to Friends tab
2. [ ] Wait for friends to load
3. [ ] Click "Scan Mutuals"
4. [ ] Verify mutual badges appear
5. [ ] Select multiple friends
6. [ ] Remove selected with confirmation
7. [ ] Verify removal success

#### Workflow 4: Send Bulk Requests
1. [ ] Ensure Scanner has scanned servers
2. [ ] Switch to Friends tab
3. [ ] Click "Send Requests to Players"
4. [ ] Wait for server scan
5. [ ] Confirm bulk send
6. [ ] Verify success/failure counts

---

## 📊 Performance Tests

- [ ] Popup opens quickly (< 1s)
- [ ] Tab switches are smooth (< 200ms)
- [ ] Large friend lists render without lag
- [ ] Server pagination is fast
- [ ] No memory leaks after extended use
- [ ] No excessive API calls
- [ ] Cache reduces redundant fetches

---

## 🔒 Security Tests

- [ ] CSRF token obtained correctly
- [ ] All API calls use credentials: "include"
- [ ] No sensitive data logged to console
- [ ] No credentials stored in plaintext
- [ ] Confirmation dialogs for destructive actions
- [ ] Favorites protected from bulk removal

---

## 📱 Cross-Tab Tests

- [ ] Multiple popups don't conflict
- [ ] Settings sync across popup instances
- [ ] Cache updates reflected in all instances
- [ ] No race conditions with storage

---

## 🎨 Visual Tests

- [ ] All icons load (16, 32, 48, 128)
- [ ] Colors match dark theme
- [ ] Text is readable (contrast)
- [ ] No UI elements overlap
- [ ] Spacing is consistent
- [ ] Buttons have hover states
- [ ] Active tabs are highlighted
- [ ] Badges are color-coded correctly

---

## ✅ Final Validation

- [ ] All major features working
- [ ] No console errors
- [ ] No broken UI elements
- [ ] Settings persist correctly
- [ ] Performance is acceptable
- [ ] Extension is stable (no crashes)
- [ ] README is accurate
- [ ] All files present and valid

---

**Testing Complete! 🎉**

Date: ___________  
Tester: ___________  
Version: 2.0.0  
Status: ⬜ Pass / ⬜ Fail  
Notes: ___________
