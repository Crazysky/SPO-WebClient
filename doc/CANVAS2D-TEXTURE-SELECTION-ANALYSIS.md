# Canvas2D Texture Selection and Loading Analysis

## Executive Summary

This document provides a comprehensive analysis of how the Canvas2D renderer loads and renders terrain textures from BMP palette indices. The analysis covers the complete flow from BMP file parsing to texture rendering and identifies key algorithms.

**Key Finding**: The Canvas2D renderer uses a **direct palette index → texture filename mapping** via INI files, with simple synchronous texture lookup and LRU caching. The texture selection is deterministic and based on authoritative server-side mappings.

---

## 1. Complete Flow: BMP → Texture Selection → Rendering

### 1.1 Overview

```
BMP File (8-bit indexed)
    ↓
TerrainLoader.loadMap() - Parse BMP, extract pixel data
    ↓
TerrainLoader.getTextureId(x, y) - Returns palette index (0-255)
    ↓
TextureCache.getTextureSync(paletteIndex) - Returns ImageBitmap or null
    ↓
IsometricTerrainRenderer.drawIsometricTile() - Render texture or fallback color
```

### 1.2 Detailed Flow

#### Phase 1: BMP Loading (TerrainLoader)

**File**: `src/client/renderer/terrain-loader.ts`

1. **Map Request**: Client requests map via `/api/map-data/:mapName`
   - Returns: `{ metadata, bmpUrl }`

2. **BMP Download**: Client fetches BMP file from `bmpUrl`
   - 8-bit indexed color BMP
   - Bottom-up row order with 4-byte padding
   - Contains 256-color palette (unused by renderer)

3. **BMP Parsing**: `parseBmp()` extracts:
   - File header (14 bytes)
   - DIB header (40 bytes) - width, height, bitsPerPixel
   - Palette (256 × 4 bytes) - RGB color table (unused)
   - Pixel data - Raw palette indices

4. **Pixel Data Storage**: Converted to flat `Uint8Array`:
   - Top-down row order (BMP is bottom-up, so rows are flipped)
   - No padding (BMP has 4-byte row padding, removed)
   - Each byte = palette index (0-255)

**Key Method**:
```typescript
getTextureId(x: number, y: number): number {
  if (!this.pixelData) return 0;
  if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
  return this.pixelData[y * this.width + x];
}
```

#### Phase 2: Texture Lookup (TextureCache)

**File**: `src/client/renderer/texture-cache.ts`

**Cache Key Format**: `${terrainType}-${season}-${paletteIndex}`
- Example: `"Earth-2-128"` (Earth terrain, Summer, palette index 128)

**Texture Request Flow**:
```typescript
getTextureSync(paletteIndex: number): ImageBitmap | null {
  const key = this.getCacheKey(paletteIndex);
  const entry = this.cache.get(key);

  if (entry && entry.texture) {
    // Cache hit - return cached texture
    entry.lastAccess = ++this.accessCounter;
    this.hits++;
    return entry.texture;
  }

  if (entry && entry.loaded) {
    // Already tried loading, texture doesn't exist
    this.misses++;
    return null;
  }

  // Not in cache - trigger async load
  if (!entry || !entry.loading) {
    this.loadTexture(paletteIndex);
  }

  this.misses++;
  return null;
}
```

**Texture Loading**:
1. Fetch from: `/api/terrain-texture/${terrainType}/${season}/${paletteIndex}`
2. Server responds:
   - `200 + BMP file` if texture exists
   - `204 No Content` if texture doesn't exist
3. Create `ImageBitmap` from blob
4. Apply color-key transparency (detects corner pixel color)
5. Store in LRU cache (max 1024 entries)

**Color-Key Transparency Algorithm**:
```typescript
applyColorKeyTransparency(bitmap: ImageBitmap): ImageBitmap {
  // 1. Draw bitmap to OffscreenCanvas
  // 2. Get pixel data as ImageData
  // 3. Read corner pixel (0,0) as transparency color
  const tr = data[0], tg = data[1], tb = data[2];

  // 4. For each pixel, if color matches corner within tolerance
  //    Set alpha to 0 (fully transparent)
  if (Math.abs(r - tr) <= 5 &&
      Math.abs(g - tg) <= 5 &&
      Math.abs(b - tb) <= 5) {
    data[i + 3] = 0;
  }

  // 5. Return processed ImageBitmap
}
```

#### Phase 3: Rendering (IsometricTerrainRenderer)

**File**: `src/client/renderer/isometric-terrain-renderer.ts`

**Rendering Loop**:
```typescript
renderTerrainLayer(bounds: TileBounds): number {
  // Use chunk-based rendering (fast path) or tile-by-tile (fallback)
  if (this.useChunks && this.chunkCache) {
    return this.renderTerrainLayerChunked();
  }
  return this.renderTerrainLayerTiles(bounds);
}
```

**Tile Rendering**:
```typescript
drawIsometricTile(screenX, screenY, config, textureId, isTallTexture) {
  // 1. Try to get texture from cache
  let texture = this.textureCache.getTextureSync(textureId);

  if (texture) {
    // 2a. Texture available - draw it
    if (isTallTexture) {
      // Tall texture: draw at full height with upward offset
      const scale = config.tileWidth / 64;
      const scaledHeight = texture.height * scale;
      const yOffset = scaledHeight - config.tileHeight;
      ctx.drawImage(texture, x - halfWidth, y - yOffset, config.tileWidth, scaledHeight);
    } else {
      // Standard texture: draw at tile height
      ctx.drawImage(texture, x - halfWidth, y, config.tileWidth, config.tileHeight);
    }
  } else {
    // 2b. No texture - draw fallback diamond
    const color = this.textureCache.getFallbackColor(textureId);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);                           // top
    ctx.lineTo(x + halfWidth, y + halfHeight);  // right
    ctx.lineTo(x, y + config.tileHeight);       // bottom
    ctx.lineTo(x - halfWidth, y + halfHeight);  // left
    ctx.closePath();
    ctx.fill();
  }
}
```

---

## 2. Server-Side Texture Mapping

### 2.1 Palette Index → Filename Mapping

**File**: `src/server/texture-extractor.ts`

The server uses **INI files** as the authoritative source for palette index → filename mapping.

**INI File Format** (`cache/LandClasses/*.ini`):
```ini
[General]
Id=128
MapColor=8421504

[Images]
64x32=land.128.DryGroundCenter0.bmp
```

**Mapping Process**:
1. Parse all INI files in `cache/LandClasses/`
2. Extract:
   - `Id` = palette index (0-255)
   - `64x32` = texture filename
3. Build map: `paletteIndex → filename`

**Texture Extraction**:
1. Extract BMP files from CAB archives to `webclient-cache/textures/<terrainType>/<season>/`
2. Build texture index using INI mappings
3. Cache index as `index.json` (version 3 = pre-baked alpha PNGs)

**API Endpoint**: `/api/terrain-texture/:terrainType/:season/:paletteIndex`

### 2.2 Texture Filename Convention

**Standard Format**: `land.<paletteIndex>.<Type><Direction><Variant>.bmp`
- Example: `land.128.DryGroundCenter0.bmp`
- Types: `Grass`, `MidGrass`, `DryGround`, `Water`
- Directions: `Center`, `N`, `E`, `S`, `W`, `NEo`, `SEo`, `SWo`, `NWo`, `NEi`, `SEi`, `SWi`, `NWi`
- Variant: `0-3`

**Special Format**: `<Type>Special<N>.bmp`
- Example: `GrassSpecial1.bmp`
- Used for decorative tiles (trees, rocks, etc.)

---

## 3. LandId Encoding and Fallback Colors

### 3.1 LandId Bit Structure

Each palette index (0-255) encodes terrain metadata in 8 bits:

```
Bit:  7   6   5   4   3   2   1   0
      └───┴───┘   └───┴───┴───┴───┘   └───┴───┘
      LandClass   LandType            LandVar
      (2 bits)    (4 bits)            (2 bits)
```

**LandClass** (bits 7-6):
- `00` = ZoneA (Grass) - indices 0-63
- `01` = ZoneB (MidGrass) - indices 64-127
- `10` = ZoneC (DryGround) - indices 128-191
- `11` = ZoneD (Water) - indices 192-255

**LandType** (bits 5-2):
- `0000` = Center (pure tile)
- `0001` = N (north edge)
- `0010` = E (east edge)
- ... (14 total types including corners)
- `1101` = Special (trees, decorations)

**LandVar** (bits 1-0):
- `00-11` = Variation 0-3

### 3.2 Fallback Color Algorithm

**File**: `src/client/renderer/texture-cache.ts`

When a texture is not available, the renderer uses a color based on the **LandClass**:

```typescript
function getFallbackColor(paletteIndex: number): string {
  const landClass = landClassOf(paletteIndex); // Extract bits 7-6

  switch (landClass) {
    case LandClass.ZoneD: // Water (192-255)
      return blueHSL(paletteIndex);
    case LandClass.ZoneC: // DryGround (128-191)
      return brownHSL(paletteIndex);
    case LandClass.ZoneB: // MidGrass (64-127)
      return yellowGreenHSL(paletteIndex);
    case LandClass.ZoneA: // Grass (0-63)
    default:
      return greenHSL(paletteIndex);
  }
}
```

---

## 4. Special Tile Handling

### 4.1 Road and Concrete Tiles

**Roads and concrete are NOT in the BMP file**. They are **overlays** rendered on top of terrain.

**Road Rendering**:
- `src/client/renderer/road-texture-system.ts`
- Uses `RoadTextureAtlas` class
- Road IDs are separate from terrain palette indices

**Concrete Rendering**:
- `src/client/renderer/concrete-texture-system.ts`
- Uses `ConcreteTextureAtlas` class
- Concrete patterns use water platform detection

### 4.2 Special Tiles in BMP

**Special tiles** are in the BMP and use `LandType.Special` (type 13):
- Trees, decorations, rocks, etc.
- Encoded with bits 5-2 = `1101` (13)
- Use texture filename pattern: `<Type>Special<N>.bmp`
- Example: `GrassSpecial1.bmp` for palette index with Special type

**Detection**:
```typescript
isSpecialTile(landId: number): boolean {
  return landTypeOf(landId) === LandType.Special;
}
```

### 4.3 Water Tiles

**Water tiles** use `LandClass.ZoneD` (bits 7-6 = `11`):
- Deep water: `LandType.Center` (type 0)
- Water edges: `LandType.N/E/S/W` (types 1-4)
- Water corners: Inner/outer corners (types 5-12)

**Detection**:
```typescript
isWater(landId: number): boolean {
  return landClassOf(landId) === LandClass.ZoneD;
}

isDeepWater(landId: number): boolean {
  return isWater(landId) && landTypeOf(landId) === LandType.Center;
}
```

---

## 5. Algorithm Summary

### 5.1 Texture Selection Algorithm

```
INPUT: (x, y) map coordinates

1. Get palette index:
   paletteIndex = pixelData[y * width + x]

2. Build cache key:
   key = `${terrainType}-${season}-${paletteIndex}`

3. Check cache:
   IF texture in cache:
     RETURN cached ImageBitmap
   ELSE IF texture load attempted:
     RETURN null (use fallback color)
   ELSE:
     START async load from /api/terrain-texture/...
     RETURN null (use fallback color)

4. Fallback color (if texture null):
   landClass = (paletteIndex >> 6) & 0x03
   color = FALLBACK_COLORS[landClass]
   RETURN color with variation based on paletteIndex
```

### 5.2 Texture Loading Algorithm

```
INPUT: paletteIndex

1. Fetch texture:
   url = `/api/terrain-texture/${terrainType}/${season}/${paletteIndex}`
   response = fetch(url)

2. Handle response:
   IF response.status == 204:
     RETURN null (texture doesn't exist)
   IF response.status != 200:
     RETURN null (error)

3. Create bitmap:
   blob = await response.blob()
   bitmap = await createImageBitmap(blob)

4. Apply transparency:
   cornerColor = bitmap.getPixel(0, 0)
   FOR EACH pixel IN bitmap:
     IF pixel.color ≈ cornerColor (±5 tolerance):
       pixel.alpha = 0

5. Cache result:
   cache[key] = {
     texture: processedBitmap,
     lastAccess: currentTime,
     loading: false,
     loaded: true
   }

6. Evict if needed:
   IF cache.size > maxSize:
     EVICT least recently used entry
```

### 5.3 Server-Side Texture Resolution

```
INPUT: (terrainType, season, paletteIndex)

1. Load INI mapping (at startup):
   FOR EACH iniFile IN cache/LandClasses/:
     id = parse "Id=" from [General]
     filename = parse "64x32=" from [Images]
     mapping[id] = filename

2. Extract textures (at startup):
   sourceDir = cache/landimages/{terrainType}/{season}
   targetDir = webclient-cache/textures/{terrainType}/{season}
   FOR EACH cabFile IN sourceDir:
     extract cabFile TO targetDir

3. Build index (at startup):
   FOR EACH paletteIndex IN mapping:
     filename = mapping[paletteIndex]
     IF filename exists IN targetDir:
       textureIndex[paletteIndex] = filepath

4. Handle request:
   filepath = textureIndex[paletteIndex]
   IF filepath exists:
     RETURN PNG file (200)
   ELSE:
     RETURN 204 No Content
```

---

## 6. Debugging Checklist

### 6.1 Client Issues

- [ ] BMP file downloaded correctly (check `/api/map-data/:mapName`)
- [ ] Pixel data parsed correctly (check `terrainLoader.getTextureId()`)
- [ ] Texture API endpoint responding (check `/api/terrain-texture/...`)
- [ ] Textures loading into cache (check `textureCache.getStats()`)
- [ ] Textures rendering on canvas (check draw calls)
- [ ] Color-key transparency applied (check corner pixels)
- [ ] Fallback colors correct for missing textures
- [ ] LRU eviction not removing needed textures

### 6.2 Server Issues

- [ ] Texture extractor initialized (check startup logs)
- [ ] INI files parsed (check "Loaded N mappings" log)
- [ ] CAB files extracted (check `webclient-cache/textures/`)
- [ ] Texture index built (check `index.json` files)
- [ ] API endpoint returning correct content type
- [ ] 204 responses for missing textures
- [ ] File paths correct (case-sensitive on Linux)

---

## 7. Key Takeaways

1. **Texture selection is deterministic**: Palette index → INI mapping → texture filename
2. **No texture parsing required**: Server handles all mapping via INI files
3. **API**: `/api/terrain-texture/:terrainType/:season/:paletteIndex`
4. **Fallback colors use LandClass**: Extract bits 7-6 to determine terrain type
5. **Transparency is dynamic**: Corner pixel detection, not hardcoded to blue
6. **Roads/concrete are overlays**: Not in terrain BMP, separate rendering system
7. **LRU caching is simple**: Access counter + eviction when full

---

## 8. Files Reference

### Client-Side
- `src/client/renderer/terrain-loader.ts` - BMP loading and parsing
- `src/client/renderer/texture-cache.ts` - Texture caching
- `src/client/renderer/isometric-terrain-renderer.ts` - Rendering

### Server-Side
- `src/server/texture-extractor.ts` - CAB extraction and INI parsing
- `src/server/server.ts` - HTTP API endpoints

### Shared
- `src/shared/land-utils.ts` - LandId bit decoding
- `src/shared/map-config.ts` - Season enums and types

---

**Document Version**: 2.0
**Date**: 2026-02-08
**Updated**: Removed obsolete Three.js references (renderer deleted February 2026)
