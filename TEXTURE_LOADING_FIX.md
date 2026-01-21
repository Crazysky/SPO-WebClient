# Texture Loading Fix

## Problem

The isometric terrain renderer was always using fallback colors instead of loading real terrain textures from `cache/landimages/`, even though texture files existed in `webclient-cache/textures/`.

## Root Cause

**Terrain type name mismatch** due to URL-encoded directory names on the filesystem:

1. **Source Directory**: `cache/landimages/Alien%20Swamp/` (literal URL-encoded name)
2. **TextureExtractor**: Read directory name as `"Alien%20Swamp"` and created index with key `"Alien%20Swamp-2"`
3. **Client Request**: Sent terrain type as `"Alien Swamp"` (human-readable with space)
4. **Server Lookup**: Decoded URL parameter to `"Alien Swamp"` and looked for index key `"Alien Swamp-2"`
5. **Result**: Index key mismatch → `textureExtractor.getTexturePath()` returned `null` → Server returned 204 No Content → Client used fallback colors

### Flow Diagram

```
Client: terrainType = "Alien Swamp"
   ↓
Client URL: /api/terrain-texture/Alien%20Swamp/2/128
   ↓
Server decode: terrainType = "Alien Swamp"
   ↓
Server lookup: textureIndex.get("Alien Swamp-2")
   ↓
Index has: "Alien%20Swamp-2" ❌ MISMATCH
   ↓
Return: null → 204 No Content → Fallback colors
```

## Solution

Modified `TextureExtractor` class to normalize terrain type names:

### Changes Made

1. **Decode directory names when reading** ([src/server/texture-extractor.ts:89](src/server/texture-extractor.ts#L89))
   ```typescript
   private async getTerrainTypes(): Promise<string[]> {
     const entries = fs.readdirSync(this.landImagesDir, { withFileTypes: true });
     return entries
       .filter(e => e.isDirectory() && !e.name.startsWith('.'))
       .map(e => decodeURIComponent(e.name)); // Decode URL-encoded names
   }
   ```

2. **Encode names for filesystem access** ([src/server/texture-extractor.ts:97](src/server/texture-extractor.ts#L97), [line 112](src/server/texture-extractor.ts#L112))
   ```typescript
   private async getZoomLevels(terrainType: string): Promise<number[]> {
     const encodedTerrainType = encodeURIComponent(terrainType);
     const terrainDir = path.join(this.landImagesDir, encodedTerrainType);
     // ...
   }
   ```

3. **Renamed extracted texture directories**
   - From: `webclient-cache/textures/Alien%20Swamp/`
   - To: `webclient-cache/textures/Alien Swamp/`

4. **Deleted old index files**
   - Removed `webclient-cache/textures/*/index.json` to force regeneration with correct terrain type names

### Behavior After Fix

```
Client: terrainType = "Alien Swamp"
   ↓
Client URL: /api/terrain-texture/Alien%20Swamp/2/128
   ↓
Server decode: terrainType = "Alien Swamp"
   ↓
Server lookup: textureIndex.get("Alien Swamp-2")
   ↓
Index has: "Alien Swamp-2" ✅ MATCH
   ↓
Return: texture BMP file → Client renders real texture
```

## Testing

1. **Start dev server**: `npm run dev`
2. **Check console**: Should see `[TextureExtractor] Found terrain types: Alien Swamp, Earth`
3. **Open client**: Navigate to a map (e.g., Shamba or Antiqua)
4. **Verify textures**: Should see real terrain textures instead of solid fallback colors
5. **Check browser Network tab**: Texture requests should return 200 OK (not 204 No Content)

## Files Modified

- [src/server/texture-extractor.ts](src/server/texture-extractor.ts) - Added URL decoding/encoding for terrain type names
- `webclient-cache/textures/` - Renamed directories to use decoded names
- Deleted `index.json` files for regeneration

## Future Considerations

- The fix assumes directory names in `cache/landimages/` may be URL-encoded
- All internal terrain type names now use human-readable format (`"Alien Swamp"` not `"Alien%20Swamp"`)
- Filesystem access automatically encodes names as needed
- This approach is robust against future maps with special characters in names

## Related Documentation

- [TERRAIN_RENDERING_STATUS.md](TERRAIN_RENDERING_STATUS.md) - Complete isometric rendering implementation
- [CLAUDE.md](CLAUDE.md) - Project overview and backlog
