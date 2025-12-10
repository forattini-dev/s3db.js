import type { BehaviorHandleInsertParams, BehaviorHandleUpdateParams, BehaviorHandleUpsertParams, BehaviorHandleGetParams, BehaviorResult, BehaviorGetResult } from './types.js';
export declare const S3_METADATA_LIMIT_BYTES = 2047;
export declare function handleInsert({ resource, data, mappedData }: BehaviorHandleInsertParams): Promise<BehaviorResult>;
export declare function handleUpdate({ resource, id, mappedData }: BehaviorHandleUpdateParams): Promise<BehaviorResult>;
export declare function handleUpsert({ resource, id, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult>;
export declare function handleGet({ metadata, body }: BehaviorHandleGetParams): Promise<BehaviorGetResult>;
//# sourceMappingURL=enforce-limits.d.ts.map