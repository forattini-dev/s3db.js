import { PluginError } from '../../errors.js';
export interface TfStateErrorContext {
    pluginName?: string;
    operation?: string;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    [key: string]: any;
}
/**
 * Base error for all Terraform/OpenTofu state operations
 */
export declare class TfStateError extends PluginError {
    context: TfStateErrorContext;
    constructor(message: string, context?: TfStateErrorContext);
}
/**
 * Thrown when state file is invalid or corrupted
 */
export declare class InvalidStateFileError extends TfStateError {
    filePath: string;
    reason: string;
    constructor(filePath: string, reason: string, context?: TfStateErrorContext);
}
/**
 * Thrown when state file version is not supported
 */
export declare class UnsupportedStateVersionError extends TfStateError {
    version: number;
    supportedVersions: number[];
    constructor(version: number, supportedVersions: number[], context?: TfStateErrorContext);
}
/**
 * Thrown when state file cannot be read
 */
export declare class StateFileNotFoundError extends TfStateError {
    filePath: string;
    constructor(filePath: string, context?: TfStateErrorContext);
}
/**
 * Thrown when resource extraction fails
 */
export declare class ResourceExtractionError extends TfStateError {
    resourceAddress: string;
    originalError: Error;
    constructor(resourceAddress: string, originalError: Error, context?: TfStateErrorContext);
}
/**
 * Thrown when state diff calculation fails
 */
export declare class StateDiffError extends TfStateError {
    oldSerial: number;
    newSerial: number;
    originalError: Error;
    constructor(oldSerial: number, newSerial: number, originalError: Error, context?: TfStateErrorContext);
}
/**
 * Thrown when file watching setup fails
 */
export declare class FileWatchError extends TfStateError {
    path: string;
    originalError: Error;
    constructor(path: string, originalError: Error, context?: TfStateErrorContext);
}
/**
 * Thrown when resource filtering fails
 */
export declare class ResourceFilterError extends TfStateError {
    filterExpression: string;
    originalError: Error;
    constructor(filterExpression: string, originalError: Error, context?: TfStateErrorContext);
}
//# sourceMappingURL=errors.d.ts.map