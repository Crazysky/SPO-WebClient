/**
 * PixiJS Renderer Module
 *
 * GPU-accelerated isometric map rendering using PixiJS
 */

// Main renderer
export { PixiRenderer, PixiRendererConfig, CameraState, ViewportBounds, RenderLayerIndex } from './pixi-renderer';

// Adapter for drop-in replacement of Canvas renderer
export { PixiMapRendererAdapter } from './pixi-map-renderer-adapter';

// Supporting classes
export { SpritePool, BatchSpriteManager, PoolStats } from './sprite-pool';
export { TextureAtlasManager, TextureCategory } from './texture-atlas-manager';

// Layer renderers
export { PixiTerrainLayer } from './layers/pixi-terrain-layer';
export { PixiConcreteLayer } from './layers/pixi-concrete-layer';
export { PixiRoadLayer } from './layers/pixi-road-layer';
export { PixiBuildingLayer } from './layers/pixi-building-layer';
export { PixiOverlayLayer } from './layers/pixi-overlay-layer';
