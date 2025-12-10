import { PluginError } from '../../errors.js';
export interface VectorErrorDetails {
    operation?: string;
    pluginName?: string;
    description?: string;
    availableMetrics?: string[];
    providedMetric?: string;
    resourceName?: string;
    vectorField?: string;
    [key: string]: unknown;
}
export declare class VectorError extends PluginError {
    constructor(message: string, details?: VectorErrorDetails);
}
//# sourceMappingURL=vector-error.d.ts.map