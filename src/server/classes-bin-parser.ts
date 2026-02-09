/**
 * CLASSES.BIN Parser
 *
 * Parses the binary BuildingClasses/CLASSES.BIN archive to extract all
 * building class definitions (VisualClass ID → texture path, size, properties).
 *
 * This is the AUTHORITATIVE source for building visual data in the SPO client.
 * See VisualClass Matching spec Section 6.2 for the binary format.
 *
 * Binary format (little-endian):
 *   HEADER: String table
 *     uint16 StringCount
 *     StringCount × CRLF-terminated strings (Windows-1252)
 *
 *   BODY: Visual classes
 *     uint16 ClassCount
 *     ClassCount × {
 *       uint16 Id (VisualClass ID)
 *       uint8  SectionCount
 *       SectionCount × {
 *         uint16 NameIndex  → Strings[NameIndex] = section name
 *         uint8  PropertyCount
 *         PropertyCount × {
 *           uint16 ValueIndex → Strings[ValueIndex] = "Key=Value"
 *         }
 *       }
 *     }
 */

import * as fs from 'fs';
import { createLogger } from '../shared/logger';

const logger = createLogger('ClassesBinParser');

/**
 * Parsed building class from CLASSES.BIN
 * Corresponds to spec Section 3.4 (BuildingClass)
 */
export interface BuildingClassEntry {
  /** VisualClass ID (unique key, uint16) */
  id: number;

  /** Footprint size in tiles (from [General] xSize, validated 0..31) */
  size: number;

  /** Human-readable name (from [General] Name) */
  name: string;

  /** Relative texture filename (from [MapImages] 64x32x0) — THE critical property */
  imagePath: string;

  /** Affects surrounding land tiles (from [General] Urban) */
  urban: boolean;

  /** Can trigger land accidents (from [General] Accident) */
  accident: boolean;

  /** Required zone type (from [General] Zone) */
  zoneType: number;

  /** Facility type identifier (from [General] FacId) */
  facId: number;

  /** Prerequisite facility type (from [General] Requires) */
  requires: number;

  /** Can be clicked/inspected (from [General] Selectable) */
  selectable: boolean;

  /** Build options: 0=default, 1=land, 2=water, 3=both (from [General] BuildOptions) */
  buildOpts: number;

  /** Sprite has animation frames (from [General] Animated) */
  animated: boolean;

  /** Level indicator X pixel offset (from [General] LevelSignX) */
  levelSignX: number;

  /** Level indicator Y pixel offset (from [General] LevelSignY) */
  levelSignY: number;
}

/**
 * Result of parsing CLASSES.BIN
 */
export interface ClassesBinResult {
  /** All parsed building classes */
  classes: BuildingClassEntry[];

  /** Lookup map: id → BuildingClassEntry */
  byId: Map<number, BuildingClassEntry>;

  /** Total string count in string table */
  stringCount: number;

  /** Total class count */
  classCount: number;
}

const BUILD_OPTIONS: Record<string, number> = {
  'default': 0,
  'land': 1,
  'water': 2,
  'both': 3,
};

/**
 * Parse CLASSES.BIN binary file
 *
 * @param filePath - Absolute path to CLASSES.BIN
 * @returns Parsed result with all building classes
 * @throws Error if file cannot be read or format is invalid
 */
export function parseClassesBin(filePath: string): ClassesBinResult {
  const buf = fs.readFileSync(filePath);
  logger.info(`[ClassesBinParser] Parsing ${filePath} (${buf.length} bytes)`);

  if (buf.length < 4) {
    throw new Error('CLASSES.BIN too small to contain header');
  }

  // Step 1: Read string table
  const stringCount = buf.readUInt16LE(0);
  let pos = 2;

  const strings: string[] = [];
  for (let i = 0; i < stringCount; i++) {
    let end = pos;
    // Find CRLF terminator (0x0D 0x0A)
    while (end < buf.length - 1) {
      if (buf[end] === 0x0D && buf[end + 1] === 0x0A) break;
      end++;
    }
    // Use latin1 (Windows-1252 compatible) for string decoding
    strings.push(buf.toString('latin1', pos, end));
    pos = end + 2; // Skip CRLF
  }

  logger.info(`[ClassesBinParser] Read ${strings.length} strings`);

  // Step 2: Read visual classes
  if (pos + 2 > buf.length) {
    throw new Error('CLASSES.BIN truncated before class count');
  }

  const classCount = buf.readUInt16LE(pos);
  pos += 2;

  const classes: BuildingClassEntry[] = [];
  const byId = new Map<number, BuildingClassEntry>();

  for (let c = 0; c < classCount; c++) {
    if (pos + 3 > buf.length) {
      logger.warn(`[ClassesBinParser] Truncated at class ${c}/${classCount}`);
      break;
    }

    const id = buf.readUInt16LE(pos);
    pos += 2;

    const sectionCount = buf.readUInt8(pos);
    pos += 1;

    // Defaults (spec Section 3.4)
    let size = 1;
    let name = '';
    let imagePath = '';
    let urban = false;
    let accident = false;
    let zoneType = 0;
    let facId = 0;
    let requires = 0;
    let selectable = true;
    let buildOpts = 0;
    let animated = false;
    let levelSignX = -2147483648; // MIN_INT sentinel
    let levelSignY = -2147483648;

    for (let s = 0; s < sectionCount; s++) {
      if (pos + 3 > buf.length) break;

      const nameIndex = buf.readUInt16LE(pos);
      pos += 2;

      const propertyCount = buf.readUInt8(pos);
      pos += 1;

      const sectionName = nameIndex < strings.length ? strings[nameIndex] : '';

      for (let p = 0; p < propertyCount; p++) {
        if (pos + 2 > buf.length) break;

        const valueIndex = buf.readUInt16LE(pos);
        pos += 2;

        const kvString = valueIndex < strings.length ? strings[valueIndex] : '';
        const eqIdx = kvString.indexOf('=');
        if (eqIdx === -1) continue;

        const key = kvString.substring(0, eqIdx);
        const value = kvString.substring(eqIdx + 1);

        // Extract properties by section (spec Section 6.3)
        if (sectionName === 'General') {
          switch (key) {
            case 'xSize': {
              const parsed = parseInt(value, 10);
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 31) size = parsed;
              break;
            }
            case 'Name': name = value; break;
            case 'Urban': urban = value === '1'; break;
            case 'Accident': accident = value === '1'; break;
            case 'Zone': zoneType = parseInt(value, 10) || 0; break;
            case 'FacId': facId = parseInt(value, 10) || 0; break;
            case 'Requires': requires = parseInt(value, 10) || 0; break;
            case 'Selectable': selectable = value !== '0'; break;
            case 'BuildOptions': buildOpts = BUILD_OPTIONS[value.toLowerCase()] ?? 0; break;
            case 'Animated': animated = value === '1'; break;
            case 'LevelSignX': levelSignX = parseInt(value, 10) ?? levelSignX; break;
            case 'LevelSignY': levelSignY = parseInt(value, 10) ?? levelSignY; break;
          }
        } else if (sectionName === 'MapImages') {
          // The critical property (spec Section 6.4)
          if (key === '64x32x0') {
            imagePath = value;
          }
        }
      }
    }

    const entry: BuildingClassEntry = {
      id, size, name, imagePath, urban, accident, zoneType, facId,
      requires, selectable, buildOpts, animated, levelSignX, levelSignY,
    };

    classes.push(entry);
    byId.set(id, entry);
  }

  logger.info(`[ClassesBinParser] Parsed ${classes.length} classes (${classes.filter(c => c.imagePath).length} with textures)`);

  return { classes, byId, stringCount, classCount };
}
