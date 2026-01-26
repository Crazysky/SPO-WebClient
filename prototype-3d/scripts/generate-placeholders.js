/**
 * Generate Placeholder 3D Models for Testing
 *
 * Creates simple extruded box models from building dimensions
 * to test the prototype while waiting for AI-generated models.
 *
 * Usage:
 *   node scripts/generate-placeholders.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '../public/models'),

  // Building definitions (from facility_db.csv)
  buildings: [
    {
      id: 'MapDisFoodStore64x32x0',
      name: 'Food Store',
      width: 2,
      depth: 2,
      height: 1.5,
      color: [0.9, 0.35, 0.35], // Red-ish
    },
    {
      id: 'MapDisHiResA64x32x0',
      name: 'High-Rise Residential A',
      width: 2,
      depth: 2,
      height: 5,
      color: [0.39, 0.71, 0.96], // Blue
    },
    {
      id: 'MapDisHeadquarter64x32x0',
      name: 'Headquarters',
      width: 3,
      depth: 3,
      height: 3,
      color: [0.51, 0.78, 0.52], // Green
    },
  ],
};

/**
 * Create a minimal GLB file with a colored box
 *
 * GLB format: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */
function createBoxGLB(building) {
  const { width, depth, height, color } = building;

  // Half dimensions for centered box
  const hw = width / 2;
  const hd = depth / 2;
  const hh = height / 2;

  // Box vertices (8 corners)
  const positions = new Float32Array([
    // Front face
    -hw, -hh, hd,
    hw, -hh, hd,
    hw, hh, hd,
    -hw, hh, hd,
    // Back face
    -hw, -hh, -hd,
    -hw, hh, -hd,
    hw, hh, -hd,
    hw, -hh, -hd,
    // Top face
    -hw, hh, -hd,
    -hw, hh, hd,
    hw, hh, hd,
    hw, hh, -hd,
    // Bottom face
    -hw, -hh, -hd,
    hw, -hh, -hd,
    hw, -hh, hd,
    -hw, -hh, hd,
    // Right face
    hw, -hh, -hd,
    hw, hh, -hd,
    hw, hh, hd,
    hw, -hh, hd,
    // Left face
    -hw, -hh, -hd,
    -hw, -hh, hd,
    -hw, hh, hd,
    -hw, hh, -hd,
  ]);

  // Normals
  const normals = new Float32Array([
    // Front
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    // Back
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Top
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    // Bottom
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Right
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    // Left
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  // Indices (2 triangles per face, 6 faces)
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,       // Front
    4, 5, 6, 4, 6, 7,       // Back
    8, 9, 10, 8, 10, 11,    // Top
    12, 13, 14, 12, 14, 15, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 21, 22, 20, 22, 23, // Left
  ]);

  // Create glTF JSON
  const gltf = {
    asset: {
      version: '2.0',
      generator: 'Starpeace Placeholder Generator',
    },
    scene: 0,
    scenes: [
      {
        nodes: [0],
      },
    ],
    nodes: [
      {
        mesh: 0,
        translation: [0, hh, 0], // Offset so bottom is at y=0
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [...color, 1.0],
          metallicFactor: 0.1,
          roughnessFactor: 0.8,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
        max: [hw, hh, hd],
        min: [-hw, -hh, -hd],
      },
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: normals.byteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength + normals.byteLength,
        byteLength: indices.byteLength,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [
      {
        byteLength: positions.byteLength + normals.byteLength + indices.byteLength,
      },
    ],
  };

  // Convert to JSON string
  const jsonString = JSON.stringify(gltf);

  // Pad to 4-byte alignment
  const jsonPadding = (4 - (jsonString.length % 4)) % 4;
  const paddedJson = jsonString + ' '.repeat(jsonPadding);

  // Create binary buffer
  const binaryBuffer = Buffer.concat([
    Buffer.from(positions.buffer),
    Buffer.from(normals.buffer),
    Buffer.from(indices.buffer),
  ]);

  // Pad binary to 4-byte alignment
  const binaryPadding = (4 - (binaryBuffer.length % 4)) % 4;
  const paddedBinary = Buffer.concat([
    binaryBuffer,
    Buffer.alloc(binaryPadding),
  ]);

  // Create GLB file
  // Header: magic(4) + version(4) + length(4) = 12 bytes
  // JSON chunk: length(4) + type(4) + data
  // Binary chunk: length(4) + type(4) + data

  const jsonChunkLength = paddedJson.length;
  const binaryChunkLength = paddedBinary.length;
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binaryChunkLength;

  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  // Header
  glb.writeUInt32LE(0x46546C67, offset); // magic: "glTF"
  offset += 4;
  glb.writeUInt32LE(2, offset); // version
  offset += 4;
  glb.writeUInt32LE(totalLength, offset); // length
  offset += 4;

  // JSON chunk
  glb.writeUInt32LE(jsonChunkLength, offset); // chunk length
  offset += 4;
  glb.writeUInt32LE(0x4E4F534A, offset); // chunk type: "JSON"
  offset += 4;
  glb.write(paddedJson, offset, 'utf8');
  offset += jsonChunkLength;

  // Binary chunk
  glb.writeUInt32LE(binaryChunkLength, offset); // chunk length
  offset += 4;
  glb.writeUInt32LE(0x004E4942, offset); // chunk type: "BIN\0"
  offset += 4;
  paddedBinary.copy(glb, offset);

  return glb;
}

/**
 * Main
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Generating Placeholder 3D Models');
  console.log('='.repeat(60));
  console.log(`Output: ${CONFIG.outputDir}`);
  console.log(`Buildings: ${CONFIG.buildings.length}`);
  console.log('');

  // Create output directory
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  for (const building of CONFIG.buildings) {
    console.log(`Creating: ${building.id}`);
    console.log(`  Name: ${building.name}`);
    console.log(`  Size: ${building.width}x${building.depth}x${building.height}`);

    const glb = createBoxGLB(building);
    const outputPath = path.join(CONFIG.outputDir, `${building.id}.glb`);
    fs.writeFileSync(outputPath, glb);

    console.log(`  Saved: ${path.basename(outputPath)} (${glb.length} bytes)`);
    console.log('');
  }

  // Create manifest
  const manifest = {
    generated: new Date().toISOString(),
    source: 'placeholder',
    note: 'These are placeholder box models. Replace with AI-generated models for production.',
    buildings: CONFIG.buildings.map(b => ({
      id: b.id,
      originalTexture: `${b.id}.gif`,
      modelPath: `${b.id}.glb`,
      dimensions: {
        width: b.width,
        depth: b.depth,
        height: b.height,
      },
    })),
  };

  const manifestPath = path.join(CONFIG.outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Manifest: ${manifestPath}`);

  console.log('\n' + '='.repeat(60));
  console.log('Placeholder models generated successfully!');
  console.log('Run the prototype to test: npm run dev');
  console.log('='.repeat(60));
}

main().catch(console.error);
