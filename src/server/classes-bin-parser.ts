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
 * Sound data for a building class (from [Sounds] section entries)
 * Parsed from comma-separated "key=value" strings (e.g. "wave=smoke.wav, aten=0.5, prio=1, loop=0, prob=1, per=0")
 */
export interface BuildingSoundEntry {
  /** Sound file path (from wave=) */
  waveFile: string;
  /** Volume attenuation factor (from aten=, default 1.0) */
  attenuation: number;
  /** Playback priority (from prio=, default 0) */
  priority: number;
  /** Whether sound loops (from loop=, default false) */
  looped: boolean;
  /** Probability of playing (from prob=, default 1.0) */
  probability: number;
  /** Period between plays in ms (from per=, default 0) */
  period: number;
}

/** Sound set kind enum matching Delphi TSoundSetKind */
export const SOUND_SET_KIND = {
  NONE: 0,
  ANIM_DRIVEN: 1,
  STOCHASTIC: 2,
} as const;

/**
 * Sound set data for a building class (from [Sounds] section)
 */
export interface BuildingSoundData {
  /** Sound set kind: 0=None, 1=AnimDriven, 2=Stochastic */
  kind: number;
  /** Individual sound entries */
  sounds: BuildingSoundEntry[];
}

/**
 * Visual effect data for a building class (from [Effects] section entries)
 * Parsed from comma-separated "key=value" strings (e.g. "id=5, x=32, y=16, animated=1, glassed=0")
 */
export interface BuildingEfxEntry {
  /** Effect type ID (from id=, default -1) */
  id: number;
  /** X pixel offset (from x=, default 0) */
  x: number;
  /** Y pixel offset (from y=, default 0) */
  y: number;
  /** Whether effect is animated (from animated=, default false) */
  animated: boolean;
  /** Whether effect uses glass rendering (from glassed=, default false) */
  glassed: boolean;
}

/**
 * Parsed building class from CLASSES.BIN
 * 100% parity with Delphi TBuildingClass record (MapTypes.pas)
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

  /** Number of void squares in footprint (from [General] VoidSquares) */
  voidSquares: number;

  /** Minimap/hide color as integer (from [General] HideColor, default clBlack=0) */
  hideColor: number;

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

  /** Animation sprite sub-region rectangle (from [Animations] Left/Top/Right/Bottom) */
  animArea: { left: number; top: number; right: number; bottom: number };

  /** Sound configuration (from [Sounds] section) */
  soundData: BuildingSoundData;

  /** Visual effects list (from [Effects] section) */
  efxData: BuildingEfxEntry[];

  /** Inspector tab configuration (from [InspectorInfo] section) */
  inspectorTabs: { tabName: string; tabHandler: string }[];
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
 * Parse a comma-separated "key=value" string into a Map.
 * Matches Delphi TStringList comma-split + .Values['key'] pattern.
 * Example: "wave=smoke.wav, aten=0.5, prio=1" → {wave: "smoke.wav", aten: "0.5", prio: "1"}
 */
function parseKvString(str: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!str) return map;

  const parts = str.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      map.set(trimmed.substring(0, eqIdx), trimmed.substring(eqIdx + 1));
    }
  }
  return map;
}

/**
 * Parse a sound entry from its comma-separated string representation.
 * Matches Delphi TLocalCacheManager.ParseSoundData.
 */
function parseSoundEntry(str: string): BuildingSoundEntry {
  const kv = parseKvString(str);
  return {
    waveFile: kv.get('wave') ?? '',
    attenuation: parseFloat(kv.get('aten') ?? '') || 1,
    priority: parseInt(kv.get('prio') ?? '', 10) || 0,
    looped: kv.get('loop') === '1',
    probability: parseFloat(kv.get('prob') ?? '') || 1,
    period: parseInt(kv.get('per') ?? '', 10) || 0,
  };
}

/**
 * Parse an effect entry from its comma-separated string representation.
 * Matches Delphi TLocalCacheManager.ParseEfxData.
 */
function parseEfxEntry(str: string): BuildingEfxEntry {
  const kv = parseKvString(str);
  return {
    id: parseInt(kv.get('id') ?? '', 10) || -1,
    x: parseInt(kv.get('x') ?? '', 10) || 0,
    y: parseInt(kv.get('y') ?? '', 10) || 0,
    animated: kv.get('animated') === '1',
    glassed: kv.get('glassed') === '1',
  };
}

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

    // Defaults matching Delphi TBuildingClass (MapTypes.pas)
    let size = 1;
    let name = '';
    let imagePath = '';
    let urban = false;
    let accident = false;
    let zoneType = 0;
    let facId = 0;
    let requires = 0;
    let voidSquares = 0;
    let hideColor = 0; // clBlack
    let selectable = true;
    let buildOpts = 0;
    let animated = false;
    let levelSignX = -2147483648; // low(integer) sentinel
    let levelSignY = -2147483648;
    const animArea = { left: 0, top: 0, right: 0, bottom: 0 };
    // Sounds/Effects/InspectorInfo use two-pass: collect raw kv pairs, then reconstruct
    const soundsProps = new Map<string, string>();
    const effectsProps = new Map<string, string>();
    const inspectorInfoProps = new Map<string, string>();

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

        // Extract properties by section (matches Delphi LoadBuildingClasses)
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
            case 'VoidSquares': voidSquares = parseInt(value, 10) || 0; break;
            case 'HideColor': hideColor = parseInt(value, 10) || 0; break;
            case 'Selectable': selectable = value !== '0'; break;
            case 'BuildOptions': buildOpts = BUILD_OPTIONS[value.toLowerCase()] ?? 0; break;
            case 'Animated': animated = value === '1'; break;
            case 'LevelSignX': levelSignX = parseInt(value, 10) ?? levelSignX; break;
            case 'LevelSignY': levelSignY = parseInt(value, 10) ?? levelSignY; break;
          }
        } else if (sectionName === 'MapImages') {
          if (key === '64x32x0') {
            imagePath = value;
          }
        } else if (sectionName === 'Animations') {
          switch (key) {
            case 'Left': animArea.left = parseInt(value, 10) || 0; break;
            case 'Top': animArea.top = parseInt(value, 10) || 0; break;
            case 'Right': animArea.right = parseInt(value, 10) || 0; break;
            case 'Bottom': animArea.bottom = parseInt(value, 10) || 0; break;
          }
        } else if (sectionName === 'Sounds') {
          soundsProps.set(key, value);
        } else if (sectionName === 'Effects') {
          effectsProps.set(key, value);
        } else if (sectionName === 'InspectorInfo') {
          inspectorInfoProps.set(key, value);
        }
      }
    }

    // Reconstruct sound data from collected properties
    const soundCount = parseInt(soundsProps.get('Count') ?? '', 10) || 0;
    const soundKind = soundCount > 0 ? (parseInt(soundsProps.get('Kind') ?? '', 10) || 0) : 0;
    const sounds: BuildingSoundEntry[] = [];
    for (let si = 0; si < soundCount; si++) {
      const raw = soundsProps.get(String(si));
      if (raw) {
        sounds.push(parseSoundEntry(raw));
      }
    }
    const soundData: BuildingSoundData = { kind: soundKind, sounds };

    // Reconstruct effect data from collected properties
    const efxCount = parseInt(effectsProps.get('Count') ?? '', 10) || 0;
    const efxData: BuildingEfxEntry[] = [];
    for (let ei = 0; ei < efxCount; ei++) {
      const raw = effectsProps.get(String(ei));
      if (raw) {
        efxData.push(parseEfxEntry(raw));
      }
    }

    // Reconstruct inspector tab data from collected properties
    const tabCount = parseInt(inspectorInfoProps.get('TabCount') ?? '', 10) || 0;
    const inspectorTabs: { tabName: string; tabHandler: string }[] = [];
    for (let ti = 0; ti < tabCount; ti++) {
      inspectorTabs.push({
        tabName: inspectorInfoProps.get(`TabName${ti}`) ?? '',
        tabHandler: inspectorInfoProps.get(`TabHandler${ti}`) ?? '',
      });
    }

    const entry: BuildingClassEntry = {
      id, size, name, imagePath, urban, accident, zoneType, facId,
      requires, voidSquares, hideColor, selectable, buildOpts, animated,
      levelSignX, levelSignY, animArea, soundData, efxData, inspectorTabs,
    };

    classes.push(entry);
    byId.set(id, entry);
  }

  logger.info(`[ClassesBinParser] Parsed ${classes.length} classes (${classes.filter(c => c.imagePath).length} with textures)`);

  return { classes, byId, stringCount, classCount };
}
