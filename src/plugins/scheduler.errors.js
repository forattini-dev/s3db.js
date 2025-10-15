import { S3dbError } from '../errors.js';

/**
 * SchedulerError - Errors related to scheduler operations
 *
 * Used for scheduled task operations including:
 * - Task creation and scheduling
 * - Cron expression validation
 * - Task execution and retries
 * - Job queue management
 * - Scheduler lifecycle management
 *
 * @extends S3dbError
 */
export class SchedulerError extends S3dbError {
  constructor(message, details = {}) {
    const { taskId, operation = 'unknown', cronExpression, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Scheduler Operation Error

Operation: ${operation}
${taskId ? `Task ID: ${taskId}` : ''}
${cronExpression ? `Cron: ${cronExpression}` : ''}

Common causes:
1. Invalid cron expression format
2. Task not found or already exists
3. Scheduler not properly initialized
4. Job execution failure
5. Resource conflicts

Solution:
Check task configuration and ensure scheduler is properly initialized.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/scheduler.md
`.trim();
    }

    super(message, { ...rest, taskId, operation, cronExpression, description,
      suggestion: details.suggestion || 'Check scheduler configuration and task settings.' });
  }
}

export default SchedulerError;
