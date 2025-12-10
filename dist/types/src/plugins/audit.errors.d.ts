import { S3dbError } from '../errors.js';
export interface AuditErrorDetails {
    resourceName?: string;
    operation?: string;
    auditId?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class AuditError extends S3dbError {
    constructor(message: string, details?: AuditErrorDetails);
}
export default AuditError;
//# sourceMappingURL=audit.errors.d.ts.map