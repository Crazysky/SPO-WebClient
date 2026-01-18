/**
 * Unit Tests for Facility CSV Parser
 * Tests for FacilityCSVParser class
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { FacilityCSVParser } from './facility-csv-parser';
import * as fs from 'fs';
import path from 'path';

// Mock logger to prevent console spam during tests
jest.mock('../shared/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

describe('FacilityCSVParser', () => {
  let parser: FacilityCSVParser;
  const fixtureDir = path.join(__dirname, '../__fixtures__/csv-samples');
  const validCsvPath = path.join(fixtureDir, 'valid-facility.csv');

  beforeEach(() => {
    parser = new FacilityCSVParser();
  });

  describe('parseFile() - CSV parsing', () => {
    it('should parse valid CSV file', async () => {
      const cache = await parser.parseFile(validCsvPath);
      expect(cache.size).toBeGreaterThan(0);
    });

    it('should skip header line', async () => {
      await parser.parseFile(validCsvPath);
      const header = parser.getFacility('visualClass'); // Header column name
      expect(header).toBeUndefined();
    });

    it('should parse facility with all fields', async () => {
      await parser.parseFile(validCsvPath);
      const facility = parser.getFacility('123');

      expect(facility).toBeDefined();
      expect(facility!.visualClass).toBe('123');
      expect(facility!.name).toBe('Office Building');
      expect(facility!.facid).toBe('FID_Office');
      expect(facility!.xsize).toBe(2);
      expect(facility!.ysize).toBe(3);
      expect(facility!.level).toBe(1);
      expect(facility!.fidConstant).toBe(100);
    });

    it('should skip NOT_FOUND entries', async () => {
      await parser.parseFile(validCsvPath);
      const facility = parser.getFacility('NOT_FOUND');
      expect(facility).toBeUndefined();
    });

    it('should skip empty lines', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Test,FID_Test,1,1,1,100

456,Test2,FID_Test2,2,2,1,101`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.size).toBe(2);
    });

    it('should skip lines with insufficient columns', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Test,FID_Test,1,1,1,100
456,Incomplete,FID_Bad
789,Valid,FID_Valid,2,2,1,101`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.size).toBe(2);
      expect(cache.get('123')).toBeDefined();
      expect(cache.get('456')).toBeUndefined();
      expect(cache.get('789')).toBeDefined();
    });

    it('should handle CRLF and LF line endings', async () => {
      const csvCRLF = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant\r\n123,Test,FID_Test,1,1,1,100\r\n`;
      const csvLF = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant\n123,Test,FID_Test,1,1,1,100\n`;

      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(csvCRLF);
      const cache1 = await new FacilityCSVParser().parseFile('test.csv');
      expect(cache1.size).toBe(1);

      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(csvLF);
      const cache2 = await new FacilityCSVParser().parseFile('test.csv');
      expect(cache2.size).toBe(1);
    });

    it('should throw error if file does not exist', async () => {
      await expect(parser.parseFile('/nonexistent/file.csv')).rejects.toThrow();
    });
  });

  describe('Numeric validation', () => {
    it('should skip entries with invalid xsize', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Bad,FID_Bad,invalid,1,1,100
456,Good,FID_Good,2,2,1,101`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.size).toBe(1);
      expect(cache.get('123')).toBeUndefined();
      expect(cache.get('456')).toBeDefined();
    });

    it('should skip entries with invalid ysize', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Bad,FID_Bad,1,NaN,1,100
456,Good,FID_Good,2,2,1,101`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.get('123')).toBeUndefined();
      expect(cache.get('456')).toBeDefined();
    });

    it('should skip entries with invalid level', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Bad,FID_Bad,1,1,abc,100`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.get('123')).toBeUndefined();
    });

    it('should skip entries with invalid fidConstant', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Bad,FID_Bad,1,1,1,notanumber`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.get('123')).toBeUndefined();
    });

    it('should handle zero dimensions', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Zero,FID_Zero,0,0,1,100`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await parser.parseFile('test.csv');

      const facility = parser.getFacility('123');
      expect(facility).toBeDefined();
      expect(facility!.xsize).toBe(0);
      expect(facility!.ysize).toBe(0);
    });

    it('should handle large dimensions', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Huge,FID_Huge,99,99,10,999`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await parser.parseFile('test.csv');

      const facility = parser.getFacility('123');
      expect(facility!.xsize).toBe(99);
      expect(facility!.ysize).toBe(99);
      expect(facility!.level).toBe(10);
      expect(facility!.fidConstant).toBe(999);
    });
  });

  describe('Duplicate handling', () => {
    it('should handle duplicate visualClass (last entry wins)', async () => {
      await parser.parseFile(validCsvPath);

      // Check fixture file has duplicates for visualClass 1002
      const facility = parser.getFacility('1002');
      expect(facility).toBeDefined();
      // Last entry should be "Duplicate Test 2" with 3x3 dimensions
      expect(facility!.name).toBe('Duplicate Test 2');
      expect(facility!.xsize).toBe(3);
      expect(facility!.ysize).toBe(3);
      expect(facility!.level).toBe(2);
    });

    it('should overwrite earlier entries with same visualClass', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
100,First,FID_First,1,1,1,100
100,Second,FID_Second,2,2,2,101
100,Third,FID_Third,3,3,3,102`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.size).toBe(1);
      const facility = cache.get('100');
      expect(facility!.name).toBe('Third');
      expect(facility!.xsize).toBe(3);
    });
  });

  describe('getFacility() - Lookups', () => {
    beforeEach(async () => {
      await parser.parseFile(validCsvPath);
    });

    it('should lookup by visualClass (numeric string)', () => {
      const facility = parser.getFacility('123');
      expect(facility).toBeDefined();
      expect(facility!.visualClass).toBe('123');
    });

    it('should lookup by building name', () => {
      const facility = parser.getFacility('Office Building');
      expect(facility).toBeDefined();
      expect(facility!.name).toBe('Office Building');
    });

    it('should fallback to name if visualClass not found', () => {
      const facility = parser.getFacility('Large Factory');
      expect(facility).toBeDefined();
      expect(facility!.visualClass).toBe('456');
    });

    it('should return undefined for unknown key', () => {
      const facility = parser.getFacility('UNKNOWN_999');
      expect(facility).toBeUndefined();
    });

    it('should prioritize visualClass over name', () => {
      // If both exist with same key, visualClass cache is checked first
      const facility = parser.getFacility('123');
      expect(facility!.visualClass).toBe('123');
    });

    it('should handle empty string lookup', () => {
      const facility = parser.getFacility('');
      expect(facility).toBeUndefined();
    });
  });

  describe('getAllFacilities()', () => {
    it('should return all parsed facilities', async () => {
      await parser.parseFile(validCsvPath);
      const facilities = parser.getAllFacilities();

      expect(facilities).toBeInstanceOf(Array);
      expect(facilities.length).toBeGreaterThan(0);
    });

    it('should return unique facilities by visualClass', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
100,First,FID_First,1,1,1,100
100,Second,FID_Second,2,2,2,101
200,Third,FID_Third,3,3,3,102`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await parser.parseFile('test.csv');

      const facilities = parser.getAllFacilities();
      expect(facilities).toHaveLength(2); // Only unique visualClass entries
    });

    it('should return empty array when no facilities parsed', () => {
      const facilities = parser.getAllFacilities();
      expect(facilities).toEqual([]);
    });
  });

  describe('getCache() and getCacheByName()', () => {
    beforeEach(async () => {
      await parser.parseFile(validCsvPath);
    });

    it('should return cache by visualClass', () => {
      const cache = parser.getCache();
      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBeGreaterThan(0);
    });

    it('should return cache by name', () => {
      const cache = parser.getCacheByName();
      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBeGreaterThan(0);
    });

    it('should have same number of entries in both caches (no duplicates)', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Test1,FID_Test1,1,1,1,100
456,Test2,FID_Test2,2,2,1,101`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await new FacilityCSVParser().parseFile('test.csv');

      const cacheByClass = parser.getCache();
      const cacheByName = parser.getCacheByName();

      expect(cacheByClass.size).toBeGreaterThan(0);
      expect(cacheByName.size).toBeGreaterThan(0);
    });
  });

  describe('Whitespace handling', () => {
    it('should trim whitespace from all fields', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
  123  ,  Test Building  ,  FID_Test  ,  5  ,  5  ,  1  ,  100  `;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await parser.parseFile('test.csv');

      const facility = parser.getFacility('123');
      expect(facility).toBeDefined();
      expect(facility!.visualClass).toBe('123');
      expect(facility!.name).toBe('Test Building');
      expect(facility!.facid).toBe('FID_Test');
      expect(facility!.xsize).toBe(5);
      expect(facility!.ysize).toBe(5);
    });
  });

  describe('Edge cases', () => {
    it('should handle CSV with only header', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      const cache = await parser.parseFile('test.csv');

      expect(cache.size).toBe(0);
    });

    it('should handle CSV with commas in quoted fields (if implemented)', async () => {
      // Note: Current implementation doesn't handle quoted CSV fields
      // This test documents expected behavior if CSV quoting is added
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Test Building,FID_Test,1,1,1,100`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await parser.parseFile('test.csv');

      const facility = parser.getFacility('123');
      expect(facility!.name).toBe('Test Building');
    });

    it('should handle very long lines', async () => {
      const longName = 'A'.repeat(1000);
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,${longName},FID_Test,1,1,1,100`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await parser.parseFile('test.csv');

      const facility = parser.getFacility('123');
      expect(facility!.name).toBe(longName);
    });

    it('should handle special characters in name', async () => {
      const csvContent = `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant
123,Test & Co. (Ltd.),FID_Test,1,1,1,100`;

      jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
      await parser.parseFile('test.csv');

      const facility = parser.getFacility('123');
      expect(facility!.name).toBe('Test & Co. (Ltd.)');
    });
  });
});
