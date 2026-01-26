import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Map size (in tiles)
  mapWidth: 16,
  mapHeight: 16,

  // Tile size in world units
  tileSize: 1,

  // Camera settings
  cameraDistance: 20,
  cameraAngle: Math.atan(1 / Math.sqrt(2)), // ~35.264 degrees (true isometric)

  // Sample buildings to place with GLB model references
  buildings: [
    { x: 4, y: 4, type: 'foodstore', width: 2, depth: 2, modelId: 'MapDisFoodStore64x32x0' },
    { x: 8, y: 6, type: 'highrise', width: 2, depth: 2, modelId: 'MapDisHiResA64x32x0' },
    { x: 12, y: 10, type: 'headquarters', width: 3, depth: 3, modelId: 'MapDisHeadquarter64x32x0' },
  ],

  // Road segments (simplified)
  roads: [
    // Horizontal road
    { x: 2, y: 8, type: 'horz' },
    { x: 3, y: 8, type: 'horz' },
    { x: 4, y: 8, type: 'horz' },
    { x: 5, y: 8, type: 'horz' },
    { x: 6, y: 8, type: 'cross' },
    { x: 7, y: 8, type: 'horz' },
    { x: 8, y: 8, type: 'horz' },
    { x: 9, y: 8, type: 'horz' },
    { x: 10, y: 8, type: 'horz' },
    // Vertical road
    { x: 6, y: 5, type: 'vert' },
    { x: 6, y: 6, type: 'vert' },
    { x: 6, y: 7, type: 'vert' },
    { x: 6, y: 9, type: 'vert' },
    { x: 6, y: 10, type: 'vert' },
    { x: 6, y: 11, type: 'vert' },
  ],

  // Texture paths (relative to public/)
  textures: {
    grass: '/textures/grass.png',
    road: '/textures/road.png',
    concrete: '/textures/concrete.png',
  }
};

// ============================================================================
// APPLICATION CLASS
// ============================================================================

class Starpeace3DApp {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;

  private terrain: THREE.Mesh | null = null;
  private buildings: THREE.Group;
  private roads: THREE.Group;

  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 0;

  private wireframeMode = false;

  // GLB model loading
  private gltfLoader: GLTFLoader;
  private modelCache: Map<string, THREE.Group> = new Map();
  private modelsLoaded = 0;

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;

    // Initialize WebGL2 renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87CEEB); // Sky blue

    // Check WebGL2 support
    const gl = this.renderer.getContext();
    console.log('WebGL Version:', gl.getParameter(gl.VERSION));
    console.log('WebGL2:', gl instanceof WebGL2RenderingContext);

    // Initialize GLTF loader
    this.gltfLoader = new GLTFLoader();

    // Initialize scene
    this.scene = new THREE.Scene();
    this.buildings = new THREE.Group();
    this.roads = new THREE.Group();
    this.scene.add(this.buildings);
    this.scene.add(this.roads);

    // Initialize camera (orthographic for isometric)
    this.camera = this.createCamera();

    // Initialize controls
    this.controls = this.createControls();

    // Add lights
    this.setupLights();

    // Create scene content
    this.createTerrain();
    this.createRoads();
    this.createBuildings();

    // Add grid helper for debugging
    this.addDebugHelpers();

    // Setup event listeners
    this.setupEventListeners();

    // Start render loop
    this.animate();

    // Expose to window for UI buttons
    (window as unknown as { app: Starpeace3DApp }).app = this;
  }

  private createCamera(): THREE.OrthographicCamera {
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 12;

    const camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      1000
    );

    // Position for isometric view
    const d = CONFIG.cameraDistance;
    camera.position.set(d, d, d);
    camera.lookAt(CONFIG.mapWidth / 2, 0, CONFIG.mapHeight / 2);

    return camera;
  }

  private createControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.canvas);

    // Set target to center of map
    controls.target.set(CONFIG.mapWidth / 2, 0, CONFIG.mapHeight / 2);

    // Enable all controls
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;

    // Rotation constraints (keep somewhat isometric feel)
    controls.minPolarAngle = Math.PI / 6;  // 30 degrees from top
    controls.maxPolarAngle = Math.PI / 2.5; // ~72 degrees (don't go below horizon)

    // Zoom constraints
    controls.minZoom = 0.5;
    controls.maxZoom = 4;

    // Smooth controls
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    // Pan constraints (keep map in view)
    controls.screenSpacePanning = true;

    return controls;
  }

  private setupLights(): void {
    // Ambient light for base illumination
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Directional light (sun) with shadows
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(30, 50, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);

    // Enable shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private createTerrain(): void {
    // Create flat terrain plane
    const geometry = new THREE.PlaneGeometry(
      CONFIG.mapWidth * CONFIG.tileSize,
      CONFIG.mapHeight * CONFIG.tileSize,
      CONFIG.mapWidth,
      CONFIG.mapHeight
    );

    // Rotate to lay flat on XZ plane
    geometry.rotateX(-Math.PI / 2);

    // Create grass texture pattern (checkerboard for now)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const tilePixels = 512 / CONFIG.mapWidth;
    for (let y = 0; y < CONFIG.mapHeight; y++) {
      for (let x = 0; x < CONFIG.mapWidth; x++) {
        // Grass with slight variation
        const shade = 0.8 + Math.random() * 0.2;
        const r = Math.floor(34 * shade);
        const g = Math.floor(139 * shade);
        const b = Math.floor(34 * shade);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x * tilePixels, y * tilePixels, tilePixels, tilePixels);

        // Tile border
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.strokeRect(x * tilePixels, y * tilePixels, tilePixels, tilePixels);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0,
    });

    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.position.set(CONFIG.mapWidth / 2, 0, CONFIG.mapHeight / 2);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  private createRoads(): void {
    const roadHeight = 0.02; // Slightly above terrain

    for (const road of CONFIG.roads) {
      const geometry = new THREE.PlaneGeometry(CONFIG.tileSize * 0.9, CONFIG.tileSize * 0.9);
      geometry.rotateX(-Math.PI / 2);

      // Road color based on type
      let color = 0x333333;
      if (road.type === 'cross') {
        color = 0x444444;
      }

      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(road.x + 0.5, roadHeight, road.y + 0.5);
      mesh.receiveShadow = true;

      // Add road markings for horizontal/vertical
      if (road.type === 'horz' || road.type === 'cross') {
        this.addRoadMarking(mesh, 'horz');
      }
      if (road.type === 'vert' || road.type === 'cross') {
        this.addRoadMarking(mesh, 'vert');
      }

      this.roads.add(mesh);
    }
  }

  private addRoadMarking(roadMesh: THREE.Mesh, direction: 'horz' | 'vert'): void {
    const markingGeometry = new THREE.PlaneGeometry(
      direction === 'horz' ? 0.6 : 0.05,
      direction === 'vert' ? 0.6 : 0.05
    );
    markingGeometry.rotateX(-Math.PI / 2);

    const markingMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFF00,
      transparent: true,
      opacity: 0.8,
    });

    const marking = new THREE.Mesh(markingGeometry, markingMaterial);
    marking.position.y = 0.01;
    roadMesh.add(marking);
  }

  private createBuildings(): void {
    for (const building of CONFIG.buildings) {
      // Add concrete pad under building
      this.addConcretePad(building);

      // Load GLB model
      this.loadBuildingModel(building);
    }
  }

  private loadBuildingModel(building: typeof CONFIG.buildings[0]): void {
    const modelPath = `/models/${building.modelId}.glb`;

    console.log(`Loading model: ${modelPath}`);

    this.gltfLoader.load(
      modelPath,
      (gltf) => {
        console.log(`Loaded: ${building.modelId}`);

        const model = gltf.scene;

        // Scale model to fit building footprint
        // GLB models are created with dimensions matching width/depth/height
        model.scale.set(1, 1, 1);

        // Position building (center of footprint, model already has y=0 at base)
        model.position.set(
          building.x + building.width / 2,
          0,
          building.y + building.depth / 2
        );

        // Enable shadows for all meshes in the model
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Add building label
        this.addBuildingLabel(model, building.type);

        // Add to scene
        this.buildings.add(model);

        // Cache model
        this.modelCache.set(building.modelId, model);
        this.modelsLoaded++;

        console.log(`Models loaded: ${this.modelsLoaded}/${CONFIG.buildings.length}`);
      },
      (progress) => {
        // Loading progress
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total * 100).toFixed(0);
          console.log(`Loading ${building.modelId}: ${percent}%`);
        }
      },
      (error) => {
        console.error(`Failed to load ${building.modelId}:`, error);

        // Fallback to colored box
        this.createFallbackBuilding(building);
      }
    );
  }

  private createFallbackBuilding(building: typeof CONFIG.buildings[0]): void {
    // Fallback colors by type
    const colors: Record<string, number> = {
      foodstore: 0xE57373,      // Red
      highrise: 0x64B5F6,       // Blue
      headquarters: 0x81C784,   // Green
    };

    // Fallback heights
    const heights: Record<string, number> = {
      foodstore: 1.5,
      highrise: 5,
      headquarters: 3,
    };

    const height = heights[building.type] || 2;

    const geometry = new THREE.BoxGeometry(
      building.width * CONFIG.tileSize * 0.85,
      height,
      building.depth * CONFIG.tileSize * 0.85
    );

    const material = new THREE.MeshStandardMaterial({
      color: colors[building.type] || 0x888888,
      roughness: 0.7,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(
      building.x + building.width / 2,
      height / 2,
      building.y + building.depth / 2
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.addBuildingLabel(mesh, `${building.type} (fallback)`);
    this.buildings.add(mesh);
  }

  private addBuildingLabel(buildingObject: THREE.Object3D, label: string): void {
    // Create canvas for text
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);

    // Calculate height from bounding box
    const box = new THREE.Box3().setFromObject(buildingObject);
    const height = box.max.y - box.min.y;
    sprite.position.y = height + 0.5;

    buildingObject.add(sprite);
  }

  private addConcretePad(building: { x: number; y: number; width: number; depth: number }): void {
    const padGeometry = new THREE.PlaneGeometry(
      building.width * CONFIG.tileSize,
      building.depth * CONFIG.tileSize
    );
    padGeometry.rotateX(-Math.PI / 2);

    const padMaterial = new THREE.MeshStandardMaterial({
      color: 0x9E9E9E,
      roughness: 0.9,
      metalness: 0,
    });

    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.position.set(
      building.x + building.width / 2,
      0.01,
      building.y + building.depth / 2
    );
    pad.receiveShadow = true;

    this.scene.add(pad);
  }

  private addDebugHelpers(): void {
    // Grid helper
    const gridHelper = new THREE.GridHelper(
      CONFIG.mapWidth,
      CONFIG.mapWidth,
      0x444444,
      0x222222
    );
    gridHelper.position.set(CONFIG.mapWidth / 2, 0.001, CONFIG.mapHeight / 2);
    this.scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(3);
    axesHelper.position.set(0, 0.1, 0);
    this.scene.add(axesHelper);
  }

  private setupEventListeners(): void {
    // Window resize
    window.addEventListener('resize', () => {
      const aspect = window.innerWidth / window.innerHeight;
      const viewSize = 12;

      this.camera.left = -viewSize * aspect;
      this.camera.right = viewSize * aspect;
      this.camera.top = viewSize;
      this.camera.bottom = -viewSize;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      switch (e.key.toUpperCase()) {
        case 'N': this.snapCamera('N'); break;
        case 'E': this.snapCamera('E'); break;
        case 'S': this.snapCamera('S'); break;
        case 'W': this.snapCamera('W'); break;
        case 'R': this.resetCamera(); break;
      }
    });

    // UI buttons
    document.getElementById('btnWireframe')?.addEventListener('click', () => {
      this.toggleWireframe();
    });

    document.getElementById('btnTextures')?.addEventListener('click', () => {
      this.toggleTextures();
    });
  }

  public snapCamera(direction: 'N' | 'E' | 'S' | 'W'): void {
    const angles: Record<string, number> = {
      N: 0,
      E: Math.PI / 2,
      S: Math.PI,
      W: -Math.PI / 2,
    };

    const angle = angles[direction];
    const d = CONFIG.cameraDistance;
    const target = this.controls.target;

    // Calculate new camera position
    this.camera.position.set(
      target.x + d * Math.sin(angle),
      target.y + d * 0.8,
      target.z + d * Math.cos(angle)
    );

    this.camera.lookAt(target);
    this.controls.update();
  }

  public resetCamera(): void {
    const d = CONFIG.cameraDistance;
    const target = new THREE.Vector3(CONFIG.mapWidth / 2, 0, CONFIG.mapHeight / 2);

    this.camera.position.set(d, d, d);
    this.camera.lookAt(target);
    this.controls.target.copy(target);
    this.controls.update();
  }

  private toggleWireframe(): void {
    this.wireframeMode = !this.wireframeMode;

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.wireframe = this.wireframeMode;
      }
    });

    const btn = document.getElementById('btnWireframe');
    if (btn) {
      btn.classList.toggle('active', this.wireframeMode);
    }
  }

  private toggleTextures(): void {
    // Toggle between textured and solid color mode
    const hasTextures = this.terrain?.material instanceof THREE.MeshStandardMaterial &&
                        (this.terrain.material as THREE.MeshStandardMaterial).map !== null;

    if (this.terrain?.material instanceof THREE.MeshStandardMaterial) {
      if (hasTextures) {
        this.terrain.material.map = null;
        this.terrain.material.color.setHex(0x228B22);
      } else {
        // Recreate texture
        this.createTerrain();
      }
      this.terrain.material.needsUpdate = true;
    }
  }

  private updateUI(): void {
    // Calculate FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = now;
    }

    // Update UI elements
    document.getElementById('fps')!.textContent = this.fps.toString();
    document.getElementById('drawCalls')!.textContent = this.renderer.info.render.calls.toString();
    document.getElementById('triangles')!.textContent = this.renderer.info.render.triangles.toString();

    // Camera angle (azimuth)
    const azimuth = Math.atan2(
      this.camera.position.x - this.controls.target.x,
      this.camera.position.z - this.controls.target.z
    );
    const degrees = ((azimuth * 180 / Math.PI) + 360) % 360;
    document.getElementById('cameraAngle')!.textContent = `${degrees.toFixed(0)}°`;

    // Zoom level
    document.getElementById('zoom')!.textContent = this.camera.zoom.toFixed(2);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    // Update controls
    this.controls.update();

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Update UI
    this.updateUI();
  };
}

// ============================================================================
// INITIALIZE
// ============================================================================

console.log('Starpeace 3D Prototype starting...');
new Starpeace3DApp();
