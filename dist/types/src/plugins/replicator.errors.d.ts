import { S3dbError } from '../errors.js';
export interface ReplicationErrorDetails {
    replicatorClass?: string;
    operation?: string;
    resourceName?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class ReplicationError extends S3dbError {
    constructor(message: string, details?: ReplicationErrorDetails);
}
export default ReplicationError;
//# sourceMappingURL=replicator.errors.d.ts.map