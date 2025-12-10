import type { BehaviorHandleInsertParams, BehaviorHandleUpdateParams, BehaviorHandleUpsertParams, BehaviorHandleGetParams, BehaviorResult, BehaviorGetResult } from './types.js';
export declare function handleInsert({ resource, data, mappedData }: BehaviorHandleInsertParams): Promise<BehaviorResult>;
export declare function handleUpdate({ resource, data, mappedData }: BehaviorHandleUpdateParams): Promise<BehaviorResult>;
export declare function handleUpsert({ resource, data, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult>;
export declare function handleGet({ metadata, body }: BehaviorHandleGetParams): Promise<BehaviorGetResult>;
//# sourceMappingURL=body-overflow.d.ts.map