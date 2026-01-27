# Texture Mapping Investigation - Three.js Renderer

## Problem Statement

User reports that special textures (roads, concrete) are being overwritten by terrain textures:
- Roads (beige/tan) appear to be covered by water/terrain (cyan/blue)
- Textures are "not even in the right place" ("même pas au bon endroit")
- The INI correspondence table used by Canvas2D is "not being respected"

## Investigation Summary

### ✅ Server-Side INI Mappings (VERIFIED CORRECT)

The server correctly uses INI files to map palette indices to texture filenames:

**TextureExtractor (texture-extractor.ts):**
1. Parses all INI files in `cache/LandClasses/` (182 files)
2. Builds `landClassMappings: Map<paletteIndex, {id, mapColor, filename}>`
3. Example mappings verified:
   - Palette 0 → `land.0.GrassCenter0.bmp`
   - Palette 52 → `GrassSpecial1.bmp`
   - Palette 128 → `land.128.DryGroundCenter0.bmp`
   - Palette 180 → `DryGroundSpecial1.bmp`

**Texture Index (webclient-cache/textures/.../index.json):**
- Version 2 (INI-based mapping)
- Correctly maps palette indices to textures
- Example: `"52": [{"paletteIndex": 52, "terrainType": "Grass", "direction": "Special", "variant": 1}]`

**Server Endpoint (/api/terrain-texture/:terrainType/:season/:paletteIndex):**
```typescript
// Line 462 in server.ts
const texturePath = textureExtractor().getTexturePath(terrainType, season, paletteIndex);
```
- Uses INI-based mappings via `getTexturePath()`
- Returns correct texture file for each palette index
- HTTP 200 responses confirmed by user logs

**✅ Conclusion: Server is working correctly. INI mappings are respected.**

---

### ✅ Coordinate Mapping (VERIFIED CORRECT)

**TerrainChunkManager → TerrainLoader coordinate chain:**

1. TerrainChunkManager.createChunkGeometry() (line 267):
   ```typescript
   const textureId = this.terrainProvider!.getTextureId(i, j);
   ```
   - `i` = map row (Y coordinate)
   - `j` = map column (X coordinate)

2. IsometricThreeRenderer.loadMap() (line 665):
   ```typescript
   getTextureId: (i: number, j: number) => this.terrainLoader.getTextureId(j, i)
   ```
   - Converts (row, col) → (col, row) for TerrainLoader

3. TerrainLoader.getTextureId() (line 266):
   ```typescript
   getTextureId(x: number, y: number): number {
     return this.pixelData[y * this.width + x];
   }
   ```
   - `x` = column, `y` = row
   - Standard row-major array indexing: `y * width + x`

**✅ Conclusion: Coordinate mapping is correct. No i/j inversion.**

---

### ⚠️ Potential Issues Identified

#### Issue 1: Render Order vs Creation Order

**Render Layer Constants (IsometricThreeRenderer.ts:29-37):**
```typescript
export const RENDER_LAYER = {
  TERRAIN: 0,      // Lowest (should render first/behind)
  CONCRETE: 1,
  ROADS: 2,        // Should render on top of terrain
  TALL_TERRAIN: 3,
  BUILDINGS: 4,
  ZONE_OVERLAY: 5,
  UI: 6
}
```

**Expected Behavior:**
- Terrain meshes have `renderOrder = 0`
- Road meshes have `renderOrder = 2`
- Three.js should render terrain first, then roads on top

**Possible Problem:**
- If renderOrder isn't being applied correctly, Three.js might use creation order
- Or depth testing might be interfering despite renderOrder

**To Verify:**
1. Check that terrain meshes actually have `renderOrder = 0`
2. Check that road meshes actually have `renderOrder = 2`
3. Verify Three.js renderer settings (depthTest, depthWrite)

---

#### Issue 2: Terrain Rendering Over Roads (Architecture Question)

**Current Architecture:**
1. **TerrainChunkManager** renders ALL tiles from BMP (including tiles where roads exist)
2. **RoadRenderer** renders roads ON TOP of terrain (separate meshes)
3. **ConcreteRenderer** renders concrete ON TOP of terrain (separate meshes)

**Canvas2D Architecture** (for comparison):
1. Renders ALL terrain tiles from BMP
2. Roads/concrete render on top (separate draw calls)
3. Works because Canvas2D respects draw order

**Question:** Should TerrainChunkManager skip tiles where roads/concrete exist?
- Canvas2D doesn't skip these tiles
- But maybe Three.js has depth fighting issues?

---

#### Issue 3: Texture Atlas UV Mapping

**Texture Atlas System:**
- 1024×512 texture atlas with 16×16 grid (256 slots)
- Each slot = 64×32 pixels (one terrain texture)
- UV coordinates calculated: `getUV(paletteIndex)`

**Diagnostic Logs Added (TerrainChunkManager.ts:271-273):**
```typescript
if (i < startI + 2 && j < startJ + 2) {
  console.log(`[TerrainChunkManager] Tile (${i},${j}) -> textureId=${textureId}, UV=(${uv.u0},${uv.v0} to ${uv.u1},${uv.v1})`);
}
```

**To Verify:**
1. Check console logs for actual palette indices at tile positions
2. Verify UV coordinates match expected atlas layout
3. Compare with Canvas2D texture IDs for same tile positions

---

## Next Steps: Diagnostic Testing

### Step 1: Verify Render Order

**Test in Browser Console:**
```javascript
// Get terrain meshes
const terrainGroup = window.renderer.scene.children.find(g => g.name === 'terrain');
console.log('Terrain meshes renderOrder:', terrainGroup.children.map(m => m.renderOrder));

// Get road meshes
const roadGroup = window.renderer.scene.children.find(g => g.name === 'roads');
console.log('Road meshes renderOrder:', roadGroup.children.map(m => m.renderOrder));

// Get concrete meshes
const concreteGroup = window.renderer.scene.children.find(g => g.name === 'concrete');
console.log('Concrete meshes renderOrder:', concreteGroup.children.map(m => m.renderOrder));
```

**Expected Output:**
- Terrain: all 0
- Roads: all 2 or higher
- Concrete: all 1 or higher

---

### Step 2: Check Palette Indices at Road Positions

**User should provide console logs showing:**
```
[TerrainChunkManager] Tile (0,0) -> textureId=X, UV=(...)
[TerrainChunkManager] Tile (0,1) -> textureId=Y, UV=(...)
```

**Questions to Answer:**
1. What palette indices appear where roads are supposed to be?
2. Do those palette indices correspond to road textures or terrain textures?
3. Are roads being rendered at all? (Check for `[RoadRenderer]` logs)

---

### Step 3: Compare Canvas2D vs Three.js Texture IDs

**Open both renderers side-by-side:**
1. Canvas2D: Check texture ID at position (100, 100) where a road exists
2. Three.js: Check texture ID at same position (100, 100)
3. Verify IDs match

**How to check Canvas2D texture ID:**
```javascript
const terrainLoader = window.renderer.getTerrainLoader();
const textureId = terrainLoader.getTextureId(100, 100); // (x, y)
console.log('Canvas2D texture at (100,100):', textureId);
```

**How to check Three.js texture ID:**
- Look at console logs from diagnostic output
- Or manually inspect BMP file data

---

### Step 4: Inspect Actual Textures Loading

**Check Network Tab in DevTools:**
1. Filter requests to `/api/terrain-texture/`
2. Verify which palette indices are being requested
3. For each request, verify:
   - HTTP 200 response (not 204)
   - Response contains actual BMP image data
   - Image dimensions are 64×32 (or 64×height for tall textures)

**Click on a response and view image:**
- Does it look like the correct texture?
- Does it match what should appear at that position?

---

## Hypotheses to Test

### Hypothesis A: RenderOrder Not Applied
**Symptom:** Terrain renders on top of roads despite renderOrder=0 < 2
**Test:** Check renderOrder values in console (Step 1)
**Fix:** Ensure all meshes have correct renderOrder set

### Hypothesis B: Depth Write Interference
**Symptom:** Depth buffer causing occlusion despite renderOrder
**Test:** Check material settings: `depthWrite`, `depthTest`
**Fix:** Set terrain material to `depthWrite: false` or adjust depth settings

### Hypothesis C: Roads Not Rendering At All
**Symptom:** No road meshes created, only terrain visible
**Test:** Check for `[RoadRenderer]` logs and road mesh count
**Fix:** Debug RoadRenderer initialization and mesh creation

### Hypothesis D: Wrong Palette Indices in BMP
**Symptom:** BMP has terrain palette indices where roads should be
**Test:** Compare Canvas2D vs Three.js palette indices (Step 3)
**Fix:** None needed if BMP is correct; investigate why Canvas2D works

### Hypothesis E: UV Mapping Incorrect
**Symptom:** Correct textures loaded but mapped to wrong tiles
**Test:** Compare UV coordinates with expected atlas layout
**Fix:** Verify `getUV()` calculation and atlas texture generation

---

## Canvas2D vs Three.js Comparison

| Aspect | Canvas2D | Three.js |
|--------|----------|----------|
| Terrain Rendering | Renders ALL tiles from BMP | Renders ALL tiles from BMP |
| Road Rendering | Separate draw calls on top | Separate meshes with renderOrder=2 |
| Texture Loading | Direct `/api/terrain-texture/` calls | Via TextureAtlasManager |
| Texture Mapping | 1 texture per tile | Atlas with UV mapping |
| Coordinate System | (x, y) = (column, row) | (i, j) = (row, column) |
| INI Usage | Server-side via TextureExtractor | Server-side via TextureExtractor |

**Key Difference:** Three.js uses a texture atlas instead of individual textures per tile. This adds complexity but improves GPU performance.

---

## Required User Actions

1. **Open browser to http://localhost:8080**
2. **Open DevTools Console (F12)**
3. **Copy and paste diagnostic commands from Step 1 & 2**
4. **Provide console output showing:**
   - renderOrder values for all groups
   - Tile texture IDs from diagnostic logs
   - Any error messages

5. **Open Network Tab**
6. **Filter by `/api/terrain-texture/`**
7. **Take screenshot showing:**
   - Request URLs
   - Response status codes
   - A few example response images

8. **Compare with Canvas2D**
9. **Switch to Canvas2D renderer**
10. **Check texture IDs at same positions**
11. **Report any differences**

---

## Expected Resolution

Once diagnostic data is collected, we can:
1. Identify exact cause of texture misplacement
2. Apply targeted fix (renderOrder, depth settings, or UV mapping)
3. Verify fix resolves both issues:
   - Textures in correct positions
   - Roads render on top of terrain

---

## Files Involved

**Server:**
- `src/server/texture-extractor.ts` - INI parsing (✅ working)
- `src/server/server.ts` - Texture endpoint (✅ working)

**Client:**
- `src/client/renderer/three/TerrainChunkManager.ts` - Terrain rendering
- `src/client/renderer/three/TextureAtlasManager.ts` - Atlas management
- `src/client/renderer/three/RoadRenderer.ts` - Road rendering
- `src/client/renderer/three/CoordinateMapper3D.ts` - Coordinate conversion (✅ working)
- `src/client/renderer/three/IsometricThreeRenderer.ts` - Main renderer

**Data:**
- `cache/LandClasses/*.ini` - Palette→texture mappings (✅ correct)
- `webclient-cache/textures/.../index.json` - Texture index (✅ version 2)
- Map BMP files - Palette indices (assumed ✅ correct)

---

## Status

- ✅ Server INI mappings verified correct
- ✅ Coordinate system verified correct
- ✅ Texture cache version 2 confirmed
- ⏳ Awaiting diagnostic console output from user
- ⏳ Awaiting network tab inspection
- ⏳ Awaiting Canvas2D comparison

**Next: User provides diagnostic output to identify root cause.**
