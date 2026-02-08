# CLAUDE.md - Starpeace Online WebClient

## Project Overview

**Name:** Starpeace Online WebClient
**Type:** Browser-based multiplayer tycoon game client
**Stack:** TypeScript + Node.js + WebSocket + Canvas 2D Isometric
**Protocol:** RDO (Remote Data Objects) - legacy ASCII protocol
**Status:** Alpha (0.1.0)

## Prerequisites

**No external tools required!** All dependencies are npm-managed:

- **7zip-min** - CAB file extraction (bundled with precompiled binaries)
- Installed automatically via `npm install`

See [doc/CAB-EXTRACTION.md](doc/CAB-EXTRACTION.md) for CAB extraction details.

## Essential Commands

```bash
npm run dev          # Build + start server
npm run build        # Build all (server + client)
npm test             # Run Jest tests (~750 tests)
npm run test:watch   # Tests in watch mode
npm run test:verbose # Verbose test output
```

## Architecture

```
Browser Client ──WebSocket──> Node.js Gateway ──RDO Protocol──> Game Servers
```

### Directory Structure

```
src/
├── client/           # Frontend (TypeScript + Canvas 2D)
│   ├── client.ts     # Main controller
│   ├── renderer/     # Canvas 2D isometric rendering engine
│   │   ├── isometric-map-renderer.ts      # Main orchestrator (terrain+concrete+roads+buildings+overlays+previews)
│   │   ├── isometric-terrain-renderer.ts  # Terrain rendering with ChunkCache + TextureCache
│   │   ├── chunk-cache.ts                 # OffscreenCanvas chunk pre-rendering (32×32 tiles), LRU
│   │   ├── coordinate-mapper.ts           # Isometric projection with 90° rotation (N/E/S/W)
│   │   ├── vegetation-flat-mapper.ts      # Auto-replaces vegetation near buildings/roads
│   │   ├── touch-handler-2d.ts            # Mobile touch gestures (pan, pinch, rotation, double-tap)
│   │   ├── texture-cache.ts               # Individual terrain texture loading + LRU cache
│   │   ├── texture-atlas-cache.ts         # Terrain texture atlas (single PNG + JSON manifest)
│   │   ├── game-object-texture-cache.ts   # Cache for road/building/concrete textures + object atlases
│   │   ├── road-texture-system.ts         # Road topology + INI loading
│   │   ├── concrete-texture-system.ts     # Concrete logic + INI loading
│   │   ├── painter-algorithm.ts           # Back-to-front sort by (i+j)
│   │   └── terrain-loader.ts              # BMP terrain parser
│   └── ui/           # UI components
├── server/           # Gateway server
│   ├── server.ts     # HTTP/WebSocket server + atlas API endpoints
│   ├── spo_session.ts # RDO session manager
│   ├── rdo.ts        # RDO protocol parser
│   ├── texture-alpha-baker.ts # BMP→PNG alpha pre-baking (no external deps)
│   ├── atlas-generator.ts    # Terrain/object texture atlas generator
│   ├── terrain-chunk-renderer.ts # Server-side terrain chunk pre-rendering
│   └── services/     # Background services
└── shared/           # Shared code
    ├── rdo-types.ts  # RDO type system (CRITICAL)
    ├── error-utils.ts # Safe error message extraction (unknown catch types)
    ├── types/        # Type definitions
    └── building-details/ # Property templates
```

## Renderer Architecture

**Active renderer:** Canvas 2D isometric (sole renderer)

The renderer is initialized in [src/client/ui/map-navigation-ui.ts](src/client/ui/map-navigation-ui.ts) via `IsometricMapRenderer`.

### Canvas 2D Isometric Renderer

- **Orchestrator:** [isometric-map-renderer.ts](src/client/renderer/isometric-map-renderer.ts) - layered rendering (terrain, concrete, roads, buildings, overlays, previews)
- **Terrain:** Chunk-based pre-rendering (32x32 tiles) with LRU cache, 4 zoom levels, atlas-accelerated
- **Texture pipeline:** Server-side BMP→PNG alpha pre-baking + texture atlases (terrain, road, concrete)
- **Vegetation mapping:** Auto-replaces vegetation textures with flat center near buildings/roads (2-tile buffer)
- **90° snap rotation:** 4 views (N/E/S/W) via Q/E keys or 2-finger gesture
- **Mobile touch:** 1-finger pan, 2-finger pinch zoom, 2-finger rotation snap, double-tap center
- **Camera controls:** Pan, zoom (4 levels), edge-of-screen scrolling
- **Building placement preview** with collision detection and tooltips
- **Road drawing preview** with staircase algorithm and validation
- **Zone overlay rendering** (7 zone types with transparency)

**Key algorithms:**
- `VegetationFlatMapper`: `flatLandId = landId & 0xC0` (keeps LandClass, zeros LandType+LandVar)
- `CoordinateMapper`: Isometric projection with `rotateMapCoordinates()` around map center
- Chunk rendering for NORTH rotation; tile-by-tile via CoordinateMapper for E/S/W

**Performance:** 60 FPS on 1000x1000 maps with chunk caching

### Texture Pipeline (Server → Client)

1. **Extraction:** CAB archives → BMP files (texture-extractor.ts)
2. **Alpha baking:** BMP + color key → PNG with alpha channel (texture-alpha-baker.ts, index v3)
3. **Atlas generation:** ~256 PNGs → 1 atlas PNG + 1 JSON manifest per terrain type/season (atlas-generator.ts)
4. **Object atlases:** Road (~60 textures) and concrete (~22 textures) packed into separate atlases
5. **Client rendering:** `ctx.drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh)` — hardware-accelerated

**API endpoints:**
- `GET /api/map-data/:mapName` — map terrain/building/road data
- `GET /api/road-block-classes` — road block class definitions
- `GET /api/concrete-block-classes` — concrete block class definitions
- `GET /api/terrain-info/:terrainType` — terrain type metadata
- `GET /api/terrain-atlas/:terrainType/:season` — terrain atlas PNG
- `GET /api/terrain-atlas/:terrainType/:season/manifest` — terrain atlas JSON
- `GET /api/object-atlas/:category` — road/concrete atlas PNG
- `GET /api/object-atlas/:category/manifest` — road/concrete atlas JSON
- `GET /api/terrain-chunk/:mapName/:terrainType/:season/:zoom/:chunkI/:chunkJ` — pre-rendered terrain chunk PNG
- `GET /api/terrain-chunks/:mapName/:terrainType/:season/manifest` — terrain chunk availability manifest
- `GET /api/terrain-texture/:terrainType/:season/:id` — individual texture fallback
- `GET /cache/:category/:filename` — individual object texture fallback (prefers pre-baked PNG)
- `GET /proxy-image?url=<encoded_url>` — image proxy for remote assets

**Cache sizes:** TextureCache 1024, GameObjectTextureCache 2048, ChunkCache 96 chunks/zoom

## RDO Protocol Type System (CRITICAL)

**Always use type-safe classes. Never construct RDO strings manually.**

```typescript
import { RdoValue, RdoCommand } from '@/shared/rdo-types';

// CORRECT - Type-safe
const cmd = RdoCommand.sel(objectId)
  .call('RDOSetPrice')
  .push()
  .args(RdoValue.int(priceId), RdoValue.float(value))
  .build();

// FORBIDDEN - Manual string
const cmd = `SEL ${objectId}*CALL %RDOSetPrice^PUSH^#${priceId}*!${value}`;
```

**RDO Type Prefixes:**
| Prefix | Type | Example |
|--------|------|---------|
| `#` | Integer (OrdinalId) | `#42` |
| `%` | String (OLEStringId) | `%Hello` |
| `!` | Float (SingleId) | `!3.14` |
| `@` | Double (DoubleId) | `@3.14159` |
| `$` | Short string (StringId) | `$ID` |
| `^` | Variant (VariantId) | `^value` |
| `*` | Void (VoidId) | `*` |

## Testing

**Policy: All code changes require tests. Coverage must stay >= 93%.**

### Commands

```bash
npm test                              # Run all tests
npm run test:watch                    # Watch mode
npm run test:coverage                 # Generate coverage report
npm test -- --clearCache              # Clear Jest cache
npm test -- rdo-types                 # Run specific test file
npm test -- --testNamePattern="RdoValue"  # Run specific suite
```

### Test Structure

```
src/
├── shared/
│   ├── rdo-types.test.ts                    # 85 tests - RDO type system
│   └── building-details/
│       └── property-definitions.test.ts     # 70 tests - Property formatting
├── server/
│   ├── rdo.test.ts                          # 59 tests - RDO protocol parser
│   ├── facility-csv-parser.test.ts          # 18 tests - CSV parsing
│   ├── texture-alpha-baker.test.ts          # 33 tests - BMP→PNG alpha baking
│   ├── atlas-generator.test.ts              # 12 tests - Texture atlas generation
│   ├── terrain-chunk-renderer.test.ts       # Server-side chunk rendering
│   └── __tests__/rdo/
│       ├── building-operations.test.ts      # 30 tests - Building operations
│       ├── login-flow.test.ts               # Login flow integration
│       └── company-session.test.ts          # Company session integration
├── client/renderer/
│   ├── *.test.ts                            # 153 tests - Road/concrete/terrain rendering
│   ├── coordinate-mapper.test.ts            # 40 tests - Isometric projection + rotation
│   ├── vegetation-flat-mapper.test.ts       # 28 tests - Vegetation→flat mapping
│   ├── touch-handler-2d.test.ts             # 11 tests - Mobile touch gestures
│   ├── texture-cache.test.ts                # 22 tests - Terrain texture cache
│   ├── texture-atlas-cache.test.ts          # 18 tests - Terrain atlas cache
│   └── game-object-texture-cache.test.ts    # 31 tests - Game object texture + atlas cache
└── __fixtures__/                            # Test data (CSV, RDO packets)
```

### Writing Tests

**File convention:** `module.ts` -> `module.test.ts` (same directory)

```typescript
import { describe, it, expect } from '@jest/globals';
import { MockRdoSession } from '@/server/__mocks__/mock-rdo-session';

describe('Feature', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  it('should format command correctly', async () => {
    const cmd = await mockSession.simulateCommand(arg);
    expect(cmd).toMatchRdoCallFormat('MethodName');
  });
});
```

### Custom Jest Matchers

- `toContainRdoCommand(method, args?)` - Check RDO command presence
- `toMatchRdoCallFormat(method)` - Validate CALL format
- `toMatchRdoSetFormat(property)` - Validate SET format
- `toHaveRdoTypePrefix(prefix)` - Check type prefix

### Best Practices

1. **Test behavior, not implementation**
2. **Test edge cases** - Empty strings, null, undefined, NaN, negatives
3. **Test roundtrips** - format -> parse -> compare
4. **Mock external deps** - Use `jest.mock()` for fs, network

## Code Style

- **TypeScript strict mode** enabled
- **Naming:** camelCase (variables/methods), PascalCase (classes/interfaces)
- **Minimize `any` types** - use `unknown` for catch blocks, typed interfaces for data
- **Error handling:** try-catch for async, logs with context
- **Comments:** JSDoc for public API only

## Development Rules

1. **Read before modify** - Always read existing code first
2. **Small focused changes** - One feature/fix at a time
3. **Tests required** - All new code needs tests
4. **Run tests before commit** - `npm test` must pass
5. **No breaking changes** - Without explicit approval
6. **No over-engineering** - Keep solutions simple

## Key Session Concepts

- `worldContextId` - ID for world operations (map focus, queries)
- `interfaceServerId` - ID for building operations

## WebSocket Message Types

- Client -> Server: `WsReq*` types
- Server -> Client: `WsResp*` types
- Use `sendResponse()`, `sendError()` from handler-utils

## Files Never Modify Without Discussion

- `src/shared/rdo-types.ts` - Core RDO type system
- `src/server/rdo.ts` - RDO protocol parser
- `BuildingClasses/facility_db.csv` - Building database
- `src/__fixtures__/*` - Test fixtures

## Git Conventions

### Branch Naming

- `feature/description` - New features
- `fix/issue` - Bug fixes
- `refactor/area` - Refactoring
- `doc/topic` - Documentation

### Commit Format

```
type: short summary (max 72 chars)

Optional detailed description
- Bullet points
- Reference issues (#123)
```

**Types:** `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`

## Services (ServiceRegistry)

| Service | Purpose | Dependencies |
|---------|---------|--------------|
| `update` | Sync game assets | none |
| `facilities` | Building dimensions | update |
| `textures` | Extract CAB textures | update |
| `mapData` | Map data caching | update |
| `terrainChunks` | Server-side terrain chunk pre-rendering | textures, mapData |

## Documentation

| Document | Purpose |
|----------|---------|
| [doc/BACKLOG.md](doc/BACKLOG.md) | Feature backlog & project status |
| [doc/rdo_typing_system.md](doc/rdo_typing_system.md) | RDO type system (RdoValue, RdoParser, RdoCommand) |
| [doc/building_details_protocol.md](doc/building_details_protocol.md) | Building details RDO protocol |
| [doc/road_rendering.md](doc/road_rendering.md) | Road rendering API & overview |
| [doc/road_rendering_reference.md](doc/road_rendering_reference.md) | Road rendering technical reference (reverse-engineered) |
| [doc/concrete_rendering.md](doc/concrete_rendering.md) | Concrete texture system & water platforms |
| [doc/ROAD-TEXTURE-MAPPING.md](doc/ROAD-TEXTURE-MAPPING.md) | Road texture mapping reference |
| [doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md](doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md) | Canvas2D texture selection algorithm analysis |
| [doc/CAB-EXTRACTION.md](doc/CAB-EXTRACTION.md) | CAB file extraction system & texture caching |

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check `npm install`, Node.js >= 18 |
| Tests fail | Run `npm run test:verbose` |
| RDO errors | Verify type prefixes (#, %, !, etc.) |
| WebSocket disconnect | Check game server status |
| Port 8080 already in use | Kill process: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` (PowerShell) |

## Current Test Status

- **Test Suites:** 23 total (21 passed, 2 pre-existing failures)
- **Tests:** ~750 total (721 passed, 10 failed pre-existing, 17 skipped)
- **Pre-existing failures:** building-data-service, cab-extractor (legacy data format issues)
- **Skipped tests:** 17 in facility-csv-parser.test.ts (backlog edge cases)
- **Threshold:** 60% minimum

## E2E Testing with Playwright MCP

**Tool:** Playwright MCP (browser automation via `mcp__playwright__*` tools)
**Purpose:** Automated functional testing of the live game client in a real browser

### MANDATORY Test Credentials (DO NOT CHANGE)

> **These credentials MUST be used for ALL E2E tests. NEVER modify, skip, or substitute them without EXPLICIT developer approval.**

| Field | Value |
|-------|-------|
| **Username** | `Crazz` |
| **Password** | `Simcity99` |
| **Server zone** | `BETA` |
| **World** | `Shamba` |
| **Company** | `President of Shamba` |

### E2E Test Procedure

Every E2E test session follows this lifecycle: **Start server → Run tests → Stop server**.

#### Step 1: Start the Dev Server

```bash
npm run dev   # Builds (server + client) then starts on port 8080
```

- Run this command **in the background** (`run_in_background: true`) so it doesn't block the test session.
- Wait for the server to be ready by checking that `http://localhost:8080` is reachable (use `browser_navigate` or poll with a short delay).
- If port 8080 is already in use, stop the existing process first (see Troubleshooting).

#### Step 2: Login Scenario (MANDATORY — always run first)

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

#### Step 3: Post-Login Tests (optional, context-dependent)

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

#### Step 4: Stop the Dev Server

After all tests are done, **always** stop the server cleanly:

```bash
# Windows (PowerShell) - kill the node process on port 8080
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process -Force
```

Or use `TaskStop` to terminate the background task started in Step 1.

### HTML Selectors Reference

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

### Important Rules

1. **Credentials are sacred:** The test credentials above are LOCKED. Do not change the username, password, server, or company without the developer's explicit written consent.
2. **Always start with login:** Every E2E session begins with the full login flow. No shortcuts.
3. **Always stop the server:** Never leave the dev server running after tests complete.
4. **Use snapshots over screenshots:** Prefer `browser_snapshot` (accessibility tree) for interacting with elements. Use `browser_take_screenshot` only for visual verification.
5. **Wait, don't rush:** Use `browser_wait_for` between steps. The game server connection can take 5-15 seconds per step.
6. **Report failures clearly:** If any step fails, take a screenshot, capture console messages (`browser_console_messages`), and report the exact step that failed.
7. **No destructive game actions:** Unless explicitly requested, do not perform irreversible in-game actions (demolishing buildings, spending money, etc.) during tests.

## Skills (SkillsMP)

Curated skills installed in `.claude/skills/`. Source: [skillsmp.com](https://skillsmp.com/)

### Installed Skills

| Skill | Source Repo (GitHub) | Stars | Category | Why |
|-------|---------------------|-------|----------|-----|
| `typescript` | cosmix/loom | 19 | Language | Core language — strict mode, generics, utility types, branded types, discriminated unions |
| `nodejs-backend` | blencorp/claude-code-kit | 60 | Backend | Node.js async/await patterns, layered architecture, error handling, DI |
| `jest-testing` | bobmatnyc/claude-mpm-skills | 11 | Testing | Jest + TypeScript — mocking, coverage, snapshot testing, async patterns |
| `security-auditor` | alirezarezvani/claude-code-tresor | 499 | Security | OWASP Top 10 scanning, XSS/SQLi/CSRF detection, secrets exposure |
| `memory-optimization` | aj-geddes/useful-ai-prompts | 60 | Performance | Memory profiling, leak detection, object pooling, GC optimization |
| `protocol-reverse-engineering` | wshobson/agents | 28011 | Protocol | Network protocol analysis, packet dissection, custom protocol docs (for RDO) |
| `web-performance` | davila7/claude-code-templates | 19653 | Performance | Core Web Vitals, bundle size, caching strategies, runtime optimization |
| `git-workflow` | Galaxy-Dawn/claude-scholar | 126 | Git | Conventional commits, branching strategies, PR workflows, merge conflicts |
| `debugging` | cosmix/loom | 19 | Debugging | Systematic bug diagnosis, git bisect, flaky test debugging, root cause analysis |
| `e2e-testing` | cosmix/loom | 19 | Testing | Playwright patterns, Page Object Model, visual regression, async handling |
| `refactoring` | cosmix/loom | 19 | Quality | Code restructuring, extract/inline patterns, SOLID principles, safe refactoring workflow |

### Skills Management

**MCP Server:** SkillsMP is configured in `~/.claude.json` (API key required).

```bash
# Search skills via MCP (available in Claude Code sessions)
# Tools: skillsmp_search_skills, skillsmp_ai_search_skills, skillsmp_install_and_read_skill

# Manual install (single skill from a repo):
curl -sL "https://raw.githubusercontent.com/OWNER/REPO/main/PATH/SKILL.md" \
  -o .claude/skills/SKILL_NAME/SKILL.md

# WARNING: The SkillsMP install tool installs ALL skills from a repo.
# For repos with many skills, use curl to download individual SKILL.md files.
```

**Adding a skill:**
1. Search on [skillsmp.com](https://skillsmp.com/) or via MCP `skillsmp_ai_search_skills`
2. Create directory: `mkdir .claude/skills/<name>`
3. Download: `curl -sL <raw-github-url> -o .claude/skills/<name>/SKILL.md`
4. Update this table

**Removing a skill:**
1. Delete directory: `rm -rf .claude/skills/<name>`
2. Remove from this table

**Selection criteria:** Only skills directly relevant to this project's stack (TypeScript, Node.js, Canvas 2D, WebSocket, Jest, RDO protocol). No framework-specific skills (React, Vue, Angular, etc.) unless the project adopts them.
