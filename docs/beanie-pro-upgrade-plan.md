# Beanie Pro Upgrade Plan (Phase-Based)

## Scope intent
Beanie Pro is a quality-of-life extension for Steal a Brainrot on Roblox focused on:

- tracking owned vs missing Brainrots,
- indexing friend relationships and private-server access signals,
- reducing repetitive clicks with explicit, user-controlled bulk actions.

## Safety and legitimacy constraints

1. Use only visible, public, or permission-based data.
2. Do not attempt to bypass platform protections or hidden endpoints.
3. Keep automation opt-in, rate-limited, and user-cancelable.
4. Default to dry-run previews for bulk operations.

## Phase 0 (implemented)

- Manifest V3 scaffold (`extension/manifest.json`).
- Background service worker with message handling for:
  - settings read/write,
  - settings sanitization and bounds checks,
  - session snapshot upsert,
  - runtime status query.
- Content script heartbeat for non-invasive session snapshotting with configurable interval.
- Popup UI for basic settings + status visibility.
- Service modules for storage-backed indexes/settings:
  - brainrot index,
  - friend index,
  - session scan,
  - activity log.

## How to use phase 0 now

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Open a Roblox game page (`https://www.roblox.com/games/*`).
5. Click the Beanie Pro extension icon:
   - view heartbeat status,
   - configure auto-refresh,
   - save settings.

## Phase 1: read-only intelligence

- Detect visible Brainrots in-session.
- Compare with owned index and notify on missing items.
- Build friend index from relationship data with access-giver flags.
- Expand popup/dashboard for filtering and search.

## Phase 2: controlled bulk actions

- Add bulk friend-request queue with:
  - pre-flight dry run,
  - max actions per run,
  - delay+jitter,
  - pause/cancel controls,
  - action logs and retry handling.

## Phase 3: operational quality

- Scheduling and auto-refresh policy.
- Better diagnostics and error reporting.
- Import/export for local index backups.
- UX polish and performance tuning.

## Data model starter

- `beaniePro.settings`
- `beaniePro.brainrotIndex`
- `beaniePro.friendIndex`
- `beaniePro.sessionScan`
- `beaniePro.activityLog`

These keys are introduced as extension-local storage primitives to keep state deterministic and auditable.
