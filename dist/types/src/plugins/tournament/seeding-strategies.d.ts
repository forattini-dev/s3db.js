export interface SeedingOptions {
    preserveSeeds?: boolean;
}
export declare function randomSeeding(participants: string[]): string[];
export declare function manualSeeding(participants: string[], seeds: string[]): string[];
export declare function snakeSeeding(participants: string[], groupCount: number): string[][];
export declare function bracketSeeding(participants: string[]): string[];
export declare function nextPowerOf2(n: number): number;
export declare function calculateByes(participantCount: number): number;
export declare function applySeeding(participants: string[], strategy: 'random' | 'manual' | 'snake' | 'bracket', options?: SeedingOptions & {
    seeds?: string[];
    groupCount?: number;
}): string[] | string[][];
//# sourceMappingURL=seeding-strategies.d.ts.map