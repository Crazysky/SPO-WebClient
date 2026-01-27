/**
 * TerrainChunkManager
 *
 * Manages terrain rendering using chunk-based batched geometry.
 * Divides the map into chunks (32x32 tiles) and creates merged geometry
 * for each chunk with proper UV mapping to the texture atlas.
 *
 * Architecture:
 * - Map divided into CHUNK_SIZE × CHUNK_SIZE tile chunks
 * - Each chunk is a single mesh with merged geometry
 * - One draw call per visible chunk
 * - Frustum culling for visibility
 * - LRU eviction for memory management
 */

import * as THREE from 'three';
import { CoordinateMapper3D } from './CoordinateMapper3D';
import { TextureAtlasManager } from './TextureAtlasManager';
import { TileBounds, Season } from '../../../shared/map-config';
import { RENDER_LAYER } from './IsometricThreeRenderer';

// Chunk configuration
export const CHUNK_SIZE = 32; // tiles per chunk dimension
const MAX_CHUNKS = 64; // Maximum cached chunks

/**
 * Terrain data provider interface
 */
export interface TerrainDataProvider {
  getTextureId(i: number, j: number): number;
  getMapWidth(): number;
  getMapHeight(): number;
}

interface ChunkEntry {
  mesh: THREE.Mesh;
  chunkI: number;
  chunkJ: number;
  lastAccess: number;
}

export class TerrainChunkManager {
  private scene: THREE.Scene;
  private coordinateMapper: CoordinateMapper3D;
  private atlasManager: TextureAtlasManager;
  private terrainProvider: TerrainDataProvider | null = null;

  // Chunk cache
  private chunks: Map<string, ChunkEntry> = new Map();
  private accessCounter: number = 0;

  // Group for all terrain chunks
  private terrainGroup: THREE.Group;

  // Shared material for all chunks
  private material: THREE.MeshBasicMaterial | null = null;

  constructor(
    scene: THREE.Scene,
    coordinateMapper: CoordinateMapper3D,
    atlasManager: TextureAtlasManager
  ) {
    this.scene = scene;
    this.coordinateMapper = coordinateMapper;
    this.atlasManager = atlasManager;

    // Create group for terrain
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'terrain';
    this.scene.add(this.terrainGroup);

    // Set up atlas update callback
    this.atlasManager.setOnAtlasUpdated(() => {
      this.updateMaterial();
    });
  }

  /**
   * Set the terrain data provider
   */
  setTerrainProvider(provider: TerrainDataProvider): void {
    this.terrainProvider = provider;
    this.coordinateMapper.setMapDimensions(
      provider.getMapWidth(),
      provider.getMapHeight()
    );
    // Clear existing chunks when provider changes
    this.clearAllChunks();
  }

  /**
   * Get or create the shared material
   */
  private getMaterial(): THREE.MeshBasicMaterial {
    if (!this.material) {
      const atlasTexture = this.atlasManager.getAtlasTexture();
      this.material = new THREE.MeshBasicMaterial({
        map: atlasTexture,
        transparent: true,
        side: THREE.DoubleSide,
        alphaTest: 0.5,
        depthWrite: false  // Allow roads/concrete to render on top via renderOrder
      });
    }
    return this.material;
  }

  /**
   * Update material when atlas changes
   */
  private updateMaterial(): void {
    if (this.material && this.material.map) {
      this.material.map.needsUpdate = true;
    }
  }

  /**
   * Generate chunk key from indices
   */
  private getChunkKey(chunkI: number, chunkJ: number): string {
    return `${chunkI},${chunkJ}`;
  }

  /**
   * Get chunk indices from map coordinates
   */
  private getChunkIndices(i: number, j: number): { chunkI: number; chunkJ: number } {
    return {
      chunkI: Math.floor(i / CHUNK_SIZE),
      chunkJ: Math.floor(j / CHUNK_SIZE)
    };
  }

  /**
   * Update visible chunks based on camera bounds
   */
  updateVisibleChunks(visibleBounds: TileBounds): void {
    if (!this.terrainProvider) return;

    // Calculate which chunks are visible
    const startChunkI = Math.floor(visibleBounds.minI / CHUNK_SIZE);
    const endChunkI = Math.floor(visibleBounds.maxI / CHUNK_SIZE);
    const startChunkJ = Math.floor(visibleBounds.minJ / CHUNK_SIZE);
    const endChunkJ = Math.floor(visibleBounds.maxJ / CHUNK_SIZE);

    // Ensure chunks exist for visible area
    for (let ci = startChunkI; ci <= endChunkI; ci++) {
      for (let cj = startChunkJ; cj <= endChunkJ; cj++) {
        this.getOrCreateChunk(ci, cj);
      }
    }

    // Update visibility and access time
    for (const [key, entry] of this.chunks) {
      const isVisible = (
        entry.chunkI >= startChunkI && entry.chunkI <= endChunkI &&
        entry.chunkJ >= startChunkJ && entry.chunkJ <= endChunkJ
      );

      entry.mesh.visible = isVisible;

      if (isVisible) {
        entry.lastAccess = ++this.accessCounter;
      }
    }

    // Evict old chunks if over limit
    this.evictIfNeeded();
  }

  /**
   * Get or create a chunk mesh
   */
  private getOrCreateChunk(chunkI: number, chunkJ: number): ChunkEntry | null {
    const key = this.getChunkKey(chunkI, chunkJ);

    // Return existing chunk
    const existing = this.chunks.get(key);
    if (existing) {
      existing.lastAccess = ++this.accessCounter;
      return existing;
    }

    // Create new chunk
    const mesh = this.createChunkMesh(chunkI, chunkJ);
    if (!mesh) return null;

    const entry: ChunkEntry = {
      mesh,
      chunkI,
      chunkJ,
      lastAccess: ++this.accessCounter
    };

    this.chunks.set(key, entry);
    this.terrainGroup.add(mesh);

    return entry;
  }

  /**
   * Create geometry and mesh for a chunk
   */
  private createChunkMesh(chunkI: number, chunkJ: number): THREE.Mesh | null {
    if (!this.terrainProvider) return null;

    const mapWidth = this.terrainProvider.getMapWidth();
    const mapHeight = this.terrainProvider.getMapHeight();

    // Calculate chunk bounds in map coordinates
    const startI = chunkI * CHUNK_SIZE;
    const startJ = chunkJ * CHUNK_SIZE;
    const endI = Math.min(startI + CHUNK_SIZE, mapHeight);
    const endJ = Math.min(startJ + CHUNK_SIZE, mapWidth);

    // Skip if chunk is entirely outside map
    if (startI >= mapHeight || startJ >= mapWidth) {
      return null;
    }

    const geometry = this.createChunkGeometry(startI, startJ, endI, endJ);
    const material = this.getMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    // Set render order for terrain layer using painter's algorithm
    // Use middle of chunk for render order calculation
    const centerI = Math.floor((startI + endI) / 2);
    const centerJ = Math.floor((startJ + endJ) / 2);
    mesh.renderOrder = this.coordinateMapper.getRenderOrder(centerI, centerJ, RENDER_LAYER.TERRAIN);

    return mesh;
  }

  /**
   * Create merged geometry for all tiles in a chunk
   */
  private createChunkGeometry(
    startI: number,
    startJ: number,
    endI: number,
    endJ: number
  ): THREE.BufferGeometry {
    const tilesI = endI - startI;
    const tilesJ = endJ - startJ;
    const tileCount = tilesI * tilesJ;

    // Each tile is a diamond with 4 vertices and 2 triangles (6 indices)
    const vertexCount = tileCount * 4;
    const indexCount = tileCount * 6;

    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);

    const tileWidth = CoordinateMapper3D.getTileWidth();
    const tileHeight = CoordinateMapper3D.getTileHeight();
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    let vertexIndex = 0;
    let uvIndex = 0;
    let indexIndex = 0;
    let tileIndex = 0;

    for (let i = startI; i < endI; i++) {
      for (let j = startJ; j < endJ; j++) {
        // Get world position for this tile
        const center = this.coordinateMapper.mapToWorld(i, j);

        // Get texture ID and UV coordinates
        const textureId = this.terrainProvider!.getTextureId(i, j);
        const uv = this.atlasManager.getUV(textureId);

        // DEBUG: Log first few tiles to check texture IDs
        if (i < startI + 2 && j < startJ + 2) {
          console.log(`[TerrainChunkManager] Tile (${i},${j}) -> textureId=${textureId}, UV=(${uv.u0.toFixed(3)},${uv.v0.toFixed(3)} to ${uv.u1.toFixed(3)},${uv.v1.toFixed(3)})`);
        }

        // Trigger texture loading (async, will update atlas later)
        this.atlasManager.loadTexture(textureId);

        // Diamond vertices (top, right, bottom, left)
        const baseVertex = tileIndex * 4;

        // Top vertex
        positions[vertexIndex++] = center.x;
        positions[vertexIndex++] = 0;
        positions[vertexIndex++] = center.z - halfH;
        uvs[uvIndex++] = (uv.u0 + uv.u1) / 2; // Center U
        uvs[uvIndex++] = uv.v0; // Top V

        // Right vertex
        positions[vertexIndex++] = center.x + halfW;
        positions[vertexIndex++] = 0;
        positions[vertexIndex++] = center.z;
        uvs[uvIndex++] = uv.u1; // Right U
        uvs[uvIndex++] = (uv.v0 + uv.v1) / 2; // Center V

        // Bottom vertex
        positions[vertexIndex++] = center.x;
        positions[vertexIndex++] = 0;
        positions[vertexIndex++] = center.z + halfH;
        uvs[uvIndex++] = (uv.u0 + uv.u1) / 2; // Center U
        uvs[uvIndex++] = uv.v1; // Bottom V

        // Left vertex
        positions[vertexIndex++] = center.x - halfW;
        positions[vertexIndex++] = 0;
        positions[vertexIndex++] = center.z;
        uvs[uvIndex++] = uv.u0; // Left U
        uvs[uvIndex++] = (uv.v0 + uv.v1) / 2; // Center V

        // Two triangles (top-right-bottom, top-bottom-left)
        indices[indexIndex++] = baseVertex + 0; // Top
        indices[indexIndex++] = baseVertex + 1; // Right
        indices[indexIndex++] = baseVertex + 2; // Bottom

        indices[indexIndex++] = baseVertex + 0; // Top
        indices[indexIndex++] = baseVertex + 2; // Bottom
        indices[indexIndex++] = baseVertex + 3; // Left

        tileIndex++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return geometry;
  }

  /**
   * Evict least recently used chunks if over limit
   */
  private evictIfNeeded(): void {
    while (this.chunks.size > MAX_CHUNKS) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;

      for (const [key, entry] of this.chunks) {
        // Don't evict visible chunks
        if (entry.mesh.visible) continue;

        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.chunks.get(oldestKey);
        if (entry) {
          this.terrainGroup.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          this.chunks.delete(oldestKey);
        }
      } else {
        break; // No evictable chunks
      }
    }
  }

  /**
   * Clear all chunks
   */
  clearAllChunks(): void {
    for (const entry of this.chunks.values()) {
      this.terrainGroup.remove(entry.mesh);
      entry.mesh.geometry.dispose();
    }
    this.chunks.clear();
  }

  /**
   * Rebuild all visible chunks (call after season change)
   */
  rebuildChunks(): void {
    // Store which chunks were visible
    const visibleChunks: { chunkI: number; chunkJ: number }[] = [];
    for (const entry of this.chunks.values()) {
      if (entry.mesh.visible) {
        visibleChunks.push({ chunkI: entry.chunkI, chunkJ: entry.chunkJ });
      }
    }

    // Clear all chunks
    this.clearAllChunks();

    // Update material with new atlas
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }

    // Recreate visible chunks
    for (const { chunkI, chunkJ } of visibleChunks) {
      this.getOrCreateChunk(chunkI, chunkJ);
    }
  }

  /**
   * Get count of cached chunks
   */
  getChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Get count of visible chunks
   */
  getVisibleChunkCount(): number {
    let count = 0;
    for (const entry of this.chunks.values()) {
      if (entry.mesh.visible) count++;
    }
    return count;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearAllChunks();

    if (this.material) {
      this.material.dispose();
      this.material = null;
    }

    this.scene.remove(this.terrainGroup);
  }
}
