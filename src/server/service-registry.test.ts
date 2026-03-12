/**
 * Unit tests for ServiceRegistry
 *
 * Tests lifecycle management:
 * - Registration and initialization
 * - Graceful shutdown calls shutdown() on all services
 * - reset() clears state for test reuse
 * - Dependency ordering
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ServiceRegistry, Service, type StartupProgressEvent } from './service-registry';

/** Minimal mock service that tracks lifecycle calls */
class MockService implements Service {
  readonly name: string;
  initCalled = false;
  shutdownCalled = false;
  healthy = true;

  constructor(name: string) {
    this.name = name;
  }

  async initialize(): Promise<void> {
    this.initCalled = true;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}

/** Service that tracks shutdown order via a shared array */
class OrderTrackingService implements Service {
  readonly name: string;
  private order: string[];

  constructor(name: string, order: string[]) {
    this.name = name;
    this.order = order;
  }

  async initialize(): Promise<void> {
    // no-op
  }

  async shutdown(): Promise<void> {
    this.order.push(this.name);
  }
}

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  afterEach(async () => {
    await registry.reset();
  });

  describe('Registration', () => {
    it('should register and retrieve a service', () => {
      const svc = new MockService('test');
      registry.register('test', svc);

      expect(registry.has('test')).toBe(true);
      expect(registry.get('test')).toBe(svc);
    });

    it('should throw on duplicate registration', () => {
      registry.register('test', new MockService('test'));
      expect(() => registry.register('test', new MockService('test')))
        .toThrow("Service 'test' is already registered");
    });

    it('should throw when getting unregistered service', () => {
      expect(() => registry.get('nonexistent'))
        .toThrow("Service 'nonexistent' is not registered");
    });

    it('should prevent registration after initialization', async () => {
      registry.register('test', new MockService('test'));
      await registry.initialize();

      expect(() => registry.register('late', new MockService('late')))
        .toThrow("Cannot register service 'late' after initialization");
    });
  });

  describe('Initialization', () => {
    it('should call initialize() on all services', async () => {
      const svc1 = new MockService('svc1');
      const svc2 = new MockService('svc2');
      registry.register('svc1', svc1);
      registry.register('svc2', svc2);

      await registry.initialize();

      expect(svc1.initCalled).toBe(true);
      expect(svc2.initCalled).toBe(true);
      expect(registry.isInitialized()).toBe(true);
    });

    it('should respect dependency order', async () => {
      const order: string[] = [];

      const parent = new OrderTrackingService('parent', []);
      const child = new OrderTrackingService('child', []);

      // Override initialize to track order
      const origParentInit = parent.initialize.bind(parent);
      parent.initialize = async () => { order.push('parent'); await origParentInit(); };
      const origChildInit = child.initialize.bind(child);
      child.initialize = async () => { order.push('child'); await origChildInit(); };

      registry.register('child', child, { dependsOn: ['parent'] });
      registry.register('parent', parent);

      await registry.initialize();

      expect(order).toEqual(['parent', 'child']);
    });

    it('should throw on circular dependency', () => {
      registry.register('a', new MockService('a'), { dependsOn: ['b'] });
      registry.register('b', new MockService('b'), { dependsOn: ['a'] });

      expect(registry.initialize()).rejects.toThrow('Circular dependency');
    });

    it('should throw on double initialization', async () => {
      registry.register('test', new MockService('test'));
      await registry.initialize();

      await expect(registry.initialize()).rejects.toThrow('already initialized');
    });
  });

  describe('Shutdown', () => {
    it('should call shutdown() on all services', async () => {
      const svc1 = new MockService('svc1');
      const svc2 = new MockService('svc2');
      registry.register('svc1', svc1);
      registry.register('svc2', svc2);

      await registry.initialize();
      await registry.shutdown();

      expect(svc1.shutdownCalled).toBe(true);
      expect(svc2.shutdownCalled).toBe(true);
      expect(registry.isShuttingDown()).toBe(true);
    });

    it('should respect shutdown priority (higher first)', async () => {
      const order: string[] = [];

      const low = new OrderTrackingService('low', order);
      const high = new OrderTrackingService('high', order);
      const mid = new OrderTrackingService('mid', order);

      registry.register('low', low, { shutdownPriority: 0 });
      registry.register('high', high, { shutdownPriority: 10 });
      registry.register('mid', mid, { shutdownPriority: 5 });

      await registry.initialize();
      await registry.shutdown();

      expect(order).toEqual(['high', 'mid', 'low']);
    });

    it('should handle services without shutdown() gracefully', async () => {
      const minimal: Service = { name: 'minimal' };
      registry.register('minimal', minimal);

      await registry.initialize();
      // Should not throw
      await registry.shutdown();
    });

    it('should handle shutdown errors without crashing', async () => {
      const failing: Service = {
        name: 'failing',
        async shutdown() { throw new Error('shutdown error'); }
      };
      registry.register('failing', failing);

      await registry.initialize();
      // Should not throw — errors are caught internally
      await registry.shutdown();
      expect(registry.isShuttingDown()).toBe(true);
    });

    it('should be idempotent (second shutdown is no-op)', async () => {
      const svc = new MockService('svc');
      registry.register('svc', svc);

      await registry.initialize();
      await registry.shutdown();
      await registry.shutdown(); // Should not throw

      expect(svc.shutdownCalled).toBe(true);
    });
  });

  describe('reset()', () => {
    it('should clear all state and allow re-registration', async () => {
      const svc = new MockService('svc');
      registry.register('svc', svc);
      await registry.initialize();

      await registry.reset();

      expect(registry.isInitialized()).toBe(false);
      expect(registry.isShuttingDown()).toBe(false);
      expect(registry.has('svc')).toBe(false);
      expect(registry.getServiceNames()).toEqual([]);
    });

    it('should call shutdown before clearing if initialized', async () => {
      const svc = new MockService('svc');
      registry.register('svc', svc);
      await registry.initialize();

      await registry.reset();

      expect(svc.shutdownCalled).toBe(true);
    });

    it('should allow a fresh register+initialize cycle after reset', async () => {
      const svc1 = new MockService('first');
      registry.register('first', svc1);
      await registry.initialize();

      await registry.reset();

      const svc2 = new MockService('second');
      registry.register('second', svc2);
      await registry.initialize();

      expect(svc2.initCalled).toBe(true);
      expect(registry.has('second')).toBe(true);
      expect(registry.has('first')).toBe(false);
    });
  });

  describe('Parallel initialization', () => {
    it('should run services at the same dependency depth in parallel', async () => {
      // Barrier pattern: b and c each wait for the other to start.
      // If they ran sequentially this would deadlock — proving parallel execution.
      let bResolve!: () => void;
      let cResolve!: () => void;
      const bStarted = new Promise<void>(r => { bResolve = r; });
      const cStarted = new Promise<void>(r => { cResolve = r; });

      const b: Service = {
        name: 'b',
        async initialize() { bResolve(); await cStarted; },
      };
      const c: Service = {
        name: 'c',
        async initialize() { cResolve(); await bStarted; },
      };

      registry.register('a', new MockService('a'));
      registry.register('b', b, { dependsOn: ['a'] });
      registry.register('c', c, { dependsOn: ['a'] });

      // Would hang forever if b and c ran sequentially
      await expect(registry.initialize()).resolves.toBeUndefined();
    });

    it('should not start a service before its dependency completes', async () => {
      const order: string[] = [];

      const a: Service = {
        name: 'a',
        async initialize() { order.push('a'); },
      };
      const b: Service = {
        name: 'b',
        async initialize() { order.push('b'); },
      };

      registry.register('a', a);
      registry.register('b', b, { dependsOn: ['a'] });

      await registry.initialize();

      expect(order).toEqual(['a', 'b']);
    });

    it('should propagate errors from parallel services', async () => {
      const bad: Service = {
        name: 'bad',
        async initialize() { throw new Error('parallel failure'); },
      };
      const good: Service = {
        name: 'good',
        async initialize() { /* fine */ },
      };

      registry.register('root', new MockService('root'));
      registry.register('bad', bad, { dependsOn: ['root'] });
      registry.register('good', good, { dependsOn: ['root'] });

      await expect(registry.initialize()).rejects.toThrow('parallel failure');
    });
  });

  describe('Startup progress events', () => {
    it('should emit startup-progress events during initialization', async () => {
      const events: StartupProgressEvent[] = [];
      registry.on('startup-progress', (evt: StartupProgressEvent) => events.push(evt));

      registry.register('svc', new MockService('svc'));
      await registry.initialize();

      expect(events.length).toBeGreaterThan(0);
      // Last event should be phase:'ready' with progress 1
      const last = events[events.length - 1];
      expect(last.phase).toBe('ready');
      expect(last.progress).toBe(1);
    });

    it('should emit service-started and service-complete events', async () => {
      const started: string[] = [];
      const completed: string[] = [];

      registry.on('service-started', ({ name }: { name: string }) => started.push(name));
      registry.on('service-complete', ({ name }: { name: string }) => completed.push(name));

      registry.register('svc', new MockService('svc'));
      await registry.initialize();

      expect(started).toContain('svc');
      expect(completed).toContain('svc');
    });

    it('should calculate progress using progressWeight', async () => {
      const progressValues: number[] = [];

      registry.on('startup-progress', (evt: StartupProgressEvent) => {
        if (evt.phase === 'initializing') progressValues.push(evt.progress);
      });

      // heavy=90, light=10 — after heavy completes progress should be ~0.9
      registry.register('heavy', new MockService('heavy'), { progressWeight: 90 });
      registry.register('light', new MockService('light'), { dependsOn: ['heavy'], progressWeight: 10 });

      await registry.initialize();

      // At some point progress should have been 90/(90+10) = 0.9 (after heavy completes)
      expect(progressValues.some(p => Math.abs(p - 0.9) < 0.01)).toBe(true);
    });

    it('should include progressMessage in startup-progress events', async () => {
      const messages: string[] = [];
      registry.on('startup-progress', (evt: StartupProgressEvent) => {
        if (evt.phase === 'initializing') messages.push(evt.message);
      });

      registry.register('svc', new MockService('svc'), {
        progressMessage: 'Custom loading message...',
      });
      await registry.initialize();

      expect(messages).toContain('Custom loading message...');
    });

    it('should report all services as complete in the ready event', async () => {
      let readyEvent: StartupProgressEvent | null = null;
      registry.on('startup-progress', (evt: StartupProgressEvent) => {
        if (evt.phase === 'ready') readyEvent = evt;
      });

      registry.register('a', new MockService('a'));
      registry.register('b', new MockService('b'), { dependsOn: ['a'] });
      await registry.initialize();

      expect(readyEvent).not.toBeNull();
      expect(readyEvent!.services.every(s => s.status === 'complete')).toBe(true);
    });
  });

  describe('Health checks', () => {
    it('should report healthy when all services are healthy', async () => {
      registry.register('svc', new MockService('svc'));
      await registry.initialize();

      const result = registry.healthCheck();
      expect(result.healthy).toBe(true);
      expect(result.services['svc'].healthy).toBe(true);
    });

    it('should report unhealthy when a service is unhealthy', async () => {
      const svc = new MockService('svc');
      svc.healthy = false;
      registry.register('svc', svc);
      await registry.initialize();

      const result = registry.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.services['svc'].healthy).toBe(false);
    });

    it('should include uptime', async () => {
      registry.register('svc', new MockService('svc'));
      await registry.initialize();

      const result = registry.healthCheck();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
