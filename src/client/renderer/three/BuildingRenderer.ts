/**
 * BuildingRenderer
 *
 * Renders buildings using Three.js sprites.
 * Uses existing GameObjectTextureCache for building textures.
 *
 * Architecture:
 * - Sprite-based rendering (billboard-style, always faces camera)
 * - Painter's algorithm via renderOrder
 * - Anchor point at building's south corner
 * - Scale factor based on current zoom level
 * - Support for hover highlighting
 * - Fallback placeholders when textures aren't loaded
 */

import * as THREE from 'three';
import { CoordinateMapper3D } from './CoordinateMapper3D';
import { RENDER_LAYER } from './IsometricThreeRenderer';
import { MapBuilding } from '../../../shared/types';
import { TileBounds } from '../../../shared/map-config';
import { GameObjectTextureCache } from '../game-object-texture-cache';
import { getFacilityDimensionsCache, FacilityDimensions } from '../../facility-dimensions-cache';

// Base tile dimensions (at zoom level 3)
const BASE_TILE_WIDTH = 64;
const BASE_TILE_HEIGHT = 32;

/**
 * Building sprite data for rendering
 */
interface BuildingEntry {
  building: MapBuilding;
  sprite: THREE.Sprite;
  dimensions: FacilityDimensions | null;
  textureLoaded: boolean;
}

export class BuildingRenderer {
  private scene: THREE.Scene;
  private coordinateMapper: CoordinateMapper3D;

  // Texture cache
  private textureCache: GameObjectTextureCache;

  // Building data
  private buildings: MapBuilding[] = [];
  private buildingEntries: Map<string, BuildingEntry> = new Map();

  // Three.js objects
  private buildingGroup: THREE.Group;

  // Dimensions cache
  private facilityDimensionsCache = getFacilityDimensionsCache();

  // Current scale factor (based on zoom level)
  private scaleFactor: number = 1.0;

  // Hovered building
  private hoveredBuilding: MapBuilding | null = null;
  private hoverHighlightSprite: THREE.Sprite | null = null;

  // Callback when textures are loaded
  private onTextureLoaded: (() => void) | null = null;

  // Three.js texture cache
  private threeTextureCache: Map<string, THREE.Texture> = new Map();
  private loadingTextures: Set<string> = new Set();

  // Placeholder material for buildings without textures
  private placeholderMaterial: THREE.SpriteMaterial;

  constructor(scene: THREE.Scene, coordinateMapper: CoordinateMapper3D) {
    this.scene = scene;
    this.coordinateMapper = coordinateMapper;

    // Create group for buildings
    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = 'buildings';
    this.scene.add(this.buildingGroup);

    // Initialize texture cache
    this.textureCache = new GameObjectTextureCache(200);
    this.textureCache.setOnTextureLoaded((category, name) => {
      if (category === 'BuildingImages') {
        this.onBuildingTextureLoaded(name);
      }
    });

    // Create placeholder material (blue colored)
    const placeholderCanvas = this.createPlaceholderTexture();
    const placeholderTexture = new THREE.CanvasTexture(placeholderCanvas);
    placeholderTexture.minFilter = THREE.NearestFilter;
    placeholderTexture.magFilter = THREE.NearestFilter;
    this.placeholderMaterial = new THREE.SpriteMaterial({
      map: placeholderTexture,
      transparent: true
    });
  }

  /**
   * Create a placeholder texture for buildings without loaded textures
   */
  private createPlaceholderTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw a blue diamond shape
      ctx.fillStyle = '#4a90e2';
      ctx.beginPath();
      ctx.moveTo(32, 8);
      ctx.lineTo(56, 32);
      ctx.lineTo(32, 56);
      ctx.lineTo(8, 32);
      ctx.closePath();
      ctx.fill();

      // Draw outline
      ctx.strokeStyle = '#2970c2';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    return canvas;
  }

  /**
   * Set callback for texture load events
   */
  setOnTextureLoaded(callback: () => void): void {
    this.onTextureLoaded = callback;
  }

  /**
   * Set the scale factor (based on zoom level)
   */
  setScaleFactor(scaleFactor: number): void {
    this.scaleFactor = scaleFactor;
    this.updateAllBuildingScales();
  }

  /**
   * Set buildings and create sprites
   */
  setBuildings(buildings: MapBuilding[]): void {
    this.clearBuildings();
    this.buildings = [...buildings];

    // Preload dimensions for all buildings
    const visualClasses = new Set(buildings.map(b => b.visualClass));
    for (const vc of visualClasses) {
      this.facilityDimensionsCache.getFacility(vc);
    }
  }

  /**
   * Add buildings
   */
  addBuildings(buildings: MapBuilding[]): void {
    this.buildings.push(...buildings);

    // Preload dimensions
    const visualClasses = new Set(buildings.map(b => b.visualClass));
    for (const vc of visualClasses) {
      this.facilityDimensionsCache.getFacility(vc);
    }
  }

  /**
   * Clear all buildings
   */
  clearBuildings(): void {
    for (const entry of this.buildingEntries.values()) {
      this.buildingGroup.remove(entry.sprite);
      entry.sprite.material.dispose();
    }
    this.buildingEntries.clear();
    this.buildings = [];
  }

  /**
   * Get building key
   */
  private getBuildingKey(building: MapBuilding): string {
    return `${building.x},${building.y},${building.visualClass}`;
  }

  /**
   * Update visible buildings based on camera bounds
   */
  updateVisibleBuildings(visibleBounds: TileBounds): void {
    // First, update visibility of existing sprites
    for (const [key, entry] of this.buildingEntries) {
      const b = entry.building;
      const dims = entry.dimensions;
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      // Building extends from (x,y) to (x+xsize-1, y+ysize-1)
      const isVisible = !(
        b.x + xsize - 1 < visibleBounds.minJ ||
        b.x > visibleBounds.maxJ ||
        b.y + ysize - 1 < visibleBounds.minI ||
        b.y > visibleBounds.maxI
      );

      entry.sprite.visible = isVisible;
    }

    // Create sprites for visible buildings that don't have them yet
    for (const building of this.buildings) {
      const key = this.getBuildingKey(building);
      if (this.buildingEntries.has(key)) continue;

      const dims = this.facilityDimensionsCache.getFacility(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      // Visibility check
      const isVisible = !(
        building.x + xsize - 1 < visibleBounds.minJ ||
        building.x > visibleBounds.maxJ ||
        building.y + ysize - 1 < visibleBounds.minI ||
        building.y > visibleBounds.maxI
      );

      if (!isVisible) continue;

      this.createBuildingSprite(building);
    }
  }

  /**
   * Create a sprite for a building
   */
  private createBuildingSprite(building: MapBuilding): void {
    const key = this.getBuildingKey(building);

    // Get dimensions
    const dims = this.facilityDimensionsCache.getFacility(building.visualClass);

    // Get texture filename
    const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(building.visualClass);

    // Try to get texture synchronously
    const imageBitmap = this.textureCache.getTextureSync('BuildingImages', textureFilename);

    let material: THREE.SpriteMaterial;
    let textureLoaded = false;

    if (imageBitmap) {
      // Create Three.js texture from ImageBitmap
      const texture = this.getOrCreateTexture(textureFilename, imageBitmap);
      material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
      });
      textureLoaded = true;
    } else {
      // Use placeholder while loading
      material = this.placeholderMaterial.clone();

      // Trigger async load
      this.textureCache.getTextureAsync('BuildingImages', textureFilename);
    }

    const sprite = new THREE.Sprite(material);

    // Position sprite
    this.positionBuildingSprite(sprite, building, dims, imageBitmap);

    // Set render order using painter's algorithm
    // Higher (i + j) = farther from viewer = lower renderOrder (drawn first)
    const depth = building.y + building.x;
    sprite.renderOrder = this.coordinateMapper.getRenderOrder(building.y, building.x, RENDER_LAYER.BUILDINGS);

    const entry: BuildingEntry = {
      building,
      sprite,
      dimensions: dims || null,
      textureLoaded
    };

    this.buildingEntries.set(key, entry);
    this.buildingGroup.add(sprite);
  }

  /**
   * Position and scale a building sprite
   */
  private positionBuildingSprite(
    sprite: THREE.Sprite,
    building: MapBuilding,
    dims: FacilityDimensions | null | undefined,
    imageBitmap: ImageBitmap | null
  ): void {
    // Get the south corner of the building (anchor point)
    // This is at map coordinates (building.y, building.x)
    const southCornerWorld = this.coordinateMapper.mapToWorld(building.y, building.x);

    // Get tile dimensions
    const tileWidth = CoordinateMapper3D.getTileWidth();
    const tileHeight = CoordinateMapper3D.getTileHeight();

    // Calculate sprite size
    let spriteWidth: number;
    let spriteHeight: number;

    if (imageBitmap) {
      // Use actual texture dimensions, scaled
      spriteWidth = imageBitmap.width * this.scaleFactor;
      spriteHeight = imageBitmap.height * this.scaleFactor;
    } else {
      // Placeholder size based on building footprint
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;
      spriteWidth = tileWidth * Math.max(xsize, ysize) * this.scaleFactor;
      spriteHeight = spriteWidth; // Square placeholder
    }

    // Convert pixel dimensions to world units
    // In world space, tileWidth pixels = tileWidth world units
    const worldWidth = spriteWidth;
    const worldHeight = spriteHeight;

    sprite.scale.set(worldWidth, worldHeight, 1);

    // Position sprite
    // The south corner world position is where the bottom-center of the texture should be
    // For a sprite, the center is at (0.5, 0.5) by default
    // We want bottom-center to be at the south corner position

    // Set sprite center to bottom-center (0.5, 0)
    sprite.center.set(0.5, 0);

    // Position at south corner, slightly above ground
    sprite.position.set(
      southCornerWorld.x,
      0.05 + (building.y + building.x) * 0.001, // Small Y offset based on depth
      southCornerWorld.z + tileHeight / 2 // Offset to south vertex of tile
    );
  }

  /**
   * Get or create a Three.js texture from an ImageBitmap
   */
  private getOrCreateTexture(filename: string, imageBitmap: ImageBitmap): THREE.Texture {
    let texture = this.threeTextureCache.get(filename);
    if (texture) return texture;

    // Create canvas from ImageBitmap
    const canvas = document.createElement('canvas');
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imageBitmap, 0, 0);
    }

    texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    this.threeTextureCache.set(filename, texture);
    return texture;
  }

  /**
   * Handle when a building texture is loaded
   */
  private onBuildingTextureLoaded(filename: string): void {
    // Find buildings using this texture and update them
    for (const [key, entry] of this.buildingEntries) {
      if (entry.textureLoaded) continue;

      const expectedFilename = GameObjectTextureCache.getBuildingTextureFilename(entry.building.visualClass);
      if (expectedFilename !== filename) continue;

      // Get the loaded texture
      const imageBitmap = this.textureCache.getTextureSync('BuildingImages', filename);
      if (!imageBitmap) continue;

      // Create new material with texture
      const texture = this.getOrCreateTexture(filename, imageBitmap);
      const newMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
      });

      // Replace material
      if (entry.sprite.material !== this.placeholderMaterial) {
        entry.sprite.material.dispose();
      }
      entry.sprite.material = newMaterial;
      entry.textureLoaded = true;

      // Update position/scale with actual texture dimensions
      this.positionBuildingSprite(entry.sprite, entry.building, entry.dimensions, imageBitmap);
    }

    // Notify callback
    if (this.onTextureLoaded) {
      this.onTextureLoaded();
    }
  }

  /**
   * Update scale of all building sprites
   */
  private updateAllBuildingScales(): void {
    for (const entry of this.buildingEntries.values()) {
      const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(entry.building.visualClass);
      const imageBitmap = this.textureCache.getTextureSync('BuildingImages', textureFilename);
      this.positionBuildingSprite(entry.sprite, entry.building, entry.dimensions, imageBitmap);
    }
  }

  /**
   * Set hovered building for highlighting
   */
  setHoveredBuilding(building: MapBuilding | null): void {
    // Remove existing highlight
    if (this.hoverHighlightSprite) {
      this.buildingGroup.remove(this.hoverHighlightSprite);
      this.hoverHighlightSprite.material.dispose();
      this.hoverHighlightSprite = null;
    }

    this.hoveredBuilding = building;

    // Create highlight for new hovered building
    if (building) {
      const key = this.getBuildingKey(building);
      const entry = this.buildingEntries.get(key);

      if (entry && entry.sprite.visible) {
        // Create a semi-transparent highlight sprite behind the building
        const highlightCanvas = this.createHighlightTexture();
        const highlightTexture = new THREE.CanvasTexture(highlightCanvas);
        highlightTexture.minFilter = THREE.NearestFilter;
        highlightTexture.magFilter = THREE.NearestFilter;

        const highlightMaterial = new THREE.SpriteMaterial({
          map: highlightTexture,
          transparent: true,
          opacity: 0.6
        });

        this.hoverHighlightSprite = new THREE.Sprite(highlightMaterial);

        // Match position and scale of the building sprite
        this.hoverHighlightSprite.position.copy(entry.sprite.position);
        this.hoverHighlightSprite.position.y -= 0.01; // Slightly below to appear behind
        this.hoverHighlightSprite.scale.copy(entry.sprite.scale);
        this.hoverHighlightSprite.scale.multiplyScalar(1.1); // Slightly larger for glow effect
        this.hoverHighlightSprite.center.copy(entry.sprite.center);

        // Use same renderOrder but slightly lower to render behind
        this.hoverHighlightSprite.renderOrder = entry.sprite.renderOrder - 1;

        this.buildingGroup.add(this.hoverHighlightSprite);
      }
    }
  }

  /**
   * Create a highlight texture (blue glow)
   */
  private createHighlightTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Create radial gradient for glow effect
      const gradient = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(93, 173, 255, 0.8)'); // Bright blue center
      gradient.addColorStop(0.5, 'rgba(93, 173, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(93, 173, 255, 0)'); // Fade to transparent

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }

    return canvas;
  }

  /**
   * Get building at screen position (for picking)
   */
  getBuildingAtPosition(screenX: number, screenY: number, camera: THREE.Camera): MapBuilding | null {
    // Use raycasting to find building under cursor
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(this.buildingGroup.children, false);

    if (intersects.length > 0) {
      // Find the building entry for this sprite
      const sprite = intersects[0].object;
      for (const entry of this.buildingEntries.values()) {
        if (entry.sprite === sprite) {
          return entry.building;
        }
      }
    }

    return null;
  }

  /**
   * Get building count
   */
  getBuildingCount(): number {
    return this.buildings.length;
  }

  /**
   * Get sprite count
   */
  getSpriteCount(): number {
    return this.buildingEntries.size;
  }

  /**
   * Check if all visible buildings have textures loaded
   */
  allTexturesLoaded(): boolean {
    for (const entry of this.buildingEntries.values()) {
      if (entry.sprite.visible && !entry.textureLoaded) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get occupied tiles (building footprints)
   */
  getOccupiedTiles(): Set<string> {
    const occupied = new Set<string>();

    for (const building of this.buildings) {
      const dims = this.facilityDimensionsCache.getFacility(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      for (let dy = 0; dy < ysize; dy++) {
        for (let dx = 0; dx < xsize; dx++) {
          occupied.add(`${building.x + dx},${building.y + dy}`);
        }
      }
    }

    return occupied;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearBuildings();

    // Remove hover highlight
    if (this.hoverHighlightSprite) {
      this.buildingGroup.remove(this.hoverHighlightSprite);
      this.hoverHighlightSprite.material.dispose();
      this.hoverHighlightSprite = null;
    }

    // Dispose Three.js textures
    for (const texture of this.threeTextureCache.values()) {
      texture.dispose();
    }
    this.threeTextureCache.clear();

    // Dispose placeholder material
    this.placeholderMaterial.dispose();

    // Clear game object texture cache
    this.textureCache.clear();

    this.scene.remove(this.buildingGroup);
  }
}
