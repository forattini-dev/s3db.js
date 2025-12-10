import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing } from '../types.js';
export interface GroupStageConfig extends FormatConfig {
    groupCount?: number;
    participantsPerGroup?: number;
    style?: 'round-robin' | 'gsl';
    rounds?: number;
    advanceCount?: number;
    seedingStrategy?: 'snake' | 'random' | 'sequential';
}
export declare class GroupStageFormat extends BaseFormat {
    config: GroupStageConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): GroupStageConfig;
    validate(participants: string[], config: GroupStageConfig): ValidationResult;
    generateBracket(participants: string[], config: FormatConfig): Bracket;
    private _distributeSequential;
    getInitialMatches(bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    private _processGSLMatch;
    private _processRoundRobinMatch;
    getStandings(bracket: Bracket, matches: Match[]): Standing[];
    isComplete(bracket: Bracket, _matches: Match[]): boolean;
    getWinner(_bracket: Bracket, _matches: Match[]): string | null;
    getAdvancing(bracket: Bracket): {
        participantId: string;
        seed: number;
        groupId: string;
    }[];
    getCurrentPhase(_bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, _matches: Match[]): number;
}
//# sourceMappingURL=group-stage.d.ts.map