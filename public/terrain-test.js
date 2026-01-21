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
      console.log(`[TerrainLoader] Loading map: ${mapName}`);
      const apiUrl = `/api/map-data/${encodeURIComponent(mapName)}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch map data: ${response.status} - ${errorText}`);
      }
      const mapFileData = await response.json();
      const { metadata, bmpUrl } = mapFileData;
      console.log(`[TerrainLoader] Metadata loaded: ${metadata.name} (${metadata.width}\xD7${metadata.height})`);
      console.log(`[TerrainLoader] BMP URL: ${bmpUrl}`);
      const bmpResponse = await fetch(bmpUrl);
      if (!bmpResponse.ok) {
        throw new Error(`Failed to fetch BMP file: ${bmpResponse.status}`);
      }
      const bmpBuffer = await bmpResponse.arrayBuffer();
      console.log(`[TerrainLoader] BMP downloaded: ${bmpBuffer.byteLength} bytes`);
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
      console.log(`[TerrainLoader] Loaded ${mapName}: ${this.width}\xD7${this.height}, ${this.pixelData.length} pixels`);
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

  // src/client/renderer/coordinate-mapper.ts
  var CoordinateMapper = class {
    constructor(mapWidth = 2e3, mapHeight = 2e3) {
      this.mapWidth = mapWidth;
      this.mapHeight = mapHeight;
    }
    /**
     * Convert map tile coordinates (i, j) to screen pixel coordinates (x, y)
     * Based on Lander.pas algorithm
     *
     * @param i - Row index (0 to mapHeight-1)
     * @param j - Column index (0 to mapWidth-1)
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
     * @param origin - Camera position (screen origin offset)
     * @returns Screen coordinates {x, y}
     */
    mapToScreen(i, j, zoomLevel, rotation, origin) {
      const config = ZOOM_LEVELS[zoomLevel];
      const u = config.u;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const x = 2 * u * (rows - i + j) - origin.x;
      const y = u * (rows - i + (cols - j)) - origin.y;
      return { x, y };
    }
    /**
     * Convert screen pixel coordinates (x, y) to map tile coordinates (i, j)
     * Based on Lander.pas algorithm
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
      const tu = u << 2;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const screenX = x + origin.x;
      const screenY = y + origin.y;
      const aux = 2 * (u * cols - screenY);
      const h1 = aux + tu * (rows + 1) - screenX;
      const i = Math.floor(h1 / tu);
      const h2 = aux + screenX;
      const j = Math.floor(h2 / tu);
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
      }
    }
    /**
     * Get the current terrain type
     */
    getTerrainType() {
      return this.terrainType;
    }
    /**
     * Generate cache key for a texture
     */
    getCacheKey(paletteIndex, zoomLevel) {
      return `${this.terrainType}-${zoomLevel}-${paletteIndex}`;
    }
    /**
     * Get texture for a palette index (sync - returns cached or null)
     * Use this for fast rendering - if not cached, returns null and starts loading
     */
    getTextureSync(paletteIndex, zoomLevel) {
      const key = this.getCacheKey(paletteIndex, zoomLevel);
      const entry = this.cache.get(key);
      if (entry && entry.texture) {
        entry.lastAccess = ++this.accessCounter;
        this.hits++;
        return entry.texture;
      }
      if (!entry || !entry.loading) {
        this.loadTexture(paletteIndex, zoomLevel);
      }
      this.misses++;
      return null;
    }
    /**
     * Get texture for a palette index (async - waits for load)
     */
    async getTextureAsync(paletteIndex, zoomLevel) {
      const key = this.getCacheKey(paletteIndex, zoomLevel);
      const entry = this.cache.get(key);
      if (entry) {
        entry.lastAccess = ++this.accessCounter;
        if (entry.texture) {
          this.hits++;
          return entry.texture;
        }
        if (entry.loadPromise) {
          return entry.loadPromise;
        }
      }
      this.misses++;
      return this.loadTexture(paletteIndex, zoomLevel);
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
    async loadTexture(paletteIndex, zoomLevel) {
      const key = this.getCacheKey(paletteIndex, zoomLevel);
      const existing = this.cache.get(key);
      if (existing?.loadPromise) {
        return existing.loadPromise;
      }
      const loadPromise = this.fetchTexture(paletteIndex, zoomLevel);
      this.cache.set(key, {
        texture: null,
        lastAccess: ++this.accessCounter,
        loading: true,
        loadPromise
      });
      try {
        const texture = await loadPromise;
        const entry = this.cache.get(key);
        if (entry) {
          entry.texture = texture;
          entry.loading = false;
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
     */
    async fetchTexture(paletteIndex, zoomLevel) {
      const url = `/api/terrain-texture/${encodeURIComponent(this.terrainType)}/${zoomLevel}/${paletteIndex}`;
      try {
        const response = await fetch(url);
        if (response.status === 204) {
          return null;
        }
        if (!response.ok) {
          return null;
        }
        const blob = await response.blob();
        return await createImageBitmap(blob);
      } catch (error) {
        console.warn(`[TextureCache] Failed to load texture ${paletteIndex}:`, error);
        return null;
      }
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
     * Preload textures for a range of palette indices
     */
    async preload(paletteIndices, zoomLevel) {
      const loadPromises = paletteIndices.map(
        (index) => this.getTextureAsync(index, zoomLevel)
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
    has(paletteIndex, zoomLevel) {
      const key = this.getCacheKey(paletteIndex, zoomLevel);
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
    constructor(canvas) {
      // Texture mode (true = use textures, false = use colors only)
      this.useTextures = true;
      // View state
      this.zoomLevel = 2;
      // Default zoom (16×32 pixels per tile)
      this.rotation = 0 /* NORTH */;
      // Camera position in map coordinates (center tile)
      this.cameraI = 500;
      this.cameraJ = 500;
      // Screen origin (for Lander.pas formula)
      this.origin = { x: 0, y: 0 };
      // State flags
      this.loaded = false;
      this.mapName = "";
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
      this.canvas = canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D rendering context");
      }
      this.ctx = ctx;
      this.terrainLoader = new TerrainLoader();
      this.coordMapper = new CoordinateMapper(2e3, 2e3);
      this.textureCache = new TextureCache(200);
      this.setupMouseControls();
      this.setupResizeHandler();
      this.render();
    }
    /**
     * Load terrain data for a map
     * @param mapName - Name of the map (e.g., 'Shamba', 'Antiqua')
     */
    async loadMap(mapName) {
      console.log(`[IsometricRenderer] Loading map: ${mapName}`);
      const terrainType = getTerrainTypeForMap(mapName);
      this.textureCache.setTerrainType(terrainType);
      console.log(`[IsometricRenderer] Terrain type: ${terrainType}`);
      const terrainData = await this.terrainLoader.loadMap(mapName);
      this.coordMapper = new CoordinateMapper(
        terrainData.width,
        terrainData.height
      );
      this.cameraI = Math.floor(terrainData.height / 2);
      this.cameraJ = Math.floor(terrainData.width / 2);
      this.updateOrigin();
      this.mapName = mapName;
      this.loaded = true;
      console.log(`[IsometricRenderer] Map loaded: ${terrainData.width}\xD7${terrainData.height}`);
      this.render();
      return terrainData;
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
      const cameraScreenX = 2 * u * (rows - this.cameraI + this.cameraJ);
      const cameraScreenY = u * (rows - this.cameraI + (cols - this.cameraJ));
      this.origin = {
        x: cameraScreenX - this.canvas.width / 2,
        y: cameraScreenY - this.canvas.height / 2
      };
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
     * Draws isometric diamond tiles for each visible map cell
     */
    renderTerrainLayer(bounds) {
      const ctx = this.ctx;
      const config = ZOOM_LEVELS[this.zoomLevel];
      const u = config.u;
      const tileWidth = config.tileWidth;
      const tileHeight = config.tileHeight;
      let tilesRendered = 0;
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
          this.drawIsometricTile(screenPos.x, screenPos.y, config, textureId);
          tilesRendered++;
        }
      }
      return tilesRendered;
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
     */
    drawIsometricTile(screenX, screenY, config, textureId) {
      const ctx = this.ctx;
      const halfWidth = config.tileWidth / 2;
      const halfHeight = config.tileHeight / 2;
      let textureDrawn = false;
      if (this.useTextures) {
        const texture = this.textureCache.getTextureSync(textureId, config.level);
        if (texture) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX - halfWidth, screenY + halfHeight);
          ctx.lineTo(screenX, screenY + config.tileHeight);
          ctx.lineTo(screenX + halfWidth, screenY + halfHeight);
          ctx.closePath();
          ctx.clip();
          const texWidth = config.tileWidth;
          const texHeight = config.tileHeight;
          ctx.drawImage(
            texture,
            screenX - halfWidth,
            screenY,
            texWidth,
            texHeight
          );
          ctx.restore();
          textureDrawn = true;
        }
      }
      if (!textureDrawn) {
        const color = this.textureCache.getFallbackColor(textureId);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX - halfWidth, screenY + halfHeight);
        ctx.lineTo(screenX, screenY + config.tileHeight);
        ctx.lineTo(screenX + halfWidth, screenY + halfHeight);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      if (this.zoomLevel >= 2) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX - halfWidth, screenY + halfHeight);
        ctx.lineTo(screenX, screenY + config.tileHeight);
        ctx.lineTo(screenX + halfWidth, screenY + halfHeight);
        ctx.closePath();
        ctx.stroke();
      }
    }
    /**
     * Render debug information overlay
     */
    renderDebugInfo(bounds, tilesRendered) {
      const ctx = this.ctx;
      const config = ZOOM_LEVELS[this.zoomLevel];
      const cacheStats = this.textureCache.getStats();
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(10, 10, 380, 180);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      const lines = [
        `Map: ${this.mapName} (${this.terrainLoader.getDimensions().width}\xD7${this.terrainLoader.getDimensions().height})`,
        `Terrain: ${this.textureCache.getTerrainType()}`,
        `Camera: (${Math.round(this.cameraI)}, ${Math.round(this.cameraJ)})`,
        `Zoom Level: ${this.zoomLevel} (${config.tileWidth}\xD7${config.tileHeight}px)`,
        `Visible: i[${bounds.minI}..${bounds.maxI}] j[${bounds.minJ}..${bounds.maxJ}]`,
        `Tiles Rendered: ${tilesRendered}`,
        `Textures: ${this.useTextures ? "ON" : "OFF"} | Cache: ${cacheStats.size}/${cacheStats.maxSize} (${(cacheStats.hitRate * 100).toFixed(1)}% hit)`,
        `Render Time: ${this.lastRenderStats.renderTimeMs.toFixed(2)}ms`,
        `Controls: Drag=Pan, Wheel=Zoom, T=Toggle Textures`
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
      await this.textureCache.preload(Array.from(textureIds), this.zoomLevel);
      this.render();
    }
  };

  // src/client/terrain-test.ts
  document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("terrainCanvas");
    const mapSelect = document.getElementById("mapSelect");
    const zoomSelect = document.getElementById("zoomSelect");
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
    window.centerMap = centerMap;
    window.toggleTextures = toggleTextures;
    window.preloadTextures = preloadTextures;
    resizeCanvas();
    setTimeout(() => loadMap("Shamba"), 500);
  });
})();
