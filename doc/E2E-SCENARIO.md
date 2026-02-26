# E2E Full UI Test Scenario

**Prerequisite:** Read [E2E-TESTING.md](E2E-TESTING.md) first for server setup, credentials, and the `__spoDebug` API.

This document is the **complete ordered test script** that exercises every UI feature.
All verification is programmatic via `browser_evaluate` + `browser_snapshot` — no screenshots needed.

---

## Phase 0 — Server Start

```
Bash(run_in_background): npm run dev
browser_navigate → http://localhost:8080
browser_wait_for → text: "STARPEACE ONLINE" (page loaded)
```

---

## Phase 1 — Login Flow

### 1.1 Fill credentials and connect
```
browser_snapshot → find #inp-username, #inp-password, #btn-connect
browser_type → #inp-username: "SPO_test3"
browser_type → #inp-password: "test3"
browser_click → #btn-connect
```

### 1.2 Select BETA zone → Shamba world
```
browser_wait_for → text: "Shamba" (timeout 15s)
browser_snapshot → find zone tabs, world cards
browser_click → "BETA" zone tab (if not already active)
browser_snapshot → find "Shamba" world card
browser_click → "Shamba" world card
```

### 1.3 Select company
```
browser_wait_for → text: "President of Shamba" (timeout 15s)
browser_snapshot → find company cards
browser_click → "President of Shamba" card
```

### 1.4 Verify login
```
browser_wait_for → textGone: "Select Company"
browser_evaluate → window.__spoDebug.getState()
```
**Assert:**
- `session.connected === true`
- `session.worldName === "Shamba"`
- `session.companyName` contains "Shamba"
- `panels.login === false`
- `renderer !== null`
- `renderer.canvasHasContent === true`
- `wire.errors === 0`

---

## Phase 2 — Map & Renderer

### 2.1 Map loaded with data
```
browser_evaluate → s = window.__spoDebug.getState().renderer
```
**Assert:** `s.mapLoaded`, `s.buildingCount > 0`, `s.canvasHasContent`

### 2.2 Zoom in / out
```
browser_evaluate → window.__spoDebug.getState().renderer.zoom   // note initial (e.g. 2)
browser_press_key → "+"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer.zoom   // should be initial+1
browser_press_key → "-"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer.zoom   // back to initial
```

### 2.3 Rotation
```
browser_evaluate → window.__spoDebug.getState().renderer.rotation   // "NORTH"
browser_press_key → "q"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer.rotation   // changed (e.g. "EAST")
browser_press_key → "e"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer.rotation   // back to "NORTH"
```

### 2.4 Debug overlay toggle
```
browser_press_key → "d"
browser_wait_for → time: 0.3
browser_evaluate → window.__spoDebug.getState().renderer.debugMode   // true
browser_press_key → "d"
browser_evaluate → window.__spoDebug.getState().renderer.debugMode   // false
```

---

## Phase 3 — Tycoon Stats Bar

```
browser_evaluate → window.__spoDebug.getState().tycoonStats
```
**Assert:**
- `cash` starts with `$` and is non-empty
- `ranking` contains `SPO_test3`
- `buildings` matches pattern `N/M` (e.g. "5/50")
- `income` contains `$` and `/h`

---

## Phase 4 — Chat UI

### 4.1 Verify chat panel visible
```
browser_evaluate → window.__spoDebug.getState().panels.chat   // true
```

### 4.2 Send a message
```
browser_snapshot → find chat input (placeholder "Type a message...")
browser_type → chat input: "E2E test ping"
browser_press_key → "Enter"
browser_wait_for → time: 1.5
browser_evaluate → window.__spoDebug.getState().chat
```
**Assert:** `messageCount > 0`, `lastMessage` contains "E2E test ping"

### 4.3 Toggle user list
```
browser_snapshot → find "👥" button in chat header
browser_click → "👥" button
browser_wait_for → time: 0.5
browser_snapshot → verify user list panel appeared with "Online Users" heading
browser_click → "👥" button again (close)
```

### 4.4 Toggle channel list
```
browser_snapshot → find "#" button in chat header
browser_click → "#" button
browser_wait_for → time: 0.5
browser_snapshot → verify channel list with "All Channels" heading
browser_click → "#" button again (close)
```

### 4.5 Minimize / restore chat
```
browser_snapshot → find "−" button in chat header
browser_click → "−" button
browser_wait_for → time: 0.3
browser_snapshot → verify chat panel is collapsed (small height)
browser_click → "−" button again (restore)
```

---

## Phase 5 — Toolbar Panel Toggles

Test each toolbar button opens its panel, Escape closes it.
Identify buttons via `browser_snapshot` by their `title` attribute.

### 5.1 Build Menu (title="Construction Menu")
```
browser_snapshot → find button with title "Construction Menu"
browser_click → "Construction Menu" button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.buildMenu   // true
browser_snapshot → verify category grid visible (building categories shown)
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.buildMenu   // false
```

### 5.2 Search Menu (title="Search Buildings")
```
browser_click → "Search Buildings" button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.searchMenu   // true
browser_snapshot → verify search menu home page with category grid
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.searchMenu   // false
```

### 5.3 Profile / Company (title="Company Overview")
```
browser_click → "Company Overview" button
browser_wait_for → time: 1.5
browser_evaluate → window.__spoDebug.getState().panels.profile   // true
browser_snapshot → verify profile panel with sidebar tabs
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.profile   // false
```

### 5.4 Mail (title="Messages")
```
browser_click → "Messages" button
browser_wait_for → time: 1.5
browser_evaluate → window.__spoDebug.getState().panels.mail   // true
browser_snapshot → verify mail panel with folder tabs (Inbox, Sent, Draft)
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.mail   // false
```

### 5.5 Transport (title="Train Routes")
```
browser_click → "Train Routes" button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.transport   // true
browser_snapshot → verify transport panel with stats cards
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.transport   // false
```

### 5.6 Settings (title="Game Settings")
```
browser_click → "Game Settings" button
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().panels.settings   // true
browser_snapshot → verify settings overlay with checkboxes
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.settings   // false
```

### 5.7 Minimap (M key)
```
browser_press_key → "m"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().panels.minimap   // true
browser_press_key → "m"
browser_evaluate → window.__spoDebug.getState().panels.minimap   // false
```

### 5.8 Refresh (title="Refresh Map")
```
browser_evaluate → window.__spoDebug.sent   // note count
browser_click → "Refresh Map" button
browser_wait_for → time: 2
browser_evaluate → window.__spoDebug.sent   // should have increased (new map load request)
```

---

## Phase 6 — Settings Panel (Read + Set)

### 6.1 Read current settings
```
browser_click → "Game Settings" button
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().settings
```
**Note initial values** (all booleans + soundVolume number).

### 6.2 Toggle each checkbox
For each setting: find the checkbox by label text via `browser_snapshot`, click it, verify via `getState().settings`.

```
browser_snapshot → find all checkboxes with labels
```

**Hide Vegetation on Move:**
```
browser_click → checkbox next to "Hide Vegetation on Move"
browser_evaluate → window.__spoDebug.getState().settings.hideVegetationOnMove   // toggled
browser_click → same checkbox (restore original)
```

**Vehicle Animations:**
```
browser_click → checkbox next to "Vehicle Animations"
browser_evaluate → window.__spoDebug.getState().settings.vehicleAnimations
browser_click → same checkbox (restore)
```

**Edge Scrolling:**
```
browser_click → checkbox next to "Edge Scrolling"
browser_evaluate → window.__spoDebug.getState().settings.edgeScrollEnabled
browser_click → same checkbox (restore)
```

**Sound:**
```
browser_click → checkbox next to "Sound"
browser_evaluate → window.__spoDebug.getState().settings.soundEnabled
browser_click → same checkbox (restore)
```

**Debug Overlay:**
```
browser_click → checkbox next to "Debug Overlay"
browser_evaluate → window.__spoDebug.getState().settings.debugOverlay
browser_click → same checkbox (restore)
```

### 6.3 Volume slider
```
browser_snapshot → find range input (volume slider)
// Use browser_evaluate to set value directly since slider drag is unreliable:
browser_evaluate → document.querySelector('#settings-overlay input[type="range"]').value = '0.5'; document.querySelector('#settings-overlay input[type="range"]').dispatchEvent(new Event('input'))
browser_evaluate → window.__spoDebug.getState().settings.soundVolume   // ~0.5
```

### 6.4 Close settings
```
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.settings   // false
```

---

## Phase 7 — Search Menu (Deep Navigation)

### 7.1 Open and browse home
```
browser_click → "Search Buildings" button
browser_wait_for → time: 1
browser_snapshot → verify category grid on home page
```

### 7.2 Navigate to Towns
```
browser_snapshot → find "Towns" category card
browser_click → "Towns" card
browser_wait_for → time: 2
browser_snapshot → verify town list appeared (town names visible)
```

### 7.3 Navigate to Rankings
```
browser_snapshot → find back button (← or ".search-menu-back-btn")
browser_click → back button
browser_wait_for → time: 1
browser_snapshot → find "Rankings" category card
browser_click → "Rankings" card
browser_wait_for → time: 2
browser_snapshot → verify ranking categories tree appeared
```

### 7.4 Navigate to People search
```
browser_click → back button
browser_wait_for → time: 1
browser_snapshot → find "People" category card
browser_click → "People" card
browser_wait_for → time: 1
browser_snapshot → verify search input and alphabet index appeared
```

### 7.5 Close
```
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.searchMenu   // false
```

---

## Phase 8 — Mail Panel (Read + Compose)

### 8.1 Open and read Inbox
```
browser_click → "Messages" button
browser_wait_for → time: 2
browser_snapshot → verify Inbox tab is active, message rows visible
```

### 8.2 Read a message
```
browser_snapshot → find first .mail-row
browser_click → first mail row
browser_wait_for → time: 1
browser_snapshot → verify message view: From, Subject, body text, Reply/Forward/Delete buttons
```

### 8.3 Go back to folder list
```
browser_snapshot → find back button (.mail-back-btn)
browser_click → back button
browser_wait_for → time: 0.5
```

### 8.4 Switch folders
```
browser_snapshot → find "Sent" tab
browser_click → "Sent" tab
browser_wait_for → time: 1.5
browser_snapshot → verify Sent folder content loaded (rows or empty message)

browser_snapshot → find "Draft" tab
browser_click → "Draft" tab
browser_wait_for → time: 1.5
browser_snapshot → verify Draft folder content
```

### 8.5 Open compose form
```
browser_snapshot → find "+ New" compose button
browser_click → "+ New" button
browser_wait_for → time: 0.5
browser_snapshot → verify compose form with To, Subject, Body fields + Send/Save Draft/Cancel buttons
```

### 8.6 Fill compose form (read-only test — Save Draft only)
```
browser_snapshot → find compose inputs
browser_type → .mail-compose-to: "SPO_test3"
browser_type → .mail-compose-subject: "E2E Test Draft"
browser_type → .mail-compose-body: "This is an automated E2E test draft."
browser_snapshot → find "Save Draft" button (.mail-compose-save-draft)
browser_click → "Save Draft" button
browser_wait_for → time: 2
browser_snapshot → verify returned to folder view (compose form gone)
```

### 8.7 Close
```
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.mail   // false
```

---

## Phase 9 — Profile Panel (All Tabs)

### 9.1 Open profile
```
browser_click → "Company Overview" button
browser_wait_for → time: 2
browser_evaluate → window.__spoDebug.getState().panels.profile   // true
```

### 9.2 Curriculum tab (default)
```
browser_snapshot → verify tycoon name, level, fortune, prestige visible in content area
```

### 9.3 Bank tab
```
browser_snapshot → find "Bank" tab in sidebar
browser_click → "Bank" tab
browser_wait_for → time: 1.5
browser_snapshot → verify bank info (balance, interest, etc.)
```

### 9.4 Profit/Loss tab
```
browser_snapshot → find "Profit/Loss" tab in sidebar
browser_click → "Profit/Loss" tab
browser_wait_for → time: 1.5
browser_snapshot → verify profit breakdown tree
```

### 9.5 Companies tab
```
browser_snapshot → find "Companies" tab in sidebar
browser_click → "Companies" tab
browser_wait_for → time: 1.5
browser_snapshot → verify company list (at least "President of Shamba" visible)
```

### 9.6 Suppliers tab
```
browser_snapshot → find "Suppliers" or "Auto-Connections" tab in sidebar
browser_click → tab
browser_wait_for → time: 1.5
browser_snapshot → verify auto-connection content
```

### 9.7 Strategy tab
```
browser_snapshot → find "Strategy" or "Policy" tab in sidebar
browser_click → tab
browser_wait_for → time: 1.5
browser_snapshot → verify policy settings (Ally/Neutral/Enemy)
```

### 9.8 Close
```
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.profile   // false
```

---

## Phase 10 — Politics Panel

```
// Politics panel may be accessible via search menu "Town" → governance info,
// or via a toolbar path. Try opening via browser_evaluate if no direct button:
browser_snapshot → check if there's a politics/governance button in toolbar or panels
// If the politics panel is accessible:
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.politics   // true
browser_snapshot → verify: mayor info, rating tabs, opposition/campaign sections
browser_press_key → "Escape"
```
**Note:** The politics panel may not have a direct toolbar button. If so, skip — it may require clicking on a Capitol or Town Hall building.

---

## Phase 11 — Transport Panel

```
browser_click → "Train Routes" button
browser_wait_for → time: 1.5
browser_evaluate → window.__spoDebug.getState().panels.transport   // true
browser_snapshot → verify overview: "Rail Segments" and "Trains" stat cards
```

If trains exist in the world:
```
browser_snapshot → find a .train-row
browser_click → first train row
browser_wait_for → time: 1
browser_snapshot → verify train detail: name, route stops, back button
browser_snapshot → find "← Back" button
browser_click → "← Back"
browser_wait_for → time: 0.5
```

```
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.transport   // false
```

---

## Phase 12 — Build Menu (Deep Navigation)

### 12.1 Open and browse categories
```
browser_click → "Construction Menu" button
browser_wait_for → time: 1.5
browser_evaluate → window.__spoDebug.getState().panels.buildMenu   // true
browser_snapshot → note all building category cards visible
```

### 12.2 Select a category
```
browser_snapshot → find first category card (e.g. "Industrial" or any visible category)
browser_click → first category card
browser_wait_for → time: 1.5
browser_snapshot → verify facility list appeared with building cards (name, cost, area, Build button)
```

### 12.3 Navigate back
```
browser_snapshot → find "← Back" button
browser_click → "← Back"
browser_wait_for → time: 0.5
browser_snapshot → verify back to categories grid
```

### 12.4 Close
```
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.buildMenu   // false
```

---

## Phase 13 — Building Details (Facility Inspector)

This is the most complex panel. Different building types expose different tabs.
**ASK the user which building type to click** if coordinates aren't known.

### 13.1 Click on an owned building

The test account owns buildings in Shamba. Click on the map canvas at an approximate building location, or:

```
// Use the renderer to find owned buildings:
browser_evaluate → window.__spoDebug.getState().renderer?.buildingCount
// Then click on canvas near a building — use browser_snapshot to see the game area
browser_click → click on a visible building on the canvas
browser_wait_for → time: 3
browser_evaluate → window.__spoDebug.getState().buildingDetails
```

**Assert:** `buildingDetails !== null`, has `buildingName`, `tabs` array, `isOwner`

### 13.2 Inspect tabs
```
browser_evaluate → window.__spoDebug.getState().buildingDetails.tabs
// Returns: [{id: "general", name: "General"}, {id: "supplies", name: "Supplies"}, ...]
```

For each tab in the array:
```
browser_snapshot → find tab button by name text
browser_click → tab button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().buildingDetails.currentTab   // matches tab.id
browser_snapshot → verify tab content rendered (property rows, tables, sliders, etc.)
```

### 13.3 Tab-specific checks

**General tab** — verify via snapshot:
- Building name, owner, value, ROI, age visible
- If isOwner: Rename button (#bd-rename-btn) visible
- Stopped toggle (if industrial)
- Sliders for editable properties

**Supplies tab** (if present) — verify via snapshot:
- Supply rows with Facility, Company, Price, Quality columns
- "Max Price" slider (if owner)
- "Find Suppliers" button (if owner)

**Products tab** (if present) — verify via snapshot:
- Product rows with Facility, Company, Value, Cost columns
- "Price" slider (if owner)
- "Find Clients" button (if owner)

**Workforce tab** (if present) — verify via snapshot:
- 3-column table: Executives, Professionals, Workers
- Salary rows (if owner: sliders)

**Upgrade tab** (if present) — verify via snapshot:
- Current level display
- Upgrade controls (if owner)

**Finances tab** (if present) — verify via snapshot:
- Sparkline graph canvas visible

### 13.4 Test editable controls (owner only)

If `buildingDetails.isOwner === true`:

**Rename:**
```
browser_snapshot → find #bd-rename-btn
browser_click → rename button
browser_snapshot → verify rename input appeared (#bd-rename-input)
browser_press_key → "Escape"   // cancel rename (don't actually rename)
```

**Slider interaction** (e.g., price or salary slider):
```
browser_snapshot → find a range input (slider) in the active tab
// Note the current value from the slider's displayed label
// Move slider via evaluate:
browser_evaluate → const s = document.querySelector('#building-details-panel input[type="range"]'); if(s) { s.value = String(Number(s.min) + (Number(s.max) - Number(s.min)) * 0.5); s.dispatchEvent(new Event('input')); } 'ok'
browser_wait_for → time: 0.5
// Note: actual SET command will fire on 'change' event — be careful with real buildings
```
**Warning:** Slider changes on owned buildings WILL send RDO SET commands to the game server. Only test on non-critical properties or restore original values.

### 13.5 Close building details
```
browser_snapshot → find close button (× in panel header)
browser_click → close button
browser_evaluate → window.__spoDebug.getState().panels.buildingDetails   // false
```

---

## Phase 14 — Protocol Log

### 14.1 Expand and check
```
browser_click → #console-header (expand protocol log)
browser_wait_for → time: 0.3
browser_evaluate → document.getElementById('console-output')?.children.length
```
**Assert:** > 0 (log has entries)

### 14.2 Verify wire messages contain expected types
```
browser_evaluate → window.__spoDebug.history.map(h => h.dir + ' ' + h.type).slice(-20)
```
**Assert:** Contains pairs like `→ REQ_CONNECT_DIRECTORY` / `← RESP_CONNECT_SUCCESS`, `→ REQ_LOGIN_WORLD` / `← RESP_LOGIN_SUCCESS`, `→ REQ_MAP_LOAD` / `← RESP_MAP_DATA`

### 14.3 Check debug badge
```
browser_snapshot → find #e2e-debug-badge in console header
// Should show "↑N ↓M" with no ✗ error count
```

### 14.4 Clear console
```
browser_click → #btn-clear-console
browser_evaluate → document.getElementById('console-output')?.children.length   // 0
```

---

## Phase 15 — Wire Health Final Check

```
browser_evaluate → window.__spoDebug.getState().wire
```
**Assert:**
- `sent > 10` (many requests through full test)
- `received > 10`
- `errors === 0` (no protocol errors)
- `sent ≈ received` (roughly balanced)

---

## Phase 16 — Logout

```
browser_snapshot → find button with title "Logout"
browser_click → "Logout" button
browser_wait_for → time: 2
browser_evaluate → window.__spoDebug.getState().session.connected
```
**Assert:** `connected === false` or login panel reappeared

---

## Phase 17 — Stop Server

```
Bash: powershell -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process -Force"
```
Or use `TaskStop` on the background task.

---

## Building Type Quick Reference

When **Phase 13** needs a specific building type to test particular tabs, ask the user to identify or click:

| Tabs to Test | Building Type to Click | What to Look For |
|---|---|---|
| General + Supplies + Products + Workforce + Upgrade + Finances | **Industrial Factory** | Full inspector with all editable sliders, supply/product connection tables |
| General + Workforce + Upgrade + Finances (with rent sliders) | **Residential** | Occupancy %, QoL, rent/maintenance sliders |
| General + Service prices TABLE | **Store** (food, clothes, etc.) | Indexed service name/price table |
| General + Research table | **Headquarters** | Research inventions grid (dev/completed/available) |
| General + Loan TABLE | **Bank** | Debtor list, budget slider |
| General + Towns + Votes + Ministers + Finances | **Capitol** | Town/minister tables, election votes |
| General + Jobs + Residential + Services + Taxes | **Town Hall** | 5 tabs with salary sliders, tax sliders |
| General + Antennas | **TV Station** | Hours/commercials sliders, antenna table |

---

## Features NOT Tested (Account Limitations)

- **Road building/demolishing** — requires town mayor role
- **Zone overlays** — requires specific permissions
- **Building placement** — can browse build menu but not place (may lack funds or permissions)
- **Building deletion** — destructive, skip unless explicitly requested
- **Company creation** — would alter account state permanently
