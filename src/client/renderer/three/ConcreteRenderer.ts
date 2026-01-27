/**
 * ConcreteRenderer
 *
 * Renders concrete/pavement tiles around buildings using Three.js.
 * Uses existing concrete texture system for neighbor-based texture selection.
 *
 * Architecture:
 * - Uses ConcreteBlockClassManager for texture paths
 * - Calculates concrete IDs based on neighbor configuration
 * - Creates Three.js meshes for concrete tiles
 * - Handles both land and water (platform) concrete
 */

import * as THREE from 'three';
import { CoordinateMapper3D } from './CoordinateMapper3D';
import { RENDER_LAYER } from './IsometricThreeRenderer';
import {
  ConcreteBlockClassManager,
  loadConcreteBlockClassFromIni,
  getConcreteId,
  buildNeighborConfig,
  CONCRETE_NONE,
  CONCRETE_FULL,
  ConcreteMapData,
  ConcreteCfg
} from '../concrete-texture-system';
import { MapBuilding } from '../../../shared/types';
import { TileBounds } from '../../../shared/map-config';

/**
 * Interface for terrain data needed by concrete rendering
 */
export interface ConcreteTerrainProvider {
  getLandId(i: number, j: number): number;
  isWater(i: number, j: number): boolean;
}

export class ConcreteRenderer {
  private scene: THREE.Scene;
  private coordinateMapper: CoordinateMapper3D;
  private terrainProvider: ConcreteTerrainProvider | null = null;

  // Concrete texture system
  private concreteBlockClassManager: ConcreteBlockClassManager;
  private concreteBlockClassesLoaded: boolean = false;

  // Building and road data
  private buildings: MapBuilding[] = [];
  private concreteTiles: Map<string, boolean> = new Map();
  private roadTiles: Map<string, boolean> = new Map();

  // Three.js objects
  private concreteGroup: THREE.Group;
  private concreteMeshes: Map<string, THREE.Mesh> = new Map();

  // Texture cache
  private textureCache: Map<string, THREE.Texture> = new Map();
  private loadingTextures: Set<string> = new Set();

  // Shared geometry
  private tileGeometry: THREE.BufferGeometry | null = null;

  // Callback when textures are loaded
  private onTextureLoaded: (() => void) | null = null;

  constructor(scene: THREE.Scene, coordinateMapper: CoordinateMapper3D) {
    this.scene = scene;
    this.coordinateMapper = coordinateMapper;

    // Create group for concrete
    this.concreteGroup = new THREE.Group();
    this.concreteGroup.name = 'concrete';
    this.scene.add(this.concreteGroup);

    // Initialize concrete block class manager
    this.concreteBlockClassManager = new ConcreteBlockClassManager();
    this.concreteBlockClassManager.setBasePath('/cache/');

    // Load concrete block classes
    this.loadConcreteBlockClasses();
  }

  /**
   * Load concrete block class definitions from INI files
   */
  private async loadConcreteBlockClasses(): Promise<void> {
    try {
      await loadConcreteBlockClassFromIni(
        '/cache/ConcreteConfig/Concrete.ini',
        this.concreteBlockClassManager
      );
      this.concreteBlockClassesLoaded = true;
      console.log('[ConcreteRenderer] Concrete block classes loaded');
    } catch (error) {
      console.error('[ConcreteRenderer] Failed to load concrete block classes:', error);
    }
  }

  /**
   * Set the terrain provider
   */
  setTerrainProvider(provider: ConcreteTerrainProvider): void {
    this.terrainProvider = provider;
  }

  /**
   * Set callback for texture load events
   */
  setOnTextureLoaded(callback: () => void): void {
    this.onTextureLoaded = callback;
  }

  /**
   * Set buildings and recalculate concrete tiles
   */
  setBuildings(buildings: MapBuilding[]): void {
    this.buildings = [...buildings];
    this.rebuildConcreteTiles();
  }

  /**
   * Add buildings
   */
  addBuildings(buildings: MapBuilding[]): void {
    this.buildings.push(...buildings);
    this.rebuildConcreteTiles();
  }

  /**
   * Set road tiles (for concrete ID calculation)
   */
  setRoadTiles(roadTiles: Map<string, boolean>): void {
    this.roadTiles = roadTiles;
  }

  /**
   * Clear all buildings and concrete
   */
  clear(): void {
    this.buildings = [];
    this.concreteTiles.clear();
    this.clearConcreteMeshes();
  }

  /**
   * Rebuild concrete tiles from buildings
   */
  private rebuildConcreteTiles(): void {
    this.concreteTiles.clear();

    for (const building of this.buildings) {
      // Building footprint
      const startI = building.y;
      const startJ = building.x;
      const endI = startI + (building.ysize || 1);
      const endJ = startJ + (building.xsize || 1);

      // Concrete extends 1 tile around the building
      for (let i = startI - 1; i <= endI; i++) {
        for (let j = startJ - 1; j <= endJ; j++) {
          // Skip tiles under the building itself
          if (i >= startI && i < endI && j >= startJ && j < endJ) {
            continue;
          }
          this.concreteTiles.set(`${j},${i}`, true);
        }
      }
    }
  }

  /**
   * Check if a tile has concrete
   */
  hasConcrete(x: number, y: number): boolean {
    return this.concreteTiles.has(`${x},${y}`);
  }

  /**
   * Update visible concrete tiles based on camera bounds
   */
  updateVisibleConcrete(visibleBounds: TileBounds, occupiedTiles: Set<string>): void {
    if (!this.terrainProvider) return;

    // Update visibility of existing meshes
    for (const [key, mesh] of this.concreteMeshes) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      const isVisible = (
        x >= visibleBounds.minJ && x <= visibleBounds.maxJ &&
        y >= visibleBounds.minI && y <= visibleBounds.maxI
      );

      mesh.visible = isVisible && !occupiedTiles.has(key);
    }

    // Create meshes for visible concrete tiles
    for (const [key] of this.concreteTiles) {
      if (this.concreteMeshes.has(key)) continue;
      if (occupiedTiles.has(key)) continue;

      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Viewport culling
      if (x < visibleBounds.minJ || x > visibleBounds.maxJ ||
          y < visibleBounds.minI || y > visibleBounds.maxI) {
        continue;
      }

      this.createConcreteMesh(x, y);
    }
  }

  /**
   * Create a mesh for a concrete tile
   */
  private createConcreteMesh(x: number, y: number): void {
    if (!this.terrainProvider || !this.concreteBlockClassesLoaded) return;

    const key = `${x},${y}`;
    const i = y;
    const j = x;

    // Build neighbor configuration
    const neighborCfg = this.buildNeighborConfig(i, j);

    // Check if on water
    const isOnWater = this.terrainProvider.isWater(i, j);

    // Check if has road
    const hasRoad = this.roadTiles.has(key);

    // Get concrete ID
    const concreteId = getConcreteId(neighborCfg, isOnWater, hasRoad);

    if (concreteId === CONCRETE_NONE) return;

    // Get texture path
    const texturePath = this.concreteBlockClassManager.getImagePath(concreteId);

    // Create geometry if not exists
    if (!this.tileGeometry) {
      this.tileGeometry = this.createTileGeometry();
    }

    // Create material
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
      // Fallback: gray color for concrete without texture
      material = new THREE.MeshBasicMaterial({
        color: 0x888888,
        side: THREE.DoubleSide
      });
    }

    const mesh = new THREE.Mesh(this.tileGeometry, material);

    // Position mesh
    const worldPos = this.coordinateMapper.mapToWorld(i, j);
    mesh.position.set(worldPos.x, 0.015, worldPos.z); // Between terrain and roads

    // Set render order
    mesh.renderOrder = this.coordinateMapper.getRenderOrder(i, j, RENDER_LAYER.CONCRETE);

    this.concreteMeshes.set(key, mesh);
    this.concreteGroup.add(mesh);
  }

  /**
   * Build neighbor configuration for concrete calculation
   */
  private buildNeighborConfig(i: number, j: number): ConcreteCfg {
    // 8-neighbor offsets: [di, dj]
    const offsets: [number, number][] = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];

    const cfg: boolean[] = [];
    for (const [di, dj] of offsets) {
      const ni = i + di;
      const nj = j + dj;
      cfg.push(this.hasConcrete(nj, ni));
    }

    return cfg as ConcreteCfg;
  }

  /**
   * Create diamond geometry for concrete tiles
   */
  private createTileGeometry(): THREE.BufferGeometry {
    const tileWidth = CoordinateMapper3D.getTileWidth();
    const tileHeight = CoordinateMapper3D.getTileHeight();
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    const positions = new Float32Array([
      0, 0, -halfH,      // Top
      halfW, 0, 0,       // Right
      0, 0, halfH,       // Bottom
      -halfW, 0, 0       // Left
    ]);

    const uvs = new Float32Array([
      0.5, 0,
      1, 0.5,
      0.5, 1,
      0, 0.5
    ]);

    const indices = new Uint16Array([
      0, 1, 2,
      0, 2, 3
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
    let texture = this.textureCache.get(path);
    if (texture) return texture;

    texture = new THREE.Texture();
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    this.textureCache.set(path, texture);

    if (!this.loadingTextures.has(path)) {
      this.loadingTextures.add(path);
      this.loadTextureAsync(path, texture);
    }

    return texture;
  }

  /**
   * Load texture asynchronously
   */
  private async loadTextureAsync(path: string, texture: THREE.Texture): Promise<void> {
    try {
      const filename = path.split('/').pop() || '';
      const url = `/cache/ConcreteImages/${encodeURIComponent(filename)}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[ConcreteRenderer] Failed to load texture: ${url}`);
        return;
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      // Apply color key transparency
      const processedBitmap = await this.applyColorKeyTransparency(bitmap);

      const canvas = document.createElement('canvas');
      canvas.width = processedBitmap.width;
      canvas.height = processedBitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(processedBitmap, 0, 0);
      }

      texture.image = canvas;
      texture.needsUpdate = true;

      if (this.onTextureLoaded) {
        this.onTextureLoaded();
      }

      processedBitmap.close();
    } catch (error) {
      console.warn(`[ConcreteRenderer] Error loading texture ${path}:`, error);
    } finally {
      this.loadingTextures.delete(path);
    }
  }

  /**
   * Apply color key transparency
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
   * Clear all concrete meshes
   */
  private clearConcreteMeshes(): void {
    for (const mesh of this.concreteMeshes.values()) {
      this.concreteGroup.remove(mesh);
      mesh.geometry?.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
    this.concreteMeshes.clear();
  }

  /**
   * Get count of concrete tiles
   */
  getConcreteTileCount(): number {
    return this.concreteTiles.size;
  }

  /**
   * Get count of concrete meshes
   */
  getConcreteMeshCount(): number {
    return this.concreteMeshes.size;
  }

  /**
   * Check if concrete classes are loaded
   */
  isLoaded(): boolean {
    return this.concreteBlockClassesLoaded;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearConcreteMeshes();

    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();

    if (this.tileGeometry) {
      this.tileGeometry.dispose();
      this.tileGeometry = null;
    }

    this.scene.remove(this.concreteGroup);
  }
}
