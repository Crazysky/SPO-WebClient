"use strict";
(() => {
  // src/client/renderer/terrain-loader.ts
  var TerrainLoader = class {
    constructor() {
      this.pixelData = null;
      this.width = 0;
      this.height = 0;
      this.metadata = null;
      this.loaded = false;
      this.mapName = "";
    }
    /**
     * Load terrain data for a map
     * @param mapName - Name of the map (e.g., 'Antiqua', 'Zyrane')
     * @returns TerrainData with pixel indices and metadata
     */
    async loadMap(mapName) {
      const apiUrl = `/api/map-data/${encodeURIComponent(mapName)}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch map data: ${response.status} - ${errorText}`);
      }
      const mapFileData = await response.json();
      const { metadata, bmpUrl } = mapFileData;
      const bmpResponse = await fetch(bmpUrl);
      if (!bmpResponse.ok) {
        throw new Error(`Failed to fetch BMP file: ${bmpResponse.status}`);
      }
      const bmpBuffer = await bmpResponse.arrayBuffer();
      const parsedBmp = this.parseBmp(bmpBuffer);
      if (parsedBmp.width !== metadata.width || parsedBmp.height !== metadata.height) {
        console.warn(`[TerrainLoader] Dimension mismatch: BMP is ${parsedBmp.width}\xD7${parsedBmp.height}, metadata says ${metadata.width}\xD7${metadata.height}`);
      }
      this.pixelData = parsedBmp.pixelData;
      this.width = parsedBmp.width;
      this.height = parsedBmp.height;
      this.metadata = metadata;
      this.mapName = mapName;
      this.loaded = true;
      return {
        width: this.width,
        height: this.height,
        pixelData: this.pixelData,
        metadata: this.metadata
      };
    }
    /**
     * Parse a BMP file from ArrayBuffer
     * Supports 8-bit indexed color BMPs (Windows 3.x format)
     */
    parseBmp(buffer) {
      const view = new DataView(buffer);
      const fileHeader = this.parseFileHeader(view);
      if (fileHeader.signature !== "BM") {
        throw new Error(`Invalid BMP signature: ${fileHeader.signature}`);
      }
      const dibHeader = this.parseDibHeader(view, 14);
      if (dibHeader.bitsPerPixel !== 8) {
        throw new Error(`Unsupported BMP format: ${dibHeader.bitsPerPixel} bits per pixel (only 8-bit supported)`);
      }
      if (dibHeader.compression !== 0) {
        throw new Error(`Unsupported BMP compression: ${dibHeader.compression} (only uncompressed supported)`);
      }
      const paletteOffset = 14 + dibHeader.headerSize;
      const paletteSize = dibHeader.colorsUsed || 256;
      const palette = new Uint8Array(buffer, paletteOffset, paletteSize * 4);
      const pixelData = this.parsePixelData(buffer, fileHeader.dataOffset, dibHeader);
      return {
        width: dibHeader.width,
        height: Math.abs(dibHeader.height),
        // Height can be negative for top-down BMPs
        bitsPerPixel: dibHeader.bitsPerPixel,
        palette,
        pixelData
      };
    }
    /**
     * Parse BMP file header (14 bytes)
     */
    parseFileHeader(view) {
      return {
        signature: String.fromCharCode(view.getUint8(0), view.getUint8(1)),
        fileSize: view.getUint32(2, true),
        reserved1: view.getUint16(6, true),
        reserved2: view.getUint16(8, true),
        dataOffset: view.getUint32(10, true)
      };
    }
    /**
     * Parse BMP DIB header (BITMAPINFOHEADER - 40 bytes)
     */
    parseDibHeader(view, offset) {
      return {
        headerSize: view.getUint32(offset, true),
        width: view.getInt32(offset + 4, true),
        height: view.getInt32(offset + 8, true),
        colorPlanes: view.getUint16(offset + 12, true),
        bitsPerPixel: view.getUint16(offset + 14, true),
        compression: view.getUint32(offset + 16, true),
        imageSize: view.getUint32(offset + 20, true),
        xPixelsPerMeter: view.getInt32(offset + 24, true),
        yPixelsPerMeter: view.getInt32(offset + 28, true),
        colorsUsed: view.getUint32(offset + 32, true),
        importantColors: view.getUint32(offset + 36, true)
      };
    }
    /**
     * Parse pixel data from BMP
     * BMP stores pixels bottom-up by default, with row padding to 4-byte boundaries
     */
    parsePixelData(buffer, dataOffset, header) {
      const width = header.width;
      const height = Math.abs(header.height);
      const isBottomUp = header.height > 0;
      const bytesPerRow = Math.ceil(width / 4) * 4;
      const pixelData = new Uint8Array(width * height);
      const rawData = new Uint8Array(buffer, dataOffset);
      for (let row = 0; row < height; row++) {
        const srcRow = isBottomUp ? height - 1 - row : row;
        const srcOffset = srcRow * bytesPerRow;
        const dstOffset = row * width;
        for (let col = 0; col < width; col++) {
          pixelData[dstOffset + col] = rawData[srcOffset + col];
        }
      }
      return pixelData;
    }
    /**
     * Get texture ID (palette index) for a tile coordinate
     * @param x - X coordinate (0 to width-1)
     * @param y - Y coordinate (0 to height-1)
     * @returns Palette index (0-255) or 0 if out of bounds
     */
    getTextureId(x, y) {
      if (!this.pixelData) return 0;
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
      return this.pixelData[y * this.width + x];
    }
    /**
     * Get the raw pixel data array
     * @returns Uint8Array of palette indices, or empty array if not loaded
     */
    getPixelData() {
      return this.pixelData || new Uint8Array(0);
    }
    /**
     * Get map metadata
     * @returns MapMetadata or null if not loaded
     */
    getMetadata() {
      return this.metadata;
    }
    /**
     * Get map dimensions
     * @returns Object with width and height
     */
    getDimensions() {
      return { width: this.width, height: this.height };
    }
    /**
     * Check if terrain data is loaded
     */
    isLoaded() {
      return this.loaded;
    }
    /**
     * Get the name of the loaded map
     */
    getMapName() {
      return this.mapName;
    }
    /**
     * Unload terrain data to free memory
     */
    unload() {
      this.pixelData = null;
      this.metadata = null;
      this.width = 0;
      this.height = 0;
      this.loaded = false;
      this.mapName = "";
      console.log("[TerrainLoader] Terrain data unloaded");
    }
  };

  // src/shared/map-config.ts
  var ZOOM_LEVELS = [
    { level: 0, u: 4, tileWidth: 8, tileHeight: 4 },
    // 4×8
    { level: 1, u: 8, tileWidth: 16, tileHeight: 8 },
    // 8×16
    { level: 2, u: 16, tileWidth: 32, tileHeight: 16 },
    // 16×32 (default)
    { level: 3, u: 32, tileWidth: 64, tileHeight: 32 }
    // 32×64
  ];
  var SEASON_NAMES = {
    [0 /* WINTER */]: "Winter",
    [1 /* SPRING */]: "Spring",
    [2 /* SUMMER */]: "Summer",
    [3 /* AUTUMN */]: "Autumn"
  };

  // src/client/renderer/coordinate-mapper.ts
  var CoordinateMapper = class {
    constructor(mapWidth = 2e3, mapHeight = 2e3) {
      this.mapWidth = mapWidth;
      this.mapHeight = mapHeight;
    }
    /**
     * Convert map tile coordinates (i, j) to screen pixel coordinates (x, y)
     * Based on Lander.pas algorithm, modified for seamless isometric tiling.
     *
     * For seamless tiles, adjacent tiles must overlap by half their dimensions:
     * - X step between tiles = tileWidth/2 = u
     * - Y step between tiles = tileHeight/2 = u/2
     *
     * @param i - Row index (0 to mapHeight-1)
     * @param j - Column index (0 to mapWidth-1)
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
     * @param origin - Camera position (screen origin offset)
     * @returns Screen coordinates {x, y} - top center point of the diamond tile
     */
    mapToScreen(i, j, zoomLevel, rotation, origin) {
      const config = ZOOM_LEVELS[zoomLevel];
      const u = config.u;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const x = u * (rows - i + j) - origin.x;
      const y = u / 2 * (rows - i + (cols - j)) - origin.y;
      return { x, y };
    }
    /**
     * Convert screen pixel coordinates (x, y) to map tile coordinates (i, j)
     * Inverse of mapToScreen, derived from the seamless tiling formula.
     *
     * @param x - Screen X coordinate
     * @param y - Screen Y coordinate
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
     * @param origin - Camera position (screen origin offset)
     * @returns Map coordinates {x: i, y: j}
     */
    screenToMap(x, y, zoomLevel, rotation, origin) {
      const config = ZOOM_LEVELS[zoomLevel];
      const u = config.u;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const screenX = x + origin.x;
      const screenY = y + origin.y;
      const A = screenX / u;
      const B = 2 * screenY / u;
      const i = Math.floor((2 * rows + cols - A - B) / 2);
      const j = Math.floor((A - B + cols) / 2);
      return { x: i, y: j };
    }
    /**
     * Calculate visible tile bounds for a given viewport
     * Used for viewport culling to determine which tiles to render
     *
     * @param viewport - Screen viewport rectangle
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0-3)
     * @param origin - Camera position
     * @returns Tile bounds {minI, maxI, minJ, maxJ}
     */
    getVisibleBounds(viewport, zoomLevel, rotation, origin) {
      const corners = [
        this.screenToMap(viewport.x, viewport.y, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x + viewport.width, viewport.y, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x, viewport.y + viewport.height, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x + viewport.width, viewport.y + viewport.height, zoomLevel, rotation, origin)
      ];
      const is = corners.map((c) => c.x);
      const js = corners.map((c) => c.y);
      const minI = Math.max(0, Math.floor(Math.min(...is)) - 1);
      const maxI = Math.min(this.mapHeight - 1, Math.ceil(Math.max(...is)) + 1);
      const minJ = Math.max(0, Math.floor(Math.min(...js)) - 1);
      const maxJ = Math.min(this.mapWidth - 1, Math.ceil(Math.max(...js)) + 1);
      return { minI, maxI, minJ, maxJ };
    }
    /**
     * Apply rotation transformation to map coordinates
     * Rotates around map center
     *
     * @param i - Row index
     * @param j - Column index
     * @param rotation - Rotation (0-3)
     * @returns Rotated coordinates {x: i, y: j}
     */
    rotateMapCoordinates(i, j, rotation) {
      const centerI = this.mapHeight / 2;
      const centerJ = this.mapWidth / 2;
      const relI = i - centerI;
      const relJ = j - centerJ;
      let newI;
      let newJ;
      switch (rotation) {
        case 0 /* NORTH */:
          newI = relI;
          newJ = relJ;
          break;
        case 1 /* EAST */:
          newI = relJ;
          newJ = -relI;
          break;
        case 2 /* SOUTH */:
          newI = -relI;
          newJ = -relJ;
          break;
        case 3 /* WEST */:
          newI = -relJ;
          newJ = relI;
          break;
        default:
          newI = relI;
          newJ = relJ;
      }
      return {
        x: newI + centerI,
        y: newJ + centerJ
      };
    }
    /**
     * Get inverse rotation
     * @param rotation - Original rotation
     * @returns Inverse rotation
     */
    getInverseRotation(rotation) {
      switch (rotation) {
        case 0 /* NORTH */:
          return 0 /* NORTH */;
        case 1 /* EAST */:
          return 3 /* WEST */;
        case 2 /* SOUTH */:
          return 2 /* SOUTH */;
        case 3 /* WEST */:
          return 1 /* EAST */;
        default:
          return 0 /* NORTH */;
      }
    }
  };

  // src/client/renderer/texture-cache.ts
  var TERRAIN_COLORS = {
    // Water (indices 192-255)
    192: "#1a3a5c",
    193: "#1d4268",
    194: "#204a74",
    195: "#234f80",
    196: "#1a3a5c",
    197: "#1d4268",
    198: "#204a74",
    199: "#234f80",
    200: "#287389",
    201: "#2a7a90",
    202: "#2c8197",
    203: "#2e889e",
    // Grass (indices 0-63)
    0: "#5a8c4f",
    1: "#5d8f52",
    2: "#608255",
    3: "#638558",
    4: "#4a7c3f",
    5: "#4d7f42",
    6: "#507245",
    7: "#537548",
    // MidGrass (indices 64-127)
    64: "#6b9460",
    65: "#6e9763",
    66: "#718a66",
    67: "#748d69",
    100: "#7a9a70",
    101: "#7d9d73",
    102: "#809076",
    103: "#839379",
    // DryGround (indices 128-191)
    128: "#8b7355",
    129: "#8e7658",
    130: "#91795b",
    131: "#947c5e",
    132: "#877050",
    133: "#8a7353",
    134: "#8d7656",
    135: "#907959",
    160: "#9a836a",
    161: "#9d866d",
    162: "#a08970",
    163: "#a38c73"
  };
  function getFallbackColor(paletteIndex) {
    if (TERRAIN_COLORS[paletteIndex]) {
      return TERRAIN_COLORS[paletteIndex];
    }
    if (paletteIndex >= 192) {
      const hue = 200 + paletteIndex % 20;
      const sat = 40 + paletteIndex % 20;
      const light = 25 + paletteIndex % 15;
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    } else if (paletteIndex >= 128) {
      const hue = 30 + paletteIndex % 15;
      const sat = 30 + paletteIndex % 20;
      const light = 35 + paletteIndex % 20;
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    } else if (paletteIndex >= 64) {
      const hue = 70 + paletteIndex % 30;
      const sat = 35 + paletteIndex % 25;
      const light = 35 + paletteIndex % 20;
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    } else {
      const hue = 90 + paletteIndex % 30;
      const sat = 40 + paletteIndex % 25;
      const light = 30 + paletteIndex % 20;
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
  }
  var TextureCache = class {
    constructor(maxSize = 200) {
      this.cache = /* @__PURE__ */ new Map();
      this.terrainType = "Earth";
      this.season = 2 /* SUMMER */;
      // Default to summer
      this.accessCounter = 0;
      // Statistics
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.maxSize = maxSize;
    }
    /**
     * Set the terrain type for texture loading
     */
    setTerrainType(terrainType) {
      if (this.terrainType !== terrainType) {
        this.terrainType = terrainType;
        this.clear();
        console.log(`[TextureCache] Terrain type set to: ${terrainType}, current season: ${SEASON_NAMES[this.season]}`);
      }
    }
    /**
     * Get the current terrain type
     */
    getTerrainType() {
      return this.terrainType;
    }
    /**
     * Set the season for texture loading
     * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.clear();
        console.log(`[TextureCache] Season changed to ${SEASON_NAMES[season]}`);
      }
    }
    /**
     * Get the current season
     */
    getSeason() {
      return this.season;
    }
    /**
     * Get the current season name
     */
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Generate cache key for a texture
     * Key is based on terrain type, season, and palette index
     */
    getCacheKey(paletteIndex) {
      return `${this.terrainType}-${this.season}-${paletteIndex}`;
    }
    /**
     * Get texture for a palette index (sync - returns cached or null)
     * Use this for fast rendering - if not cached, returns null and starts loading
     *
     * Note: The texture is the same regardless of zoom level.
     * Zoom level only affects how the texture is rendered (scaled).
     */
    getTextureSync(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      if (entry && entry.texture) {
        entry.lastAccess = ++this.accessCounter;
        this.hits++;
        return entry.texture;
      }
      if (entry && entry.loaded) {
        this.misses++;
        return null;
      }
      if (!entry || !entry.loading) {
        this.loadTexture(paletteIndex);
      }
      this.misses++;
      return null;
    }
    /**
     * Get texture for a palette index (async - waits for load)
     */
    async getTextureAsync(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      if (entry) {
        entry.lastAccess = ++this.accessCounter;
        if (entry.texture) {
          this.hits++;
          return entry.texture;
        }
        if (entry.loaded) {
          this.misses++;
          return null;
        }
        if (entry.loadPromise) {
          return entry.loadPromise;
        }
      }
      this.misses++;
      return this.loadTexture(paletteIndex);
    }
    /**
     * Get fallback color for a palette index
     */
    getFallbackColor(paletteIndex) {
      return getFallbackColor(paletteIndex);
    }
    /**
     * Load a texture from the server
     */
    async loadTexture(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const existing = this.cache.get(key);
      if (existing?.loadPromise) {
        return existing.loadPromise;
      }
      const loadPromise = this.fetchTexture(paletteIndex);
      this.cache.set(key, {
        texture: null,
        lastAccess: ++this.accessCounter,
        loading: true,
        loaded: false,
        loadPromise
      });
      try {
        const texture = await loadPromise;
        const entry = this.cache.get(key);
        if (entry) {
          entry.texture = texture;
          entry.loading = false;
          entry.loaded = true;
          entry.loadPromise = void 0;
        }
        this.evictIfNeeded();
        return texture;
      } catch (error) {
        this.cache.delete(key);
        return null;
      }
    }
    /**
     * Fetch texture from server and convert to ImageBitmap
     * Uses season (not zoom level) to fetch the correct texture variant
     * Applies blue (0,0,255) color key transparency for terrain textures
     */
    async fetchTexture(paletteIndex) {
      const url = `/api/terrain-texture/${encodeURIComponent(this.terrainType)}/${this.season}/${paletteIndex}`;
      try {
        const response = await fetch(url);
        if (response.status === 204) {
          return null;
        }
        if (!response.ok) {
          return null;
        }
        const blob = await response.blob();
        const rawBitmap = await createImageBitmap(blob);
        return this.applyColorKeyTransparency(rawBitmap);
      } catch (error) {
        console.warn(`[TextureCache] Failed to load texture ${paletteIndex}:`, error);
        return null;
      }
    }
    /**
     * Apply color key transparency to terrain textures
     *
     * Detects the transparency color dynamically by reading the corner pixels
     * of each texture. Corner pixels are always outside the isometric diamond
     * shape and contain the chroma key color.
     */
    async applyColorKeyTransparency(bitmap) {
      if (typeof OffscreenCanvas === "undefined") {
        return bitmap;
      }
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return bitmap;
      }
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const data = imageData.data;
      const tr = data[0];
      const tg = data[1];
      const tb = data[2];
      const tolerance = 5;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (Math.abs(r - tr) <= tolerance && Math.abs(g - tg) <= tolerance && Math.abs(b - tb) <= tolerance) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      bitmap.close();
      return canvas.transferToImageBitmap();
    }
    /**
     * Evict least recently used entries if cache is over capacity
     */
    evictIfNeeded() {
      while (this.cache.size > this.maxSize) {
        let oldestKey = null;
        let oldestAccess = Infinity;
        for (const [key, entry] of this.cache) {
          if (!entry.loading && entry.lastAccess < oldestAccess) {
            oldestAccess = entry.lastAccess;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          const entry = this.cache.get(oldestKey);
          if (entry?.texture) {
            entry.texture.close();
          }
          this.cache.delete(oldestKey);
          this.evictions++;
        } else {
          break;
        }
      }
    }
    /**
     * Preload textures for a list of palette indices
     */
    async preload(paletteIndices) {
      const loadPromises = paletteIndices.map(
        (index) => this.getTextureAsync(index)
      );
      await Promise.all(loadPromises);
    }
    /**
     * Clear the entire cache
     */
    clear() {
      for (const entry of this.cache.values()) {
        if (entry.texture) {
          entry.texture.close();
        }
      }
      this.cache.clear();
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.accessCounter = 0;
    }
    /**
     * Get cache statistics
     */
    getStats() {
      const total = this.hits + this.misses;
      return {
        size: this.cache.size,
        maxSize: this.maxSize,
        hits: this.hits,
        misses: this.misses,
        evictions: this.evictions,
        hitRate: total > 0 ? this.hits / total : 0
      };
    }
    /**
     * Check if a texture is cached
     */
    has(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      return entry !== void 0 && entry.texture !== null;
    }
    /**
     * Get count of loaded textures
     */
    getLoadedCount() {
      let count = 0;
      for (const entry of this.cache.values()) {
        if (entry.texture) {
          count++;
        }
      }
      return count;
    }
  };

  // src/client/renderer/chunk-cache.ts
  var CHUNK_SIZE = 32;
  var MAX_CHUNKS_PER_ZOOM = 64;
  var MAX_TEXTURE_EXTRA_HEIGHT = 64;
  var isOffscreenCanvasSupported = typeof OffscreenCanvas !== "undefined";
  function getScaledExtraHeight(config) {
    const scale = config.tileWidth / 64;
    return Math.ceil(MAX_TEXTURE_EXTRA_HEIGHT * scale);
  }
  function calculateChunkCanvasDimensions(chunkSize, config) {
    const u = config.u;
    const width = u * (2 * chunkSize - 1) + config.tileWidth;
    const baseHeight = u / 2 * (2 * chunkSize - 1) + config.tileHeight;
    const extraHeight = getScaledExtraHeight(config);
    const height = baseHeight + extraHeight;
    return { width, height };
  }
  function getTileScreenPosInChunk(localI, localJ, chunkSize, config) {
    const u = config.u;
    const x = u * (chunkSize - localI + localJ);
    const y = u / 2 * (chunkSize - localI + (chunkSize - localJ));
    const extraHeight = getScaledExtraHeight(config);
    return { x, y: y + extraHeight };
  }
  function getChunkScreenPosition(chunkI, chunkJ, chunkSize, config, mapHeight, mapWidth, origin) {
    const u = config.u;
    const baseI = chunkI * chunkSize;
    const baseJ = chunkJ * chunkSize;
    const worldX = u * (mapHeight - baseI + baseJ) - origin.x;
    const worldY = u / 2 * (mapHeight - baseI + (mapWidth - baseJ)) - origin.y;
    const localOrigin = getTileScreenPosInChunk(0, 0, chunkSize, config);
    return {
      x: worldX - localOrigin.x,
      y: worldY - localOrigin.y
    };
  }
  var ChunkCache = class {
    constructor(textureCache, getTextureId) {
      // Cache per zoom level: Map<"chunkI,chunkJ", ChunkEntry>
      this.caches = /* @__PURE__ */ new Map();
      this.accessCounter = 0;
      this.mapWidth = 0;
      this.mapHeight = 0;
      // Rendering queue
      this.renderQueue = [];
      this.isProcessingQueue = false;
      // Stats
      this.stats = {
        chunksRendered: 0,
        cacheHits: 0,
        cacheMisses: 0,
        evictions: 0
      };
      // Callback when chunk becomes ready
      this.onChunkReady = null;
      this.textureCache = textureCache;
      this.getTextureId = getTextureId;
      for (let i = 0; i <= 3; i++) {
        this.caches.set(i, /* @__PURE__ */ new Map());
      }
    }
    /**
     * Set map dimensions (call after loading map)
     */
    setMapDimensions(width, height) {
      this.mapWidth = width;
      this.mapHeight = height;
    }
    /**
     * Set callback for when a chunk becomes ready (triggers re-render)
     */
    setOnChunkReady(callback) {
      this.onChunkReady = callback;
    }
    /**
     * Get cache key for a chunk
     */
    getKey(chunkI, chunkJ) {
      return `${chunkI},${chunkJ}`;
    }
    /**
     * Get chunk coordinates for a tile
     */
    static getChunkCoords(tileI, tileJ) {
      return {
        chunkI: Math.floor(tileI / CHUNK_SIZE),
        chunkJ: Math.floor(tileJ / CHUNK_SIZE)
      };
    }
    /**
     * Check if chunk rendering is supported (requires OffscreenCanvas)
     */
    isSupported() {
      return isOffscreenCanvasSupported;
    }
    /**
     * Get a chunk canvas (sync - returns null if not ready, triggers async render)
     */
    getChunkSync(chunkI, chunkJ, zoomLevel) {
      if (!isOffscreenCanvasSupported) return null;
      const cache = this.caches.get(zoomLevel);
      if (!cache) return null;
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (entry && entry.ready) {
        entry.lastAccess = ++this.accessCounter;
        this.stats.cacheHits++;
        return entry.canvas;
      }
      if (!entry || !entry.rendering) {
        this.stats.cacheMisses++;
        this.queueChunkRender(chunkI, chunkJ, zoomLevel);
      }
      return null;
    }
    /**
     * Queue a chunk for async rendering
     */
    queueChunkRender(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      if (!cache.has(key)) {
        const config = ZOOM_LEVELS[zoomLevel];
        const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config);
        cache.set(key, {
          canvas: new OffscreenCanvas(dims.width, dims.height),
          lastAccess: ++this.accessCounter,
          ready: false,
          rendering: true
        });
      } else {
        const entry = cache.get(key);
        entry.rendering = true;
      }
      this.renderQueue.push({
        chunkI,
        chunkJ,
        zoomLevel,
        resolve: () => {
        }
      });
      this.processRenderQueue();
    }
    /**
     * Process render queue (one chunk at a time to not block)
     */
    async processRenderQueue() {
      if (this.isProcessingQueue) return;
      this.isProcessingQueue = true;
      while (this.renderQueue.length > 0) {
        const request = this.renderQueue.shift();
        await this.renderChunk(request.chunkI, request.chunkJ, request.zoomLevel);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      this.isProcessingQueue = false;
    }
    /**
     * Render a single chunk
     */
    async renderChunk(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (!entry) return;
      const config = ZOOM_LEVELS[zoomLevel];
      const ctx = entry.canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      const startI = chunkI * CHUNK_SIZE;
      const startJ = chunkJ * CHUNK_SIZE;
      const endI = Math.min(startI + CHUNK_SIZE, this.mapHeight);
      const endJ = Math.min(startJ + CHUNK_SIZE, this.mapWidth);
      const halfWidth = config.tileWidth / 2;
      const halfHeight = config.tileHeight / 2;
      const textureIds = /* @__PURE__ */ new Set();
      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          textureIds.add(this.getTextureId(j, i));
        }
      }
      await this.textureCache.preload(Array.from(textureIds));
      const BASE_TILE_HEIGHT = 32;
      const standardTiles = [];
      const tallTiles = [];
      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          const textureId = this.getTextureId(j, i);
          const texture = this.textureCache.getTextureSync(textureId);
          if (texture && texture.height > BASE_TILE_HEIGHT) {
            tallTiles.push({ i, j, textureId, texture });
          } else {
            standardTiles.push({ i, j, textureId, texture });
          }
        }
      }
      for (const tile of standardTiles) {
        const localI = tile.i - startI;
        const localJ = tile.j - startJ;
        const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config);
        const x = Math.round(screenPos.x);
        const y = Math.round(screenPos.y);
        if (tile.texture) {
          ctx.drawImage(
            tile.texture,
            x - halfWidth,
            y,
            config.tileWidth,
            config.tileHeight
          );
        } else {
          const color = getFallbackColor(tile.textureId);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + halfWidth, y + halfHeight);
          ctx.lineTo(x, y + config.tileHeight);
          ctx.lineTo(x - halfWidth, y + halfHeight);
          ctx.closePath();
          ctx.fill();
        }
      }
      tallTiles.sort((a, b) => b.i + b.j - (a.i + a.j));
      for (const tile of tallTiles) {
        const localI = tile.i - startI;
        const localJ = tile.j - startJ;
        const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config);
        const x = Math.round(screenPos.x);
        const y = Math.round(screenPos.y);
        const scale = config.tileWidth / 64;
        const scaledHeight = tile.texture.height * scale;
        const yOffset = scaledHeight - config.tileHeight;
        ctx.drawImage(
          tile.texture,
          x - halfWidth,
          y - yOffset,
          config.tileWidth,
          scaledHeight
        );
      }
      entry.ready = true;
      entry.rendering = false;
      this.stats.chunksRendered++;
      this.evictIfNeeded(zoomLevel);
      if (this.onChunkReady) {
        this.onChunkReady();
      }
    }
    /**
     * Draw a chunk to the main canvas
     */
    drawChunkToCanvas(ctx, chunkI, chunkJ, zoomLevel, origin) {
      const chunk = this.getChunkSync(chunkI, chunkJ, zoomLevel);
      if (!chunk) return false;
      const config = ZOOM_LEVELS[zoomLevel];
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      ctx.drawImage(chunk, screenPos.x, screenPos.y);
      return true;
    }
    /**
     * Get screen position of a chunk for visibility testing
     */
    getChunkScreenBounds(chunkI, chunkJ, zoomLevel, origin) {
      const config = ZOOM_LEVELS[zoomLevel];
      const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config);
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      return {
        x: screenPos.x,
        y: screenPos.y,
        width: dims.width,
        height: dims.height
      };
    }
    /**
     * Get visible chunk range for current viewport
     */
    getVisibleChunks(canvasWidth, canvasHeight, zoomLevel, origin) {
      const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
      const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);
      let minVisibleI = maxChunkI;
      let maxVisibleI = 0;
      let minVisibleJ = maxChunkJ;
      let maxVisibleJ = 0;
      for (let ci = 0; ci < maxChunkI; ci++) {
        for (let cj = 0; cj < maxChunkJ; cj++) {
          const bounds = this.getChunkScreenBounds(ci, cj, zoomLevel, origin);
          if (bounds.x + bounds.width >= 0 && bounds.x <= canvasWidth && bounds.y + bounds.height >= 0 && bounds.y <= canvasHeight) {
            minVisibleI = Math.min(minVisibleI, ci);
            maxVisibleI = Math.max(maxVisibleI, ci);
            minVisibleJ = Math.min(minVisibleJ, cj);
            maxVisibleJ = Math.max(maxVisibleJ, cj);
          }
        }
      }
      return {
        minChunkI: minVisibleI,
        maxChunkI: maxVisibleI,
        minChunkJ: minVisibleJ,
        maxChunkJ: maxVisibleJ
      };
    }
    /**
     * Preload chunks for a specific area (anticipate pan)
     */
    preloadChunks(centerChunkI, centerChunkJ, radius, zoomLevel) {
      const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
      const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);
      for (let di = -radius; di <= radius; di++) {
        for (let dj = -radius; dj <= radius; dj++) {
          const ci = centerChunkI + di;
          const cj = centerChunkJ + dj;
          if (ci >= 0 && ci < maxChunkI && cj >= 0 && cj < maxChunkJ) {
            this.getChunkSync(ci, cj, zoomLevel);
          }
        }
      }
    }
    /**
     * LRU eviction for a specific zoom level
     */
    evictIfNeeded(zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      while (cache.size > MAX_CHUNKS_PER_ZOOM) {
        let oldestKey = null;
        let oldestAccess = Infinity;
        for (const [key, entry] of cache) {
          if (entry.ready && !entry.rendering && entry.lastAccess < oldestAccess) {
            oldestAccess = entry.lastAccess;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          cache.delete(oldestKey);
          this.stats.evictions++;
        } else {
          break;
        }
      }
    }
    /**
     * Clear cache for a specific zoom level (call when zoom changes)
     */
    clearZoomLevel(zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      if (cache) {
        cache.clear();
      }
    }
    /**
     * Clear all caches
     */
    clearAll() {
      for (const cache of this.caches.values()) {
        cache.clear();
      }
      this.renderQueue = [];
      this.stats = {
        chunksRendered: 0,
        cacheHits: 0,
        cacheMisses: 0,
        evictions: 0
      };
    }
    /**
     * Invalidate a specific chunk (e.g., if terrain changes)
     */
    invalidateChunk(chunkI, chunkJ, zoomLevel) {
      if (zoomLevel !== void 0) {
        const cache = this.caches.get(zoomLevel);
        if (cache) {
          cache.delete(this.getKey(chunkI, chunkJ));
        }
      } else {
        for (const cache of this.caches.values()) {
          cache.delete(this.getKey(chunkI, chunkJ));
        }
      }
    }
    /**
     * Get cache statistics
     */
    getStats() {
      const total = this.stats.cacheHits + this.stats.cacheMisses;
      const cacheSizes = {};
      for (const [level, cache] of this.caches) {
        cacheSizes[level] = cache.size;
      }
      return {
        ...this.stats,
        hitRate: total > 0 ? this.stats.cacheHits / total : 0,
        cacheSizes,
        queueLength: this.renderQueue.length
      };
    }
  };

  // src/client/renderer/isometric-terrain-renderer.ts
  var MAP_TERRAIN_TYPES = {
    "Shamba": "Alien Swamp",
    "Antiqua": "Earth",
    "Zyrane": "Earth"
    // Default to Earth for unknown maps
  };
  function getTerrainTypeForMap(mapName) {
    return MAP_TERRAIN_TYPES[mapName] || "Earth";
  }
  var IsometricTerrainRenderer = class {
    constructor(canvas, options) {
      this.chunkCache = null;
      // Rendering mode
      this.useTextures = true;
      this.useChunks = true;
      // Use chunk-based rendering (10-20x faster)
      // View state
      this.zoomLevel = 2;
      // Default zoom (16×32 pixels per tile)
      this.rotation = 0 /* NORTH */;
      this.season = 2 /* SUMMER */;
      // Default season for textures
      // Camera position in map coordinates (center tile)
      this.cameraI = 500;
      this.cameraJ = 500;
      // Screen origin (for Lander.pas formula)
      this.origin = { x: 0, y: 0 };
      // State flags
      this.loaded = false;
      this.mapName = "";
      // Available seasons for current terrain type (auto-detected from server)
      this.availableSeasons = [0 /* WINTER */, 1 /* SPRING */, 2 /* SUMMER */, 3 /* AUTUMN */];
      // Rendering stats (for debug info)
      this.lastRenderStats = {
        tilesRendered: 0,
        renderTimeMs: 0,
        visibleBounds: { minI: 0, maxI: 0, minJ: 0, maxJ: 0 }
      };
      // Mouse interaction state
      this.isDragging = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      // Render debouncing (prevents flickering when multiple chunks become ready)
      this.pendingRenderRequest = null;
      this.canvas = canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D rendering context");
      }
      this.ctx = ctx;
      this.terrainLoader = new TerrainLoader();
      this.coordMapper = new CoordinateMapper(2e3, 2e3);
      this.textureCache = new TextureCache(200);
      if (!options?.disableMouseControls) {
        this.setupMouseControls();
      }
      this.setupResizeHandler();
      this.render();
    }
    /**
     * Load terrain data for a map
     * @param mapName - Name of the map (e.g., 'Shamba', 'Antiqua')
     */
    async loadMap(mapName) {
      const terrainType = getTerrainTypeForMap(mapName);
      this.textureCache.setTerrainType(terrainType);
      await this.fetchAvailableSeasons(terrainType);
      const terrainData = await this.terrainLoader.loadMap(mapName);
      this.coordMapper = new CoordinateMapper(
        terrainData.width,
        terrainData.height
      );
      this.chunkCache = new ChunkCache(
        this.textureCache,
        (x, y) => this.terrainLoader.getTextureId(x, y)
      );
      this.chunkCache.setMapDimensions(terrainData.width, terrainData.height);
      this.chunkCache.setOnChunkReady(() => this.requestRender());
      this.cameraI = Math.floor(terrainData.height / 2);
      this.cameraJ = Math.floor(terrainData.width / 2);
      this.updateOrigin();
      this.mapName = mapName;
      this.loaded = true;
      this.render();
      return terrainData;
    }
    /**
     * Fetch available seasons for a terrain type from server
     * Auto-selects the default season if current season is not available
     */
    async fetchAvailableSeasons(terrainType) {
      try {
        const url = `/api/terrain-info/${encodeURIComponent(terrainType)}`;
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[IsometricRenderer] Failed to fetch terrain info for ${terrainType}: ${response.status}`);
          return;
        }
        const info = await response.json();
        this.availableSeasons = info.availableSeasons;
        if (!info.availableSeasons.includes(this.season)) {
          this.season = info.defaultSeason;
          this.textureCache.setSeason(info.defaultSeason);
          this.chunkCache?.clearAll();
        }
      } catch (error) {
        console.warn(`[IsometricRenderer] Error fetching terrain info:`, error);
      }
    }
    /**
     * Update origin based on camera position
     * The origin is the screen offset that centers the camera tile
     */
    updateOrigin() {
      const config = ZOOM_LEVELS[this.zoomLevel];
      const u = config.u;
      const dims = this.terrainLoader.getDimensions();
      const rows = dims.height;
      const cols = dims.width;
      const cameraScreenX = u * (rows - this.cameraI + this.cameraJ);
      const cameraScreenY = u / 2 * (rows - this.cameraI + (cols - this.cameraJ));
      this.origin = {
        x: cameraScreenX - this.canvas.width / 2,
        y: cameraScreenY - this.canvas.height / 2
      };
    }
    /**
     * Request a render (debounced via requestAnimationFrame)
     * This prevents flickering when multiple chunks become ready simultaneously
     */
    requestRender() {
      if (this.pendingRenderRequest !== null) {
        return;
      }
      this.pendingRenderRequest = requestAnimationFrame(() => {
        this.pendingRenderRequest = null;
        this.render();
      });
    }
    /**
     * Main render loop
     */
    render() {
      const startTime = performance.now();
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, width, height);
      if (!this.loaded) {
        ctx.fillStyle = "#666";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Loading terrain data...", width / 2, height / 2);
        return;
      }
      this.updateOrigin();
      const viewport = {
        x: 0,
        y: 0,
        width,
        height
      };
      const bounds = this.coordMapper.getVisibleBounds(
        viewport,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
      const tilesRendered = this.renderTerrainLayer(bounds);
      this.renderDebugInfo(bounds, tilesRendered);
      this.lastRenderStats = {
        tilesRendered,
        renderTimeMs: performance.now() - startTime,
        visibleBounds: bounds
      };
    }
    /**
     * Render the terrain layer
     * Uses chunk-based rendering for performance (10-20x faster)
     * Falls back to tile-by-tile rendering when chunks not available
     */
    renderTerrainLayer(bounds) {
      if (this.useChunks && this.chunkCache && this.chunkCache.isSupported()) {
        return this.renderTerrainLayerChunked();
      }
      return this.renderTerrainLayerTiles(bounds);
    }
    /**
     * Chunk-based terrain rendering (fast path)
     * Renders pre-cached chunks instead of individual tiles
     */
    renderTerrainLayerChunked() {
      if (!this.chunkCache) return 0;
      const ctx = this.ctx;
      const visibleChunks = this.chunkCache.getVisibleChunks(
        this.canvas.width,
        this.canvas.height,
        this.zoomLevel,
        this.origin
      );
      let chunksDrawn = 0;
      let tilesRendered = 0;
      for (let ci = visibleChunks.minChunkI; ci <= visibleChunks.maxChunkI; ci++) {
        for (let cj = visibleChunks.minChunkJ; cj <= visibleChunks.maxChunkJ; cj++) {
          const drawn = this.chunkCache.drawChunkToCanvas(
            ctx,
            ci,
            cj,
            this.zoomLevel,
            this.origin
          );
          if (drawn) {
            chunksDrawn++;
            tilesRendered += CHUNK_SIZE * CHUNK_SIZE;
          } else {
            tilesRendered += this.renderChunkTilesFallback(ci, cj);
          }
        }
      }
      const centerChunkI = Math.floor((visibleChunks.minChunkI + visibleChunks.maxChunkI) / 2);
      const centerChunkJ = Math.floor((visibleChunks.minChunkJ + visibleChunks.maxChunkJ) / 2);
      this.chunkCache.preloadChunks(centerChunkI, centerChunkJ, 2, this.zoomLevel);
      return tilesRendered;
    }
    /**
     * Render individual tiles for a chunk that isn't cached yet
     * Uses two-pass rendering: standard tiles first, then tall tiles on top
     */
    renderChunkTilesFallback(chunkI, chunkJ) {
      const config = ZOOM_LEVELS[this.zoomLevel];
      const tileWidth = config.tileWidth;
      const tileHeight = config.tileHeight;
      const startI = chunkI * CHUNK_SIZE;
      const startJ = chunkJ * CHUNK_SIZE;
      const endI = Math.min(startI + CHUNK_SIZE, this.terrainLoader.getDimensions().height);
      const endJ = Math.min(startJ + CHUNK_SIZE, this.terrainLoader.getDimensions().width);
      const BASE_TILE_HEIGHT = 32;
      const standardTiles = [];
      const tallTiles = [];
      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          const textureId = this.terrainLoader.getTextureId(j, i);
          const screenPos = this.coordMapper.mapToScreen(
            i,
            j,
            this.zoomLevel,
            this.rotation,
            this.origin
          );
          if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth || screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
            continue;
          }
          let isTall = false;
          if (this.useTextures) {
            const texture = this.textureCache.getTextureSync(textureId);
            isTall = texture !== null && texture.height > BASE_TILE_HEIGHT;
          }
          if (isTall) {
            tallTiles.push({ i, j, screenX: screenPos.x, screenY: screenPos.y, textureId });
          } else {
            standardTiles.push({ screenX: screenPos.x, screenY: screenPos.y, textureId });
          }
        }
      }
      for (const tile of standardTiles) {
        this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, false);
      }
      tallTiles.sort((a, b) => b.i + b.j - (a.i + a.j));
      for (const tile of tallTiles) {
        this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, true);
      }
      return standardTiles.length + tallTiles.length;
    }
    /**
     * Tile-by-tile terrain rendering (slow path, fallback)
     * Uses two-pass rendering: standard tiles first, then tall tiles on top
     */
    renderTerrainLayerTiles(bounds) {
      const config = ZOOM_LEVELS[this.zoomLevel];
      const tileWidth = config.tileWidth;
      const tileHeight = config.tileHeight;
      const BASE_TILE_HEIGHT = 32;
      const standardTiles = [];
      const tallTiles = [];
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          const textureId = this.terrainLoader.getTextureId(j, i);
          const screenPos = this.coordMapper.mapToScreen(
            i,
            j,
            this.zoomLevel,
            this.rotation,
            this.origin
          );
          if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth || screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
            continue;
          }
          let isTall = false;
          if (this.useTextures) {
            const texture = this.textureCache.getTextureSync(textureId);
            isTall = texture !== null && texture.height > BASE_TILE_HEIGHT;
          }
          if (isTall) {
            tallTiles.push({ i, j, screenX: screenPos.x, screenY: screenPos.y, textureId });
          } else {
            standardTiles.push({ screenX: screenPos.x, screenY: screenPos.y, textureId });
          }
        }
      }
      for (const tile of standardTiles) {
        this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, false);
      }
      tallTiles.sort((a, b) => b.i + b.j - (a.i + a.j));
      for (const tile of tallTiles) {
        this.drawIsometricTile(tile.screenX, tile.screenY, config, tile.textureId, true);
      }
      return standardTiles.length + tallTiles.length;
    }
    /**
     * Draw a single isometric diamond tile
     *
     * Diamond shape vertices (relative to top point):
     *       (0, 0) - top
     *   (-u, h/2)  - left
     *       (0, h) - bottom
     *    (u, h/2)  - right
     *
     * Where: u = tileWidth/2, h = tileHeight
     *
     * Tiles are positioned using the seamless formula which ensures adjacent tiles
     * overlap by exactly half their dimensions. This means the opaque diamond content
     * of one tile covers the transparent corners of adjacent tiles.
     *
     * When textures are available: Draw ONLY the texture (no background rectangle)
     * When textures are NOT available: Draw a diamond-shaped fallback color
     *
     * @param isTallTexture - If true, draw texture at full height with upward offset
     */
    drawIsometricTile(screenX, screenY, config, textureId, isTallTexture = false) {
      const ctx = this.ctx;
      const halfWidth = config.tileWidth / 2;
      const halfHeight = config.tileHeight / 2;
      const x = Math.round(screenX);
      const y = Math.round(screenY);
      let texture = null;
      if (this.useTextures) {
        texture = this.textureCache.getTextureSync(textureId);
      }
      if (texture) {
        if (isTallTexture) {
          const scale = config.tileWidth / 64;
          const scaledHeight = texture.height * scale;
          const yOffset = scaledHeight - config.tileHeight;
          ctx.drawImage(
            texture,
            x - halfWidth,
            y - yOffset,
            config.tileWidth,
            scaledHeight
          );
        } else {
          ctx.drawImage(
            texture,
            x - halfWidth,
            y,
            config.tileWidth,
            config.tileHeight
          );
        }
      } else {
        const color = this.textureCache.getFallbackColor(textureId);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + halfWidth, y + halfHeight);
        ctx.lineTo(x, y + config.tileHeight);
        ctx.lineTo(x - halfWidth, y + halfHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
    /**
     * Render debug information overlay
     */
    renderDebugInfo(bounds, tilesRendered) {
      const ctx = this.ctx;
      const config = ZOOM_LEVELS[this.zoomLevel];
      const cacheStats = this.textureCache.getStats();
      const chunkStats = this.chunkCache?.getStats();
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(10, 10, 420, 210);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      const availableSeasonStr = this.availableSeasons.length === 1 ? `(only ${SEASON_NAMES[this.availableSeasons[0]]})` : `(${this.availableSeasons.length} available)`;
      const lines = [
        `Map: ${this.mapName} (${this.terrainLoader.getDimensions().width}\xD7${this.terrainLoader.getDimensions().height})`,
        `Terrain: ${this.textureCache.getTerrainType()} | Season: ${SEASON_NAMES[this.season]} ${availableSeasonStr}`,
        `Camera: (${Math.round(this.cameraI)}, ${Math.round(this.cameraJ)})`,
        `Zoom Level: ${this.zoomLevel} (${config.tileWidth}\xD7${config.tileHeight}px)`,
        `Visible: i[${bounds.minI}..${bounds.maxI}] j[${bounds.minJ}..${bounds.maxJ}]`,
        `Tiles Rendered: ${tilesRendered}`,
        `Textures: ${this.useTextures ? "ON" : "OFF"} | Cache: ${cacheStats.size}/${cacheStats.maxSize} (${(cacheStats.hitRate * 100).toFixed(1)}% hit)`,
        `Chunks: ${this.useChunks ? "ON" : "OFF"} | Cached: ${chunkStats?.cacheSizes[this.zoomLevel] || 0} (${((chunkStats?.hitRate || 0) * 100).toFixed(1)}% hit)`,
        `Render Time: ${this.lastRenderStats.renderTimeMs.toFixed(2)}ms`,
        `Controls: Drag=Pan, Wheel=Zoom, T=Textures, C=Chunks, S=Season`
      ];
      lines.forEach((line, index) => {
        ctx.fillText(line, 20, 30 + index * 18);
      });
    }
    /**
     * Setup mouse controls for pan and zoom
     */
    setupMouseControls() {
      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const oldZoom = this.zoomLevel;
        if (e.deltaY > 0) {
          this.zoomLevel = Math.max(0, this.zoomLevel - 1);
        } else {
          this.zoomLevel = Math.min(3, this.zoomLevel + 1);
        }
        if (oldZoom !== this.zoomLevel) {
          this.render();
        }
      });
      this.canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0 || e.button === 2) {
          this.isDragging = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
          this.canvas.style.cursor = "grabbing";
        }
      });
      this.canvas.addEventListener("mousemove", (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        const config = ZOOM_LEVELS[this.zoomLevel];
        const u = config.u;
        const mapDeltaI = (dy / u + dx / (2 * u)) * 0.5;
        const mapDeltaJ = (dy / u - dx / (2 * u)) * 0.5;
        this.cameraI += mapDeltaI;
        this.cameraJ -= mapDeltaJ;
        const dims = this.terrainLoader.getDimensions();
        this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
        this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.render();
      });
      const stopDrag = () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.canvas.style.cursor = "grab";
        }
      };
      this.canvas.addEventListener("mouseup", stopDrag);
      this.canvas.addEventListener("mouseleave", stopDrag);
      this.canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
      this.canvas.style.cursor = "grab";
      window.addEventListener("keydown", (e) => {
        if (e.key === "t" || e.key === "T") {
          this.toggleTextures();
        }
        if (e.key === "c" || e.key === "C") {
          this.toggleChunks();
        }
        if (e.key === "s" || e.key === "S") {
          this.cycleSeason();
        }
      });
    }
    /**
     * Setup window resize handler
     */
    setupResizeHandler() {
      const resizeObserver = new ResizeObserver(() => {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.render();
      });
      resizeObserver.observe(this.canvas);
    }
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    /**
     * Set zoom level (0-3)
     */
    setZoomLevel(level) {
      this.zoomLevel = Math.max(0, Math.min(3, level));
      this.render();
    }
    /**
     * Get current zoom level
     */
    getZoomLevel() {
      return this.zoomLevel;
    }
    /**
     * Set rotation (currently disabled - always NORTH)
     */
    setRotation(rotation) {
      this.rotation = rotation;
      this.render();
    }
    /**
     * Get current rotation
     */
    getRotation() {
      return this.rotation;
    }
    /**
     * Pan camera by delta in map coordinates
     */
    pan(deltaI, deltaJ) {
      this.cameraI += deltaI;
      this.cameraJ += deltaJ;
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
      this.render();
    }
    /**
     * Center camera on specific map coordinates
     */
    centerOn(i, j) {
      this.cameraI = i;
      this.cameraJ = j;
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
      this.render();
    }
    /**
     * Get camera position
     */
    getCameraPosition() {
      return { i: this.cameraI, j: this.cameraJ };
    }
    /**
     * Get the current screen origin (for coordinate mapping)
     * Origin is computed so that camera position appears at canvas center
     */
    getOrigin() {
      return this.origin;
    }
    /**
     * Convert screen coordinates to map coordinates
     */
    screenToMap(screenX, screenY) {
      return this.coordMapper.screenToMap(
        screenX,
        screenY,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
    }
    /**
     * Convert map coordinates to screen coordinates
     */
    mapToScreen(i, j) {
      return this.coordMapper.mapToScreen(
        i,
        j,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
    }
    /**
     * Get terrain loader (for accessing terrain data)
     */
    getTerrainLoader() {
      return this.terrainLoader;
    }
    /**
     * Get coordinate mapper
     */
    getCoordinateMapper() {
      return this.coordMapper;
    }
    /**
     * Check if map is loaded
     */
    isLoaded() {
      return this.loaded;
    }
    /**
     * Get map name
     */
    getMapName() {
      return this.mapName;
    }
    /**
     * Get last render statistics
     */
    getRenderStats() {
      return { ...this.lastRenderStats };
    }
    /**
     * Unload and cleanup
     */
    unload() {
      this.terrainLoader.unload();
      this.textureCache.clear();
      this.chunkCache?.clearAll();
      this.chunkCache = null;
      this.loaded = false;
      this.mapName = "";
      this.render();
    }
    // =========================================================================
    // TEXTURE API
    // =========================================================================
    /**
     * Toggle texture rendering on/off
     */
    toggleTextures() {
      this.useTextures = !this.useTextures;
      console.log(`[IsometricRenderer] Textures: ${this.useTextures ? "ON" : "OFF"}`);
      this.render();
    }
    /**
     * Toggle chunk-based rendering on/off
     * When OFF, uses tile-by-tile rendering (slower but useful for debugging)
     */
    toggleChunks() {
      this.useChunks = !this.useChunks;
      console.log(`[IsometricRenderer] Chunks: ${this.useChunks ? "ON" : "OFF"}`);
      this.render();
    }
    /**
     * Set texture rendering mode
     */
    setTextureMode(enabled) {
      this.useTextures = enabled;
      this.render();
    }
    /**
     * Check if texture rendering is enabled
     */
    isTextureMode() {
      return this.useTextures;
    }
    /**
     * Get texture cache for advanced operations
     */
    getTextureCache() {
      return this.textureCache;
    }
    /**
     * Preload textures for visible area
     */
    async preloadTextures() {
      if (!this.loaded) return;
      const viewport = {
        x: 0,
        y: 0,
        width: this.canvas.width,
        height: this.canvas.height
      };
      const bounds = this.coordMapper.getVisibleBounds(
        viewport,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
      const textureIds = /* @__PURE__ */ new Set();
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          textureIds.add(this.terrainLoader.getTextureId(j, i));
        }
      }
      await this.textureCache.preload(Array.from(textureIds));
      this.render();
    }
    // =========================================================================
    // SEASON API
    // =========================================================================
    /**
     * Set the season for terrain textures
     * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.textureCache.setSeason(season);
        this.chunkCache?.clearAll();
        console.log(`[IsometricRenderer] Season changed to ${SEASON_NAMES[season]}`);
        this.render();
      }
    }
    /**
     * Get current season
     */
    getSeason() {
      return this.season;
    }
    /**
     * Get current season name
     */
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Cycle to next season (for keyboard shortcut)
     * Only cycles through available seasons for this terrain type
     */
    cycleSeason() {
      if (this.availableSeasons.length <= 1) {
        console.log(`[IsometricRenderer] Only one season available, cannot cycle`);
        return;
      }
      const currentIndex = this.availableSeasons.indexOf(this.season);
      const nextIndex = (currentIndex + 1) % this.availableSeasons.length;
      const nextSeason = this.availableSeasons[nextIndex];
      this.setSeason(nextSeason);
    }
    /**
     * Get available seasons for current terrain type
     */
    getAvailableSeasons() {
      return [...this.availableSeasons];
    }
  };

  // src/client/terrain-test.ts
  document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("terrainCanvas");
    const mapSelect = document.getElementById("mapSelect");
    const zoomSelect = document.getElementById("zoomSelect");
    const seasonSelect = document.getElementById("seasonSelect");
    const loadBtn = document.getElementById("loadBtn");
    const centerBtn = document.getElementById("centerBtn");
    const status = document.getElementById("status");
    const loading = document.getElementById("loading");
    if (!canvas) {
      console.error("Canvas not found");
      return;
    }
    let renderer = null;
    function resizeCanvas() {
      const container = document.getElementById("canvas-container");
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
      if (renderer) {
        renderer.render();
      }
    }
    async function loadMap(mapName) {
      const selectedMap = mapName || mapSelect.value;
      status.textContent = `Loading ${selectedMap}...`;
      loading.classList.remove("hidden");
      try {
        if (!renderer) {
          renderer = new IsometricTerrainRenderer(canvas);
          window.terrainRenderer = renderer;
        }
        await renderer.loadMap(selectedMap);
        status.textContent = `Loaded: ${selectedMap}`;
        loading.classList.add("hidden");
      } catch (error) {
        console.error("Failed to load map:", error);
        status.textContent = `Error: ${error.message}`;
        loading.classList.add("hidden");
      }
    }
    function handleZoomChange() {
      if (renderer) {
        const level = parseInt(zoomSelect.value, 10);
        renderer.setZoomLevel(level);
      }
    }
    function handleSeasonChange() {
      if (renderer) {
        const season = parseInt(seasonSelect.value, 10);
        renderer.setSeason(season);
        status.textContent = `Season: ${renderer.getSeasonName()}`;
      }
    }
    function centerMap() {
      if (renderer && renderer.isLoaded()) {
        const loader = renderer.getTerrainLoader();
        const dims = loader.getDimensions();
        renderer.centerOn(Math.floor(dims.height / 2), Math.floor(dims.width / 2));
      }
    }
    const textureBtn = document.getElementById("textureBtn");
    const preloadBtn = document.getElementById("preloadBtn");
    if (loadBtn) loadBtn.addEventListener("click", () => loadMap());
    if (centerBtn) centerBtn.addEventListener("click", centerMap);
    if (zoomSelect) zoomSelect.addEventListener("change", handleZoomChange);
    if (seasonSelect) seasonSelect.addEventListener("change", handleSeasonChange);
    if (textureBtn) textureBtn.addEventListener("click", toggleTextures);
    if (preloadBtn) preloadBtn.addEventListener("click", preloadTextures);
    window.addEventListener("resize", resizeCanvas);
    function toggleTextures() {
      if (renderer) {
        renderer.toggleTextures();
        const mode = renderer.isTextureMode();
        status.textContent = `Textures: ${mode ? "ON" : "OFF"}`;
      }
    }
    async function preloadTextures() {
      if (renderer) {
        status.textContent = "Preloading textures...";
        await renderer.preloadTextures();
        const cache = renderer.getTextureCache();
        const stats = cache.getStats();
        status.textContent = `Preloaded: ${stats.size} textures`;
      }
    }
    window.loadMap = loadMap;
    window.setZoom = (level) => {
      if (renderer) renderer.setZoomLevel(level);
      if (zoomSelect) zoomSelect.value = String(level);
    };
    window.setSeason = (season) => {
      if (renderer) renderer.setSeason(season);
      if (seasonSelect) seasonSelect.value = String(season);
    };
    window.centerMap = centerMap;
    window.toggleTextures = toggleTextures;
    window.preloadTextures = preloadTextures;
    resizeCanvas();
    setTimeout(() => loadMap("Shamba"), 500);
  });
})();
