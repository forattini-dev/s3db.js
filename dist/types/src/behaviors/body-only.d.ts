import type { BehaviorHandleInsertParams, BehaviorHandleUpdateParams, BehaviorHandleUpsertParams, BehaviorHandleGetParams, BehaviorResult, BehaviorGetResult } from './types.js';
export declare function handleInsert({ resource, mappedData }: BehaviorHandleInsertParams): Promise<BehaviorResult>;
export declare function handleUpdate({ resource, mappedData }: BehaviorHandleUpdateParams): Promise<BehaviorResult>;
export declare function handleUpsert({ resource, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult>;
export declare function handleGet({ metadata, body }: BehaviorHandleGetParams): Promise<BehaviorGetResult>;
//# sourceMappingURL=body-only.d.ts.map