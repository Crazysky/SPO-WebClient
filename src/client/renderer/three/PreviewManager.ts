/**
 * PreviewManager
 *
 * Manages interactive preview overlays for the Three.js renderer:
 * - Building placement preview (collision detection + visual feedback)
 * - Road drawing preview (staircase path + validation)
 * - Zone overlay (semi-transparent colored zones)
 *
 * Architecture:
 * - Reuses diamond geometry for all preview tiles
 * - Creates temporary Three.js meshes for previews
 * - Provides validation logic matching Canvas2D renderer
 */

import * as THREE from 'three';
import { CoordinateMapper3D } from './CoordinateMapper3D';
import { RENDER_LAYER } from './IsometricThreeRenderer';
import { MapBuilding, MapSegment } from '../../../shared/types';
import { TileBounds, Point } from '../../../shared/map-config';
import { SurfaceData } from '../../../shared/types/domain-types';
import { getFacilityDimensionsCache } from '../../facility-dimensions-cache';

/**
 * Building placement parameters
 */
export interface PlacementParams {
  i: number;              // Map coordinate row
  j: number;              // Map coordinate column
  buildingName: string;
  cost: number;
  area: number;
  zoneRequirement: string;
  xsize: number;          // Building width in tiles
  ysize: number;          // Building height in tiles
}

/**
 * Road drawing state
 */
export interface RoadDrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Road validation result
 */
export interface RoadValidation {
  hasCollision: boolean;
  connectsToRoad: boolean;
}

export class PreviewManager {
  // Core dependencies
  private scene: THREE.Scene;
  private coordinateMapper: CoordinateMapper3D;

  // Three.js groups
  private previewGroup: THREE.Group;
  private zoneOverlayGroup: THREE.Group;

  // Shared geometry (reuse for all preview tiles)
  private previewTileGeometry: THREE.BufferGeometry;

  // Data providers (avoid circular dependencies)
  private getBuildingsData: () => MapBuilding[];
  private getSegmentsData: () => MapSegment[];

  // Facility dimensions cache
  private facilityDimensionsCache = getFacilityDimensionsCache();

  // Building placement state
  private placementParams: PlacementParams | null = null;
  private placementEnabled: boolean = false;

  // Road drawing state
  private roadDrawingEnabled: boolean = false;

  // Zone overlay state
  private zoneData: SurfaceData | null = null;
  private zoneOriginX: number = 0;
  private zoneOriginY: number = 0;

  // Zone color constants (matching Canvas2D)
  private readonly ZONE_COLORS: Record<number, THREE.Color> = {
    3000: new THREE.Color(0xff6b6b), // Residential - Red
    4000: new THREE.Color(0x4dabf7), // Commercial - Blue
    5000: new THREE.Color(0xffd43b), // Industrial - Yellow
    6000: new THREE.Color(0x51cf66), // Agricultural - Green
    7000: new THREE.Color(0xff922b), // Mixed - Orange
    8000: new THREE.Color(0x845ef7), // Special - Purple
    9000: new THREE.Color(0xfd7e14)  // Other - Bright Orange
  };

  constructor(
    scene: THREE.Scene,
    coordinateMapper: CoordinateMapper3D,
    getBuildingsData: () => MapBuilding[],
    getSegmentsData: () => MapSegment[]
  ) {
    this.scene = scene;
    this.coordinateMapper = coordinateMapper;
    this.getBuildingsData = getBuildingsData;
    this.getSegmentsData = getSegmentsData;

    // Create groups
    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'preview';
    this.scene.add(this.previewGroup);

    this.zoneOverlayGroup = new THREE.Group();
    this.zoneOverlayGroup.name = 'zoneOverlay';
    this.scene.add(this.zoneOverlayGroup);

    // Create shared diamond geometry
    this.previewTileGeometry = this.createDiamondGeometry();
  }

  // ============================================
  // CORE GEOMETRY & MATERIAL CREATION
  // ============================================

  /**
   * Create diamond-shaped geometry for isometric tiles
   * Reuses pattern from RoadRenderer
   */
  private createDiamondGeometry(): THREE.BufferGeometry {
    const tileWidth = CoordinateMapper3D.getTileWidth();
    const tileHeight = CoordinateMapper3D.getTileHeight();
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    // 4 vertices: top, right, bottom, left
    const positions = new Float32Array([
      0, 0, -halfH,       // Top vertex
      halfW, 0, 0,        // Right vertex
      0, 0, halfH,        // Bottom vertex
      -halfW, 0, 0        // Left vertex
    ]);

    const uvs = new Float32Array([
      0.5, 0,     // Top
      1, 0.5,     // Right
      0.5, 1,     // Bottom
      0, 0.5      // Left
    ]);

    // 2 triangles (6 indices)
    const indices = new Uint16Array([
      0, 1, 2,  // Top-Right-Bottom triangle
      0, 2, 3   // Top-Bottom-Left triangle
    ]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return geometry;
  }

  /**
   * Create a preview material with specified color and opacity
   */
  private createPreviewMaterial(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false // Prevent z-fighting with terrain
    });
  }

  // ============================================
  // BUILDING PLACEMENT PREVIEW
  // ============================================

  /**
   * Enable/disable building placement preview
   */
  setBuildingPreview(enabled: boolean, params?: PlacementParams): void {
    this.clearBuildingPreview();

    if (!enabled || !params) {
      this.placementEnabled = false;
      return;
    }

    this.placementParams = params;
    this.placementEnabled = true;
  }

  /**
   * Update building preview position
   */
  updateBuildingPreviewPosition(i: number, j: number): void {
    if (!this.placementEnabled || !this.placementParams) return;

    // Clear previous preview
    this.clearBuildingPreview();

    const { xsize, ysize } = this.placementParams;

    // Check collision
    const hasCollision = this.checkBuildingCollision(i, j, xsize, ysize);

    // Choose color based on collision
    const color = hasCollision ? new THREE.Color(0xff6464) : new THREE.Color(0x64ff64);
    const material = this.createPreviewMaterial(color, 0.5);

    // Create preview tiles for building footprint
    for (let dy = 0; dy < ysize; dy++) {
      for (let dx = 0; dx < xsize; dx++) {
        const mesh = new THREE.Mesh(this.previewTileGeometry, material.clone());
        const worldPos = this.coordinateMapper.mapToWorld(i + dy, j + dx);

        mesh.position.set(worldPos.x, 0.03, worldPos.z); // Above roads
        mesh.renderOrder = this.coordinateMapper.getRenderOrder(i + dy, j + dx, RENDER_LAYER.UI);

        this.previewGroup.add(mesh);
      }
    }
  }

  /**
   * Check if building placement collides with existing buildings or roads
   * Ported from Canvas2D (isometric-map-renderer.ts lines 1558-1592)
   */
  checkBuildingCollision(i: number, j: number, xsize: number, ysize: number): boolean {
    const buildings = this.getBuildingsData();
    const segments = this.getSegmentsData();

    for (let dy = 0; dy < ysize; dy++) {
      for (let dx = 0; dx < xsize; dx++) {
        const checkX = j + dx;
        const checkY = i + dy;

        // Check against all buildings (multi-tile footprints)
        for (const building of buildings) {
          const dims = this.facilityDimensionsCache.getFacility(building.visualClass);
          const bw = dims?.xsize || 1;
          const bh = dims?.ysize || 1;

          if (checkX >= building.x && checkX < building.x + bw &&
              checkY >= building.y && checkY < building.y + bh) {
            return true;
          }
        }

        // Check against road segments (bounding boxes)
        for (const seg of segments) {
          const minX = Math.min(seg.x1, seg.x2);
          const maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2);
          const maxY = Math.max(seg.y1, seg.y2);

          if (checkX >= minX && checkX <= maxX &&
              checkY >= minY && checkY <= maxY) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Clear building preview meshes
   */
  private clearBuildingPreview(): void {
    // Clear all preview meshes
    for (const child of this.previewGroup.children) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.previewGroup.clear();
  }

  // ============================================
  // ROAD DRAWING PREVIEW
  // ============================================

  /**
   * Enable/disable road drawing mode
   */
  setRoadDrawingMode(enabled: boolean): void {
    this.roadDrawingEnabled = enabled;
    if (!enabled) {
      this.clearRoadPreview();
    }
  }

  /**
   * Update road hover preview (single tile indicator)
   */
  updateRoadHoverPreview(i: number, j: number): RoadValidation {
    this.clearRoadPreview();

    if (!this.roadDrawingEnabled) {
      return { hasCollision: false, connectsToRoad: false };
    }

    // Check validity of this tile
    const validation = this.validateRoadPath([{ x: j, y: i }]);

    // Determine color: blue if valid, orange if invalid
    const isValid = !validation.hasCollision && validation.connectsToRoad;
    const color = isValid ? new THREE.Color(0x66ccff) : new THREE.Color(0xff9966);
    const material = this.createPreviewMaterial(color, 0.4);

    // Create single tile mesh
    const mesh = new THREE.Mesh(this.previewTileGeometry, material);
    const worldPos = this.coordinateMapper.mapToWorld(i, j);

    mesh.position.set(worldPos.x, 0.03, worldPos.z);
    mesh.renderOrder = this.coordinateMapper.getRenderOrder(i, j, RENDER_LAYER.UI);

    this.previewGroup.add(mesh);

    return validation;
  }

  /**
   * Update road path preview (staircase path from start to end)
   */
  updateRoadPathPreview(state: RoadDrawingState): RoadValidation {
    this.clearRoadPreview();

    if (!this.roadDrawingEnabled || !state.isDrawing) {
      return { hasCollision: false, connectsToRoad: false };
    }

    // Generate staircase path
    const pathTiles = this.generateStaircasePath(
      state.startX,
      state.startY,
      state.endX,
      state.endY
    );

    // Validate path
    const validation = this.validateRoadPath(pathTiles);

    // Determine color: green if valid, red if error
    const hasError = validation.hasCollision || !validation.connectsToRoad;
    const color = hasError ? new THREE.Color(0xff6464) : new THREE.Color(0x64c864);
    const material = this.createPreviewMaterial(color, 0.5);

    // Create meshes for all path tiles
    for (const tile of pathTiles) {
      const mesh = new THREE.Mesh(this.previewTileGeometry, material.clone());
      const worldPos = this.coordinateMapper.mapToWorld(tile.y, tile.x);

      mesh.position.set(worldPos.x, 0.03, worldPos.z);
      mesh.renderOrder = this.coordinateMapper.getRenderOrder(tile.y, tile.x, RENDER_LAYER.UI);

      this.previewGroup.add(mesh);
    }

    return validation;
  }

  /**
   * Generate staircase path between two points
   * Ported from Canvas2D (isometric-map-renderer.ts lines 1818-1845)
   */
  generateStaircasePath(x1: number, y1: number, x2: number, y2: number): Point[] {
    const tiles: Point[] = [];
    let x = x1, y = y1;
    tiles.push({ x, y });

    const dx = x2 - x1;
    const dy = y2 - y1;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    let remainingX = Math.abs(dx);
    let remainingY = Math.abs(dy);

    // Greedy algorithm: prioritize X movement when distances are equal
    while (remainingX > 0 || remainingY > 0) {
      if (remainingX >= remainingY && remainingX > 0) {
        x += sx;
        remainingX--;
      } else if (remainingY > 0) {
        y += sy;
        remainingY--;
      }
      tiles.push({ x, y });
    }

    return tiles;
  }

  /**
   * Validate road path (check building collisions and road connectivity)
   * Ported from Canvas2D (isometric-map-renderer.ts lines 1662-1681)
   */
  validateRoadPath(pathTiles: Point[]): RoadValidation {
    const buildings = this.getBuildingsData();
    const segments = this.getSegmentsData();

    // Check building collisions
    let hasCollision = false;
    for (const tile of pathTiles) {
      for (const building of buildings) {
        const dims = this.facilityDimensionsCache.getFacility(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;

        if (tile.x >= building.x && tile.x < building.x + bw &&
            tile.y >= building.y && tile.y < building.y + bh) {
          hasCollision = true;
          break;
        }
      }
      if (hasCollision) break;
    }

    // Check road connectivity (8-neighbor adjacency)
    const hasExistingRoads = segments.length > 0;

    if (!hasExistingRoads) {
      // First road is always valid (no connectivity requirement)
      return { hasCollision, connectsToRoad: true };
    }

    // Build road tile set from segments
    const roadTiles = new Set<string>();
    for (const seg of segments) {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      const minY = Math.min(seg.y1, seg.y2);
      const maxY = Math.max(seg.y1, seg.y2);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          roadTiles.add(`${x},${y}`);
        }
      }
    }

    // Check if any path tile is adjacent to existing road (8-neighbor check)
    let connectsToRoad = false;
    for (const tile of pathTiles) {
      const neighbors = [
        [tile.x - 1, tile.y], [tile.x + 1, tile.y],       // West, East
        [tile.x, tile.y - 1], [tile.x, tile.y + 1],       // North, South
        [tile.x - 1, tile.y - 1], [tile.x + 1, tile.y - 1], // NW, NE
        [tile.x - 1, tile.y + 1], [tile.x + 1, tile.y + 1]  // SW, SE
      ];

      for (const [nx, ny] of neighbors) {
        if (roadTiles.has(`${nx},${ny}`)) {
          connectsToRoad = true;
          break;
        }
      }
      if (connectsToRoad) break;
    }

    return { hasCollision, connectsToRoad };
  }

  /**
   * Clear road preview meshes
   */
  private clearRoadPreview(): void {
    this.clearBuildingPreview(); // Reuse same preview group
  }

  // ============================================
  // ZONE OVERLAY
  // ============================================

  /**
   * Set zone overlay data and create meshes
   */
  setZoneOverlay(enabled: boolean, data: SurfaceData | null, x1: number, y1: number): void {
    this.clearZoneOverlay();

    if (!enabled || !data) {
      return;
    }

    this.zoneData = data;
    this.zoneOriginX = x1;
    this.zoneOriginY = y1;

    // Create zone meshes
    for (let row = 0; row < data.rows.length; row++) {
      const rowData = data.rows[row];

      for (let col = 0; col < rowData.length; col++) {
        const value = rowData[col];
        if (value === 0) continue; // Skip transparent zones

        const worldX = x1 + col;
        const worldY = y1 + row;

        // Get color for this zone type
        const color = this.ZONE_COLORS[value] || new THREE.Color(0x888888);

        // Create material (semi-transparent)
        const material = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
          depthWrite: false
        });

        // Create mesh
        const mesh = new THREE.Mesh(this.previewTileGeometry, material);
        const worldPos = this.coordinateMapper.mapToWorld(worldY, worldX);

        mesh.position.set(worldPos.x, 0.02, worldPos.z); // Above terrain, below roads
        mesh.renderOrder = this.coordinateMapper.getRenderOrder(worldY, worldX, RENDER_LAYER.ZONE_OVERLAY);

        // Store coordinates for visibility culling
        mesh.userData.zoneX = worldX;
        mesh.userData.zoneY = worldY;

        this.zoneOverlayGroup.add(mesh);
      }
    }
  }

  /**
   * Update zone overlay visibility based on camera bounds
   */
  updateZoneOverlayVisibility(visibleBounds: TileBounds): void {
    for (const child of this.zoneOverlayGroup.children) {
      if (child instanceof THREE.Mesh) {
        const x = child.userData.zoneX;
        const y = child.userData.zoneY;

        child.visible = (
          x >= visibleBounds.minJ && x <= visibleBounds.maxJ &&
          y >= visibleBounds.minI && y <= visibleBounds.maxI
        );
      }
    }
  }

  /**
   * Clear zone overlay meshes
   */
  private clearZoneOverlay(): void {
    for (const child of this.zoneOverlayGroup.children) {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.zoneOverlayGroup.clear();
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearBuildingPreview();
    this.clearZoneOverlay();

    if (this.previewTileGeometry) {
      this.previewTileGeometry.dispose();
    }

    this.scene.remove(this.previewGroup);
    this.scene.remove(this.zoneOverlayGroup);
  }
}
