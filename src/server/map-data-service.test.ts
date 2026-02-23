import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MapDataService } from './map-data-service';

// Mock cab-extractor
jest.mock('./cab-extractor', () => ({
  extractCabArchive: jest.fn(),
}));

import { extractCabArchive } from './cab-extractor';

const mockExtractCabArchive = extractCabArchive as jest.MockedFunction<typeof extractCabArchive>;

describe('MapDataService', () => {
  let tempDir: string;
  let service: MapDataService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'map-data-test-'));
    service = new MapDataService(tempDir);
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('extractCabFile', () => {
    it('should skip extraction if already extracted', async () => {
      const mapName = 'TestMap';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, `${mapName}.bmp`), 'fake-bmp');
      fs.writeFileSync(path.join(mapDir, `${mapName}.ini`), '[General]\nName=TestMap');

      // First call: reads from disk
      await service.extractCabFile(mapName);
      // Second call: should be cached
      await service.extractCabFile(mapName);

      expect(mockExtractCabArchive).not.toHaveBeenCalled();
    });

    it('should skip extraction if bmp and ini already exist', async () => {
      const mapName = 'ExistingMap';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, `${mapName}.bmp`), 'fake-bmp');
      fs.writeFileSync(path.join(mapDir, `${mapName}.ini`), '[General]\nName=ExistingMap');

      await service.extractCabFile(mapName);

      expect(mockExtractCabArchive).not.toHaveBeenCalled();
    });

    it('should throw if CAB file does not exist', async () => {
      const mapName = 'MissingMap';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });
      // No CAB file, no BMP, no INI

      await expect(service.extractCabFile(mapName)).rejects.toThrow(
        'CAB file not found for map MissingMap'
      );
    });

    it('should call extractCabArchive when CAB exists but files are missing', async () => {
      const mapName = 'NewMap';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, 'images.cab'), 'fake-cab-data');

      // Mock successful extraction that creates the expected files
      mockExtractCabArchive.mockImplementation(async (_cabPath, targetDir) => {
        fs.writeFileSync(path.join(targetDir, `${mapName}.bmp`), 'extracted-bmp');
        fs.writeFileSync(path.join(targetDir, `${mapName}.ini`), '[General]\nName=NewMap');
        return {
          success: true,
          extractedFiles: [`${mapName}.bmp`, `${mapName}.ini`],
          errors: [],
        };
      });

      await service.extractCabFile(mapName);

      expect(mockExtractCabArchive).toHaveBeenCalledWith(
        path.join(mapDir, 'images.cab'),
        mapDir
      );
    });

    it('should throw if extraction fails', async () => {
      const mapName = 'FailMap';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, 'images.cab'), 'fake-cab-data');

      mockExtractCabArchive.mockResolvedValue({
        success: false,
        extractedFiles: [],
        errors: ['Corrupted archive'],
      });

      await expect(service.extractCabFile(mapName)).rejects.toThrow(
        'Failed to extract CAB for map FailMap: Corrupted archive'
      );
    });

    it('should throw if extraction succeeds but expected files are missing', async () => {
      const mapName = 'PartialMap';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, 'images.cab'), 'fake-cab-data');

      // Extraction "succeeds" but doesn't produce expected files
      mockExtractCabArchive.mockResolvedValue({
        success: true,
        extractedFiles: ['other-file.txt'],
        errors: [],
      });

      await expect(service.extractCabFile(mapName)).rejects.toThrow(
        'CAB extracted but expected files missing'
      );
    });
  });

  describe('getMapMetadata', () => {
    it('should throw if INI file does not exist', async () => {
      await expect(service.getMapMetadata('NoSuchMap')).rejects.toThrow(
        'INI file not found'
      );
    });

    it('should parse a valid INI file', async () => {
      const mapName = 'Shamba';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });

      const iniContent = [
        '[General]',
        'Name=Shamba',
        'Width=2000',
        'Height=2000',
        '',
        '[Ground]',
        'href=Earth',
        '',
        '[Clusters]',
        'Cluster0=PGI',
        'Cluster1=Dissidents',
        '',
        '[Towns]',
        'TownName0=Sparta',
        'TownCluster0=PGI',
        'TownX0=994',
        'TownY0=493',
      ].join('\n');

      fs.writeFileSync(path.join(mapDir, `${mapName}.ini`), iniContent);

      const metadata = await service.getMapMetadata(mapName);

      expect(metadata.name).toBe('Shamba');
      expect(metadata.width).toBe(2000);
      expect(metadata.height).toBe(2000);
      expect(metadata.groundHref).toBe('Earth');
      expect(metadata.clusters).toEqual(['PGI', 'Dissidents']);
      expect(metadata.towns).toHaveLength(1);
      expect(metadata.towns[0]).toEqual({
        name: 'Sparta',
        cluster: 'PGI',
        x: 994,
        y: 493,
      });
    });
  });

  describe('getBmpFilePath', () => {
    it('should return correct path', () => {
      const result = service.getBmpFilePath('Shamba');
      expect(result).toBe(path.join(tempDir, 'Maps', 'Shamba', 'Shamba.bmp'));
    });
  });

  describe('shutdown', () => {
    it('should clear extracted cache', async () => {
      const mapName = 'CachedMap';
      const mapDir = path.join(tempDir, 'Maps', mapName);
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, `${mapName}.bmp`), 'fake');
      fs.writeFileSync(path.join(mapDir, `${mapName}.ini`), '[General]\nName=CachedMap');

      await service.extractCabFile(mapName);
      await service.shutdown();

      // After shutdown, extraction check should re-read from disk (not cached)
      // This just verifies shutdown doesn't throw
      await service.extractCabFile(mapName);
    });
  });
});
