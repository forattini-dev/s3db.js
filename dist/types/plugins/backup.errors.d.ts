import { S3dbError } from '../errors.js';
export interface BackupErrorDetails {
    driver?: string;
    operation?: string;
    backupId?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class BackupError extends S3dbError {
    constructor(message: string, details?: BackupErrorDetails);
}
export default BackupError;
//# sourceMappingURL=backup.errors.d.ts.map