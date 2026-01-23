# Road Rendering System - Implementation Guide

## Overview

Complete implementation of the official Starpeace Online road rendering algorithm with:
- **16 topology types** (NS_START, NS_END, NS_MIDDLE, WE_START, etc.)
- **11 surface types** (LAND, URBAN, 9 BRIDGE variants, SMOOTH)
- **State transition tables** for topology detection
- **Terrain grids** (water detection, urban concrete expansion)
- **Automatic texture mapping** (topology + surface → BMP filename)

## Architecture

```
RoadRendererSystem (Main Entry Point)
├── RoadGrid (Road tile storage + neighbor lookups)
├── RoadTerrainData (Water + Concrete grids)
│   ├── TerrainGrid (Water detection from BMP palette)
│   └── ConcreteGrid (Urban concrete expansion)
├── RoadTopologyAnalyzer (16 topology types + state transitions)
├── RoadSurfaceDetector (11 surface types)
└── RoadTextureMapper (BMP filename generation)
```

## Quick Start

### 1. Initialize System

```typescript
import { RoadRendererSystem } from './road-renderer-system';
import { type UrbanBuilding } from './road-terrain-grid';

// Create system for your map size
const roadSystem = new RoadRendererSystem(2000, 2000);
```

### 2. Load Terrain Data

```typescript
// Load water data from map BMP palette
// Palette indices 0x80-0x88 encode 9 water types
const paletteData: number[][] = loadMapBMP('Antiqua.bmp');
roadSystem.loadTerrainFromPalette(paletteData);
```

### 3. Update Concrete Grid

```typescript
// Buildings array from map parser
const buildings: UrbanBuilding[] = [
  { x: 100, y: 100, xSize: 2, ySize: 2, isUrban: true },
  // ... more buildings
];
roadSystem.updateConcreteFromBuildings(buildings);
```

### 4. Add Road Segments

```typescript
// Add roads from RDO cirRoads data
const segments = [
  { x: 100, y: 100 },
  { x: 101, y: 100 },
  { x: 102, y: 100 },
];
roadSystem.addRoadSegments(segments);
```

### 5. Render Roads

```typescript
// Get roads in current viewport
const roads = roadSystem.getRoadsInViewport(
  cameraX - viewportWidth/2,
  cameraY - viewportHeight/2,
  cameraX + viewportWidth/2,
  cameraY + viewportHeight/2
);

// Render each road tile
for (const road of roads) {
  const texture = textureCache.getTextureSync('RoadBlockImages', road.textureFilename);
  if (texture) {
    ctx.drawImage(texture, /* isometric coordinates */);
  }
}
```

## API Reference

### RoadRendererSystem

```typescript
class RoadRendererSystem {
  constructor(mapWidth: number, mapHeight: number);

  // Terrain setup
  loadTerrainFromPalette(paletteData: number[][]): void;
  updateConcreteFromBuildings(buildings: UrbanBuilding[]): void;

  // Road management
  addRoadSegments(segments: RoadSegment[]): void;
  removeRoadSegments(segments: RoadSegment[]): void;
  clearAllRoads(): void;

  // Data retrieval
  getRoadTileData(x: number, y: number): RoadTileData | null;
  getRoadsInViewport(minX, minY, maxX, maxY): RoadTileData[];
  getAllRoadTileData(): RoadTileData[];

  // Advanced access
  getTerrainData(): RoadTerrainData;
  getRoadGrid(): RoadGrid;
}
```

### RoadTileData

```typescript
interface RoadTileData {
  x: number;
  y: number;
  topology: RoadTopology;      // 16 types (NS_START, WE_MIDDLE, XCROSS, etc.)
  surface: RoadSurface;        // 11 types (LAND, URBAN, BRIDGE_*, SMOOTH)
  textureFilename: string;     // BMP filename (e.g., "Roadhorz.bmp")
}
```

### UrbanBuilding

```typescript
interface UrbanBuilding {
  x: number;
  y: number;
  xSize: number;
  ySize: number;
  isUrban: boolean;  // True for stores, offices, etc.
}
```

## Topology Types (16)

| Type | Description | Texture Example |
|------|-------------|-----------------|
| NS_START | North-South road start | Roadvert.bmp |
| NS_END | North-South road end | Roadvert.bmp |
| NS_MIDDLE | North-South road middle | Roadvert.bmp |
| WE_START | West-East road start | Roadhorz.bmp |
| WE_END | West-East road end | Roadhorz.bmp |
| WE_MIDDLE | West-East road middle | Roadhorz.bmp |
| TCROSS | T-junction (3 connections) | RoadTN/TE/TS/TW.bmp |
| XCROSS | 4-way intersection | Roadcross.bmp |
| TWOCROSS | Corner (2 connections) | RoadcornerN/E/S/W.bmp |
| NWSE_* | Diagonal (not implemented) | Fallback to vert |
| NESW_* | Diagonal (not implemented) | Fallback to horz |

## Surface Types (11)

| Type | Description | Texture Modifier |
|------|-------------|------------------|
| LAND | Default land road | `Road*.bmp` |
| URBAN | Urban/concrete road | `ConcreteRoad*.bmp` |
| BRIDGE_WATER_CENTER | Bridge over water (all sides) | `Road*BridgeCenter.bmp` |
| BRIDGE_WATER_N | Bridge over water (North) | `Road*BridgeN.bmp` |
| BRIDGE_WATER_E | Bridge over water (East) | `Road*BridgeE.bmp` |
| BRIDGE_WATER_NE | Bridge over water (NorthEast) | `Road*BridgeNE.bmp` |
| BRIDGE_WATER_S | Bridge over water (South) | `Road*BridgeS.bmp` |
| BRIDGE_WATER_SW | Bridge over water (SouthWest) | `Road*BridgeSW.bmp` |
| BRIDGE_WATER_W | Bridge over water (West) | `Road*BridgeW.bmp` |
| BRIDGE_WATER_SE | Bridge over water (SouthEast) | `Road*BridgeSE.bmp` |
| BRIDGE_WATER_NW | Bridge over water (NorthWest) | `Road*BridgeNW.bmp` |
| SMOOTH | Smooth corner transition | `Road*Smooth.bmp` |

## Texture Naming Convention

### Format
```
[Prefix]Road[Type][Modifier].bmp
```

### Examples
- `Roadhorz.bmp` - Horizontal land road
- `Roadvert.bmp` - Vertical land road
- `Roadcross.bmp` - 4-way intersection
- `RoadcornerE.bmp` - Corner turning East
- `RoadTN.bmp` - T-junction opening North
- `ConcreteRoadhorz.bmp` - Urban horizontal road
- `RoadhorzBridgeN.bmp` - Horizontal bridge over water (North)
- `RoadcornerESmooth.bmp` - Smooth corner turning East

## Integration with Existing Renderer

### Step 1: Import System

```typescript
// In isometric-map-renderer.ts
import { RoadRendererSystem, type RoadTileData } from './road-renderer-system';
import { type UrbanBuilding } from './road-terrain-grid';
```

### Step 2: Initialize in Constructor

```typescript
export class IsometricMapRenderer {
  private roadSystem: RoadRendererSystem;

  constructor(/* ... */) {
    this.roadSystem = new RoadRendererSystem(mapWidth, mapHeight);
  }
}
```

### Step 3: Load Terrain on Map Change

```typescript
async loadMap(mapName: string): Promise<void> {
  // ... existing terrain loading code ...

  // Load water data
  const paletteData = this.terrainLoader.getPaletteData();
  this.roadSystem.loadTerrainFromPalette(paletteData);

  // Load buildings and update concrete
  const buildings = await this.loadBuildings();
  this.roadSystem.updateConcreteFromBuildings(buildings);

  // Load roads
  const roads = await this.loadRoads();
  this.roadSystem.addRoadSegments(roads);
}
```

### Step 4: Render Roads Layer

```typescript
private renderRoadsLayer(): void {
  const viewport = this.getViewportBounds();
  const roads = this.roadSystem.getRoadsInViewport(
    viewport.minX, viewport.minY,
    viewport.maxX, viewport.maxY
  );

  for (const road of roads) {
    const texture = this.gameObjectTextureCache.getTextureSync(
      'RoadBlockImages',
      road.textureFilename
    );

    if (texture) {
      const screenPos = this.coordinateMapper.mapToScreen(road.x, road.y);
      this.ctx.drawImage(
        texture,
        screenPos.x - this.config.tileWidth / 2,
        screenPos.y - this.config.tileHeight / 2,
        this.config.tileWidth,
        this.config.tileHeight
      );
    }
  }
}
```

### Step 5: Update Layer Rendering Order

```typescript
render(): void {
  this.ctx.clearRect(/* ... */);

  // Render in proper order
  this.renderTerrainLayer();      // Base terrain
  this.renderRoadsLayer();         // Roads (NEW!)
  this.renderBuildingsLayer();     // Buildings
  this.renderZoneOverlayLayer();   // Zone overlay
  this.renderPlacementPreview();   // Placement preview
  this.renderRoadDrawingPreview(); // Road drawing
}
```

## Performance Considerations

### Topology Caching
- Topology is cached per tile to avoid recalculation
- Cache is automatically invalidated when neighbors change
- Cache cleared when terrain data updates

### Viewport Culling
- Only roads in viewport are rendered
- Use `getRoadsInViewport()` instead of `getAllRoadTileData()`

### Texture Caching
- Reuse existing GameObjectTextureCache
- Texture requests are LRU cached

### Concrete Grid Updates
- Only recalculate when buildings change
- Radius-based expansion is O(n × radius²)

## Testing

All modules have comprehensive unit tests:

```bash
npm test -- road-topology-analyzer.test.ts    # 57 tests
npm test -- road-terrain-grid.test.ts         # 22 tests
npm test -- road-surface-detector.test.ts     # 14 tests
npm test -- road-texture-mapper.test.ts       # 33 tests
npm test -- road-renderer-system.test.ts      # 27 tests
```

Total: **153 tests** covering all functionality

## Troubleshooting

### Roads Not Rendering
1. Check terrain data loaded: `roadSystem.getTerrainData()`
2. Check roads added: `roadSystem.getAllRoadTileData()`
3. Check texture cache: `textureCache.getStats()`

### Wrong Textures
1. Verify topology: `getRoadTileData(x, y).topology`
2. Verify surface: `getRoadTileData(x, y).surface`
3. Check filename: `getRoadTileData(x, y).textureFilename`

### Performance Issues
1. Use viewport culling: `getRoadsInViewport()`
2. Check cache hit rate: `textureCache.getStats().hitRate`
3. Verify topology cache working (no recalculation per frame)

## Future Enhancements

### Not Yet Implemented
- [ ] SMOOTH corner detection (requires road grid in surface detector)
- [ ] Diagonal roads (NWSE_*, NESW_*) - currently fallback to straight
- [ ] Railroad integration (excluded from initial implementation)
- [ ] Dynamic topology transitions (state machine fully implemented, needs triggers)

### Possible Optimizations
- [ ] Chunk-based road rendering (like terrain chunks)
- [ ] WebGL shader-based rendering
- [ ] Road texture atlases

## References

- **Official Algorithm:** [doc/road_rendering_algorithm.md](road_rendering_algorithm.md)
- **Reference Data:** [doc/road_rendering_reference_data.md](road_rendering_reference_data.md)
- **Source Files:**
  - Roads.pas (Delphi client)
  - Concrete.pas (Delphi client)
  - Map.pas (Delphi client)
