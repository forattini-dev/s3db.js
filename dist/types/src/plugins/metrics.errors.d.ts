import { S3dbError } from '../errors.js';
export interface MetricsErrorDetails {
    metricName?: string;
    operation?: string;
    resourceName?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class MetricsError extends S3dbError {
    constructor(message: string, details?: MetricsErrorDetails);
}
export default MetricsError;
//# sourceMappingURL=metrics.errors.d.ts.map