# Three.js Renderer Migration Plan

## Overview

Replace Canvas2D renderer with Three.js for GPU-accelerated isometric rendering, targeting 60 FPS with 500+ buildings.

**Approach:** Full replacement (no Canvas2D fallback)
**Library:** Three.js with orthographic camera
**Timeline:** 6 phases

---

## Architecture

### Core Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Camera | Orthographic | Isometric is parallel projection (no perspective) |
| Tiles | Instanced meshes | One draw call per chunk (1024 tiles) |
| Buildings | THREE.Sprite | Auto-billboard, easy painter's algorithm via renderOrder |
| Textures | Dynamic atlases | Minimize draw calls, GPU-friendly batching |
| Sorting | renderOrder property | Replaces array sort every frame |
| Spatial Index | Grid + Octree | O(1) tile lookup, O(log n) building clicks |

### Layer System (renderOrder)

```
0: Terrain (instanced chunk meshes)
1: Concrete (instanced tiles)
2: Roads (instanced tiles)
3: Tall terrain (sprites, sorted)
4: Buildings (sprites, sorted by i+j)
5: Zone overlay (colored planes)
6: UI overlay (placement preview)
```

---

## File Structure

```
src/client/renderer/three/
├── IsometricThreeRenderer.ts     # Main renderer (replaces IsometricMapRenderer)
├── TerrainChunkManager.ts        # Instanced terrain chunks (32x32)
├── TextureAtlasManager.ts        # Atlas building & UV mapping
├── BuildingRenderer.ts           # Sprite-based buildings
├── RoadRenderer.ts               # Instanced road tiles
├── ConcreteRenderer.ts           # Instanced concrete tiles
├── InteractionHandler.ts         # Raycasting, mouse events
├── CoordinateMapper3D.ts         # Isometric ↔ world ↔ screen
├── CameraController.ts           # Pan, zoom, viewport
└── SpatialIndex.ts               # Octree for buildings
```

**Total:** ~4,500-5,500 new LOC

---

## Implementation Phases

### Phase 1: Foundation
**Files:** `IsometricThreeRenderer.ts`, `CoordinateMapper3D.ts`, `CameraController.ts`

1. Install Three.js: `npm install three @types/three`
2. Create basic scene with orthographic camera
3. Implement isometric coordinate mapper
4. Render colored tiles (no textures) to validate math
5. Test pan/zoom controls

**Validation:** Colored isometric grid matches Canvas2D tile positions

### Phase 2: Terrain System
**Files:** `TerrainChunkManager.ts`, `TextureAtlasManager.ts`

1. Build terrain texture atlas (256 textures × 4 seasons)
2. Apply color-key transparency during atlas build
3. Implement chunk manager with instanced meshes
4. Load terrain data from existing TerrainLoader
5. Test viewport culling (only render visible chunks)

**Validation:** Terrain visually matches Canvas2D at all zoom levels

### Phase 3: Roads & Concrete
**Files:** `RoadRenderer.ts`, `ConcreteRenderer.ts`

1. Build road texture atlas (150 textures)
2. Integrate with existing road topology system (RoadsRendering)
3. Render roads with correct connectivity
4. Implement concrete tiles around buildings

**Validation:** Roads and concrete match Canvas2D exactly

### Phase 4: Buildings
**Files:** `BuildingRenderer.ts`, `TextureAtlasManager.ts` (building atlas)

1. Create sprite-based building renderer
2. Implement dynamic building atlas (load on demand)
3. Apply painter's algorithm via renderOrder
4. Test with 500+ buildings

**Validation:** Buildings render in correct order, no z-fighting

### Phase 5: Interaction
**Files:** `InteractionHandler.ts`, `SpatialIndex.ts`

1. Implement raycasting for building clicks
2. Ground plane intersection for map coordinates
3. Building hover effects
4. Placement preview (ghost building)
5. Road drawing preview

**Validation:** All mouse interactions work as before

### Phase 6: Optimization & Polish
**Files:** All (optimization pass)

1. Implement Octree spatial index for buildings
2. Frustum culling optimization
3. Texture atlas LRU eviction
4. Zone overlay layer
5. Debug rendering mode
6. Performance profiling

**Validation:** 60 FPS with 500 buildings, <500MB VRAM

---

## Key Implementation Details

### Isometric Coordinates

```typescript
// Map (i,j) to Three.js world position
mapToWorld(i: number, j: number): THREE.Vector3 {
  const x = (j - i) * tileWidth / 2;
  const y = 0;
  const z = -(i + j) * tileHeight / 2;
  return new THREE.Vector3(x, y, z);
}
```

### Painter's Algorithm

```typescript
// Sort buildings once, then set renderOrder
sortedBuildings.forEach((building, index) => {
  sprite.renderOrder = 1000 + index;
});
// Three.js sorts transparent objects by renderOrder automatically
```

### Texture Atlas UV Mapping

```typescript
// Atlas: 16x16 grid of 64x32 textures = 1024x512 total
// For texture at index N:
const col = N % 16;
const row = Math.floor(N / 16);
const u0 = col / 16;
const v0 = row / 16;
const u1 = (col + 1) / 16;
const v1 = (row + 1) / 16;
```

### Color Key Transparency

```typescript
// During atlas build, detect corner pixel and make transparent
const cornerColor = imageData.data.slice(0, 4);
for (let i = 0; i < imageData.data.length; i += 4) {
  if (colorMatches(imageData.data, i, cornerColor, tolerance: 5)) {
    imageData.data[i + 3] = 0; // Set alpha to 0
  }
}
```

---

## Critical Files to Preserve

These files contain logic that must be replicated exactly:

| File | Contains |
|------|----------|
| [coordinate-mapper.ts](src/client/renderer/coordinate-mapper.ts) | Isometric math formulas |
| [painter-algorithm.ts](src/client/renderer/painter-algorithm.ts) | Depth sorting logic |
| [road-texture-system.ts](src/client/renderer/road-texture-system.ts) | Road topology calculation |
| [game-object-texture-cache.ts](src/client/renderer/game-object-texture-cache.ts) | Color key transparency |

---

## Public API (Must Remain Compatible)

```typescript
interface IsometricRenderer {
  // Map loading
  loadMap(mapName: string): Promise<TerrainData>
  isLoaded(): boolean

  // Camera
  centerOn(x: number, y: number): void
  getCameraPosition(): { x: number, y: number }
  setZoom(level: number): void
  getZoom(): number

  // Map data
  updateMapData(data: MapData): void
  addCachedZone(x, y, w, h, buildings, segments): void

  // Modes
  setPlacementMode(enabled, ...): void
  setRoadDrawingMode(enabled): void
  setZoneOverlay(enabled, data?): void

  // Callbacks
  setLoadZoneCallback(callback): void
  setBuildingClickCallback(callback): void
  setRoadSegmentCompleteCallback(callback): void
  // ... etc

  // Rendering
  render(): void
  destroy(): void
}
```

---

## Performance Targets

| Metric | Current (Canvas2D) | Target (Three.js) |
|--------|-------------------|-------------------|
| FPS (500 buildings) | 30-45 | 60 |
| Draw calls | 500+ | <50 |
| Building sort | 5-10ms/frame | 0ms (cached) |
| Click detection | 10-20ms | <2ms |
| VRAM | 0 (CPU) | <500MB |

---

## Testing Strategy

### Unit Tests
- `CoordinateMapper3D`: map ↔ world ↔ screen conversions
- `TextureAtlasManager`: UV calculations, atlas building
- `SpatialIndex`: octree queries

### Visual Tests
- Screenshot comparison at each zoom level
- Season switching (4 seasons)
- Building placement preview
- Road drawing preview

### Performance Tests
- FPS with 100, 250, 500 buildings
- Memory profiling
- Draw call counting

---

## Verification Checklist

After each phase, verify:

- [ ] `npm test` passes
- [ ] Visual output matches Canvas2D renderer
- [ ] No console errors/warnings
- [ ] Performance meets targets for that phase
- [ ] Mouse interactions work correctly

Final verification:

- [ ] All 4 zoom levels render correctly
- [ ] All 4 seasons render correctly
- [ ] 500+ buildings at 60 FPS
- [ ] Building clicks work
- [ ] Road building works
- [ ] Building placement works
- [ ] Zone overlay works

---

## Dependencies

```json
{
  "dependencies": {
    "three": "^0.160.0"
  },
  "devDependencies": {
    "@types/three": "^0.160.0"
  }
}
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Visual differences | Pixel-level comparison tests |
| WebGL not supported | Feature detection, error message |
| Mobile performance | Detect mobile, reduce quality |
| Memory issues | LRU texture eviction, monitoring |

---

## Start Point

Begin with **Phase 1: Foundation**:

1. `npm install three @types/three`
2. Create `src/client/renderer/three/IsometricThreeRenderer.ts`
3. Set up scene, camera, renderer
4. Implement coordinate mapper
5. Render test grid of colored tiles
