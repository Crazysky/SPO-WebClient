/**
 * Three.js Renderer Module
 *
 * GPU-accelerated isometric renderer using Three.js
 */

// Main renderer
export { IsometricThreeRenderer, RENDER_LAYER } from './IsometricThreeRenderer';

// Component renderers
export { CoordinateMapper3D } from './CoordinateMapper3D';
export { CameraController } from './CameraController';
export { TextureAtlasManager } from './TextureAtlasManager';
export { TerrainChunkManager, CHUNK_SIZE } from './TerrainChunkManager';
export { RoadRenderer } from './RoadRenderer';
export { ConcreteRenderer } from './ConcreteRenderer';
export { BuildingRenderer } from './BuildingRenderer';

// Integration helpers
export { ThreeRendererAdapter } from './ThreeRendererAdapter';
export { DebugOverlay, installDebugOverlayShortcut } from './DebugOverlay';

// Type exports
export type { CameraControllerOptions } from './CameraController';
export type { IsometricThreeRendererOptions } from './IsometricThreeRenderer';
export type { AtlasUV } from './TextureAtlasManager';
export type { TerrainDataProvider } from './TerrainChunkManager';
export type { RoadTerrainProvider } from './RoadRenderer';
export type { ConcreteTerrainProvider } from './ConcreteRenderer';
