/**
 * SpritePool - Efficient sprite instance reuse for PixiJS
 *
 * Instead of creating/destroying sprites every frame, we maintain pools
 * of reusable sprites per texture. This dramatically reduces GC pressure
 * and allocation overhead.
 */

import { Sprite, Texture, Container } from 'pixi.js';

/** Pool statistics for debugging */
export interface PoolStats {
  totalCreated: number;
  totalActive: number;
  totalPooled: number;
  poolsByTexture: Map<string, { active: number; pooled: number }>;
}

/**
 * Pool for managing sprite instances
 */
export class SpritePool {
  // Pool of available sprites per texture key
  private pools: Map<string, Sprite[]> = new Map();

  // Currently active sprites (in use)
  private activeSprites: Map<string, Set<Sprite>> = new Map();

  // Statistics
  private stats = {
    totalCreated: 0,
    totalActive: 0,
    totalPooled: 0
  };

  // Default pool size per texture
  private readonly DEFAULT_POOL_SIZE = 100;

  /**
   * Get a sprite from the pool (or create a new one)
   * @param textureKey Unique key for the texture
   * @param texture The PixiJS texture
   * @param parent Optional parent container to add sprite to
   */
  acquire(textureKey: string, texture: Texture, parent?: Container): Sprite {
    // Get or create pool for this texture
    let pool = this.pools.get(textureKey);
    if (!pool) {
      pool = [];
      this.pools.set(textureKey, pool);
    }

    // Get or create active set for this texture
    let activeSet = this.activeSprites.get(textureKey);
    if (!activeSet) {
      activeSet = new Set();
      this.activeSprites.set(textureKey, activeSet);
    }

    // Get sprite from pool or create new one
    let sprite: Sprite;
    if (pool.length > 0) {
      sprite = pool.pop()!;
      sprite.texture = texture;
      sprite.visible = true;
      this.stats.totalPooled--;
    } else {
      sprite = new Sprite(texture);
      this.stats.totalCreated++;
    }

    // Reset sprite state
    sprite.x = 0;
    sprite.y = 0;
    sprite.scale.set(1);
    sprite.alpha = 1;
    sprite.rotation = 0;
    sprite.anchor.set(0);
    sprite.tint = 0xFFFFFF;

    // Track as active
    activeSet.add(sprite);
    this.stats.totalActive++;

    // Add to parent if provided
    if (parent) {
      parent.addChild(sprite);
    }

    return sprite;
  }

  /**
   * Return a sprite to the pool for reuse
   * @param textureKey Texture key the sprite was acquired with
   * @param sprite The sprite to release
   */
  release(textureKey: string, sprite: Sprite): void {
    const activeSet = this.activeSprites.get(textureKey);
    if (!activeSet || !activeSet.has(sprite)) {
      console.warn(`[SpritePool] Attempted to release sprite not in active set: ${textureKey}`);
      return;
    }

    // Remove from active
    activeSet.delete(sprite);
    this.stats.totalActive--;

    // Remove from parent
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }

    // Hide and return to pool
    sprite.visible = false;

    let pool = this.pools.get(textureKey);
    if (!pool) {
      pool = [];
      this.pools.set(textureKey, pool);
    }
    pool.push(sprite);
    this.stats.totalPooled++;
  }

  /**
   * Release all sprites for a given texture key
   * @param textureKey Texture key to release
   */
  releaseAll(textureKey: string): void {
    const activeSet = this.activeSprites.get(textureKey);
    if (!activeSet) return;

    const sprites = Array.from(activeSet);
    for (const sprite of sprites) {
      this.release(textureKey, sprite);
    }
  }

  /**
   * Release all sprites across all textures
   */
  releaseEverything(): void {
    for (const textureKey of this.activeSprites.keys()) {
      this.releaseAll(textureKey);
    }
  }

  /**
   * Pre-warm pool with sprites for a given texture
   * @param textureKey Texture key
   * @param texture The texture
   * @param count Number of sprites to pre-create
   */
  prewarm(textureKey: string, texture: Texture, count: number = this.DEFAULT_POOL_SIZE): void {
    let pool = this.pools.get(textureKey);
    if (!pool) {
      pool = [];
      this.pools.set(textureKey, pool);
    }

    const toCreate = Math.max(0, count - pool.length);
    for (let i = 0; i < toCreate; i++) {
      const sprite = new Sprite(texture);
      sprite.visible = false;
      pool.push(sprite);
      this.stats.totalCreated++;
      this.stats.totalPooled++;
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const poolsByTexture = new Map<string, { active: number; pooled: number }>();

    for (const [key, pool] of this.pools) {
      const activeSet = this.activeSprites.get(key);
      poolsByTexture.set(key, {
        active: activeSet?.size ?? 0,
        pooled: pool.length
      });
    }

    return {
      totalCreated: this.stats.totalCreated,
      totalActive: this.stats.totalActive,
      totalPooled: this.stats.totalPooled,
      poolsByTexture
    };
  }

  /**
   * Destroy all sprites and clear pools
   */
  destroy(): void {
    // Destroy all pooled sprites
    for (const pool of this.pools.values()) {
      for (const sprite of pool) {
        sprite.destroy();
      }
    }

    // Destroy all active sprites
    for (const activeSet of this.activeSprites.values()) {
      for (const sprite of activeSet) {
        sprite.destroy();
      }
    }

    this.pools.clear();
    this.activeSprites.clear();
    this.stats.totalCreated = 0;
    this.stats.totalActive = 0;
    this.stats.totalPooled = 0;
  }
}

/**
 * Batch sprite manager for efficient layer rendering
 *
 * Manages a group of sprites that are updated together each frame.
 * Automatically handles pooling and visibility culling.
 */
export class BatchSpriteManager {
  private pool: SpritePool;
  private container: Container;
  private textureKeyPrefix: string;

  // Track sprites by their map position key, along with their texture key
  private spritesByPosition: Map<string, { sprite: Sprite; textureKey: string }> = new Map();
  private usedPositions: Set<string> = new Set();

  constructor(pool: SpritePool, container: Container, textureKeyPrefix: string) {
    this.pool = pool;
    this.container = container;
    this.textureKeyPrefix = textureKeyPrefix;
  }

  /**
   * Begin a new frame - mark all sprites as potentially unused
   */
  beginFrame(): void {
    this.usedPositions.clear();
  }

  /**
   * Add or update a sprite at a position
   * @param posKey Position key (e.g., "100,200" for i=100, j=200)
   * @param textureKey Texture identifier
   * @param texture The texture
   * @param x Screen X position
   * @param y Screen Y position
   * @param zIndex Z-index for sorting
   * @param options Additional sprite options
   */
  setSprite(
    posKey: string,
    textureKey: string,
    texture: Texture,
    x: number,
    y: number,
    zIndex: number,
    options?: {
      scaleX?: number;
      scaleY?: number;
      anchorX?: number;
      anchorY?: number;
      alpha?: number;
      tint?: number;
    }
  ): Sprite {
    this.usedPositions.add(posKey);

    const fullTextureKey = `${this.textureKeyPrefix}:${textureKey}`;
    const existing = this.spritesByPosition.get(posKey);
    let sprite: Sprite;

    if (existing) {
      sprite = existing.sprite;
      // If texture key changed, we need to release and re-acquire
      if (existing.textureKey !== fullTextureKey) {
        this.pool.release(existing.textureKey, sprite);
        sprite = this.pool.acquire(fullTextureKey, texture, this.container);
        this.spritesByPosition.set(posKey, { sprite, textureKey: fullTextureKey });
      } else if (sprite.texture !== texture) {
        // Same texture key but different texture object
        sprite.texture = texture;
      }
    } else {
      // Acquire new sprite
      sprite = this.pool.acquire(fullTextureKey, texture, this.container);
      this.spritesByPosition.set(posKey, { sprite, textureKey: fullTextureKey });
    }

    // Update position and properties
    sprite.x = x;
    sprite.y = y;
    sprite.zIndex = zIndex;

    if (options) {
      if (options.scaleX !== undefined || options.scaleY !== undefined) {
        sprite.scale.set(options.scaleX ?? 1, options.scaleY ?? 1);
      }
      if (options.anchorX !== undefined || options.anchorY !== undefined) {
        sprite.anchor.set(options.anchorX ?? 0, options.anchorY ?? 0);
      }
      if (options.alpha !== undefined) {
        sprite.alpha = options.alpha;
      }
      if (options.tint !== undefined) {
        sprite.tint = options.tint;
      }
    }

    return sprite;
  }

  /**
   * End frame - release sprites that weren't used this frame
   */
  endFrame(): void {
    const toRemove: string[] = [];

    for (const [posKey, { sprite, textureKey }] of this.spritesByPosition) {
      if (!this.usedPositions.has(posKey)) {
        // Release this sprite back to pool using its actual texture key
        this.pool.release(textureKey, sprite);
        toRemove.push(posKey);
      }
    }

    for (const posKey of toRemove) {
      this.spritesByPosition.delete(posKey);
    }
  }

  /**
   * Clear all sprites
   */
  clear(): void {
    for (const [posKey, { sprite, textureKey }] of this.spritesByPosition) {
      this.pool.release(textureKey, sprite);
    }
    this.spritesByPosition.clear();
    this.usedPositions.clear();
  }

  /**
   * Get count of active sprites
   */
  getActiveCount(): number {
    return this.spritesByPosition.size;
  }
}
