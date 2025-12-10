import { S3dbError } from '../errors.js';
export interface FulltextErrorDetails {
    resourceName?: string;
    query?: string;
    operation?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class FulltextError extends S3dbError {
    constructor(message: string, details?: FulltextErrorDetails);
}
export default FulltextError;
//# sourceMappingURL=fulltext.errors.d.ts.map