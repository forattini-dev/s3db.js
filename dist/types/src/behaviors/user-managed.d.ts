import type { BehaviorHandleInsertParams, BehaviorHandleUpdateParams, BehaviorHandleUpsertParams, BehaviorHandleGetParams, BehaviorResult, BehaviorGetResult } from './types.js';
export declare function handleInsert({ resource, data, mappedData, originalData }: BehaviorHandleInsertParams): Promise<BehaviorResult>;
export declare function handleUpdate({ resource, id, data, mappedData, originalData }: BehaviorHandleUpdateParams): Promise<BehaviorResult>;
export declare function handleUpsert({ resource, id, data, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult>;
export declare function handleGet({ metadata, body }: BehaviorHandleGetParams): Promise<BehaviorGetResult>;
//# sourceMappingURL=user-managed.d.ts.map