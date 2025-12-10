import { S3dbError } from '../errors.js';
export interface QueueErrorDetails {
    queueName?: string;
    operation?: string;
    messageId?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class QueueError extends S3dbError {
    constructor(message: string, details?: QueueErrorDetails);
}
export default QueueError;
//# sourceMappingURL=queue.errors.d.ts.map