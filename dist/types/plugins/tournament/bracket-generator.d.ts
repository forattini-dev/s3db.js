import type { Bracket, Group } from './types.js';
export interface SingleEliminationOptions {
    bestOf?: number;
    finalsBestOf?: number;
}
export interface DoubleEliminationOptions {
    bestOf?: number;
    grandFinalsBestOf?: number;
    grandFinalsReset?: boolean;
}
export interface RoundRobinOptions {
    rounds?: number;
    bestOf?: number;
}
export interface SwissPairingOptions {
    participants: string[];
    standings: {
        participantId: string;
        points: number;
    }[];
    completedPairings: {
        participant1Id: string;
        participant2Id: string;
    }[];
}
export interface GSLOptions {
    participants: string[];
    bestOf?: number;
}
export declare function generateSingleEliminationBracket(participants: string[], options?: SingleEliminationOptions): Bracket;
export declare function generateDoubleEliminationBracket(participants: string[], options?: DoubleEliminationOptions): Bracket;
export declare function generateRoundRobinSchedule(participants: string[], options?: RoundRobinOptions): Bracket;
export declare function generateSwissPairing(options: SwissPairingOptions): {
    participant1Id: string;
    participant2Id: string | null;
}[];
export declare function generateGSLBracket(options: GSLOptions): Group;
//# sourceMappingURL=bracket-generator.d.ts.map