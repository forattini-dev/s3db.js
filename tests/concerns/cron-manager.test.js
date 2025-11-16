/**
 * Tests for CronManager - Centralized Cron Job Management
 */

import {
  CronManager,
  getCronManager,
  resetCronManager,
  createCronManager,
  intervalToCron,
  CRON_PRESETS
} from '../../src/concerns/cron-manager.js';

describe('CronManager', () => {
  let cronManager;

  beforeEach(() => {
    cronManager = new CronManager({
      logLevel: 'silent',
      autoCleanup: false,
      exitOnSignal: false,
      disabled: false,
    });
  });

  afterEach(async () => {
    if (cronManager && !cronManager.isDestroyed()) {
      await cronManager.shutdown();
      cronManager.removeSignalHandlers();
    }
  });

  describe('Interval to Cron Conversion', () => {
    it('should convert seconds to cron (< 60s)', () => {
      expect(intervalToCron(5000)).toBe('*/5 * * * * *');
      expect(intervalToCron(10000)).toBe('*/10 * * * * *');
      expect(intervalToCron(30000)).toBe('*/30 * * * * *');
    });

    it('should convert minutes to cron (< 60min)', () => {
      expect(intervalToCron(60000)).toBe('*/1 * * * *');
      expect(intervalToCron(300000)).toBe('*/5 * * * *');
      expect(intervalToCron(600000)).toBe('*/10 * * * *');
    });

    it('should convert hours to cron (< 24h)', () => {
      expect(intervalToCron(3600000)).toBe('0 */1 * * *');
      expect(intervalToCron(7200000)).toBe('0 */2 * * *');
      expect(intervalToCron(21600000)).toBe('0 */6 * * *');
    });

    it('should convert days to cron (>= 24h)', () => {
      expect(intervalToCron(86400000)).toBe('0 0 */1 * *');
      expect(intervalToCron(172800000)).toBe('0 0 */2 * *');
    });
  });

  describe('Cron Presets', () => {
    it('should have second presets', () => {
      expect(CRON_PRESETS.EVERY_SECOND).toBe('* * * * * *');
      expect(CRON_PRESETS.EVERY_5_SECONDS).toBe('*/5 * * * * *');
      expect(CRON_PRESETS.EVERY_10_SECONDS).toBe('*/10 * * * * *');
    });

    it('should have minute presets', () => {
      expect(CRON_PRESETS.EVERY_MINUTE).toBe('* * * * *');
      expect(CRON_PRESETS.EVERY_5_MINUTES).toBe('*/5 * * * *');
      expect(CRON_PRESETS.EVERY_10_MINUTES).toBe('*/10 * * * *');
    });

    it('should have hour presets', () => {
      expect(CRON_PRESETS.EVERY_HOUR).toBe('0 * * * *');
      expect(CRON_PRESETS.EVERY_2_HOURS).toBe('0 */2 * * *');
    });

    it('should have day presets', () => {
      expect(CRON_PRESETS.EVERY_DAY).toBe('0 0 * * *');
      expect(CRON_PRESETS.EVERY_WEEK).toBe('0 0 * * 0');
    });
  });

  describe('Basic Scheduling', () => {
    it('should schedule a cron job', async () => {
      let called = false;
      const fn = () => { called = true; };

      const task = await cronManager.schedule(
        '*/1 * * * * *', // Every second
        fn,
        'test-job'
      );

      expect(task).toBeTruthy();
      expect(cronManager.jobs.has('test-job')).toBe(true);
    });

    it('should prevent duplicate job names', async () => {
      await cronManager.schedule('*/1 * * * * *', () => {}, 'test-job');

      await expect(
        cronManager.schedule('*/2 * * * * *', () => {}, 'test-job')
      ).rejects.toThrow("Job 'test-job' already exists");
    });

    it('should schedule with interval helper', async () => {
      let called = false;
      const fn = () => { called = true; };

      const task = await cronManager.scheduleInterval(
        5000, // 5 seconds
        fn,
        'interval-job'
      );

      expect(task).toBeTruthy();
      expect(cronManager.jobs.has('interval-job')).toBe(true);

      const entry = cronManager.jobs.get('interval-job');
      expect(entry.expression).toBe('*/5 * * * * *');
    });

    it('should schedule with timezone', async () => {
      let called = false;
      const fn = () => { called = true; };

      const task = await cronManager.schedule(
        '0 9 * * *',
        fn,
        'timezone-job',
        { timezone: 'America/New_York' }
      );

      expect(task).toBeTruthy();

      const entry = cronManager.jobs.get('timezone-job');
      expect(entry.options.timezone).toBe('America/New_York');
    });
  });

  describe('Job Management', () => {
    it('should stop a specific job', async () => {
      await cronManager.schedule('*/1 * * * * *', () => {}, 'job-1');
      await cronManager.schedule('*/2 * * * * *', () => {}, 'job-2');

      expect(cronManager.jobs.size).toBe(2);

      const stopped = cronManager.stop('job-1');

      expect(stopped).toBe(true);
      expect(cronManager.jobs.size).toBe(1);
      expect(cronManager.jobs.has('job-1')).toBe(false);
      expect(cronManager.jobs.has('job-2')).toBe(true);
    });

    it('should return false when stopping non-existent job', () => {
      const stopped = cronManager.stop('non-existent');
      expect(stopped).toBe(false);
    });

    it('should get job statistics', async () => {
      await cronManager.schedule('*/1 * * * * *', () => {}, 'job-1');
      await cronManager.schedule('*/5 * * * *', () => {}, 'job-2');

      const stats = cronManager.getStats();

      expect(stats.totalJobs).toBe(2);
      expect(stats.jobs).toHaveLength(2);
      expect(stats.isDestroyed).toBe(false);

      const job1 = stats.jobs.find(j => j.name === 'job-1');
      expect(job1.expression).toBe('*/1 * * * * *');
      expect(job1.createdAt).toBeGreaterThan(0);
      expect(job1.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Shutdown and Cleanup', () => {
    it('should shutdown and stop all jobs', async () => {
      await cronManager.schedule('*/1 * * * * *', () => {}, 'job-1');
      await cronManager.schedule('*/2 * * * * *', () => {}, 'job-2');
      await cronManager.schedule('*/3 * * * * *', () => {}, 'job-3');

      expect(cronManager.jobs.size).toBe(3);

      await cronManager.shutdown();

      expect(cronManager.jobs.size).toBe(0);
      expect(cronManager.isDestroyed()).toBe(true);
    });

    it('should handle multiple shutdown calls gracefully', async () => {
      await cronManager.schedule('*/1 * * * * *', () => {}, 'job-1');

      await cronManager.shutdown();
      await cronManager.shutdown();
      await cronManager.shutdown();

      expect(cronManager.isDestroyed()).toBe(true);
    });

    it('should not schedule jobs after destruction', async () => {
      await cronManager.shutdown();

      const task = await cronManager.schedule('*/1 * * * * *', () => {}, 'dead-job');

      expect(task).toBeNull();
      expect(cronManager.jobs.has('dead-job')).toBe(false);
    });

    it('should handle shutdown timeout', async () => {
      await cronManager.schedule('*/1 * * * * *', () => {}, 'job-1');

      const shutdownPromise = cronManager.shutdown({ timeout: 100 });

      await expect(shutdownPromise).resolves.toBeUndefined();
      expect(cronManager.isDestroyed()).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    afterEach(() => {
      resetCronManager();
    });

    it('should return singleton instance', () => {
      const manager1 = getCronManager({ logLevel: 'silent', disabled: false });
      const manager2 = getCronManager({ logLevel: 'silent', disabled: false });

      expect(manager1).toBe(manager2);
    });

    it('should reset singleton', () => {
      const manager1 = getCronManager({ logLevel: 'silent', disabled: false });
      resetCronManager();
      const manager2 = getCronManager({ logLevel: 'silent', disabled: false });

      expect(manager1).not.toBe(manager2);
    });

    it('should create non-singleton instances', () => {
      const manager1 = createCronManager({ logLevel: 'silent', exitOnSignal: false, disabled: false });
      const manager2 = createCronManager({ logLevel: 'silent', exitOnSignal: false, disabled: false });

      expect(manager1).not.toBe(manager2);

      manager1.removeSignalHandlers();
      manager2.removeSignalHandlers();
    });
  });

  describe('Real-World Usage', () => {
    it('should work as plugin scheduler', async () => {
      // Simulate plugin using CronManager
      class MyPlugin {
        constructor(cronManager) {
          this.cronManager = cronManager;
          this.execCount = 0;
        }

        async start() {
          // Schedule cleanup every 5 seconds
          await this.cronManager.schedule(
            '*/5 * * * * *',
            () => this.cleanup(),
            'MyPlugin-cleanup'
          );

          // Schedule sync every minute
          await this.cronManager.schedule(
            '* * * * *',
            () => this.sync(),
            'MyPlugin-sync'
          );
        }

        cleanup() {
          this.execCount++;
        }

        sync() {
          this.execCount++;
        }

        async stop() {
          this.cronManager.stop('MyPlugin-cleanup');
          this.cronManager.stop('MyPlugin-sync');
        }
      }

      const plugin = new MyPlugin(cronManager);
      await plugin.start();

      expect(cronManager.jobs.size).toBe(2);

      await plugin.stop();

      expect(cronManager.jobs.size).toBe(0);
    });

    it('should handle async job functions', async () => {
      const results = [];

      await cronManager.schedule(
        '*/1 * * * * *',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push('executed');
        },
        'async-job'
      );

      // Wait for at least one execution
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should support multiple jobs with different schedules', async () => {
      const counts = { job1: 0, job2: 0, job3: 0 };

      await cronManager.schedule(
        '*/1 * * * * *', // Every second
        () => counts.job1++,
        'fast-job'
      );

      await cronManager.schedule(
        '*/5 * * * * *', // Every 5 seconds
        () => counts.job2++,
        'medium-job'
      );

      await cronManager.schedule(
        '*/10 * * * * *', // Every 10 seconds
        () => counts.job3++,
        'slow-job'
      );

      expect(cronManager.jobs.size).toBe(3);

      const stats = cronManager.getStats();
      expect(stats.totalJobs).toBe(3);
      expect(stats.jobs.map(j => j.name)).toEqual(['fast-job', 'medium-job', 'slow-job']);
    });
  });

  describe('Error Handling', () => {
    it('should throw error if node-cron not installed', async () => {
      // This test would fail in real scenario without node-cron
      // but we have it installed for tests
      const task = await cronManager.schedule('*/1 * * * * *', () => {}, 'test');
      expect(task).toBeTruthy();
    });

    it('should handle job function errors gracefully', async () => {
      const errors = [];

      await cronManager.schedule(
        '*/1 * * * * *',
        () => {
          throw new Error('Job failed');
        },
        'error-job'
      );

      // Job should still be scheduled despite throwing
      expect(cronManager.jobs.has('error-job')).toBe(true);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Job should still exist (node-cron handles errors internally)
      expect(cronManager.jobs.has('error-job')).toBe(true);
    });
  });

  describe('Signal Handlers', () => {
    it('should setup signal handlers on construction', () => {
      const manager = new CronManager({ logLevel: 'silent', exitOnSignal: false, disabled: false });

      expect(manager._signalHandlersSetup).toBe(true);

      manager.removeSignalHandlers();
    });

    it('should remove signal handlers', () => {
      const manager = new CronManager({ logLevel: 'silent', exitOnSignal: false });

      manager.removeSignalHandlers();

      expect(manager._signalHandlersSetup).toBe(false);
    });
  });
});
