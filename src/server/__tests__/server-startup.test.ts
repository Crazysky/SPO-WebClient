/**
 * Tests for the /api/startup-status SSE endpoint behaviour.
 *
 * Rather than booting the full HTTP server (which imports all services),
 * we test the ServiceRegistry event contract that drives the endpoint:
 * progress events fire correctly, the 'initialized' event fires last,
 * and the event payload shapes match the SSE wire format.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ServiceRegistry, type StartupProgressEvent } from '../service-registry';

/** Minimal service stub */
function makeService(name: string, initFn?: () => Promise<void>) {
  return {
    name,
    initialize: initFn ?? (() => Promise.resolve()),
  };
}

describe('/api/startup-status — ServiceRegistry event contract', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  afterEach(async () => {
    await registry.reset();
  });

  describe('SSE event payload shape', () => {
    it('should emit startup-progress events with required fields', async () => {
      const events: StartupProgressEvent[] = [];
      registry.on('startup-progress', (e: StartupProgressEvent) => events.push(e));

      registry.register('svc', makeService('svc'));
      await registry.initialize();

      expect(events.length).toBeGreaterThan(0);
      for (const evt of events) {
        expect(typeof evt.phase).toBe('string');
        expect(['initializing', 'ready']).toContain(evt.phase);
        expect(typeof evt.progress).toBe('number');
        expect(evt.progress).toBeGreaterThanOrEqual(0);
        expect(evt.progress).toBeLessThanOrEqual(1);
        expect(typeof evt.message).toBe('string');
        expect(Array.isArray(evt.services)).toBe(true);
      }
    });

    it('should be JSON-serialisable (suitable for SSE wire format)', async () => {
      let lastEvent: StartupProgressEvent | null = null;
      registry.on('startup-progress', (e: StartupProgressEvent) => { lastEvent = e; });

      registry.register('svc', makeService('svc'));
      await registry.initialize();

      expect(() => JSON.stringify(lastEvent)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(lastEvent)) as StartupProgressEvent;
      expect(parsed.phase).toBe('ready');
      expect(parsed.progress).toBe(1);
    });
  });

  describe('when server is already initialised (JSON fast-path)', () => {
    it('isInitialized() returns true after initialize()', async () => {
      registry.register('svc', makeService('svc'));
      await registry.initialize();
      expect(registry.isInitialized()).toBe(true);
    });

    it('isInitialized() returns false before initialize()', () => {
      registry.register('svc', makeService('svc'));
      expect(registry.isInitialized()).toBe(false);
    });
  });

  describe('when server is initialising (SSE stream path)', () => {
    it('should emit initialized event after all startup-progress events', async () => {
      const sequence: string[] = [];
      registry.on('startup-progress', () => sequence.push('progress'));
      registry.on('initialized', () => sequence.push('initialized'));

      registry.register('svc', makeService('svc'));
      await registry.initialize();

      // 'initialized' must come after all 'progress' events
      const lastProgressIdx = sequence.lastIndexOf('progress');
      const initializedIdx = sequence.indexOf('initialized');
      expect(initializedIdx).toBeGreaterThan(lastProgressIdx);
    });

    it('should emit a ready phase:ready event as the last startup-progress event', async () => {
      const events: StartupProgressEvent[] = [];
      registry.on('startup-progress', (e: StartupProgressEvent) => events.push(e));

      registry.register('svc', makeService('svc'));
      await registry.initialize();

      const last = events[events.length - 1];
      expect(last.phase).toBe('ready');
      expect(last.progress).toBe(1);
    });

    it('should emit initializing events before the ready event', async () => {
      const phases: string[] = [];
      registry.on('startup-progress', (e: StartupProgressEvent) => phases.push(e.phase));

      registry.register('a', makeService('a'));
      registry.register('b', makeService('b'), { dependsOn: ['a'] });
      await registry.initialize();

      expect(phases).toContain('initializing');
      expect(phases[phases.length - 1]).toBe('ready');
    });
  });

  describe('listener cleanup on client disconnect', () => {
    it('should allow removing startup-progress listener without error', async () => {
      const handler = () => { /* noop */ };
      registry.on('startup-progress', handler);

      // Simulate client disconnect — remove listener
      registry.off('startup-progress', handler);

      registry.register('svc', makeService('svc'));
      // Should not throw even though listener was removed before events fire
      await expect(registry.initialize()).resolves.toBeUndefined();
    });

    it('removing the initialized listener after disconnect prevents duplicate callbacks', async () => {
      let callCount = 0;
      const handler = () => { callCount++; };

      registry.on('initialized', handler);
      registry.off('initialized', handler); // simulate disconnect cleanup

      registry.register('svc', makeService('svc'));
      await registry.initialize();

      expect(callCount).toBe(0);
    });
  });

  describe('progress during multi-service startup', () => {
    it('should reach progress=1 at the end regardless of weights', async () => {
      let finalProgress = -1;
      registry.on('startup-progress', (e: StartupProgressEvent) => {
        finalProgress = e.progress;
      });

      registry.register('heavy', makeService('heavy'), { progressWeight: 99 });
      registry.register('light', makeService('light'), { dependsOn: ['heavy'], progressWeight: 1 });
      await registry.initialize();

      expect(finalProgress).toBe(1);
    });

    it('should increase progress monotonically across completion events', async () => {
      const progressValues: number[] = [];
      registry.on('startup-progress', (e: StartupProgressEvent) => {
        // Only track completion events (after each service finishes)
        if (e.services.some(s => s.status === 'complete')) {
          progressValues.push(e.progress);
        }
      });

      registry.register('a', makeService('a'), { progressWeight: 50 });
      registry.register('b', makeService('b'), { dependsOn: ['a'], progressWeight: 50 });
      await registry.initialize();

      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });
  });
});
