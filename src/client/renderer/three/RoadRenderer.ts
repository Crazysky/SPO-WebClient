/**
 * RoadRenderer
 *
 * Renders road segments using Three.js sprites/planes.
 * Uses existing road texture system for topology and textures.
 *
 * Architecture:
 * - Integrates with existing RoadsRendering for road topology
 * - Uses RoadBlockClassManager for texture paths
 * - Creates Three.js sprites for each road tile
 * - Separates standard roads and tall roads (bridges) for painter's algorithm
 */

import * as THREE from 'three';
import { CoordinateMapper3D } from './CoordinateMapper3D';
import { RENDER_LAYER } from './IsometricThreeRenderer';
import {
  RoadsRendering,
  RoadBlockClassManager,
  RoadBlockId,
  roadBlockId,
  renderRoadSegment,
  loadRoadBlockClassFromIni
} from '../road-texture-system';
import { MapSegment } from '../../../shared/types';
import { TileBounds } from '../../../shared/map-config';

// Standard tile height at base resolution (64×32)
const BASE_TILE_HEIGHT = 32;

/**
 * Interface for terrain data needed by road rendering
 */
export interface RoadTerrainProvider {
  getLandId(i: number, j: number): number;
  hasConcrete(i: number, j: number): boolean;
}

/**
 * Road tile data for rendering
 */
interface RoadTile {
  i: number;
  j: number;
  topology: RoadBlockId;
  texturePath: string | null;
  isTall: boolean;
}

export class RoadRenderer {
  private scene: THREE.Scene;
  private coordinateMapper: CoordinateMapper3D;
  private terrainProvider: RoadTerrainProvider | null = null;

  // Road rendering system
  private roadsRendering: RoadsRendering | null = null;
  private roadBlockClassManager: RoadBlockClassManager;
  private roadBlockClassesLoaded: boolean = false;

  // Road segments
  private segments: MapSegment[] = [];
  private roadTilesMap: Map<string, boolean> = new Map();

  // Three.js objects
  private roadGroup: THREE.Group;
  private roadMeshes: Map<string, THREE.Mesh> = new Map();

  // Texture cache (path -> THREE.Texture)
  private textureCache: Map<string, THREE.Texture> = new Map();
  private loadingTextures: Set<string> = new Set();

  // Shared geometry for road tiles
  private tileGeometry: THREE.BufferGeometry | null = null;

  // Callback when textures are loaded
  private onTextureLoaded: (() => void) | null = null;

  constructor(scene: THREE.Scene, coordinateMapper: CoordinateMapper3D) {
    this.scene = scene;
    this.coordinateMapper = coordinateMapper;

    // Create group for roads
    this.roadGroup = new THREE.Group();
    this.roadGroup.name = 'roads';
    this.scene.add(this.roadGroup);

    // Initialize road block class manager
    this.roadBlockClassManager = new RoadBlockClassManager();
    this.roadBlockClassManager.setBasePath('/cache/');

    // Load road block classes
    this.loadRoadBlockClasses();
  }

  /**
   * Load road block class definitions from INI files
   */
  private async loadRoadBlockClasses(): Promise<void> {
    try {
      // Load INI file content
      const response = await fetch('/cache/RoadBlocksConfig/RoadBlocks.ini');
      const iniContent = await response.text();

      // Load the INI content into the manager
      this.roadBlockClassManager.loadFromIni(iniContent);

      this.roadBlockClassesLoaded = true;
      console.log('[RoadRenderer] Road block classes loaded');
    } catch (error) {
      console.error('[RoadRenderer] Failed to load road block classes:', error);
    }
  }

  /**
   * Set the terrain provider for road type calculations
   */
  setTerrainProvider(provider: RoadTerrainProvider): void {
    this.terrainProvider = provider;
  }

  /**
   * Set callback for texture load events
   */
  setOnTextureLoaded(callback: () => void): void {
    this.onTextureLoaded = callback;
  }

  /**
   * Add road segments to the renderer
   */
  addSegments(segments: MapSegment[]): void {
    this.segments.push(...segments);
    this.rebuildRoadTopology();
  }

  /**
   * Set all road segments (replaces existing)
   */
  setSegments(segments: MapSegment[]): void {
    this.segments = [...segments];
    this.rebuildRoadTopology();
  }

  /**
   * Clear all road segments
   */
  clearSegments(): void {
    this.segments = [];
    this.roadsRendering = null;
    this.roadTilesMap.clear();
    this.clearRoadMeshes();
  }

  /**
   * Rebuild road topology from segments
   */
  private rebuildRoadTopology(): void {
    if (this.segments.length === 0) return;

    // Find bounds of all segments
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const seg of this.segments) {
      minX = Math.min(minX, seg.x1, seg.x2);
      maxX = Math.max(maxX, seg.x1, seg.x2);
      minY = Math.min(minY, seg.y1, seg.y2);
      maxY = Math.max(maxY, seg.y1, seg.y2);
    }

    // Add margin
    minX = Math.max(0, minX - 1);
    minY = Math.max(0, minY - 1);
    maxX += 1;
    maxY += 1;

    // Create RoadsRendering buffer
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    this.roadsRendering = new RoadsRendering(minY, minX, width, height);

    // Clear previous road tiles
    this.roadTilesMap.clear();

    // Render all segments into the buffer
    for (const seg of this.segments) {
      renderRoadSegment(this.roadsRendering, {
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2
      });
    }

    // Mark all road tiles
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const topology = this.roadsRendering.get(y, x);
        if (topology !== RoadBlockId.None) {
          this.roadTilesMap.set(`${x},${y}`, true);
        }
      }
    }
  }

  /**
   * Update visible road tiles based on camera bounds
   */
  updateVisibleRoads(visibleBounds: TileBounds, occupiedTiles: Set<string>): void {
    if (!this.roadsRendering || !this.terrainProvider) return;

    // Clear existing road meshes that are out of view
    for (const [key, mesh] of this.roadMeshes) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      const isVisible = (
        x >= visibleBounds.minJ && x <= visibleBounds.maxJ &&
        y >= visibleBounds.minI && y <= visibleBounds.maxI
      );

      mesh.visible = isVisible && !occupiedTiles.has(key);
    }

    // Create meshes for visible road tiles that don't have meshes yet
    for (const [key] of this.roadTilesMap) {
      if (this.roadMeshes.has(key)) continue;
      if (occupiedTiles.has(key)) continue;

      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Viewport culling
      if (x < visibleBounds.minJ || x > visibleBounds.maxJ ||
          y < visibleBounds.minI || y > visibleBounds.maxI) {
        continue;
      }

      this.createRoadMesh(x, y);
    }
  }

  /**
   * Create a mesh for a road tile
   */
  private createRoadMesh(x: number, y: number): void {
    if (!this.roadsRendering || !this.terrainProvider) return;

    const key = `${x},${y}`;
    const topology = this.roadsRendering.get(y, x);

    if (topology === RoadBlockId.None) return;

    // Calculate road block ID
    const landId = this.terrainProvider.getLandId(y, x);
    const onConcrete = this.terrainProvider.hasConcrete(y, x);

    const fullRoadBlockId = roadBlockId(
      topology,
      landId,
      onConcrete,
      false, // onRailroad
      false  // isDummy
    );

    // Get texture path
    const texturePath = this.roadBlockClassManager.getImagePath(fullRoadBlockId);

    // Create geometry if not exists
    if (!this.tileGeometry) {
      this.tileGeometry = this.createTileGeometry();
    }

    // Get or load texture
    let material: THREE.MeshBasicMaterial;
    if (texturePath) {
      const texture = this.getOrLoadTexture(texturePath);
      material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide
      });
    } else {
      // Fallback: gray color for roads without texture
      material = new THREE.MeshBasicMaterial({
        color: 0x666666,
        side: THREE.DoubleSide
      });
    }

    const mesh = new THREE.Mesh(this.tileGeometry, material);

    // Position mesh
    const worldPos = this.coordinateMapper.mapToWorld(y, x);
    mesh.position.set(worldPos.x, 0.02, worldPos.z); // Slightly above terrain

    // Set render order
    mesh.renderOrder = this.coordinateMapper.getRenderOrder(y, x, RENDER_LAYER.ROADS);

    this.roadMeshes.set(key, mesh);
    this.roadGroup.add(mesh);
  }

  /**
   * Create diamond geometry for road tiles
   */
  private createTileGeometry(): THREE.BufferGeometry {
    const tileWidth = CoordinateMapper3D.getTileWidth();
    const tileHeight = CoordinateMapper3D.getTileHeight();
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    // Diamond vertices (top, right, bottom, left)
    const positions = new Float32Array([
      0, 0, -halfH,      // Top
      halfW, 0, 0,       // Right
      0, 0, halfH,       // Bottom
      -halfW, 0, 0       // Left
    ]);

    // UV coordinates for diamond
    const uvs = new Float32Array([
      0.5, 0,     // Top
      1, 0.5,     // Right
      0.5, 1,     // Bottom
      0, 0.5      // Left
    ]);

    // Two triangles
    const indices = new Uint16Array([
      0, 1, 2,  // Top-Right-Bottom
      0, 2, 3   // Top-Bottom-Left
    ]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return geometry;
  }

  /**
   * Get or load a texture
   */
  private getOrLoadTexture(path: string): THREE.Texture {
    // Check cache
    let texture = this.textureCache.get(path);
    if (texture) return texture;

    // Create placeholder texture
    texture = new THREE.Texture();
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    this.textureCache.set(path, texture);

    // Load texture asynchronously
    if (!this.loadingTextures.has(path)) {
      this.loadingTextures.add(path);
      this.loadTextureAsync(path, texture);
    }

    return texture;
  }

  /**
   * Load texture asynchronously with color key transparency
   */
  private async loadTextureAsync(path: string, texture: THREE.Texture): Promise<void> {
    try {
      const filename = path.split('/').pop() || '';
      const url = `/cache/RoadBlockImages/${encodeURIComponent(filename)}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[RoadRenderer] Failed to load texture: ${url}`);
        return;
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      // Apply color key transparency
      const processedBitmap = await this.applyColorKeyTransparency(bitmap);

      // Create canvas from bitmap
      const canvas = document.createElement('canvas');
      canvas.width = processedBitmap.width;
      canvas.height = processedBitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(processedBitmap, 0, 0);
      }

      // Update texture
      texture.image = canvas;
      texture.needsUpdate = true;

      // Notify callback
      if (this.onTextureLoaded) {
        this.onTextureLoaded();
      }

      processedBitmap.close();
    } catch (error) {
      console.warn(`[RoadRenderer] Error loading texture ${path}:`, error);
    } finally {
      this.loadingTextures.delete(path);
    }
  }

  /**
   * Apply color key transparency (detect from corner pixel)
   */
  private async applyColorKeyTransparency(bitmap: ImageBitmap): Promise<ImageBitmap> {
    if (typeof OffscreenCanvas === 'undefined') {
      return bitmap;
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return bitmap;

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const data = imageData.data;

    // Detect transparency color from corner pixel
    const tr = data[0];
    const tg = data[1];
    const tb = data[2];
    const tolerance = 5;

    for (let i = 0; i < data.length; i += 4) {
      if (
        Math.abs(data[i] - tr) <= tolerance &&
        Math.abs(data[i + 1] - tg) <= tolerance &&
        Math.abs(data[i + 2] - tb) <= tolerance
      ) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    bitmap.close();

    return canvas.transferToImageBitmap();
  }

  /**
   * Clear all road meshes
   */
  private clearRoadMeshes(): void {
    for (const mesh of this.roadMeshes.values()) {
      this.roadGroup.remove(mesh);
      mesh.geometry?.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
    this.roadMeshes.clear();
  }

  /**
   * Get count of road tiles
   */
  getRoadTileCount(): number {
    return this.roadTilesMap.size;
  }

  /**
   * Get count of road meshes
   */
  getRoadMeshCount(): number {
    return this.roadMeshes.size;
  }

  /**
   * Check if road classes are loaded
   */
  isLoaded(): boolean {
    return this.roadBlockClassesLoaded;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearRoadMeshes();

    // Dispose textures
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();

    // Dispose geometry
    if (this.tileGeometry) {
      this.tileGeometry.dispose();
      this.tileGeometry = null;
    }

    this.scene.remove(this.roadGroup);
  }
}
