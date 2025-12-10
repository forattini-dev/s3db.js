export declare function calculateUTF8Bytes(str: unknown): number;
export declare function clearUTF8Memory(): void;
export declare function calculateAttributeNamesSize(mappedObject: Record<string, unknown>): number;
export declare function transformValue(value: unknown): string;
export declare function calculateAttributeSizes(mappedObject: Record<string, unknown>): Record<string, number>;
export declare function calculateTotalSize(mappedObject: Record<string, unknown>): number;
export interface SizeBreakdownAttribute {
    attribute: string;
    size: number;
    percentage: string;
}
export interface SizeBreakdown {
    total: number;
    valueSizes: Record<string, number>;
    namesSize: number;
    valueTotal: number;
    breakdown: SizeBreakdownAttribute[];
    detailedBreakdown: {
        values: number;
        names: number;
        total: number;
    };
}
export declare function getSizeBreakdown(mappedObject: Record<string, unknown>): SizeBreakdown;
export interface SystemOverheadConfig {
    version?: string;
    timestamps?: boolean;
    id?: string;
}
export declare function calculateSystemOverhead(config?: SystemOverheadConfig): number;
export interface EffectiveLimitConfig {
    s3Limit?: number;
    systemConfig?: SystemOverheadConfig;
}
export declare function calculateEffectiveLimit(config?: EffectiveLimitConfig): number;
//# sourceMappingURL=calculator.d.ts.map