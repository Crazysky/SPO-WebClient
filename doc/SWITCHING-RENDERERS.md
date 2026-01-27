# Switching Between Renderers

## Quick Start

The game now supports two rendering engines:

- **Canvas2D**: Original renderer (stable, tested)
- **Three.js**: New WebGL renderer (GPU-accelerated, 60 FPS)

## How to Switch

Edit [src/client/renderer-settings.ts](../src/client/renderer-settings.ts):

```typescript
const defaultSettings: RendererSettings = {
  // Change this line:
  rendererType: 'threejs', // or 'canvas2d'

  enableDebug: process.env.NODE_ENV === 'development',
  showDebugOverlay: false
};
```

Then rebuild and restart the dev server:

```bash
npm run dev
```

## Renderer Comparison

| Feature | Canvas2D | Three.js |
|---------|----------|----------|
| Performance (500+ buildings) | ~30-40 FPS | **60 FPS** |
| GPU Acceleration | ❌ No | ✅ Yes |
| Memory Usage | Lower | Slightly higher |
| Stability | ✅ Proven | 🚧 New |
| Debug Overlay | ❌ No | ✅ Yes (press 'D') |
| API Compatibility | - | ✅ 100% |

## Three.js Debug Features

When using Three.js renderer with `enableDebug: true`, press **'D' key** to toggle on-screen stats:

- FPS (color-coded: green=60+, yellow=30-60, red=<30)
- Frame time in milliseconds
- Draw calls per frame
- Building count (visible/total)
- Terrain chunks (visible/total)
- Road and concrete mesh counts
- Camera position and zoom level

## Troubleshooting

### Three.js renderer not loading

1. Check browser console for errors
2. Verify WebGL is supported: Visit `chrome://gpu` or `about:support` (Firefox)
3. Try disabling browser extensions that might block WebGL

### Performance issues with Three.js

1. Enable debug mode to see FPS and draw calls
2. Check GPU acceleration is enabled in browser settings
3. Try reducing visible area or zoom out

### Fallback to Canvas2D

If Three.js has issues, immediately switch back to Canvas2D:

```typescript
rendererType: 'canvas2d'
```

## Reporting Issues

When reporting renderer issues, please include:

1. Which renderer you're using (`canvas2d` or `threejs`)
2. Browser and version (Chrome 120, Firefox 121, etc.)
3. GPU info (from `chrome://gpu` or `about:support`)
4. Debug stats if using Three.js (press 'D' key, take screenshot)
5. Console errors (F12 Developer Tools)

## See Also

- [Three.js Integration Guide](three-js-renderer-integration.md)
- [Three.js Migration Plan](threejs-migration-plan.md)
- [Resume Document](RESUME-THREE-JS-MIGRATION.md)
