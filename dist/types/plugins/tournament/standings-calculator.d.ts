import type { Match, Standing, Bracket, LadderRanking } from './types.js';
export declare function calculateRoundRobinStandings(matches: Match[], config?: {
    pointsWin?: number;
    pointsDraw?: number;
    pointsLoss?: number;
}): Standing[];
export declare function calculateEliminationStandings(matches: Match[], bracket: Bracket): Standing[];
export declare function calculateSwissStandings(matches: Match[], participants: string[]): Standing[];
export declare function calculateLadderRankings(rankings: LadderRanking[]): Standing[];
export declare function calculateCircuitStandings(events: {
    results: {
        participantId: string;
        points: number;
    }[];
}[]): Standing[];
export declare function sortStandings(standings: Standing[]): Standing[];
export declare function applyHeadToHead(standings: Standing[], matches: Match[]): Standing[];
//# sourceMappingURL=standings-calculator.d.ts.map