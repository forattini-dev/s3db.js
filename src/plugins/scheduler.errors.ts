import { S3dbError } from '../errors.js';

export interface SchedulerErrorDetails {
  taskId?: string;
  operation?: string;
  cronExpression?: string;
  description?: string;
  [key: string]: unknown;
}

export class SchedulerError extends S3dbError {
  constructor(message: string, details: SchedulerErrorDetails = {}) {
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

    super(message, { ...rest, taskId, operation, cronExpression, description });
  }
}

export default SchedulerError;
