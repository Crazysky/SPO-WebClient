# Three.js Migration - Resume Point

## Current Status: Phase 1 In Progress

**Last action:** Three.js dependencies installed (`three@0.182.0`, `@types/three`)

## Completed Tasks
- [x] Analyzed current Canvas2D rendering engine
- [x] Designed Three.js migration plan (see [threejs-migration-plan.md](threejs-migration-plan.md))
- [x] Installed Three.js dependencies

## Next Tasks (Phase 1: Foundation)

### 1. Create `src/client/renderer/three/IsometricThreeRenderer.ts`
- Setup Three.js scene, orthographic camera, WebGL renderer
- Attach to existing canvas element
- Basic render loop

### 2. Create `src/client/renderer/three/CoordinateMapper3D.ts`
- Replicate isometric math from existing `coordinate-mapper.ts`
- Map (i,j) to Three.js world position
- Screen to map via raycasting

### 3. Create `src/client/renderer/three/CameraController.ts`
- Pan (mouse drag)
- Zoom (mouse wheel)
- 4 zoom levels matching existing system

### 4. Test with colored tiles
- Render a test grid of colored tiles
- Verify positions match Canvas2D output

## Key Files to Reference

| Purpose | File |
|---------|------|
| Isometric math | [src/client/renderer/coordinate-mapper.ts](../src/client/renderer/coordinate-mapper.ts) |
| Zoom levels | [src/shared/map-config.ts](../src/shared/map-config.ts) |
| Current renderer API | [src/client/renderer/isometric-map-renderer.ts](../src/client/renderer/isometric-map-renderer.ts) |
| Painter's algorithm | [src/client/renderer/painter-algorithm.ts](../src/client/renderer/painter-algorithm.ts) |
| Full migration plan | [doc/threejs-migration-plan.md](threejs-migration-plan.md) |

## Isometric Formula Quick Reference

```typescript
// Map (i,j) to screen (existing Canvas2D)
const x = u * (rows - i + j) - origin.x;
const y = (u / 2) * ((rows - i) + (cols - j)) - origin.y;

// Map (i,j) to Three.js world position (new)
const worldX = (j - i) * tileWidth / 2;
const worldY = 0;  // Ground plane
const worldZ = -(i + j) * tileHeight / 2;
```

## Commands

```bash
npm run dev      # Start development server
npm test         # Run tests (must pass after each change)
npm run build    # Production build
```

## Resume Instructions

1. Open project in VSCode
2. Run `npm install` (if node_modules missing)
3. Start implementing files in order listed above
4. Test with `npm run dev` to see visual output
5. Run `npm test` before committing

## Architecture Notes

- Use **orthographic camera** (true isometric projection)
- Use **instanced meshes** for terrain tiles (batch rendering)
- Use **THREE.Sprite** for buildings (auto-billboard)
- Use **renderOrder** property for painter's algorithm (not array sorting)
- Layer system: terrain(0) -> concrete(1) -> roads(2) -> buildings(4) -> UI(6)
