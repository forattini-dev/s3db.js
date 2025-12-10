import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing } from '../types.js';
export interface RoundRobinConfig extends FormatConfig {
    rounds?: number;
    tiebreaker?: 'goal-difference' | 'head-to-head' | 'goals-scored';
    allowDraws?: boolean;
}
export declare class RoundRobinFormat extends BaseFormat {
    config: RoundRobinConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): RoundRobinConfig;
    validate(participants: string[], config: RoundRobinConfig): ValidationResult;
    generateBracket(participants: string[], config: RoundRobinConfig): Bracket;
    getInitialMatches(bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    getNextMatches(bracket: Bracket, completedMatches: Match[]): Match[];
    getStandings(bracket: Bracket, matches: Match[]): Standing[];
    isComplete(bracket: Bracket, matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(_bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, _matches: Match[]): number;
    calculateTiebreaker(participantStats: Standing): number;
    getTotalRounds(participants: string[], config: RoundRobinConfig): number;
    getTotalMatches(participants: string[], config: RoundRobinConfig): number;
}
//# sourceMappingURL=round-robin.d.ts.map