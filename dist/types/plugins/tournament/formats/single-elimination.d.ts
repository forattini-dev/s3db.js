import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing } from '../types.js';
export interface SingleEliminationConfig extends FormatConfig {
    finalsBestOf?: number;
    thirdPlaceMatch?: boolean;
    seedingStrategy?: 'bracket' | 'random' | 'manual';
}
export declare class SingleEliminationFormat extends BaseFormat {
    config: SingleEliminationConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): SingleEliminationConfig;
    validate(participants: string[], _config: FormatConfig): ValidationResult;
    generateBracket(participants: string[], config: SingleEliminationConfig): Bracket;
    getInitialMatches(bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    getStandings(bracket: Bracket, matches: Match[]): Standing[];
    isComplete(bracket: Bracket, matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(bracket: Bracket, matches: Match[]): string;
    getCurrentRound(bracket: Bracket, matches: Match[]): number;
    getCompletedRounds(bracket: Bracket, matches: Match[]): number;
    getRoundName(round: number, totalRounds: number): string;
    getBracketSize(participantCount: number): number;
}
//# sourceMappingURL=single-elimination.d.ts.map