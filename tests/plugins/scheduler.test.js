import { SchedulerPlugin } from '../../src/plugins/scheduler.plugin.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("SchedulerPlugin", () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/scheduler-test');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe("Plugin Setup", () => {
    it("should create lock resource during setup", async () => {
      let executionCount = 0;

      const plugin = new SchedulerPlugin({
        jobs: {
          test_job: {
            schedule: '@hourly',
            action: async () => {
              executionCount++;
              return { success: true };
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Verify lock resource was created
      expect(database.resources.plg_scheduler_job_locks).toBeDefined();

      await plugin.cleanup();
    });

    it("should create job history resource when persistJobs is true", async () => {
      const plugin = new SchedulerPlugin({
        persistJobs: true,
        jobs: {
          test_job: {
            schedule: '@hourly',
            action: async () => ({ success: true })
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      expect(database.resources.plg_job_executions).toBeDefined();

      await plugin.cleanup();
    });

    it("should throw error when no jobs are defined", async () => {
      expect(() => {
        new SchedulerPlugin({
          jobs: {}
        });
      }).toThrow('At least one job must be defined');
    });

    it("should validate job configuration", async () => {
      expect(() => {
        new SchedulerPlugin({
          jobs: {
            invalid_job: {
              // Missing schedule and action
              description: 'Invalid job'
            }
          }
        });
      }).toThrow();
    });
  });

  describe("Job Execution", () => {
    it("should execute job manually with runJob()", async () => {
      let executionCount = 0;
      let lastContext = null;

      const plugin = new SchedulerPlugin({
        jobs: {
          manual_job: {
            schedule: '@hourly',
            action: async (database, context) => {
              executionCount++;
              lastContext = context;
              return { result: 'success', count: executionCount };
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Manually trigger job
      await plugin.runJob('manual_job');

      expect(executionCount).toBe(1);
      expect(lastContext).toBeDefined();
      expect(lastContext.jobName).toBe('manual_job');
      expect(lastContext.executionId).toContain('manual_job');

      await plugin.cleanup();
    });

    it("should prevent concurrent manual execution of the same job", async () => {
      let executionCount = 0;

      const plugin = new SchedulerPlugin({
        jobs: {
          slow_job: {
            schedule: '@hourly',
            action: async () => {
              executionCount++;
              await sleep(200); // Simulate slow job
              return { success: true };
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Try to run same job concurrently
      const promise1 = plugin.runJob('slow_job');

      // Wait a bit to ensure first job started
      await sleep(50);

      // Second call should throw because job is already running
      await expect(plugin.runJob('slow_job')).rejects.toThrow('already running');

      await promise1;
      expect(executionCount).toBe(1);

      await plugin.cleanup();
    });

    it("should handle job errors and retries", async () => {
      let attemptCount = 0;

      const plugin = new SchedulerPlugin({
        jobs: {
          failing_job: {
            schedule: '@hourly',
            retries: 2, // Will attempt 3 times total (1 initial + 2 retries)
            action: async () => {
              attemptCount++;
              if (attemptCount < 3) {
                throw new Error('Job failed');
              }
              return { success: true, attempts: attemptCount };
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Run job - should retry and eventually succeed
      await plugin.runJob('failing_job');

      expect(attemptCount).toBe(3); // Initial + 2 retries

      // Check statistics
      const status = plugin.getJobStatus('failing_job');
      expect(status.statistics.totalRuns).toBe(1);
      expect(status.statistics.totalSuccesses).toBe(1);

      await plugin.cleanup();
    });

    it("should fail after max retries", async () => {
      let attemptCount = 0;

      const plugin = new SchedulerPlugin({
        jobs: {
          always_failing_job: {
            schedule: '@hourly',
            retries: 2,
            action: async () => {
              attemptCount++;
              throw new Error('Always fails');
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Run job - should fail after retries
      await expect(plugin.runJob('always_failing_job')).rejects.toThrow('Always fails');

      expect(attemptCount).toBe(3); // Initial + 2 retries

      // Check statistics
      const status = plugin.getJobStatus('always_failing_job');
      expect(status.statistics.totalErrors).toBe(1);

      await plugin.cleanup();
    });
  });

  describe("Job Management", () => {
    it("should enable and disable jobs", async () => {
      let executionCount = 0;

      const plugin = new SchedulerPlugin({
        jobs: {
          toggleable_job: {
            schedule: '@hourly',
            enabled: true,
            action: async () => {
              executionCount++;
              return { success: true };
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Disable job
      plugin.disableJob('toggleable_job');

      const status1 = plugin.getJobStatus('toggleable_job');
      expect(status1.enabled).toBe(false);

      // Enable job
      plugin.enableJob('toggleable_job');

      const status2 = plugin.getJobStatus('toggleable_job');
      expect(status2.enabled).toBe(true);

      await plugin.cleanup();
    });

    it("should get job status", async () => {
      const plugin = new SchedulerPlugin({
        jobs: {
          status_job: {
            schedule: '@hourly',
            description: 'Test job for status',
            action: async () => ({ success: true })
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const status = plugin.getJobStatus('status_job');

      expect(status).toBeDefined();
      expect(status.name).toBe('status_job');
      expect(status.description).toBe('Test job for status');
      expect(status.schedule).toBe('@hourly');
      expect(status.enabled).toBe(true);
      expect(status.statistics).toBeDefined();
      expect(status.statistics.totalRuns).toBe(0);

      await plugin.cleanup();
    });

    it("should get all jobs status", async () => {
      const plugin = new SchedulerPlugin({
        jobs: {
          job1: {
            schedule: '@hourly',
            action: async () => ({ success: true })
          },
          job2: {
            schedule: '@daily',
            action: async () => ({ success: true })
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const allStatus = plugin.getAllJobsStatus();

      expect(allStatus).toHaveLength(2);
      expect(allStatus[0].name).toBe('job1');
      expect(allStatus[1].name).toBe('job2');

      await plugin.cleanup();
    });

    it("should add job at runtime", async () => {
      const plugin = new SchedulerPlugin({
        jobs: {
          initial_job: {
            schedule: '@hourly',
            action: async () => ({ success: true })
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Add new job
      let executionCount = 0;
      plugin.addJob('runtime_job', {
        schedule: '@daily',
        action: async () => {
          executionCount++;
          return { success: true };
        }
      });

      const allJobs = plugin.getAllJobsStatus();
      expect(allJobs).toHaveLength(2);

      // Verify new job can be executed
      await plugin.runJob('runtime_job');
      expect(executionCount).toBe(1);

      await plugin.cleanup();
    });

    it("should remove job", async () => {
      const plugin = new SchedulerPlugin({
        jobs: {
          removable_job: {
            schedule: '@hourly',
            action: async () => ({ success: true })
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      plugin.removeJob('removable_job');

      const allJobs = plugin.getAllJobsStatus();
      expect(allJobs).toHaveLength(0);

      // Trying to run removed job should fail
      await expect(plugin.runJob('removable_job')).rejects.toThrow('not found');

      await plugin.cleanup();
    });
  });

  describe("Job History", () => {
    it("should persist job execution history", async () => {
      const plugin = new SchedulerPlugin({
        persistJobs: true,
        jobs: {
          history_job: {
            schedule: '@hourly',
            action: async () => ({ result: 'test data', timestamp: Date.now() })
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Execute job
      await plugin.runJob('history_job');

      // Get history
      const history = await plugin.getJobHistory('history_job');

      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('success');
      expect(history[0].result).toBeDefined();
      expect(history[0].result.result).toBe('test data');

      await plugin.cleanup();
    });

    it("should filter history by status", async () => {
      const plugin = new SchedulerPlugin({
        persistJobs: true,
        jobs: {
          multi_exec_job: {
            schedule: '@hourly',
            retries: 0,
            action: async (database, context) => {
              return { success: true, executionId: context.executionId };
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Execute job multiple times
      await plugin.runJob('multi_exec_job');
      await plugin.runJob('multi_exec_job');
      await plugin.runJob('multi_exec_job');

      // Wait for history to be persisted
      await sleep(200);

      // Get all history
      const allHistory = await plugin.getJobHistory('multi_exec_job');
      expect(allHistory.length).toBeGreaterThanOrEqual(3);

      // All should be successful
      const statuses = allHistory.map(h => h.status);
      expect(statuses.every(s => s === 'success')).toBe(true);

      // Filter by status
      const successHistory = await plugin.getJobHistory('multi_exec_job', { status: 'success' });
      expect(successHistory.length).toBeGreaterThanOrEqual(3);
      expect(successHistory[0].status).toBe('success');

      // Verify limit works
      const limitedHistory = await plugin.getJobHistory('multi_exec_job', { limit: 2 });
      expect(limitedHistory.length).toBe(2);

      await plugin.cleanup();
    });
  });

  describe("Distributed Locking", () => {
    it("should prevent concurrent execution across instances", async () => {
      let executionCount = 0;

      // Simulate two instances with the same database
      const plugin1 = new SchedulerPlugin({
        jobs: {
          distributed_job: {
            schedule: '@hourly',
            action: async () => {
              executionCount++;
              await sleep(200);
              return { instance: 1 };
            }
          }
        }
      });

      const plugin2 = new SchedulerPlugin({
        jobs: {
          distributed_job: {
            schedule: '@hourly',
            action: async () => {
              executionCount++;
              await sleep(200);
              return { instance: 2 };
            }
          }
        }
      });

      await database.usePlugin(plugin1);
      await plugin1.start();

      await database.usePlugin(plugin2);
      await plugin2.start();

      // Try to execute same job from both instances simultaneously
      const promise1 = plugin1.runJob('distributed_job');
      await sleep(50); // Ensure first one starts
      const promise2 = plugin2.runJob('distributed_job');

      await Promise.all([promise1, promise2]);

      // Only one should have executed (the other was blocked by lock)
      expect(executionCount).toBe(1);

      await plugin1.cleanup();
      await plugin2.cleanup();
    });
  });

  describe("Hooks", () => {
    it("should call onJobStart, onJobComplete, and onJobError hooks", async () => {
      const hooks = {
        starts: [],
        completes: [],
        errors: []
      };

      const plugin = new SchedulerPlugin({
        onJobStart: (jobName, context) => {
          hooks.starts.push({ jobName, executionId: context.executionId });
        },
        onJobComplete: (jobName, result, duration) => {
          hooks.completes.push({ jobName, result, duration });
        },
        onJobError: (jobName, error) => {
          hooks.errors.push({ jobName, error: error.message });
        },
        jobs: {
          success_job: {
            schedule: '@hourly',
            action: async () => ({ result: 'success' })
          },
          error_job: {
            schedule: '@hourly',
            retries: 0,
            action: async () => {
              throw new Error('Test error');
            }
          }
        }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Run successful job
      await plugin.runJob('success_job');

      expect(hooks.starts).toHaveLength(1);
      expect(hooks.completes).toHaveLength(1);
      expect(hooks.completes[0].result.result).toBe('success');

      // Run failing job
      try {
        await plugin.runJob('error_job');
      } catch (e) {
        // Expected
      }

      expect(hooks.starts).toHaveLength(2);
      expect(hooks.errors).toHaveLength(1);
      expect(hooks.errors[0].error).toBe('Test error');

      await plugin.cleanup();
    });
  });
});
