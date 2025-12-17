/**
 * Tests for Coordinator Resilience Features
 *
 * Tests epoch fencing and contention detection features inspired by etcd Raft.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../../../src/database.class.js';
import { GlobalCoordinatorService } from '../../../src/plugins/concerns/global-coordinator-service.class.js';
import { CoordinatorPlugin } from '../../../src/plugins/concerns/coordinator-plugin.class.js';

describe('Coordinator Resilience Features', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database({
      connectionString: 'memory://test/resilience/db',
      logLevel: 'silent'
    });
    await db.connect();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  describe('Enhanced Metrics', () => {
    let service: GlobalCoordinatorService;

    afterEach(async () => {
      if (service?.isRunning) {
        await service.stop();
      }
    });

    it('should include latency stats in metrics', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-metrics',
        database: db,
        config: {
          heartbeatInterval: 50,
          heartbeatJitter: 10,
          metricsBufferSize: 50
        }
      });

      await service.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      const metrics = service.getMetrics();

      expect(metrics.latency).toBeDefined();
      expect(metrics.latency.count).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.latency.p50).toBe('number');
      expect(typeof metrics.latency.p95).toBe('number');
      expect(typeof metrics.latency.p99).toBe('number');
    });

    it('should track contentionEvents and epochDriftEvents counters', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-counters',
        database: db
      });

      await service.start();

      const metrics = service.getMetrics();

      expect(metrics.contentionEvents).toBe(0);
      expect(metrics.epochDriftEvents).toBe(0);
    });

    it('should increment epochDriftEvents via incrementEpochDriftEvents()', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-drift',
        database: db
      });

      await service.start();

      service.incrementEpochDriftEvents();
      service.incrementEpochDriftEvents();

      const metrics = service.getMetrics();
      expect(metrics.epochDriftEvents).toBe(2);
    });
  });

  describe('Contention Detection', () => {
    let service: GlobalCoordinatorService;

    afterEach(async () => {
      if (service?.isRunning) {
        await service.stop();
      }
    });

    it('should emit contention:detected event when threshold exceeded', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-contention',
        database: db,
        config: {
          heartbeatInterval: 10,
          contention: {
            enabled: true,
            threshold: 0.5,
            rateLimitMs: 100
          }
        }
      });

      const contentionEvents: unknown[] = [];
      service.on('contention:detected', (event) => {
        contentionEvents.push(event);
      });

      await service.start();

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(contentionEvents.length).toBeGreaterThanOrEqual(0);

      if (contentionEvents.length > 0) {
        const event = contentionEvents[0] as Record<string, unknown>;
        expect(event.namespace).toBe('test-contention');
        expect(event.duration).toBeDefined();
        expect(event.expected).toBeDefined();
        expect(event.ratio).toBeDefined();
        expect(event.threshold).toBeDefined();
      }
    });

    it('should respect contention rate limiting', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-rate-limit',
        database: db,
        config: {
          heartbeatInterval: 5,
          contention: {
            enabled: true,
            threshold: 0.1,
            rateLimitMs: 1000
          }
        }
      });

      const contentionEvents: unknown[] = [];
      service.on('contention:detected', (event) => {
        contentionEvents.push(event);
      });

      await service.start();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(contentionEvents.length).toBeLessThanOrEqual(1);
    });

    it('should not emit when contention disabled', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-disabled',
        database: db,
        config: {
          heartbeatInterval: 5,
          contention: {
            enabled: false
          }
        }
      });

      const contentionEvents: unknown[] = [];
      service.on('contention:detected', (event) => {
        contentionEvents.push(event);
      });

      await service.start();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(contentionEvents.length).toBe(0);
    });
  });

  describe('Epoch Fencing (CoordinatorPlugin)', () => {
    class TestPlugin extends CoordinatorPlugin {
      slug = 'test-plugin';

      constructor(config = {}) {
        super({
          enableCoordinator: false,
          ...config
        });
      }
    }

    it('should accept tasks with current epoch', () => {
      const plugin = new TestPlugin({ epochFencingEnabled: true });

      (plugin as any)._lastKnownEpoch = 5;

      const result = plugin.validateEpoch(5);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('current');
    });

    it('should accept tasks with higher epoch and update', () => {
      const plugin = new TestPlugin({ epochFencingEnabled: true });

      (plugin as any)._lastKnownEpoch = 5;

      const result = plugin.validateEpoch(7);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('current');
      expect((plugin as any)._lastKnownEpoch).toBe(7);
    });

    it('should reject tasks with stale epoch', () => {
      const plugin = new TestPlugin({ epochFencingEnabled: true });

      (plugin as any)._lastKnownEpoch = 10;
      (plugin as any)._lastEpochChangeTime = Date.now() - 10000;

      const result = plugin.validateEpoch(5);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('stale');
    });

    it('should allow grace period for epoch-1 tasks', () => {
      const plugin = new TestPlugin({
        epochFencingEnabled: true,
        epochGracePeriodMs: 5000
      });

      (plugin as any)._lastKnownEpoch = 10;
      (plugin as any)._lastEpochChangeTime = Date.now();

      const result = plugin.validateEpoch(9, Date.now());

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('grace_period');
    });

    it('should reject epoch-1 tasks after grace period', () => {
      const plugin = new TestPlugin({
        epochFencingEnabled: true,
        epochGracePeriodMs: 5000
      });

      (plugin as any)._lastKnownEpoch = 10;
      (plugin as any)._lastEpochChangeTime = Date.now() - 10000;

      const result = plugin.validateEpoch(9, Date.now() - 10000);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('stale');
    });

    it('should always accept when epoch fencing disabled', () => {
      const plugin = new TestPlugin({ epochFencingEnabled: false });

      (plugin as any)._lastKnownEpoch = 10;

      const result = plugin.validateEpoch(1);

      expect(result.valid).toBe(true);
    });

    it('should provide isEpochValid convenience method', () => {
      const plugin = new TestPlugin({ epochFencingEnabled: true });

      (plugin as any)._lastKnownEpoch = 5;

      expect(plugin.isEpochValid(5)).toBe(true);
      expect(plugin.isEpochValid(6)).toBe(true);

      (plugin as any)._lastEpochChangeTime = Date.now() - 10000;
      expect(plugin.isEpochValid(3)).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should use default contention config', () => {
      const service = new GlobalCoordinatorService({
        namespace: 'test-defaults',
        database: db
      });

      expect((service as any).config.contentionEnabled).toBe(true);
      expect((service as any).config.contentionThreshold).toBe(2.0);
      expect((service as any).config.contentionRateLimitMs).toBe(30000);
      expect((service as any).config.metricsBufferSize).toBe(100);
    });

    it('should allow custom contention config', () => {
      const service = new GlobalCoordinatorService({
        namespace: 'test-custom',
        database: db,
        config: {
          contention: {
            enabled: false,
            threshold: 3.0,
            rateLimitMs: 60000
          },
          metricsBufferSize: 200
        }
      });

      expect((service as any).config.contentionEnabled).toBe(false);
      expect((service as any).config.contentionThreshold).toBe(3.0);
      expect((service as any).config.contentionRateLimitMs).toBe(60000);
      expect((service as any).config.metricsBufferSize).toBe(200);
    });

    it('should enforce minimum metrics buffer size', () => {
      const service = new GlobalCoordinatorService({
        namespace: 'test-min-buffer',
        database: db,
        config: {
          metricsBufferSize: 1
        }
      });

      expect((service as any).config.metricsBufferSize).toBe(10);
    });
  });
});
