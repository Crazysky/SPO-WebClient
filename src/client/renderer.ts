import { MapData, MapBuilding, MapSegment, SurfaceData, FacilityDimensions, RoadDrawingState } from '../shared/types';

interface CachedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  buildings: MapBuilding[];
  segments: MapSegment[];
}

interface PlacementPreview {
  x: number;
  y: number;
  buildingName: string;
  cost: number;
  area: number;
  zoneRequirement: string;
  xsize: number;
  ysize: number;
}

export class MapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Camera/viewport
  private cameraX: number = 0;
  private cameraY: number = 0;
  private scale: number = 8; // Pixels per map cell

  // Cached zones and aggregated data
  private cachedZones: Map<string, CachedZone> = new Map();
  private allBuildings: MapBuilding[] = [];
  private allSegments: MapSegment[] = [];

  // Building dimensions cache (visualClass -> dimensions)
  private facilityDimensionsCache: Map<string, FacilityDimensions> = new Map();

  // Mouse drag state
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

    // Hovered building for cursor change
  private hoveredBuilding: MapBuilding | null = null;

  // Zone loading callback
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;

  // Facility dimensions fetch callback
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;
  
	  // --- ZONE LOADING CONTROL ---
	private loadingZones: Set<string> = new Set();
	private zoneCheckDebounceTimer: number | null = null;
	private readonly ZONE_CHECK_DEBOUNCE_MS = 500; // Wait 200ms after movement stops
	
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onCancelPlacement: (() => void) | null = null;

  // Zone overlay state
  private zoneOverlayEnabled: boolean = false;
  private zoneOverlayData: SurfaceData | null = null;
  private zoneOverlayX1: number = 0;
  private zoneOverlayY1: number = 0;

  // Building placement preview
  private placementPreview: PlacementPreview | null = null;
  private placementMode: boolean = false;
  private mouseWorldX: number = 0;
  private mouseWorldY: number = 0;

  // Road drawing mode state
  private roadDrawingMode: boolean = false;
  private roadDrawingState: RoadDrawingState = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    isMouseDown: false,
    mouseDownTime: 0
  };
  private onRoadSegmentComplete: ((x1: number, y1: number, x2: number, y2: number) => void) | null = null;
  private onCancelRoadDrawing: (() => void) | null = null;
  private roadCostPerTile: number = 100; // Default cost, will be updated from server

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error(`Canvas with id "${canvasId}" not found`);
    }
    
    this.ctx = this.canvas.getContext('2d')!;
    
    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Setup mouse controls
    this.setupMouseControls();
    
    // Initial render
    this.render();
  }

  private resizeCanvas() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.render();
  }

   /**
   * Set callback for loading new zones
   */
  public setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void) {
    this.onLoadZone = callback;
  }
   /**
   *  Set callback for building clicks
   */
  public setBuildingClickCallback(callback: (x: number, y: number, visualClass?: string) => void) {
    this.onBuildingClick = callback;
  }

  /**
   * Set callback for placement cancellation
   */
  public setCancelPlacementCallback(callback: () => void) {
    this.onCancelPlacement = callback;
  }

  /**
   * Set callback for fetching facility dimensions
   */
  public setFetchFacilityDimensionsCallback(callback: (visualClass: string) => Promise<FacilityDimensions | null>) {
    this.onFetchFacilityDimensions = callback;
  }

  /**
   * Set callback for road segment completion
   */
  public setRoadSegmentCompleteCallback(callback: (x1: number, y1: number, x2: number, y2: number) => void) {
    this.onRoadSegmentComplete = callback;
  }

  /**
   * Set callback for road drawing cancellation
   */
  public setCancelRoadDrawingCallback(callback: () => void) {
    this.onCancelRoadDrawing = callback;
  }

  /**
   * Set road cost per tile (for preview display)
   */
  public setRoadCostPerTile(cost: number) {
    this.roadCostPerTile = cost;
  }
	/**
	 * Convert mouse event coordinates to canvas-relative coordinates
	 */
	private getCanvasCoordinates(clientX: number, clientY: number): { x: number, y: number } {
	  const rect = this.canvas.getBoundingClientRect();
	  return {
		x: clientX - rect.left,
		y: clientY - rect.top
	  };
	}
  /**
   *  Get building at screen coordinates
   */
private getClickedBuilding(mouseX: number, mouseY: number): MapBuilding | null {
  // Convert screen coordinates to world coordinates
  const centerX = this.canvas.width / 2;
  const centerY = this.canvas.height / 2;

  const worldX = this.cameraX + (mouseX - centerX) / this.scale;
  const worldY = this.cameraY + (mouseY - centerY) / this.scale;

  // Check if click is within any building's footprint
  for (const building of this.allBuildings) {
    const dimensions = this.facilityDimensionsCache.get(building.visualClass);
    const xsize = dimensions?.xsize || 1;
    const ysize = dimensions?.ysize || 1;

    // Check if world coordinates are within the building footprint
    if (worldX >= building.x && worldX < building.x + xsize &&
        worldY >= building.y && worldY < building.y + ysize) {
      return building;
    }
  }

  return null;
}

	/**
	 * Update map data (add to cache)
	 */
	public async updateMapData(data: MapData) {
		const zoneKey = `${data.x},${data.y}`;

		// --- AJOUT: Retirer de la liste des zones en chargement ---
		this.loadingZones.delete(zoneKey);

		// Check if zone already cached
		if (this.cachedZones.has(zoneKey)) {
			// Remove old data from aggregated lists
			const oldZone = this.cachedZones.get(zoneKey)!;
			this.allBuildings = this.allBuildings.filter(b =>
				!oldZone.buildings.some(ob => ob.x === b.x && ob.y === b.y)
			);
			this.allSegments = this.allSegments.filter(s =>
				!oldZone.segments.some(os => os.x1 === s.x1 && os.y1 === s.y1 && os.x2 === s.x2 && os.y2 === s.y2)
			);
		}

		// Cache the new zone
		this.cachedZones.set(zoneKey, {
			x: data.x,
			y: data.y,
			w: data.w,
			h: data.h,
			buildings: data.buildings,
			segments: data.segments
		});

		// Add new data to aggregated lists
		this.allBuildings.push(...data.buildings);
		this.allSegments.push(...data.segments);

		// Fetch dimensions for new buildings
		await this.loadBuildingDimensions(data.buildings);

		// Center camera on first zone loaded
		if (this.cachedZones.size === 1) {
			this.cameraX = data.x + data.w / 2;
			this.cameraY = data.y + data.h / 2;
		}

		this.render();
	}

	/**
	 * Load dimensions for buildings
	 */
	private async loadBuildingDimensions(buildings: MapBuilding[]): Promise<void> {
		if (!this.onFetchFacilityDimensions) return;

		// Get unique visual classes that aren't already cached
		const uniqueClasses = new Set<string>();
		buildings.forEach(b => {
			if (b.visualClass && !this.facilityDimensionsCache.has(b.visualClass)) {
				uniqueClasses.add(b.visualClass);
			}
		});

		// Fetch dimensions for each unique class
		for (const visualClass of uniqueClasses) {
			try {
				const dimensions = await this.onFetchFacilityDimensions(visualClass);
				if (dimensions) {
					this.facilityDimensionsCache.set(visualClass, dimensions);
				}
			} catch (err) {
				console.error(`Failed to load dimensions for ${visualClass}:`, err);
			}
		}
	}


  /**
   * Check which zones are visible and need loading
   */
     // Check which zones are visible and need loading
    private checkAndLoadVisibleZones(): void {
        if (!this.onLoadZone) return;

        // --- DEBOUNCE: Clear previous timer ---
        if (this.zoneCheckDebounceTimer !== null) {
            window.clearTimeout(this.zoneCheckDebounceTimer);
        }

        // Schedule zone check after movement stabilizes
        this.zoneCheckDebounceTimer = window.setTimeout(() => {
            this.performZoneCheck();
        }, this.ZONE_CHECK_DEBOUNCE_MS);
    }
	
	
    private performZoneCheck(): void {
        const zoneSize = 64;

        // --- UNIQUEMENT ZONE CENTRALE ---
        const centerX = this.cameraX;
        const centerY = this.cameraY;
        const zx = Math.floor(centerX / zoneSize) * zoneSize;
        const zy = Math.floor(centerY / zoneSize) * zoneSize;
        const zoneKey = `${zx},${zy}`;

        // FIX: Only block if zone is currently loading (not if already cached)
        // This allows refreshing zones after movement
        if (this.loadingZones.has(zoneKey)) {
            return;  // Avoid duplicate requests
        }

        this.loadingZones.add(zoneKey);
        this.onLoadZone!(zx, zy, zoneSize, zoneSize);
    }   

		
		// Load zones progressively with delay between batches
	private async batchLoadZones(zones: Array<{ x: number; y: number }>): Promise<void> {
		const BATCH_SIZE = 3; // Load 3 zones at a time
		const BATCH_DELAY_MS = 300; // Wait 300ms between batches

		for (let i = 0; i < zones.length; i += BATCH_SIZE) {
			const batch = zones.slice(i, i + BATCH_SIZE);

			// Mark zones as loading BEFORE triggering
			for (const zone of batch) {
				const zoneKey = `${zone.x},${zone.y}`;
				this.loadingZones.add(zoneKey);
			}

			// Trigger parallel loading for this batch
			for (const zone of batch) {
				this.onLoadZone!(zone.x, zone.y, 64, 64);
			}

			// --- FIX: Wait before next batch (except for last batch) ---
			if (i + BATCH_SIZE < zones.length) {
				await new Promise<void>(resolve => setTimeout(resolve, BATCH_DELAY_MS));
			}
		}
	}

		
		
		
  private render() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (this.cachedZones.size === 0) {
      // No data - show message
      ctx.fillStyle = '#666';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading map data...', width / 2, height / 2);
      return;
    }

    // Calculate screen center
    const centerX = width / 2;
    const centerY = height / 2;

    // Build tile occupation map to ensure one object per tile
    const occupiedTiles = this.buildTileOccupationMap();

    // Draw cached zone boundaries (debug)
    this.drawZoneBoundaries(centerX, centerY);

    // Draw all road segments (only unoccupied tiles)
    this.drawSegments(centerX, centerY, occupiedTiles);

    // Draw all buildings (these have priority over roads)
    this.drawBuildings(centerX, centerY);

    // Draw zone overlay
    this.drawZoneOverlay(centerX, centerY);

    // Draw building placement preview
    this.drawPlacementPreview(centerX, centerY);

    // Draw road drawing preview
    this.drawRoadDrawingPreview(centerX, centerY);

    // Draw info overlay
    this.drawInfo();
  }

  /**
   * Build a map of occupied tiles (buildings have priority)
   */
  private buildTileOccupationMap(): Set<string> {
    const occupied = new Set<string>();

    // Mark all building tiles as occupied (using real dimensions)
    this.allBuildings.forEach(building => {
      const dimensions = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dimensions?.xsize || 1;
      const ysize = dimensions?.ysize || 1;

      // Mark all tiles in the building footprint
      for (let dy = 0; dy < ysize; dy++) {
        for (let dx = 0; dx < xsize; dx++) {
          const key = `${building.x + dx},${building.y + dy}`;
          occupied.add(key);
        }
      }
    });

    return occupied;
  }

  private drawZoneBoundaries(centerX: number, centerY: number) {
    const ctx = this.ctx;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;

    this.cachedZones.forEach(zone => {
      const x1 = centerX + (zone.x - this.cameraX) * this.scale;
      const y1 = centerY + (zone.y - this.cameraY) * this.scale;
      const x2 = centerX + (zone.x + zone.w - this.cameraX) * this.scale;
      const y2 = centerY + (zone.y + zone.h - this.cameraY) * this.scale;

      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Draw zone label
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(`${zone.x},${zone.y}`, x1 + 5, y1 + 15);
    });
  }

  private drawSegments(centerX: number, centerY: number, occupiedTiles: Set<string>) {
    const ctx = this.ctx;

    this.allSegments.forEach(seg => {
      // Calculate the bounding box of the segment
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      const minY = Math.min(seg.y1, seg.y2);
      const maxY = Math.max(seg.y1, seg.y2);

      // Draw each tile covered by the road segment
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          // Check if this tile is already occupied by a building
          const tileKey = `${x},${y}`;
          if (occupiedTiles.has(tileKey)) {
            continue; // Skip this tile - it's occupied by a building
          }

          const screenX = centerX + (x - this.cameraX) * this.scale;
          const screenY = centerY + (y - this.cameraY) * this.scale;

          // Only draw if visible
          if (this.isPointVisible(screenX, screenY)) {
            // Fill the road tile with a gray color
            ctx.fillStyle = '#666';
            ctx.fillRect(screenX, screenY, this.scale, this.scale);

            // Draw a darker border around each road tile
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;
            ctx.strokeRect(screenX, screenY, this.scale, this.scale);
          }
        }
      }
    });
  }

  private drawBuildings(centerX: number, centerY: number) {
    const ctx = this.ctx;

    this.allBuildings.forEach(building => {
      // Get building dimensions from cache
      const dimensions = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dimensions?.xsize || 1;
      const ysize = dimensions?.ysize || 1;

      // Building coordinates represent the bottom-left corner (closest to 0,0)
      const screenX = centerX + (building.x - this.cameraX) * this.scale;
      const screenY = centerY + (building.y - this.cameraY) * this.scale;

      // Only draw if visible
      if (!this.isPointVisible(screenX, screenY)) return;

      const isHovered = this.hoveredBuilding === building;

      // Draw each tile of the building footprint
      for (let dy = 0; dy < ysize; dy++) {
        for (let dx = 0; dx < xsize; dx++) {
          const tileScreenX = screenX + dx * this.scale;
          const tileScreenY = screenY + dy * this.scale;

          // Fill the tile
          ctx.fillStyle = isHovered ? '#5fadff' : '#4a90e2'; // Brighter when hovered
          ctx.fillRect(tileScreenX, tileScreenY, this.scale, this.scale);

          // Draw border
          ctx.strokeStyle = isHovered ? '#fff' : '#2d5a8f';
          ctx.lineWidth = isHovered ? 2 : 1;
          ctx.strokeRect(tileScreenX, tileScreenY, this.scale, this.scale);
        }
      }

      // Draw outer border for multi-tile buildings
      if (xsize > 1 || ysize > 1) {
        ctx.strokeStyle = isHovered ? '#fff' : '#2d5a8f';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX, screenY, xsize * this.scale, ysize * this.scale);
      }
    });
  }

  private isPointVisible(x: number, y: number): boolean {
    return x >= -50 && x <= this.canvas.width + 50 &&
           y >= -50 && y <= this.canvas.height + 50;
  }

  private isLineVisible(x1: number, y1: number, x2: number, y2: number): boolean {
    return this.isPointVisible(x1, y1) || this.isPointVisible(x2, y2);
  }

  private drawInfo() {
    const ctx = this.ctx;
    
    // Draw info panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 280, 100);
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    
    ctx.fillText(`Camera: (${Math.round(this.cameraX)}, ${Math.round(this.cameraY)})`, 20, 30);
    ctx.fillText(`Zoom: ${this.scale.toFixed(1)}x`, 20, 50);
    ctx.fillText(`Zones cached: ${this.cachedZones.size}`, 20, 70);
    ctx.fillText(`Buildings: ${this.allBuildings.length} | Segments: ${this.allSegments.length}`, 20, 90);
  }

  public destroy() {
    window.removeEventListener('resize', () => this.resizeCanvas());
  }
 
	private updateHover(mouseX: number, mouseY: number) {
		const building = this.getClickedBuilding(mouseX, mouseY);
		if (building !== this.hoveredBuilding) {
			this.hoveredBuilding = building;
		}

		// --- FIX CURSOR CONSISTANT ---
		// Don't change cursor if in placement mode or road drawing mode
		if (this.placementMode || this.roadDrawingMode) {
			this.canvas.style.cursor = 'crosshair';
		} else if (this.hoveredBuilding) {
			this.canvas.style.cursor = 'pointer';
		} else if (this.isDragging) {
			this.canvas.style.cursor = 'grabbing';
		} else {
			this.canvas.style.cursor = 'grab';
		}
		this.render();
	} 

	private setupMouseControls() {
	  // Right mouse button down - cancel placement OR cancel road drawing OR start drag
	  this.canvas.addEventListener('mousedown', (e) => {
		if (e.button === 2) { // Right click
		  e.preventDefault(); // Prevent context menu

		  // In placement mode, right click cancels
		  if (this.placementMode && this.onCancelPlacement) {
			this.onCancelPlacement();
			return;
		  }

		  // In road drawing mode, right click cancels
		  if (this.roadDrawingMode && this.onCancelRoadDrawing) {
			this.onCancelRoadDrawing();
			return;
		  }

		  // Normal mode - start drag
		  this.isDragging = true;
		  this.lastMouseX = e.clientX;
		  this.lastMouseY = e.clientY;
		  this.canvas.style.cursor = 'grabbing';
		}

		// Left mouse button down - start road drawing if in road mode
		if (e.button === 0 && this.roadDrawingMode) {
		  const coords = this.getCanvasCoordinates(e.clientX, e.clientY);
		  const centerX = this.canvas.width / 2;
		  const centerY = this.canvas.height / 2;
		  const worldX = Math.floor(this.cameraX + (coords.x - centerX) / this.scale);
		  const worldY = Math.floor(this.cameraY + (coords.y - centerY) / this.scale);

		  this.roadDrawingState.isDrawing = true;
		  this.roadDrawingState.isMouseDown = true;
		  this.roadDrawingState.mouseDownTime = Date.now();
		  this.roadDrawingState.startX = worldX;
		  this.roadDrawingState.startY = worldY;
		  this.roadDrawingState.endX = worldX;
		  this.roadDrawingState.endY = worldY;
		  this.render();
		}
	  });

	  // Mouse move - drag with right button OR detect hover OR update road drawing
	  this.canvas.addEventListener('mousemove', (e) => {
		// Update mouse world coordinates for placement preview
		const coords = this.getCanvasCoordinates(e.clientX, e.clientY);
		const centerX = this.canvas.width / 2;
		const centerY = this.canvas.height / 2;
		this.mouseWorldX = this.cameraX + (coords.x - centerX) / this.scale;
		this.mouseWorldY = this.cameraY + (coords.y - centerY) / this.scale;

		if (this.isDragging) {
		  // Dragging with right button
		  const dx = e.clientX - this.lastMouseX;
		  const dy = e.clientY - this.lastMouseY;

		  // Move camera (invert direction for natural feel)
		  this.cameraX -= dx / this.scale;
		  this.cameraY -= dy / this.scale;

		  this.lastMouseX = e.clientX;
		  this.lastMouseY = e.clientY;

		  this.render();
		} else if (this.roadDrawingMode && this.roadDrawingState.isDrawing) {
		  // In road drawing mode with active drawing - update endpoint
		  // No snapping: allow diagonal paths (server handles staircase generation)
		  const worldX = Math.floor(this.mouseWorldX);
		  const worldY = Math.floor(this.mouseWorldY);

		  this.roadDrawingState.endX = worldX;
		  this.roadDrawingState.endY = worldY;

		  this.render();
		} else if (this.roadDrawingMode) {
		  // Road drawing mode but not yet drawing - show hover preview
		  this.render();
		} else if (this.placementMode) {
		  // In placement mode - update preview
		  this.render();
		} else {
		  // Not dragging - detect building hover
		  this.updateHover(coords.x, coords.y);
		}
	  });

	  // Mouse up - stop drag OR complete road segment
	const stopDrag = (e?: MouseEvent) => {
        // Handle road drawing completion on mouse up
        if (this.roadDrawingState.isMouseDown && this.roadDrawingMode) {
            this.roadDrawingState.isMouseDown = false;

            // Check if this was a drag (not just a click)
            const dragDuration = Date.now() - this.roadDrawingState.mouseDownTime;
            const startX = this.roadDrawingState.startX;
            const startY = this.roadDrawingState.startY;
            const endX = this.roadDrawingState.endX;
            const endY = this.roadDrawingState.endY;

            // Only complete if there's actual movement and drag was long enough
            if ((startX !== endX || startY !== endY) && dragDuration > 50) {
                // Complete the road segment
                if (this.onRoadSegmentComplete) {
                    this.onRoadSegmentComplete(startX, startY, endX, endY);
                }
            }

            // Reset drawing state
            this.roadDrawingState.isDrawing = false;
            this.render();
            return;
        }

        if (this.isDragging) {
            this.isDragging = false;

            // --- FIX CURSOR + LOAD ZONES ---
            if (e) {
                const coords = this.getCanvasCoordinates(e.clientX, e.clientY);
                this.updateHover(coords.x, coords.y);
            } else {
                // Mouse left canvas
                if (this.hoveredBuilding) {
                    this.hoveredBuilding = null;
                }
                this.canvas.style.cursor = 'grab';
            }
            this.render();
            // --- CRITICAL: Load central zone after drag ---
            this.checkAndLoadVisibleZones();
        }
    };

	  this.canvas.addEventListener('mouseup', (e) => stopDrag(e));
	  this.canvas.addEventListener('mouseleave', () => stopDrag());

	  // Prevent context menu on right click
	  this.canvas.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		return false;
	  });

	  // Left click - select building OR place building in placement mode
	  this.canvas.addEventListener('click', (e) => {
		if (e.button === 0) { // Left click
		  const coords = this.getCanvasCoordinates(e.clientX, e.clientY);

		  // In placement mode, click anywhere to place building
		  if (this.placementMode && this.placementPreview && this.onBuildingClick) {
			// Use the preview's stored coordinates (which are always the bottom-left corner, closest to 0,0)
			// This ensures the sent coordinates match exactly what's shown in the preview
			this.onBuildingClick(this.placementPreview.x, this.placementPreview.y);
			return;
		  }

		  // Normal mode - select existing building
		  const building = this.getClickedBuilding(coords.x, coords.y);
		  if (building && this.onBuildingClick) {
			this.onBuildingClick(building.x, building.y, building.visualClass);
		  }
		}
	  });

	  // Wheel - zoom
	  this.canvas.addEventListener('wheel', (e) => {
		e.preventDefault();
		const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
		this.scale = Math.max(2, Math.min(32, this.scale * zoomFactor));
		this.render();
	  });

	  // Initial cursor
	  this.canvas.style.cursor = 'default';
	}

  // =========================================================================
  // ZONE OVERLAY METHODS
  // =========================================================================

  /**
   * Enable/disable zone overlay
   */
  public setZoneOverlay(enabled: boolean, data: SurfaceData | null = null, x1: number = 0, y1: number = 0) {
    this.zoneOverlayEnabled = enabled;
    this.zoneOverlayData = data;
    this.zoneOverlayX1 = x1;
    this.zoneOverlayY1 = y1;
    this.render();
  }

  /**
   * Draw zone overlay on the map
   */
  private drawZoneOverlay(centerX: number, centerY: number) {
    if (!this.zoneOverlayEnabled || !this.zoneOverlayData) return;

    const ctx = this.ctx;
    const data = this.zoneOverlayData;

    ctx.save();
    ctx.globalAlpha = 0.3;

    // Zone color mapping
    const zoneColors: Record<number, string> = {
      0: 'transparent',
      3000: '#ff6b6b', // Residential - Red
      4000: '#4dabf7', // Commercial - Blue
      5000: '#ffd43b', // Industrial - Yellow
      6000: '#51cf66', // Agricultural - Green
      7000: '#ff922b', // Mixed - Orange
      8000: '#845ef7', // Special - Purple
      9000: '#fd7e14', // Other - Bright Orange
    };

    // Draw each cell
    for (let row = 0; row < data.rows.length; row++) {
      const rowData = data.rows[row];
      for (let col = 0; col < rowData.length; col++) {
        const value = rowData[col];
        if (value === 0) continue;

        const worldX = this.zoneOverlayX1 + col;
        const worldY = this.zoneOverlayY1 + row;

        const screenX = centerX + (worldX - this.cameraX) * this.scale;
        const screenY = centerY + (worldY - this.cameraY) * this.scale;

        const color = zoneColors[value] || '#888888';
        ctx.fillStyle = color;
        ctx.fillRect(screenX, screenY, this.scale, this.scale);
      }
    }

    ctx.restore();
  }

  // =========================================================================
  // BUILDING PLACEMENT PREVIEW METHODS
  // =========================================================================

  /**
   * Enable/disable placement mode
   */
  public setPlacementMode(
    enabled: boolean,
    buildingName: string = '',
    cost: number = 0,
    area: number = 0,
    zoneRequirement: string = '',
    xsize: number = 1,
    ysize: number = 1
  ) {
    this.placementMode = enabled;
    if (enabled && buildingName) {
      this.placementPreview = {
        x: this.mouseWorldX,
        y: this.mouseWorldY,
        buildingName,
        cost,
        area,
        zoneRequirement,
        xsize,
        ysize
      };
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.placementPreview = null;
      this.canvas.style.cursor = 'default';
    }
    this.render();
  }

  // =========================================================================
  // ROAD DRAWING MODE METHODS
  // =========================================================================

  /**
   * Enable/disable road drawing mode
   */
  public setRoadDrawingMode(enabled: boolean) {
    this.roadDrawingMode = enabled;
    // Reset drawing state when toggling mode
    this.roadDrawingState = {
      isDrawing: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      isMouseDown: false,
      mouseDownTime: 0
    };
    if (enabled) {
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.canvas.style.cursor = 'default';
    }
    this.render();
  }

  /**
   * Check if road drawing mode is active
   */
  public isRoadDrawingModeActive(): boolean {
    return this.roadDrawingMode;
  }

  /**
   * Draw road drawing preview
   * Shows the current road segment being drawn with cost preview
   */
  private drawRoadDrawingPreview(centerX: number, centerY: number) {
    if (!this.roadDrawingMode) {
      return;
    }

    const ctx = this.ctx;
    ctx.save();

    // If actively drawing, show the road segment preview
    if (this.roadDrawingState.isDrawing) {
      const x1 = this.roadDrawingState.startX;
      const y1 = this.roadDrawingState.startY;
      const x2 = this.roadDrawingState.endX;
      const y2 = this.roadDrawingState.endY;

      // Generate staircase path tiles (same algorithm as server)
      const pathTiles = this.generateStaircasePath(x1, y1, x2, y2);
      const tileCount = pathTiles.length;
      const cost = tileCount * this.roadCostPerTile;

      // Check for collisions along the staircase path
      const hasCollision = this.checkStaircaseCollision(pathTiles);
      const isValid = !hasCollision && tileCount > 0;

      // Draw each tile in the staircase path
      for (const tile of pathTiles) {
        const screenX = centerX + (tile.x - this.cameraX) * this.scale;
        const screenY = centerY + (tile.y - this.cameraY) * this.scale;

        ctx.fillStyle = isValid ? 'rgba(102, 102, 102, 0.5)' : 'rgba(255, 107, 107, 0.5)';
        ctx.fillRect(screenX, screenY, this.scale, this.scale);

        ctx.strokeStyle = isValid ? '#888' : '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX, screenY, this.scale, this.scale);
      }

      // Draw start point marker
      const startScreenX = centerX + (x1 - this.cameraX) * this.scale + this.scale / 2;
      const startScreenY = centerY + (y1 - this.cameraY) * this.scale + this.scale / 2;
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(startScreenX, startScreenY, Math.max(3, this.scale / 4), 0, Math.PI * 2);
      ctx.fill();

      // Draw end point marker
      const endScreenX = centerX + (x2 - this.cameraX) * this.scale + this.scale / 2;
      const endScreenY = centerY + (y2 - this.cameraY) * this.scale + this.scale / 2;
      ctx.fillStyle = isValid ? '#60a5fa' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(endScreenX, endScreenY, Math.max(3, this.scale / 4), 0, Math.PI * 2);
      ctx.fill();

      // Draw cost/info label near cursor
      const labelX = endScreenX + 10;
      const labelY = endScreenY - 10;

      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';

      // Background for label
      const costText = `$${this.formatCost(cost)}`;
      const tileText = `${tileCount} tiles`;
      const labelText = `${costText} (${tileText})`;
      const labelWidth = ctx.measureText(labelText).width + 10;

      ctx.fillStyle = isValid ? 'rgba(0, 0, 0, 0.8)' : 'rgba(100, 0, 0, 0.8)';
      ctx.fillRect(labelX - 5, labelY - 14, labelWidth, 20);

      ctx.fillStyle = isValid ? '#4ade80' : '#ff6b6b';
      ctx.fillText(labelText, labelX, labelY);

      // Draw validation error if any
      if (!isValid && hasCollision) {
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('Building collision!', labelX, labelY + 16);
      }
    } else {
      // Not actively drawing - show cursor position hint
      const mouseX = Math.floor(this.mouseWorldX);
      const mouseY = Math.floor(this.mouseWorldY);

      const screenX = centerX + (mouseX - this.cameraX) * this.scale;
      const screenY = centerY + (mouseY - this.cameraY) * this.scale;

      // Draw cursor highlight
      ctx.fillStyle = 'rgba(102, 102, 102, 0.3)';
      ctx.fillRect(screenX, screenY, this.scale, this.scale);

      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(screenX, screenY, this.scale, this.scale);
      ctx.setLineDash([]);

      // Draw hint text
      ctx.font = '11px monospace';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText('Click and drag to draw road', screenX + this.scale / 2, screenY - 8);
    }

    ctx.restore();
  }

  /**
   * Generate staircase path tiles from (x1,y1) to (x2,y2)
   * Same algorithm as server: alternate H and V moves, prioritizing axis with more remaining distance
   *
   * @returns Array of tile coordinates that form the staircase path
   */
  private generateStaircasePath(x1: number, y1: number, x2: number, y2: number): Array<{ x: number; y: number }> {
    const tiles: Array<{ x: number; y: number }> = [];

    const dx = x2 - x1;
    const dy = y2 - y1;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Same point - no tiles
    if (dx === 0 && dy === 0) {
      return tiles;
    }

    // Direction increments
    const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);

    let currentX = x1;
    let currentY = y1;
    let remainingX = absDx;
    let remainingY = absDy;

    // Add starting tile
    tiles.push({ x: currentX, y: currentY });

    // Generate staircase path
    while (remainingX > 0 || remainingY > 0) {
      // Prioritize the axis with more remaining steps
      const moveX = remainingX > 0 && (remainingX >= remainingY || remainingY === 0);

      if (moveX) {
        currentX += stepX;
        remainingX--;
      } else if (remainingY > 0) {
        currentY += stepY;
        remainingY--;
      }

      tiles.push({ x: currentX, y: currentY });
    }

    return tiles;
  }

  /**
   * Check for building collisions along a staircase path
   */
  private checkStaircaseCollision(pathTiles: Array<{ x: number; y: number }>): boolean {
    for (const tile of pathTiles) {
      if (this.checkBuildingCollision(tile.x, tile.y, 1, 1)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Draw building placement preview
   */
  private drawPlacementPreview(centerX: number, centerY: number) {
    if (!this.placementMode || !this.placementPreview) {
      return;
    }

    const ctx = this.ctx;
    const preview = this.placementPreview;

    // Update preview position to current mouse (this is the bottom-left corner, closest to 0,0)
    preview.x = Math.floor(this.mouseWorldX);
    preview.y = Math.floor(this.mouseWorldY);

    // Calculate all validation checks
    let isValidPlacement = true;
    let validationErrors: string[] = [];
    let currentZoneType = 'Unknown';

    // Check road collision (client-side validation)
    const hasRoadCollision = this.checkRoadCollision(preview.x, preview.y, preview.xsize, preview.ysize);
    if (hasRoadCollision) {
      isValidPlacement = false;
      validationErrors.push('Road collision');
    }

    // Check building collision (client-side validation)
    const hasBuildingCollision = this.checkBuildingCollision(preview.x, preview.y, preview.xsize, preview.ysize);
    if (hasBuildingCollision) {
      isValidPlacement = false;
      validationErrors.push('Building collision');
    }

    // Check zone validation if zone overlay is active
    if (this.zoneOverlayEnabled && this.zoneOverlayData && preview.zoneRequirement) {
      const zoneValid = this.checkZoneCompatibility(preview.x, preview.y, preview.xsize, preview.ysize, preview.zoneRequirement);
      if (!zoneValid.valid) {
        isValidPlacement = false;
        validationErrors.push(zoneValid.error || 'Invalid zone');
      }
      currentZoneType = zoneValid.zoneName || 'Unknown';
    }

    // Draw building footprint
    ctx.save();

    // Draw each tile of the building footprint
    for (let tileY = 0; tileY < preview.ysize; tileY++) {
      for (let tileX = 0; tileX < preview.xsize; tileX++) {
        const worldX = preview.x + tileX;
        const worldY = preview.y + tileY;

        const screenX = centerX + (worldX - this.cameraX) * this.scale;
        const screenY = centerY + (worldY - this.cameraY) * this.scale;

        // Fill with semi-transparent color
        ctx.fillStyle = isValidPlacement ? 'rgba(77, 171, 247, 0.2)' : 'rgba(255, 107, 107, 0.2)';
        ctx.fillRect(screenX, screenY, this.scale, this.scale);

        // Draw border
        ctx.strokeStyle = isValidPlacement ? '#4dabf7' : '#ff6b6b';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX, screenY, this.scale, this.scale);
      }
    }

    // Draw outer border with dashed line
    const outerScreenX = centerX + (preview.x - this.cameraX) * this.scale;
    const outerScreenY = centerY + (preview.y - this.cameraY) * this.scale;
    const outerWidth = preview.xsize * this.scale;
    const outerHeight = preview.ysize * this.scale;

    ctx.strokeStyle = isValidPlacement ? '#4dabf7' : '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(outerScreenX, outerScreenY, outerWidth, outerHeight);
    ctx.setLineDash([]);

    // Draw reference point at bottom-left corner
    ctx.fillStyle = isValidPlacement ? '#4dabf7' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(outerScreenX, outerScreenY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw building info above the building
    ctx.font = '12px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';

    const centerScreenX = outerScreenX + outerWidth / 2;
    let yOffset = outerScreenY - 10;

    // Building name
    ctx.fillText(preview.buildingName, centerScreenX, yOffset);

    // Cost and area
    yOffset -= 15;
    ctx.fillText(`$${this.formatCost(preview.cost)} | ${preview.area}m² | ${preview.xsize}x${preview.ysize}`, centerScreenX, yOffset);

    // Zone validation
    if (preview.zoneRequirement && this.zoneOverlayEnabled) {
      yOffset -= 15;
      ctx.fillStyle = isValidPlacement ? '#4ade80' : '#ff6b6b';
      const zoneText = isValidPlacement
        ? `✓ ${currentZoneType}`
        : `✗ ${validationErrors.join(', ')}`;
      ctx.fillText(zoneText, centerScreenX, yOffset);
    } else if (!isValidPlacement) {
      yOffset -= 15;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText(`✗ ${validationErrors.join(', ')}`, centerScreenX, yOffset);
    }

    ctx.restore();
  }

  /**
   * Check if building footprint collides with any road segments
   */
  private checkRoadCollision(x: number, y: number, xsize: number, ysize: number): boolean {
    for (let tileY = 0; tileY < ysize; tileY++) {
      for (let tileX = 0; tileX < xsize; tileX++) {
        const checkX = x + tileX;
        const checkY = y + tileY;

        // Check if any road segment intersects this tile
        for (const segment of this.allSegments) {
          if (this.doesSegmentIntersectTile(segment, checkX, checkY)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if building footprint collides with any existing buildings
   */
  private checkBuildingCollision(x: number, y: number, xsize: number, ysize: number): boolean {
    for (let tileY = 0; tileY < ysize; tileY++) {
      for (let tileX = 0; tileX < xsize; tileX++) {
        const checkX = x + tileX;
        const checkY = y + tileY;

        // Check if any existing building occupies this tile
        for (const building of this.allBuildings) {
          const buildingDims = this.facilityDimensionsCache.get(building.visualClass);
          const buildingXSize = buildingDims?.xsize || 1;
          const buildingYSize = buildingDims?.ysize || 1;

          // Check if the tile overlaps with this building's footprint
          if (checkX >= building.x && checkX < building.x + buildingXSize &&
              checkY >= building.y && checkY < building.y + buildingYSize) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if a road segment intersects with a tile
   */
  private doesSegmentIntersectTile(segment: MapSegment, tileX: number, tileY: number): boolean {
    const x1 = Math.min(segment.x1, segment.x2);
    const x2 = Math.max(segment.x1, segment.x2);
    const y1 = Math.min(segment.y1, segment.y2);
    const y2 = Math.max(segment.y1, segment.y2);

    // Check if tile is within the segment bounding box (inclusive)
    // A tile at position (tileX, tileY) occupies exactly that one coordinate
    return tileX >= x1 && tileX <= x2 && tileY >= y1 && tileY <= y2;
  }

  /**
   * Check zone compatibility for building footprint
   */
  private checkZoneCompatibility(
    x: number,
    y: number,
    xsize: number,
    ysize: number,
    zoneRequirement: string
  ): { valid: boolean; error?: string; zoneName?: string } {
    if (!this.zoneOverlayData) {
      return { valid: true };
    }

    const zoneNames: Record<number, string> = {
      0: 'No Zone',
      3000: 'Residential',
      4000: 'Commercial',
      5000: 'Industrial'
    };

    // Check all tiles in the building footprint
    for (let tileY = 0; tileY < ysize; tileY++) {
      for (let tileX = 0; tileX < xsize; tileX++) {
        const checkX = x + tileX;
        const checkY = y + tileY;

        const localX = checkX - this.zoneOverlayX1;
        const localY = checkY - this.zoneOverlayY1;

        if (localY >= 0 && localY < this.zoneOverlayData.rows.length) {
          const row = this.zoneOverlayData.rows[localY];
          if (localX >= 0 && localX < row.length) {
            const zoneValue = row[localX];
            const zoneName = zoneNames[zoneValue] || `Zone ${zoneValue}`;

            // Validate zone compatibility
            let zoneValid = false;
            if (zoneRequirement.includes('blue') || zoneRequirement.includes('Commerce')) {
              zoneValid = zoneValue === 4000 || zoneValue === 0;
            } else if (zoneRequirement.includes('red') || zoneRequirement.includes('Residential')) {
              zoneValid = zoneValue === 3000 || zoneValue === 0;
            } else if (zoneRequirement.includes('yellow') || zoneRequirement.includes('Industrial')) {
              zoneValid = zoneValue === 5000 || zoneValue === 0;
            } else {
              zoneValid = true; // No specific requirement
            }

            if (!zoneValid) {
              return {
                valid: false,
                error: `Wrong zone (need ${zoneRequirement})`,
                zoneName
              };
            }

            // Return the zone name of the first tile checked (for display)
            if (tileX === 0 && tileY === 0) {
              return { valid: true, zoneName };
            }
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Format cost with K/M suffix
   */
  private formatCost(cost: number): string {
    if (cost >= 1000000) {
      return `${(cost / 1000000).toFixed(1)}M`;
    } else if (cost >= 1000) {
      return `${(cost / 1000).toFixed(0)}K`;
    }
    return cost.toString();
  }

  /**
   * Get current placement coordinates (bottom-left corner, closest to 0,0)
   */
  public getPlacementCoordinates(): { x: number, y: number } | null {
    if (!this.placementMode || !this.placementPreview) return null;
    // Return the preview's coordinates (already floored and representing bottom-left corner)
    return {
      x: this.placementPreview.x,
      y: this.placementPreview.y
    };
  }

}
