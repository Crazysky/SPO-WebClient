# Starpeace 3D Renderer Prototype

WebGL2 3D renderer prototype with rotatable isometric camera for Starpeace Online.

## Purpose

Test the feasibility of:
1. **WebGL2 3D rendering** vs current Canvas 2D
2. **3D building models** (placeholder boxes, replaceable with real models)
3. **360° camera rotation** for enhanced user experience

## Quick Start

### 1. Install Dependencies

```bash
cd prototype-3d
npm install
```

### 2. Run Prototype

```bash
npm run dev
```

Open http://localhost:3001 in your browser.

**Controls:**
- **Left Mouse** - Rotate camera (360°)
- **Right Mouse** - Pan view
- **Scroll** - Zoom in/out
- **N/E/S/W keys** - Snap to cardinal directions
- **R** - Reset camera

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WebGL2 Renderer                               │
├─────────────────────────────────────────────────────────────────┤
│  Three.js r160                                                   │
│  ├── OrthographicCamera (isometric projection)                  │
│  ├── OrbitControls (360° rotation, pan, zoom)                   │
│  └── WebGL2 context (instancing ready)                          │
├─────────────────────────────────────────────────────────────────┤
│  Scene Layers                                                    │
│  ├── Terrain: Flat plane with grass texture                     │
│  ├── Roads: Elevated quads with markings                        │
│  ├── Concrete: Building pads                                    │
│  └── Buildings: GLB models (placeholder boxes)                  │
├─────────────────────────────────────────────────────────────────┤
│  Lighting                                                        │
│  ├── Ambient light (base illumination)                          │
│  └── Directional light (sun, shadows)                           │
└─────────────────────────────────────────────────────────────────┘
```

## Adding 3D Models

To add custom 3D building models:

1. Export as GLB format with bottom-center pivot
2. Save to `public/models/` with matching name (e.g., `MapDisFoodStore64x32x0.glb`)
3. The prototype will automatically load them

## Evaluation Criteria

After running the prototype, evaluate:

### Performance
- [ ] 60 FPS with buildings and roads?
- [ ] Draw calls acceptable? (target: < 50)
- [ ] Memory usage reasonable? (target: < 100MB)

### Visual Quality
- [ ] Lighting and shadows add depth?
- [ ] Road/terrain textures look acceptable?

### User Experience
- [ ] Camera rotation intuitive?
- [ ] Snap-to-cardinal useful?
- [ ] Zoom range appropriate?

## File Structure

```
prototype-3d/
├── index.html              # Main HTML with UI
├── package.json            # Dependencies
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript config
├── README.md               # This file
├── src/
│   └── main.ts             # Three.js application
├── public/
│   ├── textures/           # Terrain, road textures
│   └── models/             # 3D models (GLB)
└── scripts/
    └── generate-placeholders.js # Generate placeholder 3D boxes
```

## Dependencies

- [Three.js](https://threejs.org/) - WebGL renderer
- [Vite](https://vitejs.dev/) - Build tool

## Notes

- Prototype uses placeholder box meshes (can be replaced with real 3D models)
- Main Starpeace server must be running on port 3000 for texture proxy
- WebGL2 required (97%+ browser support)
