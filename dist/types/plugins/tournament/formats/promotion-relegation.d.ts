import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing } from '../types.js';
export interface PromotionRelegationConfig extends FormatConfig {
    divisions?: number;
    teamsPerDivision?: number;
    rounds?: number;
    promotionSpots?: number;
    relegationSpots?: number;
    playoffSpots?: number;
    seasonDuration?: number | null;
}
interface PromotionEntry {
    participantId: string;
    fromDivision: number;
    toDivision: number;
    type: 'direct' | 'playoff';
}
interface DivisionBracket {
    divisionId: number;
    divisionName: string;
    participants: string[];
    bracket: Bracket;
    standings: Standing[];
    complete: boolean;
}
interface PromotionRelegationBracket {
    type: string;
    config?: FormatConfig;
    divisions: DivisionBracket[];
    promotions: PromotionEntry[];
    relegations: PromotionEntry[];
    playoffMatches: Match[];
    season: number;
    seasonStartedAt: number;
    seasonComplete: boolean;
    [key: string]: unknown;
}
export declare class PromotionRelegationFormat extends BaseFormat {
    config: PromotionRelegationConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): PromotionRelegationConfig;
    validate(participants: string[], config: PromotionRelegationConfig): ValidationResult;
    generateBracket(participants: string[], config: FormatConfig): Bracket;
    private _getDivisionName;
    getInitialMatches(bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    private _processEndOfSeason;
    getStandings(bracket: Bracket, matches: Match[]): Standing[];
    isComplete(bracket: Bracket, _matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(_bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, matches: Match[]): number;
    getDivisionStandings(bracket: Bracket, divisionId: number): {
        divisionId: number;
        divisionName: string;
        standings: Standing[];
        promotionZone: string[];
        relegationZone: string[];
    } | null;
    _getPromotionZone(bracket: PromotionRelegationBracket, divisionId: number): string[];
    _getRelegationZone(bracket: PromotionRelegationBracket, divisionId: number): string[];
    getPromotions(bracket: Bracket): PromotionEntry[];
    getRelegations(bracket: Bracket): PromotionEntry[];
    getDivisions(bracket: Bracket): {
        divisionId: number;
        divisionName: string;
        participantCount: number;
        complete: boolean;
    }[];
    newSeason(bracket: Bracket): Bracket;
    private _moveParticipant;
}
export {};
//# sourceMappingURL=promotion-relegation.d.ts.map