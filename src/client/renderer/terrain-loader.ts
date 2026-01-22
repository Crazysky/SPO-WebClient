/**
 * TerrainLoader - Client-side BMP loading and parsing for terrain data
 *
 * Loads terrain data from the server API and parses 8-bit BMP files
 * to extract palette indices for each tile.
 */

import { TerrainData, MapMetadata, MapFileData } from '../../shared/map-config';

/**
 * BMP file header structure (14 bytes)
 */
interface BmpFileHeader {
  signature: string;      // 'BM' for Windows BMP
  fileSize: number;       // Total file size
  reserved1: number;      // Reserved (0)
  reserved2: number;      // Reserved (0)
  dataOffset: number;     // Offset to pixel data
}

/**
 * BMP DIB header (BITMAPINFOHEADER - 40 bytes)
 */
interface BmpDibHeader {
  headerSize: number;     // Size of this header (40)
  width: number;          // Image width in pixels
  height: number;         // Image height in pixels (positive = bottom-up)
  colorPlanes: number;    // Number of color planes (must be 1)
  bitsPerPixel: number;   // Bits per pixel (8 for indexed color)
  compression: number;    // Compression method (0 = none)
  imageSize: number;      // Size of raw bitmap data
  xPixelsPerMeter: number;
  yPixelsPerMeter: number;
  colorsUsed: number;     // Number of colors in palette
  importantColors: number;
}

/**
 * Parsed BMP data
 */
interface ParsedBmp {
  width: number;
  height: number;
  bitsPerPixel: number;
  palette: Uint8Array | null;  // RGBX palette (4 bytes per color)
  pixelData: Uint8Array;       // Raw pixel indices (for 8-bit)
}

export class TerrainLoader {
  private pixelData: Uint8Array | null = null;
  private width: number = 0;
  private height: number = 0;
  private metadata: MapMetadata | null = null;
  private loaded: boolean = false;
  private mapName: string = '';

  /**
   * Load terrain data for a map
   * @param mapName - Name of the map (e.g., 'Antiqua', 'Zyrane')
   * @returns TerrainData with pixel indices and metadata
   */
  async loadMap(mapName: string): Promise<TerrainData> {
    // 1. Fetch metadata + BMP URL from server API
    const apiUrl = `/api/map-data/${encodeURIComponent(mapName)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch map data: ${response.status} - ${errorText}`);
    }

    const mapFileData: MapFileData = await response.json();
    const { metadata, bmpUrl } = mapFileData;

    // 2. Download BMP file as ArrayBuffer
    const bmpResponse = await fetch(bmpUrl);

    if (!bmpResponse.ok) {
      throw new Error(`Failed to fetch BMP file: ${bmpResponse.status}`);
    }

    const bmpBuffer = await bmpResponse.arrayBuffer();

    // 3. Parse BMP file
    const parsedBmp = this.parseBmp(bmpBuffer);

    // 4. Validate dimensions match metadata
    if (parsedBmp.width !== metadata.width || parsedBmp.height !== metadata.height) {
      console.warn(`[TerrainLoader] Dimension mismatch: BMP is ${parsedBmp.width}×${parsedBmp.height}, metadata says ${metadata.width}×${metadata.height}`);
    }

    // 5. Store data
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
  private parseBmp(buffer: ArrayBuffer): ParsedBmp {
    const view = new DataView(buffer);

    // Parse file header (14 bytes)
    const fileHeader = this.parseFileHeader(view);

    if (fileHeader.signature !== 'BM') {
      throw new Error(`Invalid BMP signature: ${fileHeader.signature}`);
    }

    // Parse DIB header (starts at offset 14)
    const dibHeader = this.parseDibHeader(view, 14);

    if (dibHeader.bitsPerPixel !== 8) {
      throw new Error(`Unsupported BMP format: ${dibHeader.bitsPerPixel} bits per pixel (only 8-bit supported)`);
    }

    if (dibHeader.compression !== 0) {
      throw new Error(`Unsupported BMP compression: ${dibHeader.compression} (only uncompressed supported)`);
    }

    // Parse color palette (follows DIB header)
    const paletteOffset = 14 + dibHeader.headerSize;
    const paletteSize = dibHeader.colorsUsed || 256; // Default to 256 colors for 8-bit
    const palette = new Uint8Array(buffer, paletteOffset, paletteSize * 4);

    // Parse pixel data
    const pixelData = this.parsePixelData(buffer, fileHeader.dataOffset, dibHeader);

    return {
      width: dibHeader.width,
      height: Math.abs(dibHeader.height), // Height can be negative for top-down BMPs
      bitsPerPixel: dibHeader.bitsPerPixel,
      palette,
      pixelData
    };
  }

  /**
   * Parse BMP file header (14 bytes)
   */
  private parseFileHeader(view: DataView): BmpFileHeader {
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
  private parseDibHeader(view: DataView, offset: number): BmpDibHeader {
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
  private parsePixelData(buffer: ArrayBuffer, dataOffset: number, header: BmpDibHeader): Uint8Array {
    const width = header.width;
    const height = Math.abs(header.height);
    const isBottomUp = header.height > 0;

    // Calculate row stride (padded to 4-byte boundary)
    const bytesPerRow = Math.ceil(width / 4) * 4;

    // Create output array (no padding, top-down order)
    const pixelData = new Uint8Array(width * height);
    const rawData = new Uint8Array(buffer, dataOffset);

    for (let row = 0; row < height; row++) {
      // Source row (BMP is usually bottom-up)
      const srcRow = isBottomUp ? (height - 1 - row) : row;
      const srcOffset = srcRow * bytesPerRow;

      // Destination row (we want top-down)
      const dstOffset = row * width;

      // Copy row pixels (skip padding)
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
  getTextureId(x: number, y: number): number {
    if (!this.pixelData) return 0;
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.pixelData[y * this.width + x];
  }

  /**
   * Get the raw pixel data array
   * @returns Uint8Array of palette indices, or empty array if not loaded
   */
  getPixelData(): Uint8Array {
    return this.pixelData || new Uint8Array(0);
  }

  /**
   * Get map metadata
   * @returns MapMetadata or null if not loaded
   */
  getMetadata(): MapMetadata | null {
    return this.metadata;
  }

  /**
   * Get map dimensions
   * @returns Object with width and height
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Check if terrain data is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get the name of the loaded map
   */
  getMapName(): string {
    return this.mapName;
  }

  /**
   * Unload terrain data to free memory
   */
  unload(): void {
    this.pixelData = null;
    this.metadata = null;
    this.width = 0;
    this.height = 0;
    this.loaded = false;
    this.mapName = '';
    console.log('[TerrainLoader] Terrain data unloaded');
  }
}
