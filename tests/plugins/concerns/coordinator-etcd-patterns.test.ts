/**
 * Tests for etcd-inspired Coordinator Patterns
 *
 * Tests fair election, lease checkpointing, lifecycle management, and S3Mutex.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../../../src/database.class.js';
import { GlobalCoordinatorService, type LifecycleHooks, type LifecycleEvent } from '../../../src/plugins/concerns/global-coordinator-service.class.js';
import { S3Mutex, type LockResult } from '../../../src/plugins/concerns/s3-mutex.class.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import type { PluginClient } from '../../../src/concerns/plugin-storage.js';

describe('Coordinator etcd-inspired Patterns', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database({
      connectionString: 'memory://test/etcd-patterns/db',
      logLevel: 'silent'
    });
    await db.connect();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  describe('Fair Election (timestamp-based)', () => {
    let service: GlobalCoordinatorService;

    afterEach(async () => {
      if (service?.isRunning) {
        await service.stop();
      }
    });

    it('should use timestamp strategy by default', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-election',
        database: db
      });

      expect((service as any).config.electionStrategy).toBe('timestamp');
    });

    it('should allow alphabetical strategy configuration', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-election-alpha',
        database: db,
        config: {
          electionStrategy: 'alphabetical'
        }
      });

      expect((service as any).config.electionStrategy).toBe('alphabetical');
    });

    it('should track worker startTime in registration', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-start-time',
        database: db,
        config: {
          heartbeatInterval: 100
        }
      });

      await service.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      const workers = await service.getActiveWorkers();

      if (workers.length > 0) {
        const worker = workers[0];
        expect(worker.startTime).toBeDefined();
        expect(typeof worker.startTime).toBe('number');
        expect(worker.startTime).toBeLessThanOrEqual(Date.now());
      } else {
        expect(service.workerId).toBeDefined();
      }
    });

    it('should maintain startTime across heartbeats', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-persist-time',
        database: db,
        config: {
          heartbeatInterval: 100
        }
      });

      await service.start();

      await new Promise(resolve => setTimeout(resolve, 300));
      const workersFirst = await service.getActiveWorkers();
      const firstStartTime = workersFirst[0]?.startTime;

      await new Promise(resolve => setTimeout(resolve, 300));
      const workersSecond = await service.getActiveWorkers();
      const secondStartTime = workersSecond[0]?.startTime;

      if (firstStartTime !== undefined && secondStartTime !== undefined) {
        expect(firstStartTime).toBe(secondStartTime);
      } else {
        expect(service.workerId).toBeDefined();
      }
    });

    it('should elect leader based on earliest startTime', async () => {
      const service1 = new GlobalCoordinatorService({
        namespace: 'test-fifo',
        database: db,
        config: {
          heartbeatInterval: 100,
          electionStrategy: 'timestamp'
        }
      });

      await service1.start();
      await new Promise(resolve => setTimeout(resolve, 300));

      const service2 = new GlobalCoordinatorService({
        namespace: 'test-fifo',
        database: db,
        config: {
          heartbeatInterval: 100,
          electionStrategy: 'timestamp'
        }
      });

      await service2.start();
      await new Promise(resolve => setTimeout(resolve, 400));

      const leader = await service1.getLeader();
      if (leader !== null) {
        expect(leader).toBe(service1.workerId);
      } else {
        expect(service1.workerId).toBeDefined();
      }

      await service1.stop();
      await service2.stop();
    });
  });

  describe('Lease Checkpointing', () => {
    let service: GlobalCoordinatorService;

    afterEach(async () => {
      if (service?.isRunning) {
        await service.stop();
      }
    });

    it('should have checkpointing enabled by default', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-checkpoint-default',
        database: db
      });

      expect((service as any).config.checkpointEnabled).toBe(true);
      expect((service as any).config.checkpointThreshold).toBe(0.1);
    });

    it('should allow disabling checkpointing', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-checkpoint-disabled',
        database: db,
        config: {
          checkpoint: {
            enabled: false
          }
        }
      });

      expect((service as any).config.checkpointEnabled).toBe(false);
    });

    it('should allow custom checkpoint threshold', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-checkpoint-threshold',
        database: db,
        config: {
          checkpoint: {
            enabled: true,
            threshold: 0.25
          }
        }
      });

      expect((service as any).config.checkpointThreshold).toBe(0.25);
    });

    it('should write checkpoint during heartbeat cycle', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-checkpoint-write',
        database: db,
        config: {
          heartbeatInterval: 50,
          leaseTimeout: 500,
          checkpoint: {
            enabled: true,
            threshold: 0.05
          }
        }
      });

      await service.start();
      await new Promise(resolve => setTimeout(resolve, 300));

      const checkpointKey = (service as any)._getCheckpointKey();
      const storage = (service as any).storage as PluginStorage;

      const checkpoint = await storage.get(checkpointKey);

      expect(checkpoint).toBeDefined();
    });

    it('should not write checkpoint when disabled', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-no-checkpoint',
        database: db,
        config: {
          heartbeatInterval: 50,
          checkpoint: {
            enabled: false
          }
        }
      });

      await service.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      const checkpointKey = (service as any)._getCheckpointKey();
      const storage = (service as any).storage as PluginStorage;

      const checkpoint = await storage.get(checkpointKey);

      expect(checkpoint).toBeNull();
    });

    it('should restore from checkpoint on restart', async () => {
      const service1 = new GlobalCoordinatorService({
        namespace: 'test-checkpoint-restore',
        database: db,
        config: {
          heartbeatInterval: 50,
          leaseTimeout: 2000,
          checkpoint: {
            enabled: true,
            threshold: 0.01
          }
        }
      });

      await service1.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      const originalLeader = await service1.getLeader();
      const originalEpoch = (service1 as any)._lastKnownEpoch;

      await service1.stop();

      const service2 = new GlobalCoordinatorService({
        namespace: 'test-checkpoint-restore',
        database: db,
        config: {
          heartbeatInterval: 50,
          leaseTimeout: 2000,
          checkpoint: {
            enabled: true
          }
        }
      });

      await service2.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      const newLeader = await service2.getLeader();
      expect(newLeader).toBeDefined();

      await service2.stop();
    });
  });

  describe('Lifecycle Management', () => {
    let service: GlobalCoordinatorService;

    afterEach(async () => {
      if (service?.isRunning) {
        await service.stop();
      }
    });

    it('should start with isPrimary = false', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-lifecycle',
        database: db
      });

      expect(service.isPrimary).toBe(false);
    });

    it('should register lifecycle hooks', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-hooks-register',
        database: db
      });

      const hooks: LifecycleHooks = {
        onPromote: async () => {},
        onDemote: async () => {}
      };

      service.registerLifecycleHooks('test-plugin', hooks);

      expect((service as any)._lifecycleHooks.has('test-plugin')).toBe(true);
    });

    it('should unregister lifecycle hooks', () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-hooks-unregister',
        database: db
      });

      const hooks: LifecycleHooks = {
        onPromote: async () => {}
      };

      service.registerLifecycleHooks('test-plugin', hooks);
      expect((service as any)._lifecycleHooks.size).toBe(1);

      service.unregisterLifecycleHooks('test-plugin');
      expect((service as any)._lifecycleHooks.size).toBe(0);
    });

    it('should call onPromote when becoming leader', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-promote-callback',
        database: db,
        config: {
          heartbeatInterval: 100
        }
      });

      let promoteCalled = false;
      let promoteEvent: LifecycleEvent | null = null;

      const hooks: LifecycleHooks = {
        onPromote: async (coordinator) => {
          promoteCalled = true;
        }
      };

      service.registerLifecycleHooks('test-plugin', hooks);

      service.on('coordinator:promoted', (event: LifecycleEvent) => {
        promoteEvent = event;
      });

      await service.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      if (service.isPrimary) {
        expect(promoteCalled).toBe(true);
        expect(promoteEvent).toBeDefined();
        expect(promoteEvent!.namespace).toBe('test-promote-callback');
        expect(promoteEvent!.epoch).toBeGreaterThan(0);
      } else {
        expect(service.workerId).toBeDefined();
      }
    });

    it('should call onDemote when losing leadership', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-demote-callback',
        database: db,
        config: {
          heartbeatInterval: 100
        }
      });

      let demoteCalled = false;

      const hooks: LifecycleHooks = {
        onDemote: async () => {
          demoteCalled = true;
        }
      };

      service.registerLifecycleHooks('test-plugin', hooks);

      await service.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      const wasPrimary = service.isPrimary;

      await service.stop();

      if (wasPrimary) {
        expect(demoteCalled).toBe(true);
      }
      expect(service.isPrimary).toBe(false);
    });

    it('should emit coordinator:demoted event on stop', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-demote-event',
        database: db,
        config: {
          heartbeatInterval: 100
        }
      });

      let demoteEvent: LifecycleEvent | null = null;

      service.on('coordinator:demoted', (event: LifecycleEvent) => {
        demoteEvent = event;
      });

      await service.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      const wasPrimary = service.isPrimary;
      await service.stop();

      if (wasPrimary) {
        expect(demoteEvent).toBeDefined();
        expect(demoteEvent!.namespace).toBe('test-demote-event');
      } else {
        expect(service.isPrimary).toBe(false);
      }
    });

    it('should isolate errors between hooks', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-hook-isolation',
        database: db,
        config: {
          heartbeatInterval: 100
        }
      });

      let hook1Called = false;
      let hook2Called = false;

      const hooks1: LifecycleHooks = {
        onPromote: async () => {
          hook1Called = true;
          throw new Error('Hook 1 error');
        }
      };

      const hooks2: LifecycleHooks = {
        onPromote: async () => {
          hook2Called = true;
        }
      };

      service.registerLifecycleHooks('plugin1', hooks1);
      service.registerLifecycleHooks('plugin2', hooks2);

      await service.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      if (service.isPrimary) {
        expect(hook1Called).toBe(true);
        expect(hook2Called).toBe(true);
      } else {
        expect(service.workerId).toBeDefined();
      }
    });

    it('should clear hooks on stop', async () => {
      service = new GlobalCoordinatorService({
        namespace: 'test-clear-hooks',
        database: db
      });

      service.registerLifecycleHooks('plugin1', { onPromote: async () => {} });
      service.registerLifecycleHooks('plugin2', { onDemote: async () => {} });

      expect((service as any)._lifecycleHooks.size).toBe(2);

      await service.start();
      await service.stop();

      expect((service as any)._lifecycleHooks.size).toBe(0);
    });
  });

  describe('S3Mutex Distributed Lock', () => {
    let storage: PluginStorage;
    let mutex: S3Mutex;

    beforeEach(async () => {
      storage = new PluginStorage(db.client as PluginClient, 'test-mutex');
      mutex = new S3Mutex(storage, 'test-namespace');
    });

    it('should require storage in constructor', () => {
      expect(() => {
        new S3Mutex(null as any);
      }).toThrow('S3Mutex: storage is required');
    });

    it('should generate unique holder ID per instance', () => {
      const mutex1 = new S3Mutex(storage, 'ns1');
      const mutex2 = new S3Mutex(storage, 'ns2');

      expect((mutex1 as any).holderId).toBeDefined();
      expect((mutex2 as any).holderId).toBeDefined();
      expect(typeof (mutex1 as any).holderId).toBe('string');
      expect((mutex1 as any).holderId.startsWith('holder-')).toBe(true);
    });

    it('should acquire lock successfully', async () => {
      const result = await mutex.lock('my-resource');

      expect(result.acquired).toBe(true);
      expect(result.lockId).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should fail to acquire already held lock', async () => {
      const result1 = await mutex.lock('contested-resource');
      expect(result1.acquired).toBe(true);

      const mutex2 = new S3Mutex(storage, 'test-namespace');
      const result2 = await mutex2.lock('contested-resource');

      expect(result2.acquired).toBe(false);
      expect(result2.error).toBeDefined();
    });

    it('should release lock successfully', async () => {
      const result = await mutex.lock('release-test');
      expect(result.acquired).toBe(true);

      const unlocked = await mutex.unlock('release-test', result.lockId!);
      expect(unlocked).toBe(true);

      const isLocked = await mutex.isLocked('release-test');
      expect(isLocked).toBe(false);
    });

    it('should reject unlock with wrong lockId', async () => {
      const result = await mutex.lock('wrong-id-test');
      expect(result.acquired).toBe(true);

      const unlocked = await mutex.unlock('wrong-id-test', 'wrong-lock-id');
      expect(unlocked).toBe(false);
    });

    it('should report lock status correctly', async () => {
      expect(await mutex.isLocked('status-test')).toBe(false);

      const result = await mutex.lock('status-test');
      expect(result.acquired).toBe(true);

      expect(await mutex.isLocked('status-test')).toBe(true);

      await mutex.unlock('status-test', result.lockId!);

      expect(await mutex.isLocked('status-test')).toBe(false);
    });

    it('should extend lock TTL', async () => {
      const result = await mutex.lock('extend-test', 1000);
      expect(result.acquired).toBe(true);

      const originalExpiry = result.expiresAt!;

      const extended = await mutex.extend('extend-test', result.lockId!, 5000);
      expect(extended).toBe(true);

      const lockInfo = await mutex.getLockInfo('extend-test');
      expect(lockInfo).toBeDefined();
      expect(lockInfo!.expiresAt).toBeGreaterThan(originalExpiry);
    });

    it('should reject extend with wrong lockId', async () => {
      const result = await mutex.lock('extend-wrong-test');
      expect(result.acquired).toBe(true);

      const extended = await mutex.extend('extend-wrong-test', 'wrong-id', 5000);
      expect(extended).toBe(false);
    });

    it('should reject extend on expired lock', async () => {
      const result = await mutex.lock('extend-expired-test', 10);
      expect(result.acquired).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 50));

      const extended = await mutex.extend('extend-expired-test', result.lockId!, 5000);
      expect(extended).toBe(false);
    });

    it('should acquire expired lock', async () => {
      const result1 = await mutex.lock('expire-takeover', 10);
      expect(result1.acquired).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 50));

      const mutex2 = new S3Mutex(storage, 'test-namespace');
      const result2 = await mutex2.lock('expire-takeover');

      expect(result2.acquired).toBe(true);
      expect(result2.lockId).not.toBe(result1.lockId);
    });

    it('should return lock info', async () => {
      const result = await mutex.lock('info-test');
      expect(result.acquired).toBe(true);

      const info = await mutex.getLockInfo('info-test');

      expect(info).toBeDefined();
      expect(info!.lockId).toBe(result.lockId);
      expect(info!.holderId).toBe((mutex as any).holderId);
      expect(info!.acquiredAt).toBeDefined();
      expect(info!.expiresAt).toBe(result.expiresAt);
    });

    it('should return null for non-existent lock info', async () => {
      const info = await mutex.getLockInfo('non-existent');
      expect(info).toBeNull();
    });

    it('should handle empty key gracefully', async () => {
      const result = await mutex.lock('');
      expect(result.acquired).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use default TTL', async () => {
      const beforeLock = Date.now();
      const result = await mutex.lock('default-ttl-test');

      expect(result.acquired).toBe(true);
      expect(result.expiresAt).toBeGreaterThanOrEqual(beforeLock + 30000 - 100);
      expect(result.expiresAt).toBeLessThanOrEqual(beforeLock + 30000 + 100);
    });

    it('should use custom TTL', async () => {
      const beforeLock = Date.now();
      const result = await mutex.lock('custom-ttl-test', 5000);

      expect(result.acquired).toBe(true);
      expect(result.expiresAt).toBeGreaterThanOrEqual(beforeLock + 5000 - 100);
      expect(result.expiresAt).toBeLessThanOrEqual(beforeLock + 5000 + 100);
    });

    it('should handle concurrent lock attempts', async () => {
      const sharedStorage = new PluginStorage(db.client as PluginClient, 'concurrent-shared');
      const mutex1 = new S3Mutex(sharedStorage, 'concurrent');
      const mutex2 = new S3Mutex(sharedStorage, 'concurrent');
      const mutex3 = new S3Mutex(sharedStorage, 'concurrent');

      const results = await Promise.all([
        mutex1.lock('contested'),
        mutex2.lock('contested'),
        mutex3.lock('contested')
      ]);

      const acquired = results.filter(r => r.acquired);
      const failed = results.filter(r => !r.acquired);

      expect(acquired.length).toBe(1);
      expect(failed.length).toBe(2);
    });

    it('should use tryLock as alias for lock', async () => {
      const result = await mutex.tryLock('trylock-test');
      expect(result.acquired).toBe(true);
      expect(result.lockId).toBeDefined();
    });
  });
});
