/**
 * S3DB Error Classes
 *
 * Typed error hierarchy for s3db.js operations.
 */
import type { StringRecord } from './types/common.types.js';
/** Base error context for all S3DB errors */
export interface BaseErrorContext {
    verbose?: boolean;
    bucket?: string;
    key?: string;
    message?: string;
    code?: string;
    statusCode?: number;
    requestId?: string;
    awsMessage?: string;
    original?: Error | unknown;
    commandName?: string;
    commandInput?: unknown;
    metadata?: StringRecord;
    description?: string;
    suggestion?: string;
    retriable?: boolean;
    docs?: string;
    title?: string;
    hint?: string;
    [key: string]: unknown;
}
/** Serialized error format */
export interface SerializedError {
    name: string;
    message: string;
    code?: string;
    statusCode?: number;
    requestId?: string;
    awsMessage?: string;
    bucket?: string;
    key?: string;
    thrownAt?: Date;
    retriable?: boolean;
    suggestion?: string;
    docs?: string;
    title?: string;
    hint?: string;
    commandName?: string;
    commandInput?: unknown;
    metadata?: StringRecord;
    description?: string;
    data?: StringRecord;
    original?: unknown;
    stack?: string;
}
export declare class BaseError extends Error {
    bucket?: string;
    key?: string;
    thrownAt: Date;
    code?: string;
    statusCode: number;
    requestId?: string;
    awsMessage?: string;
    original?: Error | unknown;
    commandName?: string;
    commandInput?: unknown;
    metadata?: StringRecord;
    description?: string;
    suggestion?: string;
    retriable: boolean;
    docs?: string;
    title: string;
    hint?: string;
    data: StringRecord;
    constructor(context: BaseErrorContext);
    toJSON(): SerializedError;
    toString(): string;
}
/** AWS Error with $metadata */
interface AwsErrorLike {
    code?: string;
    Code?: string;
    name?: string;
    message?: string;
    statusCode?: number;
    requestId?: string;
    stack?: string;
    $metadata?: {
        httpStatusCode?: number;
        requestId?: string;
        [key: string]: unknown;
    };
}
/** S3DB Error details */
export interface S3dbErrorDetails {
    bucket?: string;
    key?: string;
    original?: AwsErrorLike | Error | unknown;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    description?: string;
    [key: string]: unknown;
}
export declare class S3dbError extends BaseError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export declare class DatabaseError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export declare class ValidationError extends S3dbError {
    field?: string;
    value?: unknown;
    constraint?: string;
    constructor(message: string, details?: S3dbErrorDetails & {
        field?: string;
        value?: unknown;
        constraint?: string;
    });
}
export declare class AuthenticationError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export declare class PermissionError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export declare class EncryptionError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export interface ResourceNotFoundDetails extends S3dbErrorDetails {
    bucket: string;
    resourceName: string;
    id: string;
}
export declare class ResourceNotFound extends S3dbError {
    resourceName: string;
    id: string;
    constructor(details: ResourceNotFoundDetails);
}
export interface NoSuchBucketDetails extends S3dbErrorDetails {
    bucket: string;
}
export declare class NoSuchBucket extends S3dbError {
    constructor(details: NoSuchBucketDetails);
}
export interface NoSuchKeyDetails extends S3dbErrorDetails {
    bucket: string;
    key: string;
    resourceName?: string;
    id?: string;
}
export declare class NoSuchKey extends S3dbError {
    resourceName?: string;
    id?: string;
    constructor(details: NoSuchKeyDetails);
}
export declare class NotFound extends S3dbError {
    resourceName?: string;
    id?: string;
    constructor(details: NoSuchKeyDetails);
}
export declare class MissingMetadata extends S3dbError {
    constructor(details: NoSuchBucketDetails);
}
export interface InvalidResourceItemDetails extends S3dbErrorDetails {
    bucket: string;
    resourceName: string;
    attributes?: unknown;
    validation?: unknown;
    message?: string;
}
export declare class InvalidResourceItem extends S3dbError {
    constructor(details: InvalidResourceItemDetails);
}
export declare class UnknownError extends S3dbError {
}
export declare const ErrorMap: {
    readonly NotFound: typeof NotFound;
    readonly NoSuchKey: typeof NoSuchKey;
    readonly UnknownError: typeof UnknownError;
    readonly NoSuchBucket: typeof NoSuchBucket;
    readonly MissingMetadata: typeof MissingMetadata;
    readonly InvalidResourceItem: typeof InvalidResourceItem;
};
export interface MapAwsErrorContext {
    bucket?: string;
    key?: string;
    resourceName?: string;
    id?: string;
    operation?: string;
    commandName?: string;
    commandInput?: unknown;
    retriable?: boolean;
}
export declare function mapAwsError(err: AwsErrorLike | Error, context?: MapAwsErrorContext): S3dbError;
export declare class ConnectionStringError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export declare class CryptoError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export declare class SchemaError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export declare class ResourceError extends S3dbError {
    constructor(message: string, details?: S3dbErrorDetails);
}
export interface PartitionErrorDetails extends S3dbErrorDetails {
    resourceName?: string;
    partitionName?: string;
    fieldName?: string;
    availableFields?: string[];
    strictValidation?: boolean;
}
export declare class PartitionError extends S3dbError {
    constructor(message: string, details?: PartitionErrorDetails);
}
export interface PluginErrorDetails extends S3dbErrorDetails {
    pluginName?: string;
    operation?: string;
}
export declare class PluginError extends S3dbError {
    pluginName: string;
    operation: string;
    constructor(message: string, details?: PluginErrorDetails);
}
export interface PluginStorageErrorDetails extends S3dbErrorDetails {
    pluginSlug?: string;
    key?: string;
    operation?: string;
}
export declare class PluginStorageError extends S3dbError {
    constructor(message: string, details?: PluginStorageErrorDetails);
}
export interface PartitionDriverErrorDetails extends S3dbErrorDetails {
    driver?: string;
    operation?: string;
    queueSize?: number;
    maxQueueSize?: number;
}
export declare class PartitionDriverError extends S3dbError {
    constructor(message: string, details?: PartitionDriverErrorDetails);
}
export interface BehaviorErrorDetails extends S3dbErrorDetails {
    behavior?: string;
    availableBehaviors?: string[];
}
export declare class BehaviorError extends S3dbError {
    constructor(message: string, details?: BehaviorErrorDetails);
}
export interface StreamErrorDetails extends S3dbErrorDetails {
    operation?: string;
    resource?: string;
}
export declare class StreamError extends S3dbError {
    constructor(message: string, details?: StreamErrorDetails);
}
export interface MetadataLimitErrorDetails extends S3dbErrorDetails {
    totalSize?: number;
    effectiveLimit?: number;
    absoluteLimit?: number;
    excess?: number;
    resourceName?: string;
    operation?: string;
}
export declare class MetadataLimitError extends S3dbError {
    constructor(message: string, details?: MetadataLimitErrorDetails);
}
export interface AnalyticsNotEnabledErrorDetails extends S3dbErrorDetails {
    pluginName?: string;
    resourceName?: string;
    field?: string;
    configuredResources?: string[];
    registeredResources?: string[];
    pluginInitialized?: boolean;
}
export declare class AnalyticsNotEnabledError extends S3dbError {
    constructor(details?: AnalyticsNotEnabledErrorDetails);
}
export {};
//# sourceMappingURL=errors.d.ts.map