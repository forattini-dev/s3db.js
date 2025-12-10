import { S3dbError } from '../errors.js';
export interface CacheErrorDetails {
    driver?: string;
    operation?: string;
    resourceName?: string;
    key?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class CacheError extends S3dbError {
    constructor(message: string, details?: CacheErrorDetails);
}
export default CacheError;
//# sourceMappingURL=cache.errors.d.ts.map