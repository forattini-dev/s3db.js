import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing } from '../types.js';
export interface DoubleEliminationConfig extends FormatConfig {
    grandFinalsBestOf?: number;
    grandFinalsReset?: boolean;
    seedingStrategy?: 'bracket' | 'random' | 'manual';
}
export declare class DoubleEliminationFormat extends BaseFormat {
    config: DoubleEliminationConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): DoubleEliminationConfig;
    validate(participants: string[], _config: FormatConfig): ValidationResult;
    generateBracket(participants: string[], config: DoubleEliminationConfig): Bracket;
    getInitialMatches(bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    private _processWinnersMatch;
    private _processLosersMatch;
    private _processGrandFinals;
    private _advanceInWinners;
    private _advanceInLosers;
    private _dropToLosers;
    private _checkGrandFinalsReady;
    getStandings(bracket: Bracket, matches: Match[]): Standing[];
    isComplete(bracket: Bracket, matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, _matches: Match[]): number;
}
//# sourceMappingURL=double-elimination.d.ts.map