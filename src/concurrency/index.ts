export { TaskExecutor } from './task-executor.interface.js';

export type {
  TaskFunction,
  EnqueueOptions,
  ProcessOptions,
  ProcessResult,
  ExecutorStats
} from './task-executor.interface.js';

export { ThreadPool } from './thread-pool.js';
export type { DistanceMetric, CompressionTaskOptions } from './thread-pool.js';
