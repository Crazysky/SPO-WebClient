/**
 * CAB Extractor - Cross-platform Microsoft Cabinet archive extraction
 *
 * Uses the pure JavaScript 'cabarc' package for CAB extraction.
 * No external tools required (no 7-Zip, expand.exe, or cabextract needed).
 * Works on Windows, Linux, and macOS.
 */

import * as fs from 'fs';
import * as path from 'path';

// Dynamic import for cabarc (CommonJS module)
let Cabinet: any = null;

/**
 * Initialize the Cabinet module (lazy loading)
 */
async function getCabinetModule(): Promise<any> {
  if (!Cabinet) {
    try {
      Cabinet = require('cabarc');
    } catch (error) {
      throw new Error(
        'cabarc package not installed. Run: npm install cabarc\n' +
        'This package provides cross-platform CAB extraction without external tools.'
      );
    }
  }
  return Cabinet;
}

/**
 * Information about a file within a CAB archive
 */
export interface CabFileInfo {
  name: string;
  size: number;
  offset: number;
}

/**
 * Result of a CAB extraction operation
 */
export interface CabExtractionResult {
  success: boolean;
  extractedFiles: string[];  // Relative paths of extracted files
  errors: string[];
}

/**
 * Open a CAB archive and return the archive object
 * @param cabPath - Path to the CAB file
 * @returns Promise resolving to the archive object
 */
async function openCabArchive(cabPath: string): Promise<any> {
  const CabinetModule = await getCabinetModule();
  const archive = new CabinetModule.Archive();

  return new Promise((resolve, reject) => {
    archive.open(cabPath, (error: Error | null) => {
      if (error) {
        reject(new Error(`Failed to open CAB archive ${cabPath}: ${error.message}`));
      } else {
        resolve(archive);
      }
    });
  });
}

/**
 * Read a single file from an opened CAB archive
 * @param archive - The opened archive object
 * @param fileName - Name of the file to extract
 * @returns Promise resolving to the file buffer
 */
async function readFileFromArchive(archive: any, fileName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    archive.readFile(fileName, (error: Error | null, buffer: Buffer) => {
      if (error) {
        reject(new Error(`Failed to extract ${fileName}: ${error.message}`));
      } else {
        resolve(buffer);
      }
    });
  });
}

/**
 * Get list of files in a CAB archive
 * @param archive - The opened archive object
 * @returns Array of file information
 */
function getArchiveFiles(archive: any): CabFileInfo[] {
  const files: CabFileInfo[] = [];

  // The cabarc library stores files in archive.files array
  if (archive.files && Array.isArray(archive.files)) {
    for (const file of archive.files) {
      files.push({
        name: file.name || file.filename,
        size: file.size || file.uncompressedSize || 0,
        offset: file.offset || 0
      });
    }
  }

  return files;
}

/**
 * Extract all files from a CAB archive to a target directory
 *
 * @param cabPath - Path to the CAB file
 * @param targetDir - Directory to extract files to (will be created if needed)
 * @returns Extraction result with list of extracted files
 *
 * @example
 * ```typescript
 * const result = await extractCabArchive('/path/to/archive.cab', '/path/to/output');
 * if (result.success) {
 *   console.log(`Extracted ${result.extractedFiles.length} files`);
 * }
 * ```
 */
export async function extractCabArchive(
  cabPath: string,
  targetDir: string
): Promise<CabExtractionResult> {
  const result: CabExtractionResult = {
    success: false,
    extractedFiles: [],
    errors: []
  };

  // Verify CAB file exists
  if (!fs.existsSync(cabPath)) {
    result.errors.push(`CAB file not found: ${cabPath}`);
    return result;
  }

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let archive: any = null;

  try {
    // Open the CAB archive
    archive = await openCabArchive(cabPath);

    // Get list of files in archive
    const files = getArchiveFiles(archive);

    if (files.length === 0) {
      result.errors.push(`No files found in CAB archive: ${cabPath}`);
      return result;
    }

    // Extract each file
    for (const fileInfo of files) {
      try {
        const buffer = await readFileFromArchive(archive, fileInfo.name);

        // Determine output path (preserve directory structure within archive)
        const outputPath = path.join(targetDir, fileInfo.name);
        const outputDir = path.dirname(outputPath);

        // Create subdirectory if needed
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(outputPath, buffer);

        // Track extracted file (use forward slashes for consistency)
        result.extractedFiles.push(fileInfo.name.replace(/\\/g, '/'));

      } catch (fileError: any) {
        result.errors.push(`Error extracting ${fileInfo.name}: ${fileError.message}`);
      }
    }

    result.success = result.extractedFiles.length > 0;

  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

/**
 * List files in a CAB archive without extracting
 *
 * @param cabPath - Path to the CAB file
 * @returns Array of file information or null if failed
 */
export async function listCabContents(cabPath: string): Promise<CabFileInfo[] | null> {
  if (!fs.existsSync(cabPath)) {
    return null;
  }

  try {
    const archive = await openCabArchive(cabPath);
    return getArchiveFiles(archive);
  } catch (error) {
    return null;
  }
}

/**
 * Check if the cabarc package is available
 * @returns true if cabarc can be loaded
 */
export async function isCabExtractorAvailable(): Promise<boolean> {
  try {
    await getCabinetModule();
    return true;
  } catch {
    return false;
  }
}
