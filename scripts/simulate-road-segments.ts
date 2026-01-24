/**
 * Simulation Script - Verify LandId decoding and Road/Bridge texture mapping
 * Uses real Shamba map data and segment data to validate the theory
 */

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// LAND ID DECODING (from theory)
// ═══════════════════════════════════════════════════════════════════════════

enum LandClass {
  ZoneA = 0,  // Grass
  ZoneB = 1,  // MidGrass
  ZoneC = 2,  // DryGround
  ZoneD = 3   // Water
}

enum LandType {
  Center = 0,
  N = 1, E = 2, S = 3, W = 4,
  NEo = 5, SEo = 6, SWo = 7, NWo = 8,
  NEi = 9, SEi = 10, SWi = 11, NWi = 12,
  Special = 13
}

const LND_CLASS_MASK = 0xC0;
const LND_TYPE_MASK = 0x3C;
const LND_VAR_MASK = 0x03;
const LND_CLASS_SHIFT = 6;
const LND_TYPE_SHIFT = 2;

function landClassOf(landId: number): LandClass {
  return ((landId & LND_CLASS_MASK) >> LND_CLASS_SHIFT) as LandClass;
}

function landTypeOf(landId: number): LandType {
  const typeValue = (landId & LND_TYPE_MASK) >> LND_TYPE_SHIFT;
  return (typeValue <= LandType.Special ? typeValue : LandType.Special) as LandType;
}

function landVarOf(landId: number): number {
  return landId & LND_VAR_MASK;
}

function isWater(landId: number): boolean {
  return landClassOf(landId) === LandClass.ZoneD;
}

const LAND_CLASS_NAMES = ['ZoneA/Grass', 'ZoneB/MidGrass', 'ZoneC/DryGround', 'ZoneD/Water'];
const LAND_TYPE_NAMES = ['Center', 'N', 'E', 'S', 'W', 'NEo', 'SEo', 'SWo', 'NWo', 'NEi', 'SEi', 'SWi', 'NWi', 'Special'];

// ═══════════════════════════════════════════════════════════════════════════
// ROAD BLOCK ID CALCULATION (from road-texture-system.ts)
// ═══════════════════════════════════════════════════════════════════════════

enum RoadBlockId {
  None = 0,
  NSRoadStart = 1, NSRoadEnd = 2,
  WERoadStart = 3, WERoadEnd = 4,
  NSRoad = 5, WERoad = 6,
  LeftPlug = 7, RightPlug = 8, TopPlug = 9, BottomPlug = 10,
  CornerW = 11, CornerS = 12, CornerN = 13, CornerE = 14,
  CrossRoads = 15
}

const ROAD_TYPE = {
  LAND_ROAD: 0,
  URBAN_ROAD: 1,
  NORTH_BRIDGE: 2,
  SOUTH_BRIDGE: 3,
  EAST_BRIDGE: 4,
  WEST_BRIDGE: 5,
  FULL_BRIDGE: 6,
} as const;

const LAND_TYPE_SHIFT = 4;
const ROAD_NONE = 0xFFFFFFFF;

function isHorizontalRoad(topId: RoadBlockId): boolean {
  return topId === RoadBlockId.WERoad ||
         topId === RoadBlockId.WERoadStart ||
         topId === RoadBlockId.WERoadEnd;
}

function roadBlockIdCalc(
  topolId: RoadBlockId,
  landId: number,
  onConcrete: boolean
): { roadBlockId: number; bridgeType: string | null } {
  if (topolId === RoadBlockId.None) {
    return { roadBlockId: ROAD_NONE, bridgeType: null };
  }

  const topolIdOrd = topolId - 1;
  const horizRoad = isHorizontalRoad(topolId);
  let result: number;
  let bridgeType: string | null = null;

  if (landClassOf(landId) === LandClass.ZoneD && !onConcrete) {
    const landType = landTypeOf(landId);

    switch (landType) {
      case LandType.N:
        result = topolIdOrd | (ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT);
        bridgeType = 'NORTH_BRIDGE';
        break;
      case LandType.S:
        result = topolIdOrd | (ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT);
        bridgeType = 'SOUTH_BRIDGE';
        break;
      case LandType.E:
        result = topolIdOrd | (ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT);
        bridgeType = 'EAST_BRIDGE';
        break;
      case LandType.W:
        result = topolIdOrd | (ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT);
        bridgeType = 'WEST_BRIDGE';
        break;
      case LandType.NEo:
        if (horizRoad) {
          result = topolIdOrd | (ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'EAST_BRIDGE (NEo corner, horiz)';
        } else {
          result = topolIdOrd | (ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'NORTH_BRIDGE (NEo corner, vert)';
        }
        break;
      case LandType.SEo:
        if (horizRoad) {
          result = topolIdOrd | (ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'EAST_BRIDGE (SEo corner, horiz)';
        } else {
          result = topolIdOrd | (ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'SOUTH_BRIDGE (SEo corner, vert)';
        }
        break;
      case LandType.SWo:
        if (horizRoad) {
          result = topolIdOrd | (ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'WEST_BRIDGE (SWo corner, horiz)';
        } else {
          result = topolIdOrd | (ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'SOUTH_BRIDGE (SWo corner, vert)';
        }
        break;
      case LandType.NWo:
        if (horizRoad) {
          result = topolIdOrd | (ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'WEST_BRIDGE (NWo corner, horiz)';
        } else {
          result = topolIdOrd | (ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT);
          bridgeType = 'NORTH_BRIDGE (NWo corner, vert)';
        }
        break;
      case LandType.Center:
      case LandType.NEi:
      case LandType.SEi:
      case LandType.SWi:
      case LandType.NWi:
        result = topolIdOrd | (ROAD_TYPE.FULL_BRIDGE << LAND_TYPE_SHIFT);
        bridgeType = 'FULL_BRIDGE';
        break;
      default:
        result = topolIdOrd;
    }
  } else {
    result = onConcrete
      ? topolIdOrd | (ROAD_TYPE.URBAN_ROAD << LAND_TYPE_SHIFT)
      : topolIdOrd;
  }

  return { roadBlockId: result, bridgeType };
}

// ═══════════════════════════════════════════════════════════════════════════
// BMP PARSER (simplified for 8-bit)
// ═══════════════════════════════════════════════════════════════════════════

interface BmpData {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function parseBmp(buffer: Buffer): BmpData {
  const dataOffset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const height = buffer.readInt32LE(22);
  const isBottomUp = height > 0;
  const absHeight = Math.abs(height);

  const bytesPerRow = Math.ceil(width / 4) * 4;
  const pixels = new Uint8Array(width * absHeight);

  for (let row = 0; row < absHeight; row++) {
    const srcRow = isBottomUp ? (absHeight - 1 - row) : row;
    const srcOffset = dataOffset + srcRow * bytesPerRow;
    const dstOffset = row * width;

    for (let col = 0; col < width; col++) {
      pixels[dstOffset + col] = buffer[srcOffset + col];
    }
  }

  return { width, height: absHeight, pixels };
}

function getLandId(bmp: BmpData, x: number, y: number): number {
  if (x < 0 || x >= bmp.width || y < 0 || y >= bmp.height) return 0;
  return bmp.pixels[y * bmp.width + x];
}

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT PARSER
// ═══════════════════════════════════════════════════════════════════════════

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Other fields we'll ignore for now
}

function parseSegments(data: string): Segment[] {
  const lines = data.trim().split('\n').map(l => parseInt(l.trim(), 10));
  const segments: Segment[] = [];

  // Each segment is 10 values
  for (let i = 0; i + 9 < lines.length; i += 10) {
    segments.push({
      x1: lines[i],
      y1: lines[i + 1],
      x2: lines[i + 2],
      y2: lines[i + 3]
    });
  }

  return segments;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROAD BLOCK INI LOADER
// ═══════════════════════════════════════════════════════════════════════════

interface RoadBlockClass {
  id: number;
  filename: string;
  iniFile: string;
}

function loadRoadBlockClasses(dir: string): Map<number, RoadBlockClass> {
  const classes = new Map<number, RoadBlockClass>();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ini'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const idMatch = content.match(/^Id\s*=\s*(\$?[\da-fA-F]+)/m);
    const imgMatch = content.match(/^64x32\s*=\s*(.+\.bmp)/mi);

    if (idMatch && imgMatch) {
      let id: number;
      const idStr = idMatch[1];
      if (idStr.startsWith('$')) {
        id = parseInt(idStr.substring(1), 16);
      } else {
        id = parseInt(idStr, 10);
      }

      classes.set(id, {
        id,
        filename: imgMatch[1].trim(),
        iniFile: file
      });
    }
  }

  return classes;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SIMULATION
// ═══════════════════════════════════════════════════════════════════════════

const SEGMENT_DATA = `498
110
498
154
57
7
-2
-2
0
0
498
154
509
154
7
21
-2
-1
0
0
498
154
498
191
7
16
-2
1
0
0
489
154
498
154
6
7
-3
-2
0
0
509
109
509
154
-6
21
5
-1
0
0
509
154
509
190
21
28
-1
1
0
0
509
190
517
190
28
-26
1
0
0
0
505
190
509
190
15
28
0
1
0
0
505
190
505
191
15
15
0
0
0
0
498
191
505
191
16
15
1
0
0
0
497
191
498
191
16
16
0
1
0
0
497
191
497
192
16
16
0
-1
0
0
495
192
497
192
-5
16
-1
-1
0
0
495
192
495
194
-5
-4
-1
-3
0
0
465
189
465
195
38
14
-4
-4
0
0
423
189
465
189
-2
38
0
-4
0
0`;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('Road Segment Simulation - Shamba Map');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Load Shamba BMP
  const bmpPath = 'cache/Maps/Shamba/Shamba.bmp';
  if (!fs.existsSync(bmpPath)) {
    console.error('ERROR: Shamba.bmp not found at', bmpPath);
    return;
  }

  const bmpBuffer = fs.readFileSync(bmpPath);
  const bmp = parseBmp(bmpBuffer);
  console.log(`Loaded Shamba map: ${bmp.width}×${bmp.height}\n`);

  // Load road block classes
  const roadBlockDir = 'cache/RoadBlockClasses';
  const roadClasses = loadRoadBlockClasses(roadBlockDir);
  console.log(`Loaded ${roadClasses.size} road block classes\n`);

  // Parse segments
  const segments = parseSegments(SEGMENT_DATA);
  console.log(`Parsed ${segments.length} segments\n`);

  // Analyze each segment
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('SEGMENT ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const waterTiles: { x: number; y: number; landId: number; landType: LandType }[] = [];
  const bridgeTiles: { x: number; y: number; roadBlockId: number; bridgeType: string; iniFile: string | undefined }[] = [];

  for (let si = 0; si < Math.min(segments.length, 10); si++) {
    const seg = segments[si];
    const isVertical = seg.x1 === seg.x2;
    const isHorizontal = seg.y1 === seg.y2;

    console.log(`\n--- Segment ${si + 1}: (${seg.x1},${seg.y1}) → (${seg.x2},${seg.y2}) [${isVertical ? 'VERTICAL' : isHorizontal ? 'HORIZONTAL' : 'DIAGONAL'}]`);

    // Sample points along the segment
    if (isVertical) {
      const x = seg.x1;
      const yMin = Math.min(seg.y1, seg.y2);
      const yMax = Math.max(seg.y1, seg.y2);

      for (let y = yMin; y <= yMax; y++) {
        const landId = getLandId(bmp, x, y);
        const lc = landClassOf(landId);
        const lt = landTypeOf(landId);
        const lv = landVarOf(landId);

        if (isWater(landId)) {
          waterTiles.push({ x, y, landId, landType: lt });

          const { roadBlockId, bridgeType } = roadBlockIdCalc(RoadBlockId.NSRoad, landId, false);
          const roadClass = roadClasses.get(roadBlockId);

          if (bridgeType) {
            bridgeTiles.push({
              x, y,
              roadBlockId,
              bridgeType,
              iniFile: roadClass?.iniFile
            });
          }

          console.log(`  [${x},${y}] landId=${landId} (0x${landId.toString(16).padStart(2,'0')}) → ${LAND_CLASS_NAMES[lc]}, ${LAND_TYPE_NAMES[lt]}, var=${lv}`);
          console.log(`           → roadBlockId=${roadBlockId} (0x${roadBlockId.toString(16)}) → ${bridgeType || 'LAND'}`);
          if (roadClass) {
            console.log(`           → INI: ${roadClass.iniFile} → ${roadClass.filename}`);
          }
        }
      }
    } else if (isHorizontal) {
      const y = seg.y1;
      const xMin = Math.min(seg.x1, seg.x2);
      const xMax = Math.max(seg.x1, seg.x2);

      for (let x = xMin; x <= xMax; x++) {
        const landId = getLandId(bmp, x, y);
        const lc = landClassOf(landId);
        const lt = landTypeOf(landId);
        const lv = landVarOf(landId);

        if (isWater(landId)) {
          waterTiles.push({ x, y, landId, landType: lt });

          const { roadBlockId, bridgeType } = roadBlockIdCalc(RoadBlockId.WERoad, landId, false);
          const roadClass = roadClasses.get(roadBlockId);

          if (bridgeType) {
            bridgeTiles.push({
              x, y,
              roadBlockId,
              bridgeType,
              iniFile: roadClass?.iniFile
            });
          }

          console.log(`  [${x},${y}] landId=${landId} (0x${landId.toString(16).padStart(2,'0')}) → ${LAND_CLASS_NAMES[lc]}, ${LAND_TYPE_NAMES[lt]}, var=${lv}`);
          console.log(`           → roadBlockId=${roadBlockId} (0x${roadBlockId.toString(16)}) → ${bridgeType || 'LAND'}`);
          if (roadClass) {
            console.log(`           → INI: ${roadClass.iniFile} → ${roadClass.filename}`);
          }
        }
      }
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  console.log(`Water tiles found: ${waterTiles.length}`);
  console.log(`Bridge tiles needed: ${bridgeTiles.length}`);

  // Group by bridge type
  const bridgeTypeCount: Record<string, number> = {};
  for (const bt of bridgeTiles) {
    bridgeTypeCount[bt.bridgeType] = (bridgeTypeCount[bt.bridgeType] || 0) + 1;
  }

  console.log('\nBridge types:');
  for (const [type, count] of Object.entries(bridgeTypeCount)) {
    console.log(`  ${type}: ${count} tiles`);
  }

  // Verify LandId theory
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('LANDID DECODING VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Check some specific landIds from LandClasses INI files
  const testCases = [
    { landId: 0, expected: { class: 'ZoneA/Grass', type: 'Center' } },
    { landId: 192, expected: { class: 'ZoneD/Water', type: 'Center' } },
    { landId: 196, expected: { class: 'ZoneD/Water', type: 'N' } },
    { landId: 200, expected: { class: 'ZoneD/Water', type: 'E' } },
    { landId: 204, expected: { class: 'ZoneD/Water', type: 'S' } },
    { landId: 208, expected: { class: 'ZoneD/Water', type: 'W' } },
    { landId: 212, expected: { class: 'ZoneD/Water', type: 'NEo' } },
    { landId: 228, expected: { class: 'ZoneD/Water', type: 'NEi' } },
    { landId: 64, expected: { class: 'ZoneB/MidGrass', type: 'Center' } },
    { landId: 128, expected: { class: 'ZoneC/DryGround', type: 'Center' } },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const lc = landClassOf(tc.landId);
    const lt = landTypeOf(tc.landId);
    const actualClass = LAND_CLASS_NAMES[lc];
    const actualType = LAND_TYPE_NAMES[lt];
    const ok = actualClass === tc.expected.class && actualType === tc.expected.type;

    console.log(`  landId=${tc.landId.toString().padStart(3)} (0x${tc.landId.toString(16).padStart(2,'0')}): ${actualClass}, ${actualType} → ${ok ? '✅' : '❌'}`);
    if (ok) passed++;
  }

  console.log(`\nTest results: ${passed}/${testCases.length} passed`);

  // Verify road block ID calculation
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('ROAD BLOCK ID VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const roadBlockTests = [
    { topId: RoadBlockId.NSRoad, landId: 0, expected: 4, desc: 'NSRoad on land' },
    { topId: RoadBlockId.WERoad, landId: 0, expected: 5, desc: 'WERoad on land' },
    { topId: RoadBlockId.NSRoad, landId: 192, expected: 100, desc: 'NSRoad on water center → FULL_BRIDGE' },
    { topId: RoadBlockId.WERoad, landId: 192, expected: 101, desc: 'WERoad on water center → FULL_BRIDGE' },
    { topId: RoadBlockId.NSRoad, landId: 196, expected: 36, desc: 'NSRoad on water N-edge → NORTH_BRIDGE' },
    { topId: RoadBlockId.NSRoad, landId: 204, expected: 52, desc: 'NSRoad on water S-edge → SOUTH_BRIDGE' },
    { topId: RoadBlockId.WERoad, landId: 200, expected: 69, desc: 'WERoad on water E-edge → EAST_BRIDGE' },
    { topId: RoadBlockId.WERoad, landId: 208, expected: 85, desc: 'WERoad on water W-edge → WEST_BRIDGE' },
  ];

  let roadPassed = 0;
  for (const tc of roadBlockTests) {
    const { roadBlockId } = roadBlockIdCalc(tc.topId, tc.landId, false);
    const roadClass = roadClasses.get(roadBlockId);
    const ok = roadBlockId === tc.expected;

    console.log(`  ${tc.desc}:`);
    console.log(`    calculated=${roadBlockId} (0x${roadBlockId.toString(16)}), expected=${tc.expected} (0x${tc.expected.toString(16)}) → ${ok ? '✅' : '❌'}`);
    if (roadClass) {
      console.log(`    INI: ${roadClass.iniFile} → ${roadClass.filename}`);
    } else if (roadBlockId !== ROAD_NONE) {
      console.log(`    ⚠️  No INI file found for roadBlockId ${roadBlockId}`);
    }
    if (ok) roadPassed++;
  }

  console.log(`\nRoad block tests: ${roadPassed}/${roadBlockTests.length} passed`);
}

main().catch(console.error);
