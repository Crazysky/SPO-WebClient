# CLAUDE.md - Starpeace Online WebClient

## Project Overview

**Name:** Starpeace Online WebClient
**Type:** Browser-based multiplayer tycoon game client
**Stack:** TypeScript + Node.js + WebSocket + Canvas2D/Three.js (WebGL)
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
npm test             # Run Jest tests (414 tests, 93% coverage)
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
├── client/           # Frontend (TypeScript + Canvas)
│   ├── client.ts     # Main controller
│   ├── renderer/     # Isometric rendering engine
│   │   ├── isometric-map-renderer.ts      # Canvas2D renderer (legacy)
│   │   └── three/                         # Three.js renderer (WebGL)
│   │       ├── IsometricThreeRenderer.ts  # Main renderer
│   │       ├── TerrainChunkManager.ts     # Terrain batching
│   │       ├── BuildingRenderer.ts        # Sprite-based buildings
│   │       ├── RoadRenderer.ts            # Road segment rendering
│   │       ├── ConcreteRenderer.ts        # Concrete platforms
│   │       ├── PreviewManager.ts          # Placement/zone previews
│   │       └── TextureAtlasManager.ts     # GPU texture atlases
│   └── ui/           # UI components
├── server/           # Gateway server
│   ├── server.ts     # HTTP/WebSocket server
│   ├── spo_session.ts # RDO session manager
│   ├── rdo.ts        # RDO protocol parser
│   └── services/     # Background services
└── shared/           # Shared code
    ├── rdo-types.ts  # RDO type system (CRITICAL)
    ├── types/        # Type definitions
    └── building-details/ # Property templates
```

## Renderer Architecture

**Three renderers available:** PixiJS (default), Canvas2D (legacy), and Three.js

Switch renderer in [src/client/ui/map-navigation-ui.ts](src/client/ui/map-navigation-ui.ts):
```typescript
// In MapNavigationUI constructor
new MapNavigationUI(gamePanel, 'pixi');   // PixiJS (default)
new MapNavigationUI(gamePanel, 'canvas'); // Canvas2D (legacy)
```

### PixiJS Renderer (Default - WebGL)
- **Files:** [src/client/renderer/pixi/](src/client/renderer/pixi/)
- GPU-accelerated via PixiJS v8 WebGL
- Batched draw calls for optimal performance
- Efficient texture atlasing
- Mobile-optimized rendering
- **Current default renderer**

### Canvas2D Renderer (Legacy)
- **File:** [isometric-map-renderer.ts](src/client/renderer/isometric-map-renderer.ts)
- CPU-based rendering with 2D canvas
- Chunk-based terrain caching
- Full feature parity (placement, roads, zones, overlays)
- Stable, well-tested fallback

### Three.js Renderer (WebGL)
- **File:** [IsometricThreeRenderer.ts](src/client/renderer/three/IsometricThreeRenderer.ts)
- GPU-accelerated via WebGL
- Batched geometry for terrain chunks
- Sprite-based building rendering
- RenderOrder-based painter's algorithm (no per-frame sorting)
- **Season auto-detection** - Automatically switches to available seasons for terrain types

**Common Features (all renderers):**
- Terrain chunk rendering with texture atlases
- Building placement preview (collision detection, tooltips)
- Road drawing preview (staircase algorithm, validation)
- Zone overlay rendering (7 zone types with transparency)
- Camera controls (pan, zoom, edge-of-screen scrolling)

**Performance:** 60 FPS on 1000×1000 maps with 4000+ terrain tiles visible

See [doc/ENGINE_MIGRATION_SPEC.md](doc/ENGINE_MIGRATION_SPEC.md) for PixiJS implementation details.

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

## PixiJS Renderer Status (February 2026)

**Status:** Default renderer, actively developed

**Completed Features:**
- ✅ Terrain chunk rendering with texture atlases
- ✅ Building sprites with automatic scaling
- ✅ Road segment rendering
- ✅ Concrete platform rendering
- ✅ Building placement preview (collision detection)
- ✅ Road drawing preview (staircase algorithm, validation)
- ✅ Zone overlay rendering
- ✅ Camera controls (pan, zoom, edge scrolling)
- ✅ Season auto-detection for terrain types
- ✅ Painter's algorithm via inverted zIndex (higher i+j = lower zIndex = drawn first)

**Performance:**
- 60 FPS on 1000×1000 maps
- GPU-accelerated batched rendering via PixiJS v8
- Efficient sprite pooling and texture atlasing

## Three.js Renderer Status (January 2026)

**Status:** Feature-complete, alternative renderer

**Completed Features:**
- ✅ Terrain chunk rendering with texture atlases
- ✅ Building sprites with automatic scaling
- ✅ Road segment rendering with texture selection
- ✅ Concrete platform rendering
- ✅ Building placement preview (collision detection, tooltips)
- ✅ Road drawing preview (staircase algorithm, validation)
- ✅ Zone overlay rendering (7 zone types)
- ✅ Camera controls (pan, zoom, edge scrolling)
- ✅ Season auto-detection for terrain types
- ✅ Painter's algorithm via renderOrder (no sorting)

**Performance:**
- 60 FPS on 1000×1000 maps
- GPU-accelerated batched rendering
- Efficient texture atlases (1024×512px per season)

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
│   └── __tests__/rdo/
│       └── building-operations.test.ts      # 30 tests - Building operations
├── client/renderer/
│   └── *.test.ts                            # 153 tests - Road rendering system
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
| [doc/ENGINE_MIGRATION_SPEC.md](doc/ENGINE_MIGRATION_SPEC.md) | PixiJS WebGL renderer (NEW - replaces Canvas) |
| [doc/rdo_typing_system.md](doc/rdo_typing_system.md) | RDO type system (RdoValue, RdoParser, RdoCommand) |
| [doc/building_details_protocol.md](doc/building_details_protocol.md) | Building details RDO protocol |
| [doc/road_rendering.md](doc/road_rendering.md) | Road rendering API & overview |
| [doc/road_rendering_reference.md](doc/road_rendering_reference.md) | Road rendering technical reference (reverse-engineered) |
| [doc/concrete_rendering.md](doc/concrete_rendering.md) | Concrete texture system & water platforms |
| [doc/THREE-JS-PREVIEW-IMPLEMENTATION.md](doc/THREE-JS-PREVIEW-IMPLEMENTATION.md) | Three.js preview features (placement, roads, zones) |
| [doc/SWITCHING-RENDERERS.md](doc/SWITCHING-RENDERERS.md) | How to switch between Canvas2D and Three.js renderers |
| [doc/SOLUTION-TEXTURES-SEASON.md](doc/SOLUTION-TEXTURES-SEASON.md) | Season auto-detection fix for Three.js texture loading |
| [doc/FIX-TERRAIN-DEPTH-RENDERING.md](doc/FIX-TERRAIN-DEPTH-RENDERING.md) | Depth buffer & renderOrder fixes for proper layering |
| [doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md](doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md) | Complete analysis of Canvas2D texture selection algorithm |
| [doc/CAB-EXTRACTION.md](doc/CAB-EXTRACTION.md) | CAB file extraction system & texture caching |
| [src/client/renderer/painter-algorithm.ts](src/client/renderer/painter-algorithm.ts) | Painter's algorithm rule: higher (i+j) = draw first |

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check `npm install`, Node.js >= 18 |
| Tests fail | Run `npm run test:verbose` |
| RDO errors | Verify type prefixes (#, %, !, etc.) |
| WebSocket disconnect | Check game server status |
| Textures show as colored tiles (Three.js) | Season mismatch - see [SOLUTION-TEXTURES-SEASON.md](doc/SOLUTION-TEXTURES-SEASON.md) |
| Roads/concrete not visible (Three.js) | Depth buffer issue - see [FIX-TERRAIN-DEPTH-RENDERING.md](doc/FIX-TERRAIN-DEPTH-RENDERING.md) |
| Terrain not rendering (Three.js) | Check browser console for WebGL errors, try Canvas2D renderer |
| Sprites overlap incorrectly (PixiJS) | Painter's algorithm uses inverted sortKey - see [painter-algorithm.ts](src/client/renderer/painter-algorithm.ts) |
| Port 8080 already in use | Kill process: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` (PowerShell) |

## Current Test Status

- **Test Suites:** 14 passed
- **Tests:** 497 total (479 passing, 18 skipped)
- **Coverage:** 93%
- **Threshold:** 60% minimum (tracking higher)
