/**
 * Quick script to examine CLASSES.BIN structure
 * Run with: npx ts-node scripts/parse-classes-bin.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const binPath = path.join(__dirname, '../cache/BuildingClasses/CLASSES.BIN');
const buf = fs.readFileSync(binPath);

console.log('File size:', buf.length, 'bytes');

// Step 1: Read string table
const stringCount = buf.readUInt16LE(0);
console.log('String count:', stringCount);

let pos = 2;
const strings: string[] = [];

for (let i = 0; i < stringCount; i++) {
  let end = pos;
  // Find CRLF terminator
  while (end < buf.length - 1) {
    if (buf[end] === 0x0D && buf[end + 1] === 0x0A) break;
    end++;
  }
  strings.push(buf.toString('latin1', pos, end));
  pos = end + 2; // Skip CRLF
}

console.log('\nFirst 30 strings:');
strings.slice(0, 30).forEach((s, i) => console.log(`  [${i}]: "${s}"`));
console.log(`  ... (${strings.length} total)`);
console.log('\nPosition after string table:', pos);

// Step 2: Read visual classes
const classCount = buf.readUInt16LE(pos);
pos += 2;
console.log('Class count:', classCount);

interface ParsedClass {
  id: number;
  imagePath: string;
  xSize: number;
  name: string;
  urban: boolean;
}

const classes: ParsedClass[] = [];

for (let c = 0; c < classCount; c++) {
  const id = buf.readUInt16LE(pos);
  pos += 2;

  const sectionCount = buf.readUInt8(pos);
  pos += 1;

  let imagePath = '';
  let xSize = 1;
  let name = '';
  let urban = false;

  for (let s = 0; s < sectionCount; s++) {
    const nameIndex = buf.readUInt16LE(pos);
    pos += 2;

    const propertyCount = buf.readUInt8(pos);
    pos += 1;

    const sectionName = strings[nameIndex] || '';

    for (let p = 0; p < propertyCount; p++) {
      const valueIndex = buf.readUInt16LE(pos);
      pos += 2;

      const kvString = strings[valueIndex] || '';
      const eqIdx = kvString.indexOf('=');
      if (eqIdx === -1) continue;

      const key = kvString.substring(0, eqIdx);
      const value = kvString.substring(eqIdx + 1);

      if (sectionName === 'MapImages' && key === '64x32x0') {
        imagePath = value;
      }
      if (sectionName === 'General') {
        if (key === 'xSize') xSize = parseInt(value, 10) || 1;
        if (key === 'Name') name = value;
        if (key === 'Urban') urban = value === '1';
      }
    }
  }

  classes.push({ id, imagePath, xSize, name, urban });
}

console.log('\nTotal classes parsed:', classes.length);
console.log('Classes with imagePath:', classes.filter(c => c.imagePath).length);
console.log('Classes without imagePath:', classes.filter(c => !c.imagePath).length);

// Check the specific IDs
const targetIds = [602, 8022, 8062, 4722, 8072, 7282];
console.log('\n=== TARGET IDs ===');
for (const targetId of targetIds) {
  const cls = classes.find(c => c.id === targetId);
  if (cls) {
    console.log(`ID ${targetId}: name="${cls.name}", imagePath="${cls.imagePath}", xSize=${cls.xSize}, urban=${cls.urban}`);
  } else {
    console.log(`ID ${targetId}: NOT FOUND in classes.bin`);
  }
}

// Show ID range
const ids = classes.map(c => c.id).sort((a, b) => a - b);
console.log(`\nID range: ${ids[0]} to ${ids[ids.length - 1]}`);

// Show some stats
const withImages = classes.filter(c => c.imagePath);
console.log(`Total with textures: ${withImages.length} / ${classes.length}`);

// Print all classes near the target IDs
console.log('\n=== CLASSES NEAR TARGET IDs ===');
for (const targetId of targetIds) {
  const nearby = classes.filter(c => Math.abs(c.id - targetId) <= 5).sort((a, b) => a.id - b.id);
  if (nearby.length > 0) {
    console.log(`\nNear ${targetId}:`);
    for (const cls of nearby) {
      console.log(`  ID ${cls.id}: name="${cls.name}", imagePath="${cls.imagePath}", xSize=${cls.xSize}`);
    }
  }
}
