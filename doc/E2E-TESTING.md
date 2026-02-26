# E2E Testing with Playwright MCP

**Tool:** Playwright MCP (browser automation via `mcp__playwright__*` tools)
**Purpose:** Automated functional testing of the live game client in a real browser

## MANDATORY Test Credentials (DO NOT CHANGE)

> **These credentials MUST be used for ALL E2E tests. NEVER modify, skip, or substitute them without EXPLICIT developer approval.**

| Field | Value |
|-------|-------|
| **Username** | `SPO_test3` |
| **Password** | `test3` |
| **Server zone** | `BETA` |
| **World** | `Shamba` |
| **Company** | `President of Shamba` |

### Account Limitations

This test account does **NOT** have access to:
- **Road building/demolishing** — requires town mayor role
- **Zone overlays** — requires specific permissions
- Do NOT include these features in E2E test runs.

## Programmatic State Verification (No Screenshots)

All E2E verification uses `browser_evaluate` + `window.__spoDebug.getState()` instead of screenshots.
This avoids the ~3-5MB per screenshot cost that saturates the 20MB context limit.

### The `__spoDebug` API

```javascript
// Wire-level message counters (always available)
window.__spoDebug.sent         // number — outgoing WS messages
window.__spoDebug.received     // number — incoming WS messages
window.__spoDebug.errors       // number — error responses
window.__spoDebug.lastSent     // string — last sent message type
window.__spoDebug.lastReceived // string — last received message type
window.__spoDebug.history      // array  — last 200 messages [{dir, type, ts, reqId}]

// Full game state snapshot (call as function)
window.__spoDebug.getState()   // returns SpoDebugState object
```

### `getState()` Return Structure

```typescript
{
  session: {
    connected: boolean,       // WebSocket connected?
    worldName: string,        // e.g. "Shamba"
    companyName: string,      // e.g. "President of Shamba"
    worldSize: { x, y },      // map dimensions (null before login)
  },
  renderer: {                 // null if renderer not initialized
    mapLoaded: boolean,       // true if buildings or segments exist
    zoom: number,             // 0-5
    rotation: string,         // "NORTH" | "EAST" | "SOUTH" | "WEST"
    cameraPosition: { x, y },
    buildingCount: number,
    segmentCount: number,
    mapDimensions: { width, height },
    debugMode: boolean,
    canvasSize: { width, height },
    canvasHasContent: boolean, // true if center pixel has alpha > 0
  },
  panels: {                   // true = visible
    login, chat, mail, profile, politics, settings,
    transport, minimap, buildMenu, buildingDetails, searchMenu,
  },
  tycoonStats: {              // text content from DOM data attributes
    ranking, buildings, cash, income, prestige, area, debt,
  },
  chat: {
    visible: boolean,
    messageCount: number,
    lastMessage: string,
  },
  wire: { sent, received, errors, lastSent, lastReceived },
}
```

### Common Verification Patterns

```
// Check connection is live
browser_evaluate("window.__spoDebug.getState().session.connected")
→ true

// Check map loaded with content
browser_evaluate("const s = window.__spoDebug.getState(); ({loaded: s.renderer?.mapLoaded, buildings: s.renderer?.buildingCount, drawn: s.renderer?.canvasHasContent})")
→ {loaded: true, buildings: 42, drawn: true}

// Check all panels closed after login
browser_evaluate("window.__spoDebug.getState().panels")
→ {login: false, chat: true, mail: false, ...}

// Check tycoon stats populated
browser_evaluate("window.__spoDebug.getState().tycoonStats")
→ {ranking: "#125 SPO_test3", cash: "$1,500,000.00", ...}

// Check zoom changed after key press
browser_evaluate("window.__spoDebug.getState().renderer?.zoom")
→ 3

// Check no wire errors
browser_evaluate("window.__spoDebug.getState().wire.errors")
→ 0

// Get last 5 wire messages
browser_evaluate("window.__spoDebug.history.slice(-5).map(h => h.dir + ' ' + h.type)")
→ ["→ REQ_MAP_LOAD", "← RESP_MAP_DATA", ...]
```

## E2E Test Procedure

Every E2E test session follows this lifecycle: **Start server → Run tests → Stop server**.

### Step 1: Start the Dev Server

```bash
npm run dev   # Builds (server + client) then starts on port 8080
```

- Run this command **in the background** (`run_in_background: true`) so it doesn't block the test session.
- Wait for the server to be ready by checking that `http://localhost:8080` is reachable (use `browser_navigate` or poll with a short delay).
- If port 8080 is already in use, stop the existing process first (see Troubleshooting in CLAUDE.md).

### Step 2: Login Scenario (MANDATORY — always run first)

This scenario MUST succeed before any other test. It validates the full authentication flow.

**2a. Navigate to the app**
```
browser_navigate → http://localhost:8080
```

**2b. Fill login form and connect**
```
browser_snapshot → identify #inp-username, #inp-password, #btn-connect
browser_type → ref for #inp-username, text: "SPO_test3"
browser_type → ref for #inp-password, text: "test3"
browser_click → ref for #btn-connect ("Connect to Starpeace")
```

**2c. Wait for world list and select BETA/Shamba**
```
browser_wait_for → text: "Shamba" (wait for worlds to load, timeout ~15s)
browser_snapshot → identify zone tabs and world cards
browser_click → ref for "BETA" zone tab (if not already active)
browser_snapshot → identify "Shamba" world card in the list
browser_click → ref for the "Shamba" world card
```

**2d. Wait for company list and select President of Shamba**
```
browser_wait_for → text: "President of Shamba" (wait for companies to load, timeout ~15s)
browser_snapshot → identify company cards
browser_click → ref for "President of Shamba" company card
```

**2e. Verify login success (programmatic)**
```
browser_wait_for → textGone: "Select Company" (login panel disappears)
browser_evaluate → window.__spoDebug.getState()
```

**Validation criteria (all checked via `getState()`):**
- `session.connected === true`
- `session.worldName === "Shamba"`
- `session.companyName` contains "Shamba"
- `panels.login === false` (login panel hidden)
- `renderer !== null` (renderer initialized)
- `wire.errors === 0`

### Step 3: Post-Login Feature Tests

After successful login, run the tests below. **All verification is programmatic** — no screenshots needed.

#### 3a. Map Rendering
```
browser_evaluate → window.__spoDebug.getState().renderer
```
**Check:**
- `mapLoaded === true`
- `buildingCount > 0`
- `canvasHasContent === true`
- `canvasSize.width > 0 && canvasSize.height > 0`

#### 3b. Zoom
```
browser_evaluate → window.__spoDebug.getState().renderer?.zoom  // note initial
browser_press_key → "+"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer?.zoom  // should increase
browser_press_key → "-"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer?.zoom  // should decrease back
```

#### 3c. Rotation
```
browser_evaluate → window.__spoDebug.getState().renderer?.rotation  // e.g. "NORTH"
browser_press_key → "q"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer?.rotation  // e.g. "EAST"
browser_press_key → "e"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().renderer?.rotation  // back to "NORTH"
```

#### 3d. Tycoon Stats
```
browser_evaluate → window.__spoDebug.getState().tycoonStats
```
**Check:**
- `cash` is non-empty and starts with `$`
- `ranking` contains `SPO_test3`
- `buildings` matches pattern like `N/M`

#### 3e. Chat
```
browser_snapshot → find chat input field
browser_type → ref for chat input, text: "E2E test message"
browser_press_key → "Enter"
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().chat
```
**Check:**
- `messageCount > 0`
- `lastMessage` contains "E2E test message"

#### 3f. Panel Toggle Tests

For each panel, click the toolbar button and verify it opens, then close it:

**Mail panel:**
```
browser_snapshot → find Mail toolbar button
browser_click → ref for Mail button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.mail  // true
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.mail  // false
```

**Profile panel (Company button):**
```
browser_snapshot → find Company toolbar button
browser_click → ref for Company button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.profile  // true
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.profile  // false
```

**Settings panel:**
```
browser_snapshot → find Settings toolbar button
browser_click → ref for Settings button
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().panels.settings  // true
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.settings  // false
```

**Transport panel:**
```
browser_snapshot → find Transport toolbar button
browser_click → ref for Transport button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.transport  // true
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.transport  // false
```

**Search menu:**
```
browser_snapshot → find Search toolbar button
browser_click → ref for Search button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.searchMenu  // true
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.searchMenu  // false
```

**Minimap:**
```
browser_press_key → "m"
browser_wait_for → time: 0.5
browser_evaluate → window.__spoDebug.getState().panels.minimap  // true
browser_press_key → "m"
browser_evaluate → window.__spoDebug.getState().panels.minimap  // false
```

**Build menu:**
```
browser_snapshot → find Build toolbar button
browser_click → ref for Build button
browser_wait_for → time: 1
browser_evaluate → window.__spoDebug.getState().panels.buildMenu  // true
browser_press_key → "Escape"
browser_evaluate → window.__spoDebug.getState().panels.buildMenu  // false
```

#### 3g. Building Details (click on map)
```
browser_click → click on a building on the canvas (approximate location)
browser_wait_for → time: 2
browser_evaluate → window.__spoDebug.getState().panels.buildingDetails
```
**Check:** `buildingDetails === true` (if a building was hit) — this test is best-effort since click coordinates may miss.

#### 3h. Protocol Log
```
browser_click → ref for #console-header (expand protocol log)
browser_snapshot → check #console-output has content
browser_evaluate → document.getElementById('console-output')?.children.length
```
**Check:** child count > 0 (log has entries)

#### 3i. Wire Health Summary
```
browser_evaluate → window.__spoDebug.getState().wire
```
**Check:**
- `sent > 0` (requests were made)
- `received > 0` (responses arrived)
- `errors === 0` (no protocol errors)
- `sent` and `received` are roughly balanced

### Step 4: Stop the Dev Server

After all tests are done, **always** stop the server cleanly:

```bash
# Windows (PowerShell) - kill the node process on port 8080
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process -Force
```

Or use `TaskStop` to terminate the background task started in Step 1.

## Debug Mode (In-Game Overlay)

The renderer has a full-screen debug overlay activated via keyboard keys. **All keys target the game canvas** — make sure the canvas has focus (click on it first) before pressing debug keys.

### Activation

Press `D` to toggle debug mode ON/OFF. Once ON, press number keys to toggle sub-layers:

| Key | Toggle | Default | What it shows |
|-----|--------|---------|---------------|
| `D` | Debug mode | OFF | Master switch — enables all debug drawing |
| `1` | Tile info | ON | Per-tile label: `j,i` coordinates + land class letter (G/M/D/W) |
| `2` | Building info | ON | Building details in mouse-detail panel (bottom-left) |
| `3` | Concrete IDs | ON | Per-tile `$XX` concrete ID hex (cyan=water platform, purple=land) |
| `4` | Water grid | OFF | Color-coded isometric diamond outlines on water concrete tiles |
| `5` | Road info | OFF | Per-tile `R:XX` or `X:XX` (road/bridge + road block ID hex) |

### Verify Debug Mode Programmatically
```
browser_press_key → "d"
browser_evaluate → window.__spoDebug.getState().renderer?.debugMode  // true
browser_press_key → "d"
browser_evaluate → window.__spoDebug.getState().renderer?.debugMode  // false
```

### Debug Key Sequences for Common Scenarios

| Scenario | Keys to press (after `D`) | What to look for |
|----------|---------------------------|------------------|
| **Concrete positioning** | `D`, `4`, `3` | Water grid diamonds + concrete IDs on every tile |
| **Road/bridge classification** | `D`, `5` | `R:` = urban road, `X:` = bridge |
| **Full diagnostic** | `D`, `4`, `5` | Everything: grid + concrete IDs + road IDs + tile coords |
| **Tile-only (land types)** | `D` | Just coordinates + land class |

### Water Grid Color Legend

When toggle `4` (water grid) is active, isometric diamond outlines appear on every water tile that has concrete:

| Color | Meaning | Source pass |
|-------|---------|------------|
| **Green** | Building buffer (+1 tile around buildings) | Pass 1: `rebuildConcreteSet` |
| **Blue** | Junction 3×3 (corners, T-sections, crossroads on water) | Pass 2: `addWaterRoadJunctionConcrete` |
| **Orange** | Road tile sitting on a platform | Road tile within concrete set |

### On-Screen Panels

| Panel | Position | Content |
|-------|----------|---------|
| **Legend** | Top-left | Static — active toggles, color legend, label format |
| **Mouse detail** | Bottom-left (above stats bar) | Live — tile details for tile under cursor |
| **Stats bar** | Bottom-left | Always visible — building/segment/road counts, mouse coords |

## Screenshot Analysis Policy (visual-only debugging)

**Only use screenshots when visual rendering bugs need human inspection.**
For all other verification, use `__spoDebug.getState()` as documented above.

If screenshots are needed for visual debugging:

**MANDATORY: Never load screenshot images directly in the main conversation context.**

Each screenshot costs ~3-5MB and the session limit is ~20MB. Always delegate to a sub-agent:

```
1. Activate debug mode:  browser_press_key("d")  then toggle keys as needed
2. Wait for render:      browser_wait_for(time: 0.5)
3. Save to disk:         browser_take_screenshot(filename: "screenshots/descriptive-name.png")
4. Delegate analysis:    Task(subagent_type: "general-purpose", prompt: "Read screenshots/<name>.png ...")
5. Act on text verdict:  sub-agent returns PASS/FAIL per criterion (~100 bytes)
```

## HTML Selectors Reference

| Element | Selector | Notes |
|---------|----------|-------|
| Username input | `#inp-username` | Text input |
| Password input | `#inp-password` | Password input |
| Connect button | `#btn-connect` | "Connect to Starpeace" |
| Login panel | `#login-panel` | Hidden after company selection |
| World list | `#world-list` | Contains `.world-card` elements |
| Zone tabs | `.zone-tab` | BETA, Free Space, Restricted Space |
| Company section | `#company-section` | Hidden until world selected |
| Company list | `#company-list` | Contains `.company-card` elements |
| Game panel | `#game-panel` | Visible after company selection |
| Game canvas | `#game-canvas` | Isometric renderer canvas (created dynamically) |
| Toolbar container | `#toolbar-container` | In-game toolbar (player stats) |
| Toolbar buttons | `.toolbar-btn` | Individual toolbar action buttons |
| Chat panel | `#chat-panel` | Draggable chat window |
| Building details | `#building-details-panel` | Building inspector panel |
| Build menu | `#build-menu` | Building category/facility picker |
| Settings overlay | `#settings-overlay` | Full-screen settings dialog |
| Mail panel | `.mail-panel` | Mail inbox/compose panel |
| Profile panel | `.profile-panel` | Tycoon profile with tabs |
| Politics panel | `.politics-panel` | Elections/politics panel |
| Transport panel | `.transport-panel` | Train routes panel |
| Search menu | `.search-menu-panel` | Town/tycoon search |
| Minimap canvas | `#minimap-canvas` | Map overview toggle with M key |
| Protocol log | `#console-wrapper` | Collapsed by default, click header to expand |
| Console output | `#console-output` | Wire-level protocol log messages |
| Debug badge | `#e2e-debug-badge` | Shows ↑sent ↓received ✗errors counters |
| Tycoon stats | `[data-type="cash"] .stat-value` | Also: ranking, buildings, income, prestige, area, debt |

## Important Rules

1. **Credentials are sacred:** The test credentials above are LOCKED. Do not change the username, password, server, or company without the developer's explicit written consent.
2. **Always start with login:** Every E2E session begins with the full login flow. No shortcuts.
3. **Always stop the server:** Never leave the dev server running after tests complete.
4. **Prefer `getState()` over screenshots:** Use `browser_evaluate("window.__spoDebug.getState()")` for all verification. Only use screenshots for visual rendering bugs.
5. **Use snapshots for interaction:** Prefer `browser_snapshot` (accessibility tree) for finding and clicking elements.
6. **Wait, don't rush:** Use `browser_wait_for` between steps. The game server connection can take 5-15 seconds per step.
7. **Report failures clearly:** If any step fails, capture `getState()` output, `browser_console_messages`, and report the exact step that failed.
8. **No destructive game actions:** Unless explicitly requested, do not perform irreversible in-game actions (demolishing buildings, spending money, etc.) during tests.
9. **No road/zone tests:** The test account lacks road building and zone overlay permissions — skip these features.
