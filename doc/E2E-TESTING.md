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
