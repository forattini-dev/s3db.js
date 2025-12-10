import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing } from '../types.js';
export interface SwissConfig extends FormatConfig {
    rounds?: number;
    advanceWins?: number;
    eliminateLosses?: number;
    avoidRematches?: boolean;
    buchholzTiebreaker?: boolean;
}
interface SwissStanding {
    participantId: string;
    wins: number;
    losses: number;
    matchWins: number;
    matchLosses: number;
    buchholz: number;
    opponents: string[];
    status: 'active' | 'advanced' | 'eliminated';
    points?: number;
}
interface SwissPairing {
    id: string;
    round: number;
    matchNumber: number;
    participant1Id: string;
    participant2Id: string | null;
    bestOf?: number;
    status: string;
    winnerId?: string | null;
}
interface SwissBracket extends Bracket {
    pairings: SwissPairing[][];
    standings: SwissStanding[];
    advanced: string[];
    eliminated: string[];
}
export declare class SwissFormat extends BaseFormat {
    config: SwissConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): SwissConfig;
    validate(participants: string[], config: SwissConfig): ValidationResult;
    generateBracket(participants: string[], config: SwissConfig): SwissBracket;
    getInitialMatches(bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    private _generateNextRound;
    private _updateBuchholz;
    private _isSwissComplete;
    getStandings(bracket: Bracket, matches: Match[]): Standing[];
    isComplete(bracket: Bracket, _matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(_bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, _matches: Match[]): number;
    getAdvanced(bracket: Bracket): string[];
    getEliminated(bracket: Bracket): string[];
    getRecordDisplay(wins: number, losses: number): string;
}
export {};
//# sourceMappingURL=swiss.d.ts.map