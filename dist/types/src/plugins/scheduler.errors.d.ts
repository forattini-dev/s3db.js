import { S3dbError } from '../errors.js';
export interface SchedulerErrorDetails {
    taskId?: string;
    operation?: string;
    cronExpression?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class SchedulerError extends S3dbError {
    constructor(message: string, details?: SchedulerErrorDetails);
}
export default SchedulerError;
//# sourceMappingURL=scheduler.errors.d.ts.map