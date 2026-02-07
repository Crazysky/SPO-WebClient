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
npm test             # Run Jest tests (788 tests)
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
│   └── services/     # Background services
└── shared/           # Shared code
    ├── rdo-types.ts  # RDO type system (CRITICAL)
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
- `GET /api/terrain-atlas/:terrainType/:season` — terrain atlas PNG
- `GET /api/terrain-atlas/:terrainType/:season/manifest` — terrain atlas JSON
- `GET /api/object-atlas/:category` — road/concrete atlas PNG
- `GET /api/object-atlas/:category/manifest` — road/concrete atlas JSON
- `GET /api/terrain-texture/:terrainType/:season/:id` — individual texture fallback
- `GET /cache/:category/:filename` — individual object texture fallback (prefers pre-baked PNG)

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
│   └── __tests__/rdo/
│       └── building-operations.test.ts      # 30 tests - Building operations
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
- **No `any` types** - project has 0 `any` types
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

## Documentation

| Document | Purpose |
|----------|---------|
| [doc/BACKLOG.md](doc/BACKLOG.md) | Feature backlog & project status |
| [doc/rdo_typing_system.md](doc/rdo_typing_system.md) | RDO type system (RdoValue, RdoParser, RdoCommand) |
| [doc/building_details_protocol.md](doc/building_details_protocol.md) | Building details RDO protocol |
| [doc/road_rendering.md](doc/road_rendering.md) | Road rendering API & overview |
| [doc/road_rendering_reference.md](doc/road_rendering_reference.md) | Road rendering technical reference (reverse-engineered) |
| [doc/concrete_rendering.md](doc/concrete_rendering.md) | Concrete texture system & water platforms |
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

- **Test Suites:** 21 total (19 passed, 2 pre-existing failures)
- **Tests:** 668 passed, 10 failed (pre-existing), 17 skipped
- **Pre-existing failures:** building-data-service, cab-extractor
- **Threshold:** 60% minimum
