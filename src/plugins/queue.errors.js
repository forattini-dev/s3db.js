import { S3dbError } from '../errors.js';

/**
 * QueueError - Errors related to queue operations
 *
 * Used for queue operations including:
 * - Message enqueueing and dequeueing
 * - Queue consumer registration
 * - Message processing
 * - Dead letter queue handling
 * - Queue configuration and management
 *
 * @extends S3dbError
 */
export class QueueError extends S3dbError {
  constructor(message, details = {}) {
    const { queueName, operation = 'unknown', messageId, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Queue Operation Error

Operation: ${operation}
${queueName ? `Queue: ${queueName}` : ''}
${messageId ? `Message ID: ${messageId}` : ''}

Common causes:
1. Queue not properly configured
2. Message handler not registered
3. Queue resource not found
4. SQS/RabbitMQ connection failed
5. Message processing timeout

Solution:
Check queue configuration and message handler registration.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/queue.md
`.trim();
    }

    super(message, { ...rest, queueName, operation, messageId, description });
  }
}

export default QueueError;
