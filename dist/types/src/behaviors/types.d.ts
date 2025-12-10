import type { StringRecord } from '../types/common.types.js';
export interface SchemaInfo {
    map?: StringRecord;
    pluginMap?: StringRecord;
}
export interface ResourceConfig {
    timestamps?: boolean;
}
export interface Resource {
    name: string;
    version: string;
    config: ResourceConfig;
    schema?: SchemaInfo;
    emit(event: string, payload: unknown): void;
}
export interface BehaviorHandleInsertParams {
    resource: Resource;
    data: StringRecord;
    mappedData: StringRecord<string>;
    originalData?: StringRecord;
}
export interface BehaviorHandleUpdateParams {
    resource: Resource;
    id: string;
    data: StringRecord;
    mappedData: StringRecord<string>;
    originalData?: StringRecord;
}
export interface BehaviorHandleUpsertParams {
    resource: Resource;
    id: string;
    data: StringRecord;
    mappedData: StringRecord<string>;
}
export interface BehaviorHandleGetParams {
    resource: Resource;
    metadata: StringRecord<string>;
    body: string;
}
export interface BehaviorResult {
    mappedData: StringRecord<string>;
    body: string;
}
export interface BehaviorGetResult {
    metadata: StringRecord<string>;
    body: string;
}
export interface Behavior {
    handleInsert(params: BehaviorHandleInsertParams): Promise<BehaviorResult>;
    handleUpdate(params: BehaviorHandleUpdateParams): Promise<BehaviorResult>;
    handleUpsert?(params: BehaviorHandleUpsertParams): Promise<BehaviorResult>;
    handleGet(params: BehaviorHandleGetParams): Promise<BehaviorGetResult>;
}
export type BehaviorName = 'user-managed' | 'enforce-limits' | 'truncate-data' | 'body-overflow' | 'body-only';
export type BehaviorType = BehaviorName;
//# sourceMappingURL=types.d.ts.map