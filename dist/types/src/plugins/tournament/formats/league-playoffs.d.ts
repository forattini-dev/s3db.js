import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing } from '../types.js';
export interface LeaguePlayoffsConfig extends FormatConfig {
    leagueRounds?: number;
    leagueBestOf?: number;
    playoffsFormat?: 'single-elimination' | 'double-elimination';
    playoffsSize?: number;
    playoffsBestOf?: number;
    playoffsFinalsBestOf?: number;
    byesForTopSeeds?: number;
    thirdPlaceMatch?: boolean;
}
interface LeaguePhase {
    bracket: Bracket;
    standings: Standing[];
    complete: boolean;
}
interface PlayoffsPhase {
    bracket: Bracket | null;
    qualifiedParticipants: string[];
    complete: boolean;
}
interface LeaguePlayoffsBracket extends Bracket {
    phase: 'league' | 'playoffs';
    league: LeaguePhase;
    playoffs: PlayoffsPhase;
}
export declare class LeaguePlayoffsFormat extends BaseFormat {
    config: LeaguePlayoffsConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): LeaguePlayoffsConfig;
    validate(participants: string[], config: LeaguePlayoffsConfig): ValidationResult;
    generateBracket(participants: string[], config: LeaguePlayoffsConfig): LeaguePlayoffsBracket;
    getInitialMatches(bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    private _processLeagueMatch;
    private _initializePlayoffs;
    private _processPlayoffsMatch;
    private _getAllPlayoffsMatches;
    getStandings(bracket: Bracket, matches: Match[]): Standing[];
    isComplete(bracket: Bracket, _matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, matches: Match[]): number;
    getLeagueStandings(bracket: Bracket, matches: Match[]): Standing[];
    getQualifiedParticipants(bracket: Bracket): string[];
}
export {};
//# sourceMappingURL=league-playoffs.d.ts.map