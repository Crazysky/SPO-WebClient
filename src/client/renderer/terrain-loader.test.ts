/**
 * Unit tests for TerrainLoader
 *
 * Tests BMP parsing logic with mock data since we can't actually fetch
 * files in a Jest environment without a running server.
 */

import { TerrainLoader } from './terrain-loader';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * Create a mock 8-bit BMP file as ArrayBuffer
 * @param width - Image width
 * @param height - Image height
 * @param fillValue - Value to fill all pixels (0-255)
 */
function createMockBmp(width: number, height: number, fillValue: number = 0): ArrayBuffer {
  // Calculate sizes
  const bytesPerRow = Math.ceil(width / 4) * 4; // Row padding to 4-byte boundary
  const pixelDataSize = bytesPerRow * height;
  const paletteSize = 256 * 4; // 256 colors, 4 bytes each (BGRA)
  const headerSize = 14; // BMP file header
  const dibHeaderSize = 40; // BITMAPINFOHEADER
  const dataOffset = headerSize + dibHeaderSize + paletteSize;
  const fileSize = dataOffset + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // BMP File Header (14 bytes)
  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4D; // 'M'
  view.setUint32(2, fileSize, true);    // File size
  view.setUint16(6, 0, true);           // Reserved1
  view.setUint16(8, 0, true);           // Reserved2
  view.setUint32(10, dataOffset, true); // Data offset

  // DIB Header - BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, dibHeaderSize, true);  // Header size
  view.setInt32(18, width, true);           // Width
  view.setInt32(22, height, true);          // Height (positive = bottom-up)
  view.setUint16(26, 1, true);              // Color planes
  view.setUint16(28, 8, true);              // Bits per pixel
  view.setUint32(30, 0, true);              // Compression (0 = none)
  view.setUint32(34, pixelDataSize, true);  // Image size
  view.setInt32(38, 2835, true);            // X pixels per meter (72 DPI)
  view.setInt32(42, 2835, true);            // Y pixels per meter (72 DPI)
  view.setUint32(46, 256, true);            // Colors used
  view.setUint32(50, 0, true);              // Important colors

  // Color palette (256 colors, BGRA format)
  const paletteOffset = headerSize + dibHeaderSize;
  for (let i = 0; i < 256; i++) {
    const offset = paletteOffset + i * 4;
    bytes[offset] = i;     // Blue (same as index for testing)
    bytes[offset + 1] = i; // Green
    bytes[offset + 2] = i; // Red
    bytes[offset + 3] = 0; // Alpha (unused)
  }

  // Pixel data (bottom-up, with row padding)
  for (let row = 0; row < height; row++) {
    const rowOffset = dataOffset + row * bytesPerRow;
    for (let col = 0; col < width; col++) {
      bytes[rowOffset + col] = fillValue;
    }
    // Padding bytes remain as 0
  }

  return buffer;
}

/**
 * Create a mock BMP with a test pattern
 * Each pixel value = (x + y) % 256
 */
function createPatternBmp(width: number, height: number): ArrayBuffer {
  const bytesPerRow = Math.ceil(width / 4) * 4;
  const pixelDataSize = bytesPerRow * height;
  const paletteSize = 256 * 4;
  const headerSize = 14;
  const dibHeaderSize = 40;
  const dataOffset = headerSize + dibHeaderSize + paletteSize;
  const fileSize = dataOffset + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // BMP File Header
  bytes[0] = 0x42;
  bytes[1] = 0x4D;
  view.setUint32(2, fileSize, true);
  view.setUint32(10, dataOffset, true);

  // DIB Header
  view.setUint32(14, dibHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 8, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelDataSize, true);
  view.setUint32(46, 256, true);

  // Palette (grayscale for simplicity)
  const paletteOffset = headerSize + dibHeaderSize;
  for (let i = 0; i < 256; i++) {
    const offset = paletteOffset + i * 4;
    bytes[offset] = i;
    bytes[offset + 1] = i;
    bytes[offset + 2] = i;
    bytes[offset + 3] = 0;
  }

  // Pixel data with pattern (bottom-up in BMP)
  for (let row = 0; row < height; row++) {
    const bmpRow = height - 1 - row; // BMP is bottom-up
    const rowOffset = dataOffset + bmpRow * bytesPerRow;
    for (let col = 0; col < width; col++) {
      bytes[rowOffset + col] = (col + row) % 256;
    }
  }

  return buffer;
}

describe('TerrainLoader', () => {
  let loader: TerrainLoader;

  beforeEach(() => {
    loader = new TerrainLoader();
    mockFetch.mockClear();
  });

  describe('initial state', () => {
    it('should start unloaded', () => {
      expect(loader.isLoaded()).toBe(false);
      expect(loader.getMapName()).toBe('');
      expect(loader.getMetadata()).toBeNull();
      expect(loader.getPixelData().length).toBe(0);
    });

    it('should return 0 for getTextureId when not loaded', () => {
      expect(loader.getTextureId(0, 0)).toBe(0);
      expect(loader.getTextureId(100, 100)).toBe(0);
    });

    it('should return zero dimensions when not loaded', () => {
      const dims = loader.getDimensions();
      expect(dims.width).toBe(0);
      expect(dims.height).toBe(0);
    });
  });

  describe('loadMap', () => {
    it('should load a small map successfully', async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 100,
        height: 100,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      const mockBmp = createMockBmp(100, 100, 42);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.bmp' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBmp)
        });

      const terrain = await loader.loadMap('TestMap');

      expect(terrain.width).toBe(100);
      expect(terrain.height).toBe(100);
      expect(terrain.pixelData.length).toBe(10000);
      expect(terrain.metadata.name).toBe('TestMap');

      expect(loader.isLoaded()).toBe(true);
      expect(loader.getMapName()).toBe('TestMap');
    });

    it('should throw error for failed API request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Map not found')
      });

      await expect(loader.loadMap('NonExistent')).rejects.toThrow('Failed to fetch map data: 404');
    });

    it('should throw error for failed BMP download', async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 100,
        height: 100,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.bmp' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500
        });

      await expect(loader.loadMap('TestMap')).rejects.toThrow('Failed to fetch BMP file: 500');
    });
  });

  describe('BMP parsing', () => {
    it('should parse 8-bit BMP correctly', async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 10,
        height: 10,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      // Create BMP filled with value 128
      const mockBmp = createMockBmp(10, 10, 128);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.bmp' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBmp)
        });

      await loader.loadMap('TestMap');

      // All pixels should be 128
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(loader.getTextureId(x, y)).toBe(128);
        }
      }
    });

    it('should handle BMP with row padding correctly', async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 5,  // Not a multiple of 4, so padding needed
        height: 5,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      const mockBmp = createMockBmp(5, 5, 200);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.bmp' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBmp)
        });

      await loader.loadMap('TestMap');

      expect(loader.getDimensions().width).toBe(5);
      expect(loader.getDimensions().height).toBe(5);
      expect(loader.getPixelData().length).toBe(25);

      // Verify all pixels are correct
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(loader.getTextureId(x, y)).toBe(200);
        }
      }
    });

    it('should convert bottom-up BMP to top-down correctly', async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 8,
        height: 8,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      // Pattern BMP: pixel value = (x + y) % 256
      const mockBmp = createPatternBmp(8, 8);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.bmp' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBmp)
        });

      await loader.loadMap('TestMap');

      // Check pattern is preserved after bottom-up conversion
      expect(loader.getTextureId(0, 0)).toBe(0);     // (0 + 0) % 256
      expect(loader.getTextureId(5, 0)).toBe(5);     // (5 + 0) % 256
      expect(loader.getTextureId(0, 5)).toBe(5);     // (0 + 5) % 256
      expect(loader.getTextureId(7, 7)).toBe(14);    // (7 + 7) % 256
      expect(loader.getTextureId(3, 4)).toBe(7);     // (3 + 4) % 256
    });

    it('should reject non-BMP files', async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 10,
        height: 10,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      // Create invalid buffer (not a BMP)
      const invalidBuffer = new ArrayBuffer(100);
      const bytes = new Uint8Array(invalidBuffer);
      bytes[0] = 0x89; // PNG signature
      bytes[1] = 0x50;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.png' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(invalidBuffer)
        });

      await expect(loader.loadMap('TestMap')).rejects.toThrow('Invalid BMP signature');
    });
  });

  describe('getTextureId', () => {
    beforeEach(async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 8,
        height: 8,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      const mockBmp = createPatternBmp(8, 8);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.bmp' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBmp)
        });

      await loader.loadMap('TestMap');
    });

    it('should return correct texture ID for valid coordinates', () => {
      expect(loader.getTextureId(0, 0)).toBe(0);
      expect(loader.getTextureId(7, 7)).toBe(14);
    });

    it('should return 0 for negative coordinates', () => {
      expect(loader.getTextureId(-1, 0)).toBe(0);
      expect(loader.getTextureId(0, -1)).toBe(0);
      expect(loader.getTextureId(-5, -5)).toBe(0);
    });

    it('should return 0 for out-of-bounds coordinates', () => {
      expect(loader.getTextureId(8, 0)).toBe(0);
      expect(loader.getTextureId(0, 8)).toBe(0);
      expect(loader.getTextureId(100, 100)).toBe(0);
    });
  });

  describe('unload', () => {
    it('should clear all data when unloaded', async () => {
      const mockMetadata = {
        name: 'TestMap',
        width: 10,
        height: 10,
        groundHref: 'ground/testmap.bmp',
        towns: [],
        clusters: []
      };

      const mockBmp = createMockBmp(10, 10, 50);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/test.bmp' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBmp)
        });

      await loader.loadMap('TestMap');
      expect(loader.isLoaded()).toBe(true);

      loader.unload();

      expect(loader.isLoaded()).toBe(false);
      expect(loader.getMapName()).toBe('');
      expect(loader.getMetadata()).toBeNull();
      expect(loader.getPixelData().length).toBe(0);
      expect(loader.getDimensions().width).toBe(0);
      expect(loader.getDimensions().height).toBe(0);
    });
  });

  describe('large map simulation', () => {
    it('should handle 2000x2000 map dimensions', async () => {
      // Note: We don't actually create a 4MB buffer in tests, just check dimensions
      const mockMetadata = {
        name: 'Antiqua',
        width: 2000,
        height: 2000,
        groundHref: 'ground/antiqua.bmp',
        towns: [
          { name: 'Sparta', cluster: 'PGI', x: 994, y: 493 }
        ],
        clusters: ['Moab', 'Dissidents', 'UW', 'PGI', 'Mariko']
      };

      // Create a smaller BMP but with metadata claiming 2000x2000
      // The actual BMP will be 10x10 for test performance
      const mockBmp = createMockBmp(10, 10, 100);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ metadata: mockMetadata, bmpUrl: '/antiqua.bmp' })
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockBmp)
        });

      // This will log a warning about dimension mismatch, which is expected
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await loader.loadMap('Antiqua');

      // Metadata reports 2000x2000, but actual BMP is 10x10
      expect(loader.getMetadata()?.width).toBe(2000);
      expect(loader.getMetadata()?.height).toBe(2000);
      expect(loader.getDimensions().width).toBe(10); // Actual BMP dimensions
      expect(loader.getDimensions().height).toBe(10);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dimension mismatch')
      );

      consoleSpy.mockRestore();
    });
  });
});
