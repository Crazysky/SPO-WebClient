# CLAUDE.md - Starpeace Online WebClient

## Rules & Constraints

**NEVER do these:**
- Construct RDO protocol strings manually — always use `RdoValue`/`RdoCommand` from `@/shared/rdo-types`
- Use `any` types — use `unknown` for catch blocks, typed interfaces for data
- Modify without reading first — always read existing code before changing it
- Skip tests — all code changes require tests, coverage >= 93%
- Modify these files without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`, `BuildingClasses/facility_db.csv`, `src/__fixtures__/*`
- Load screenshots directly in the main context during debug/E2E sessions — use sub-agent delegation (see below)

**Screenshot analysis (mandatory for debug/E2E sessions):**
Never read screenshot images in the main conversation context — each image costs ~3-5MB and quickly saturates the 20MB session limit. Instead:
1. Save screenshot to disk: `browser_take_screenshot(filename: "descriptive-name.png")`
2. Delegate analysis to a Task sub-agent: `Task(subagent_type: "general-purpose", prompt: "Read <path>.png and check: <specific criteria>. Reply PASS/FAIL per criterion with brief explanation.")`
3. Only the text verdict returns to the main context (~100 bytes vs ~3-5MB per image)

**Critical patterns & gotchas:**
- Test environment is `node` (no jsdom) — mock DOM elements as plain objects
- `FacilityDimensionsCache` is singleton — must `clear()` then `initialize()` in tests
- TerrainLoader i/j swap: `getTextureId(j, i)` — provider uses (i,j), loader expects (x,y)
- Concrete tiles stored as `"${x},${y}"` (col,row) not `"${i},${j}"` (row,col)
- ROAD_TYPE constants are `as const` — use explicit `number` type annotation for local vars
- `worldContextId` = world operations (map focus, queries); `interfaceServerId` = building operations
- WebSocket: Client→Server = `WsReq*` types, Server→Client = `WsResp*` types; use `sendResponse()`/`sendError()`

## Project

**Starpeace Online WebClient** — Browser-based multiplayer tycoon game client
TypeScript + Node.js + WebSocket + Canvas 2D Isometric | RDO protocol | Alpha 0.1.0

```
Browser Client ──WebSocket──> Node.js Gateway ──RDO Protocol──> Game Servers
```

## Commands

```bash
npm run dev          # Build + start server (port 8080)
npm run build        # Build all (server + client)
npm test             # Run Jest tests (~750 tests)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

## Architecture

```
src/
├── client/
│   ├── client.ts                        # Main controller
│   ├── renderer/                        # Canvas 2D isometric engine
│   │   ├── isometric-map-renderer.ts    # Orchestrator (terrain+concrete+roads+buildings+overlays)
│   │   ├── isometric-terrain-renderer.ts # Chunk-based terrain (32×32 tiles, LRU, 4 zoom levels)
│   │   ├── chunk-cache.ts              # OffscreenCanvas chunk pre-rendering
│   │   ├── coordinate-mapper.ts        # Isometric projection + 90° rotation (N/E/S/W)
│   │   ├── vegetation-flat-mapper.ts   # Auto-replaces vegetation near buildings/roads
│   │   ├── touch-handler-2d.ts         # Mobile gestures (pan, pinch, rotation, double-tap)
│   │   ├── texture-cache.ts            # Terrain texture LRU (1024 max)
│   │   ├── texture-atlas-cache.ts      # Terrain atlas PNG+JSON
│   │   ├── game-object-texture-cache.ts # Road/building/concrete textures + object atlases (2048 max)
│   │   ├── road-texture-system.ts      # Road topology + INI loading
│   │   ├── concrete-texture-system.ts  # Concrete logic + INI loading
│   │   └── painter-algorithm.ts        # Back-to-front sort by (i+j)
│   └── ui/                             # UI components (entry: map-navigation-ui.ts)
├── server/
│   ├── server.ts                       # HTTP/WebSocket server + API endpoints
│   ├── spo_session.ts                  # RDO session manager
│   ├── rdo.ts                          # RDO protocol parser
│   ├── texture-alpha-baker.ts          # BMP→PNG alpha pre-baking
│   ├── atlas-generator.ts             # Terrain/object atlas generator
│   ├── terrain-chunk-renderer.ts      # Server-side chunk pre-rendering
│   └── services/                      # Background services (ServiceRegistry)
└── shared/
    ├── rdo-types.ts                   # RDO type system (CRITICAL)
    ├── error-utils.ts                 # toErrorMessage(err: unknown)
    ├── types/                         # Type definitions
    └── building-details/              # Property templates
```

## RDO Protocol

**Always use type-safe classes.** Full API docs: [doc/rdo_typing_system.md](doc/rdo_typing_system.md)

```typescript
import { RdoValue, RdoCommand } from '@/shared/rdo-types';

// Build commands with the builder pattern
const cmd = RdoCommand.sel(objectId)
  .call('RDOSetPrice').push()
  .args(RdoValue.int(priceId), RdoValue.float(value))
  .build();

// Parse responses
const { prefix, value } = RdoParser.extract(token);
```

| Prefix | Type | Example |
|--------|------|---------|
| `#` | Integer | `#42` |
| `%` | String (OLE) | `%Hello` |
| `!` | Float | `!3.14` |
| `@` | Double | `@3.14159` |
| `$` | Short string | `$ID` |
| `^` | Variant | `^value` |
| `*` | Void | `*` |

## Code Style

- TypeScript strict mode, camelCase vars/methods, PascalCase classes/interfaces
- `unknown` for catch blocks + `toErrorMessage(err)` from `@/shared/error-utils`
- JSDoc for public API only, no over-engineering, small focused changes

## Testing

**Convention:** `module.ts` → `module.test.ts` (same directory)

```bash
npm test -- rdo-types              # Specific file
npm test -- --testNamePattern="X"  # Specific suite
```

**Custom matchers:** `toContainRdoCommand()`, `toMatchRdoCallFormat()`, `toMatchRdoSetFormat()`, `toHaveRdoTypePrefix()`

**Current status:** 23 suites, ~750 tests (721 passed, 10 pre-existing failures in building-data-service/cab-extractor, 17 skipped)

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/map-data/:mapName` | Map terrain/building/road data |
| `GET /api/road-block-classes` | Road block class definitions |
| `GET /api/concrete-block-classes` | Concrete block class definitions |
| `GET /api/terrain-info/:terrainType` | Terrain type metadata |
| `GET /api/terrain-atlas/:type/:season` | Terrain atlas PNG |
| `GET /api/terrain-atlas/:type/:season/manifest` | Terrain atlas JSON |
| `GET /api/object-atlas/:category` | Road/concrete atlas PNG |
| `GET /api/object-atlas/:category/manifest` | Road/concrete atlas JSON |
| `GET /api/terrain-chunk/:map/:type/:season/:zoom/:i/:j` | Pre-rendered chunk PNG |
| `GET /api/terrain-chunks/:map/:type/:season/manifest` | Chunk availability manifest |
| `GET /api/terrain-texture/:type/:season/:id` | Individual texture fallback |
| `GET /cache/:category/:filename` | Object texture (prefers pre-baked PNG) |
| `GET /proxy-image?url=<url>` | Image proxy for remote assets |

## E2E Testing

Full procedure, credentials, and selectors: **[doc/E2E-TESTING.md](doc/E2E-TESTING.md)**

Credentials: `Crazz` / `Simcity99` / BETA zone / Shamba world / President of Shamba company
**These credentials are LOCKED — never change without explicit developer approval.**

## Documentation Index

Read the relevant doc when working on a specific system:

| Working on... | Read |
|---------------|------|
| RDO protocol, commands, parsing | [doc/rdo_typing_system.md](doc/rdo_typing_system.md) |
| Building properties (256+ props) | [doc/building_details_protocol.md](doc/building_details_protocol.md) |
| Road rendering | [doc/road_rendering.md](doc/road_rendering.md) |
| Road internals (reverse-engineered) | [doc/road_rendering_reference.md](doc/road_rendering_reference.md) |
| Road texture↔screen mapping | [doc/ROAD-TEXTURE-MAPPING.md](doc/ROAD-TEXTURE-MAPPING.md) |
| Concrete textures | [doc/concrete_rendering.md](doc/concrete_rendering.md) |
| Terrain texture pipeline | [doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md](doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md) |
| CAB extraction | [doc/CAB-EXTRACTION.md](doc/CAB-EXTRACTION.md) |
| E2E testing procedure | [doc/E2E-TESTING.md](doc/E2E-TESTING.md) |
| Project history & backlog | [doc/BACKLOG.md](doc/BACKLOG.md) |
| Raw RDO packet captures | [doc/building_details_rdo.txt](doc/building_details_rdo.txt) |

## Git Conventions

**Branch:** `feature/`, `fix/`, `refactor/`, `doc/` + description
**Commit:** `type: short summary` — types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`

## Services (ServiceRegistry)

| Service | Purpose | Dependencies |
|---------|---------|--------------|
| `update` | Sync game assets | none |
| `facilities` | Building dimensions | update |
| `textures` | Extract CAB textures | update |
| `mapData` | Map data caching | update |
| `terrainChunks` | Server-side chunk pre-rendering | textures, mapData |

## Installed Skills

| Skill | Category | Purpose |
|-------|----------|---------|
| `typescript` | Language | Strict mode, generics, utility types |
| `nodejs-backend` | Backend | Async/await, layered architecture, DI |
| `jest-testing` | Testing | Mocking, coverage, snapshot testing |
| `security-auditor` | Security | OWASP Top 10, XSS/SQLi/CSRF detection |
| `memory-optimization` | Performance | Memory profiling, leak detection |
| `protocol-reverse-engineering` | Protocol | Network protocol analysis (for RDO) |
| `web-performance` | Performance | Core Web Vitals, caching, runtime |
| `git-workflow` | Git | Conventional commits, PR workflows |
| `debugging` | Debugging | Systematic diagnosis, root cause analysis |
| `e2e-testing` | Testing | Playwright patterns, visual regression |
| `refactoring` | Quality | Extract/inline patterns, SOLID |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | `npm install`, Node.js >= 18 |
| Tests fail | `npm run test:verbose` |
| RDO errors | Verify type prefixes (#, %, !, etc.) |
| WebSocket disconnect | Check game server status |
| Port 8080 in use | `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` |
