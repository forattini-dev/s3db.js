export interface TaskMetadata {
    signature?: string;
    item?: unknown;
    items?: unknown;
    payload?: unknown;
    body?: unknown;
    data?: unknown;
    value?: unknown;
    itemLength?: number;
    length?: number;
    size?: number;
    [key: string]: unknown;
}
export declare function extractLengthHint(item: unknown): number | undefined;
export declare function deriveSignature(fn: unknown, metadata?: TaskMetadata, signatureOverride?: string, priority?: number): string;
//# sourceMappingURL=task-signature.d.ts.map