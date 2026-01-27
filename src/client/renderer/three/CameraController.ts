/**
 * CameraController
 *
 * Handles camera pan and zoom for the isometric Three.js renderer.
 * Matches the 4 zoom levels from the existing Canvas2D renderer.
 */

import * as THREE from 'three';
import { ZOOM_LEVELS, ZoomConfig } from '../../../shared/map-config';
import { CoordinateMapper3D } from './CoordinateMapper3D';

export interface CameraControllerOptions {
  minZoom?: number;
  maxZoom?: number;
  panSpeed?: number;
  enablePan?: boolean;
  enableZoom?: boolean;
}

export class CameraController {
  private camera: THREE.OrthographicCamera;
  private domElement: HTMLElement;
  private coordinateMapper: CoordinateMapper3D;

  // Zoom state
  private currentZoomLevel: number = 2; // Default zoom level (0-3)
  private targetZoom: number = 1;
  private currentZoom: number = 1;

  // Pan state
  private isPanning: boolean = false;
  private panStart: THREE.Vector2 = new THREE.Vector2();
  private panDelta: THREE.Vector2 = new THREE.Vector2();

  // Camera target (where the camera looks at on the ground plane)
  private target: THREE.Vector3 = new THREE.Vector3();

  // Options
  private enablePan: boolean = true;
  private enableZoom: boolean = true;
  private panSpeed: number = 1.0;

  // Zoom level scales (matches ZOOM_LEVELS from map-config)
  // These determine how many pixels per world unit at each zoom level
  private readonly zoomScales: number[] = [
    0.25,  // Level 0: 4x4 tiles (zoomed out)
    0.5,   // Level 1: 8x8 tiles
    1.0,   // Level 2: 16x16 tiles (default)
    2.0    // Level 3: 32x32 tiles (zoomed in)
  ];

  // Callbacks
  private onCameraChange: (() => void) | null = null;

  constructor(
    camera: THREE.OrthographicCamera,
    domElement: HTMLElement,
    coordinateMapper: CoordinateMapper3D,
    options: CameraControllerOptions = {}
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.coordinateMapper = coordinateMapper;

    // Apply options
    this.enablePan = options.enablePan ?? true;
    this.enableZoom = options.enableZoom ?? true;
    this.panSpeed = options.panSpeed ?? 1.0;

    // Initialize zoom
    this.currentZoom = this.zoomScales[this.currentZoomLevel];
    this.targetZoom = this.currentZoom;

    // Set initial camera position
    this.setupCamera();

    // Bind event listeners
    this.addEventListeners();
  }

  /**
   * Setup the orthographic camera for isometric view
   * Camera looks down at the ground plane from above at an angle
   */
  private setupCamera(): void {
    // Position camera above and behind the target
    // For true isometric, we use an orthographic projection looking down
    // The camera is positioned to look at the ground plane (y=0)
    this.updateCameraProjection();
    this.updateCameraPosition();
  }

  /**
   * Update the orthographic camera projection based on zoom
   */
  private updateCameraProjection(): void {
    const width = this.domElement.clientWidth;
    const height = this.domElement.clientHeight;

    // Calculate frustum size based on zoom
    // At zoom 1.0, 1 world unit = 1 pixel
    const frustumHalfHeight = (height / 2) / this.currentZoom;
    const frustumHalfWidth = (width / 2) / this.currentZoom;

    this.camera.left = -frustumHalfWidth;
    this.camera.right = frustumHalfWidth;
    this.camera.top = frustumHalfHeight;
    this.camera.bottom = -frustumHalfHeight;

    this.camera.updateProjectionMatrix();
  }

  /**
   * Update camera position to look at the target
   */
  private updateCameraPosition(): void {
    // Position camera above the target, looking down
    // Use a 45-degree angle for isometric-style view
    const cameraHeight = 1000; // Far enough to see everything
    const cameraOffset = 1000; // Offset for angled view

    this.camera.position.set(
      this.target.x,
      cameraHeight,
      this.target.z + cameraOffset
    );

    // Look at the target on the ground plane
    this.camera.lookAt(this.target.x, 0, this.target.z);

    // For true top-down orthographic (no perspective rotation):
    // We position camera directly above and use camera.up to control orientation
    // this.camera.position.set(this.target.x, cameraHeight, this.target.z);
    // this.camera.up.set(0, 0, -1);
    // this.camera.lookAt(this.target.x, 0, this.target.z);
  }

  /**
   * Add event listeners for pan and zoom
   */
  private addEventListeners(): void {
    this.domElement.addEventListener('mousedown', this.onMouseDown);
    this.domElement.addEventListener('mousemove', this.onMouseMove);
    this.domElement.addEventListener('mouseup', this.onMouseUp);
    this.domElement.addEventListener('mouseleave', this.onMouseUp);
    this.domElement.addEventListener('wheel', this.onMouseWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this.onContextMenu);

    // Handle window resize
    window.addEventListener('resize', this.onWindowResize);
  }

  /**
   * Remove event listeners
   */
  public dispose(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.domElement.removeEventListener('mousemove', this.onMouseMove);
    this.domElement.removeEventListener('mouseup', this.onMouseUp);
    this.domElement.removeEventListener('mouseleave', this.onMouseUp);
    this.domElement.removeEventListener('wheel', this.onMouseWheel);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.onWindowResize);
  }

  // Event handlers (arrow functions to preserve 'this')
  private onMouseDown = (event: MouseEvent): void => {
    if (!this.enablePan) return;

    // Middle mouse button or left button with no modifier for pan
    if (event.button === 1 || (event.button === 0 && !event.shiftKey && !event.ctrlKey)) {
      this.isPanning = true;
      this.panStart.set(event.clientX, event.clientY);
      event.preventDefault();
    }
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isPanning) return;

    this.panDelta.set(
      event.clientX - this.panStart.x,
      event.clientY - this.panStart.y
    );

    // Convert screen delta to world delta
    // At zoom 1.0, 1 pixel = 1 world unit
    const worldDeltaX = -this.panDelta.x / this.currentZoom * this.panSpeed;
    const worldDeltaZ = -this.panDelta.y / this.currentZoom * this.panSpeed;

    this.target.x += worldDeltaX;
    this.target.z += worldDeltaZ;

    this.panStart.set(event.clientX, event.clientY);

    this.updateCameraPosition();
    this.notifyCameraChange();
  };

  private onMouseUp = (_event: MouseEvent): void => {
    this.isPanning = false;
  };

  private onMouseWheel = (event: WheelEvent): void => {
    if (!this.enableZoom) return;
    event.preventDefault();

    // Determine zoom direction
    const delta = event.deltaY > 0 ? -1 : 1;
    const newZoomLevel = Math.max(0, Math.min(3, this.currentZoomLevel + delta));

    if (newZoomLevel !== this.currentZoomLevel) {
      this.setZoomLevel(newZoomLevel);
    }
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onWindowResize = (): void => {
    this.updateCameraProjection();
    this.notifyCameraChange();
  };

  /**
   * Set zoom level (0-3)
   */
  public setZoomLevel(level: number): void {
    const clampedLevel = Math.max(0, Math.min(3, level));
    if (clampedLevel !== this.currentZoomLevel) {
      this.currentZoomLevel = clampedLevel;
      this.currentZoom = this.zoomScales[this.currentZoomLevel];
      this.updateCameraProjection();
      this.notifyCameraChange();
    }
  }

  /**
   * Get current zoom level (0-3)
   */
  public getZoomLevel(): number {
    return this.currentZoomLevel;
  }

  /**
   * Set a custom zoom value (not limited to discrete levels)
   * Useful for fitting the entire map to view
   */
  public setCustomZoom(zoom: number): void {
    this.currentZoom = zoom;
    this.targetZoom = zoom;
    this.updateCameraProjection();
    this.notifyCameraChange();
  }

  /**
   * Calculate and apply zoom to fit the entire map in view
   * @param mapWidth - Map width in tiles
   * @param mapHeight - Map height in tiles
   */
  public fitMapToView(mapWidth: number, mapHeight: number): void {
    const width = this.domElement.clientWidth;
    const height = this.domElement.clientHeight;

    // Calculate world dimensions of the map
    // For a 1000x1000 tile map:
    // The diagonal spans from mapToWorld(0,0) to mapToWorld(1000,1000)
    // Width in world units: mapWidth * tileWidth/2 + mapHeight * tileWidth/2
    // Height in world units: (mapWidth + mapHeight) * tileHeight/2
    const tileWidth = 32;
    const tileHeight = 16;

    const mapWorldWidth = (mapWidth + mapHeight) * (tileWidth / 2);
    const mapWorldHeight = (mapWidth + mapHeight) * (tileHeight / 2);

    // Calculate zoom needed to fit map in view with some padding
    const padding = 1.1; // 10% padding
    const zoomForWidth = (width / 2) / (mapWorldWidth / 2 * padding);
    const zoomForHeight = (height / 2) / (mapWorldHeight / 2 * padding);

    // Use the smaller zoom to ensure entire map fits
    const fitZoom = Math.min(zoomForWidth, zoomForHeight);

    console.log(`[CameraController] fitMapToView: map=${mapWidth}x${mapHeight}, canvas=${width}x${height}, zoom=${fitZoom.toFixed(3)}`);

    this.setCustomZoom(fitZoom);
  }

  /**
   * Center the camera on map coordinates (i, j)
   */
  public centerOnMapCoords(i: number, j: number): void {
    const worldPos = this.coordinateMapper.mapToWorld(i, j);
    this.target.copy(worldPos);
    this.updateCameraPosition();
    this.notifyCameraChange();
  }

  /**
   * Center the camera on world coordinates
   */
  public centerOnWorld(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.updateCameraPosition();
    this.notifyCameraChange();
  }

  /**
   * Pan the camera by pixel delta (used for mouse dragging)
   */
  public panByPixels(deltaX: number, deltaY: number): void {
    // Convert screen delta to world delta
    // At zoom 1.0, 1 pixel = 1 world unit
    const worldDeltaX = -deltaX / this.currentZoom * this.panSpeed;
    const worldDeltaZ = -deltaY / this.currentZoom * this.panSpeed;

    this.target.x += worldDeltaX;
    this.target.z += worldDeltaZ;

    this.updateCameraPosition();
    this.notifyCameraChange();
  }

  /**
   * Get the current camera target in world coordinates
   */
  public getTargetWorld(): THREE.Vector3 {
    return this.target.clone();
  }

  /**
   * Get the current camera target in map coordinates
   */
  public getTargetMapCoords(): { i: number; j: number } {
    const mapCoords = this.coordinateMapper.worldToMap(this.target.x, this.target.z);
    return { i: mapCoords.x, j: mapCoords.y };
  }

  /**
   * Set callback for camera changes
   */
  public setOnCameraChange(callback: () => void): void {
    this.onCameraChange = callback;
  }

  /**
   * Notify listeners of camera change
   */
  private notifyCameraChange(): void {
    if (this.onCameraChange) {
      this.onCameraChange();
    }
  }

  /**
   * Handle viewport resize
   */
  public handleResize(width: number, height: number): void {
    this.updateCameraProjection();
    this.notifyCameraChange();
  }

  /**
   * Check if currently panning
   */
  public isPanningActive(): boolean {
    return this.isPanning;
  }

  /**
   * Enable or disable panning
   */
  public setPanEnabled(enabled: boolean): void {
    this.enablePan = enabled;
    if (!enabled) {
      this.isPanning = false;
    }
  }

  /**
   * Enable or disable zooming
   */
  public setZoomEnabled(enabled: boolean): void {
    this.enableZoom = enabled;
  }

  /**
   * Get the orthographic camera
   */
  public getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  /**
   * Get current zoom scale (pixels per world unit)
   */
  public getZoomScale(): number {
    return this.currentZoom;
  }
}
