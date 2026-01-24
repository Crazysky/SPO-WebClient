# Road Rendering System

Complete road rendering with topology detection, surface analysis, and automatic texture mapping.

## Architecture

```
RoadRendererSystem (Main Entry Point)
├── RoadGrid (Road tile storage + neighbor lookups)
├── RoadTerrainData (Water + Concrete grids)
├── RoadTopologyAnalyzer (16 topology types + state transitions)
├── RoadSurfaceDetector (11 surface types)
└── RoadTextureMapper (BMP filename generation)
```

## Quick Start

```typescript
import { RoadRendererSystem } from './road-renderer-system';

// 1. Initialize
const roadSystem = new RoadRendererSystem(2000, 2000);

// 2. Load terrain (water detection from BMP palette 0x80-0x88)
roadSystem.loadTerrainFromPalette(paletteData);

// 3. Update concrete (urban building proximity)
roadSystem.updateConcreteFromBuildings(buildings);

// 4. Add roads
roadSystem.addRoadSegments(segments);

// 5. Render
const roads = roadSystem.getRoadsInViewport(minX, minY, maxX, maxY);
for (const road of roads) {
  const texture = textureCache.getTextureSync('RoadBlockImages', road.textureFilename);
  ctx.drawImage(texture, screenX, screenY);
}
```

## API Reference

### RoadRendererSystem

```typescript
class RoadRendererSystem {
  constructor(mapWidth: number, mapHeight: number);

  // Terrain
  loadTerrainFromPalette(paletteData: number[][]): void;
  updateConcreteFromBuildings(buildings: UrbanBuilding[]): void;

  // Roads
  addRoadSegments(segments: RoadSegment[]): void;
  removeRoadSegments(segments: RoadSegment[]): void;
  clearAllRoads(): void;

  // Query
  getRoadTileData(x: number, y: number): RoadTileData | null;
  getRoadsInViewport(minX, minY, maxX, maxY): RoadTileData[];
}
```

### Data Types

```typescript
interface RoadTileData {
  x: number;
  y: number;
  topology: RoadTopology;      // 16 types
  surface: RoadSurface;        // 11 types
  textureFilename: string;     // e.g., "Roadhorz.bmp"
}

interface RoadSegment {
  x: number;
  y: number;
}

interface UrbanBuilding {
  x: number;
  y: number;
  xSize: number;
  ySize: number;
  isUrban: boolean;
}
```

## Topology Types (16)

| Type | Description | Texture |
|------|-------------|---------|
| NS_START/END/MIDDLE | North-South segments | Roadvert.bmp |
| WE_START/END/MIDDLE | West-East segments | Roadhorz.bmp |
| TCROSS | T-junction (3 connections) | RoadTN/TE/TS/TW.bmp |
| XCROSS | 4-way intersection | Roadcross.bmp |
| TWOCROSS | Corner (2 connections) | RoadcornerN/E/S/W.bmp |

## Surface Types (11)

| Type | Description | Texture Modifier |
|------|-------------|------------------|
| LAND | Default road | `Road*.bmp` |
| URBAN | Near urban buildings | `ConcreteRoad*.bmp` |
| BRIDGE_* | Over water (9 variants) | `Road*Bridge*.bmp` |
| SMOOTH | Smooth corner | `Road*Smooth.bmp` |

## Texture Naming

```
[Prefix]Road[Type][Modifier].bmp

Examples:
- Roadhorz.bmp          - Horizontal land road
- Roadvert.bmp          - Vertical land road
- RoadcornerE.bmp       - Corner turning East
- RoadTN.bmp            - T-junction opening North
- Roadcross.bmp         - 4-way intersection
- ConcreteRoadhorz.bmp  - Urban horizontal road
- RoadhorzBridgeN.bmp   - Bridge over water (North edge)
```

## Tests

```bash
npm test -- road-topology-analyzer.test.ts    # 57 tests
npm test -- road-terrain-grid.test.ts         # 22 tests
npm test -- road-surface-detector.test.ts     # 14 tests
npm test -- road-texture-mapper.test.ts       # 33 tests
npm test -- road-renderer-system.test.ts      # 27 tests
```

**Total: 153 tests** (100% passing)

## Source Files

```
src/client/renderer/
├── road-renderer-system.ts      # Main orchestrator
├── road-topology-analyzer.ts    # Topology detection
├── road-terrain-grid.ts         # Water/concrete grids
├── road-surface-detector.ts     # Surface type detection
└── road-texture-mapper.ts       # Texture filename mapping
```

## Technical Reference

For detailed algorithm (state transitions, water encoding, concrete expansion):
- [road_rendering_reference.md](road_rendering_reference.md)
