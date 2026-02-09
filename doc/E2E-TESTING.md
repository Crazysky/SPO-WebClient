# E2E Testing with Playwright MCP

**Tool:** Playwright MCP (browser automation via `mcp__playwright__*` tools)
**Purpose:** Automated functional testing of the live game client in a real browser

## MANDATORY Test Credentials (DO NOT CHANGE)

> **These credentials MUST be used for ALL E2E tests. NEVER modify, skip, or substitute them without EXPLICIT developer approval.**

| Field | Value |
|-------|-------|
| **Username** | `Crazz` |
| **Password** | `Simcity99` |
| **Server zone** | `BETA` |
| **World** | `Shamba` |
| **Company** | `President of Shamba` |

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
browser_type → ref for #inp-username, text: "Crazz"
browser_type → ref for #inp-password, text: "Simcity99"
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

**2e. Verify map loaded**
```
browser_wait_for → textGone: "Select Company" (login panel disappears)
browser_snapshot → verify #game-panel is visible, toolbar shows "Crazz"
```

**Validation criteria:**
- The toolbar in the header should display the player name "Crazz"
- The isometric map canvas should be visible in `#game-panel`
- The `#login-panel` should be hidden
- Take a screenshot (`browser_take_screenshot`) for visual confirmation

### Step 3: Post-Login Tests (optional, context-dependent)

After successful login, run any relevant tests based on the current task. Examples:

| Test | How to verify |
|------|---------------|
| **Map rendering** | Screenshot the map, verify canvas is drawn (non-blank) |
| **Zoom** | Use `browser_press_key` with `+`/`-` or mouse wheel, screenshot before/after |
| **Rotation** | Press `Q` or `E` key, verify map orientation changes via screenshot |
| **Chat** | Type in the chat input (`#chat-input` or equivalent), verify message appears |
| **Toolbar** | Snapshot the toolbar, verify player stats (money, population, etc.) are displayed |
| **Building panel** | Click toolbar buttons, verify panels open/close |
| **Road drawing** | If road UI is present, test click-and-drag on map |
| **Console log** | Click "Protocol Log" header to expand, check for RDO errors |
| **Responsive** | Use `browser_resize` to test different viewport sizes |

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

### Debug Key Sequences for Common Scenarios

| Scenario | Keys to press (after `D`) | What to look for |
|----------|---------------------------|------------------|
| **Concrete positioning** | `D`, `4`, `3` | Water grid diamonds + concrete IDs on every tile |
| **Road/bridge classification** | `D`, `5` | `R:` = urban road, `X:` = bridge. Check water tiles specifically |
| **Full diagnostic** | `D`, `4`, `5` | Everything: grid + concrete IDs + road IDs + tile coords |
| **Tile-only (land types)** | `D` | Just coordinates + land class. Disable `3` if concrete clutter |
| **Clean screenshot (no labels)** | `D`, `1` off, `3` off | Only water grid diamonds, no text labels |

### Water Grid Color Legend

When toggle `4` (water grid) is active, isometric diamond outlines appear on every water tile that has concrete:

| Color | Meaning | Source pass |
|-------|---------|------------|
| **Green** | Building buffer (+1 tile around buildings) | Pass 1: `rebuildConcreteSet` |
| **Blue** | Junction 3×3 (corners, T-sections, crossroads on water) | Pass 2: `addWaterRoadJunctionConcrete` |
| **Orange** | Road tile sitting on a platform | Road tile within concrete set |

Labels inside diamonds: `j,i` coordinates, `$XX` concrete ID, `R`=road on platform / `X`=bridge (red).

### On-Screen Panels

| Panel | Position | Content |
|-------|----------|---------|
| **Legend** | Top-left | Static — active toggles, color legend, label format. Readable in any screenshot. |
| **Mouse detail** | Bottom-left (above stats bar) | Live — tile details for tile under cursor. Useful for interactive debugging. |
| **Stats bar** | Bottom-left | Always visible — building/segment/road counts, mouse coords. |

## Screenshot Analysis Policy

**MANDATORY: Never load screenshot images directly in the main conversation context.**

Each screenshot costs ~3-5MB and the session limit is ~20MB. Always delegate to a sub-agent.

### Protocol

```
1. Activate debug mode:  browser_press_key("d")  then toggle keys as needed
2. Wait for render:      browser_wait_for(time: 0.5)
3. Save to disk:         browser_take_screenshot(filename: "descriptive-name.png")
4. Delegate analysis:    Task(subagent_type: "general-purpose", prompt: "...")
5. Act on text verdict:  sub-agent returns PASS/FAIL per criterion (~100 bytes)
```

### Sub-Agent Prompt Template

When spawning a screenshot analysis sub-agent, use this template. Adapt the criteria list to the specific debug scenario.

```
Read the screenshot at <absolute-path>.png.

This is a Starpeace Online isometric game map with debug overlay enabled.
The debug overlay shows:
- Top-left legend panel (black background): active toggle states and color key
- Per-tile labels on the map: "j,i" coordinates, "$XX" concrete IDs, "R:XX"/"X:XX" road IDs
- [If water grid active]: Color-coded diamond outlines on water tiles:
  Green=building buffer, Blue=junction, Orange=road on platform

Check the following criteria and reply PASS or FAIL for each, with a brief explanation:
1. <criterion 1>
2. <criterion 2>
...
```

### Example Prompts for Common Scenarios

**Concrete positioning on water:**
```
Read the screenshot at C:\...\concrete-debug.png.
Debug overlay is active with water grid (toggle 4) and concrete IDs (toggle 3).
Diamond outlines: Green=building, Blue=junction, Orange=road.

Check:
1. Are concrete platform diamonds ($80-$88) aligned with the road tiles? (no half-tile offset)
2. Do junction tiles (blue diamonds) form a 3x3 box around road intersections?
3. Are bridge tiles (red "X" label) free of concrete diamonds?
4. Do bridge tiles (X label, no diamond) have NO concrete underneath?
```

**Road rendering on water:**
```
Read the screenshot at C:\...\road-debug.png.
Debug overlay is active with road info (toggle 5).
Labels: "R:XX" = urban road on platform, "X:XX" = bridge, red = bridge.

Check:
1. Do straight road segments on water show "X:" (bridge) labels?
2. Do junction tiles (corners/T/cross) show "R:" (urban road) labels?
3. Are bridge textures visually different from urban road textures?
4. Is there a visible concrete platform under junction road tiles?
```

**General rendering verification:**
```
Read the screenshot at C:\...\render-check.png.
This is the game map without debug overlay.

Check:
1. Is the isometric map rendered (not blank canvas)?
2. Are buildings visible and not floating/clipped?
3. Are roads visible connecting buildings?
4. Is there visible water with appropriate textures?
```

### Step 4: Stop the Dev Server

After all tests are done, **always** stop the server cleanly:

```bash
# Windows (PowerShell) - kill the node process on port 8080
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process -Force
```

Or use `TaskStop` to terminate the background task started in Step 1.

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
| Toolbar container | `#toolbar-container` | In-game toolbar (player stats) |
| Protocol log | `#console-wrapper` | Collapsed by default, click header to expand |
| Console output | `#console-output` | RDO protocol log messages |

## Important Rules

1. **Credentials are sacred:** The test credentials above are LOCKED. Do not change the username, password, server, or company without the developer's explicit written consent.
2. **Always start with login:** Every E2E session begins with the full login flow. No shortcuts.
3. **Always stop the server:** Never leave the dev server running after tests complete.
4. **Use snapshots over screenshots:** Prefer `browser_snapshot` (accessibility tree) for interacting with elements. Use `browser_take_screenshot` only for visual verification.
5. **Wait, don't rush:** Use `browser_wait_for` between steps. The game server connection can take 5-15 seconds per step.
6. **Report failures clearly:** If any step fails, take a screenshot, capture console messages (`browser_console_messages`), and report the exact step that failed.
7. **No destructive game actions:** Unless explicitly requested, do not perform irreversible in-game actions (demolishing buildings, spending money, etc.) during tests.
