import type { FormatConfig, ValidationResult, Bracket, Match, MatchTemplateParams, OnMatchCompleteResult, Standing, SerializedFormat } from '../types.js';
export declare abstract class BaseFormat {
    config: FormatConfig;
    constructor(config?: FormatConfig);
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): FormatConfig;
    validate(participants: string[], _config: FormatConfig): ValidationResult;
    abstract generateBracket(participants: string[], config: FormatConfig): Bracket;
    abstract getInitialMatches(bracket: Bracket): Match[];
    abstract onMatchComplete(bracket: Bracket, match: Match): OnMatchCompleteResult;
    getNextMatches(_bracket: Bracket, _completedMatches: Match[]): Match[];
    abstract getStandings(bracket: Bracket, matches: Match[]): Standing[];
    abstract isComplete(bracket: Bracket, matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(_bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(_bracket: Bracket, matches: Match[]): number;
    serialize(bracket: Bracket): SerializedFormat;
    static deserialize(data: SerializedFormat): Bracket;
    calculateTiebreaker(participantStats: Standing): number;
    sortStandings(standings: Standing[]): Standing[];
    createMatchTemplate({ phase, round, matchNumber, participant1Id, participant2Id, bestOf, nextMatchId, loserNextMatchId, groupId }: MatchTemplateParams): Match;
}
//# sourceMappingURL=base-format.d.ts.map