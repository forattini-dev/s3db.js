import { BaseFormat } from './base-format.js';
import type { FormatConfig, ValidationResult, Bracket, Match, OnMatchCompleteResult, Standing, LadderRanking, ChallengeResult } from '../types.js';
export interface LadderConfig extends FormatConfig {
    initialRating?: number;
    kFactor?: number;
    challengeRange?: number;
    challengeCooldown?: number;
    protectionPeriod?: number;
    maxActiveChallenges?: number;
    autoQualifyTop?: number;
    seasonDuration?: number | null;
}
interface LadderRankingEntry extends LadderRanking {
    challengesMade?: number;
    challengesReceived?: number;
    lastChallengeAt?: number | null;
    lastDefendAt?: number | null;
}
interface ChallengeEntry {
    matchId: string;
    challengerId: string;
    defenderId: string;
    challengerRank: number;
    defenderRank: number;
    createdAt: number;
    winnerId?: string;
    loserId?: string;
    completedAt?: number;
}
interface LadderBracket {
    type: string;
    config?: FormatConfig;
    rankings: LadderRankingEntry[];
    pendingChallenges: ChallengeEntry[];
    challengeHistory: ChallengeEntry[];
    startedAt: number;
    seasonEndsAt: number | null;
    [key: string]: unknown;
}
export declare class LadderFormat extends BaseFormat {
    config: LadderConfig;
    static get type(): string;
    static get displayName(): string;
    static get defaultConfig(): LadderConfig;
    validate(participants: string[], config: LadderConfig): ValidationResult;
    generateBracket(participants: string[], config: FormatConfig): Bracket;
    getInitialMatches(_bracket: Bracket): Match[];
    onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult;
    createChallenge(bracket: Bracket, challengerId: string, defenderId: string): ChallengeResult;
    validateChallenge(bracket: LadderBracket, challenger: LadderRankingEntry, defender: LadderRankingEntry): {
        valid: boolean;
        error?: string;
    };
    getStandings(bracket: Bracket, _matches: Match[]): Standing[];
    isComplete(bracket: Bracket, _matches: Match[]): boolean;
    getWinner(bracket: Bracket, matches: Match[]): string | null;
    getCurrentPhase(_bracket: Bracket, _matches: Match[]): string;
    getCurrentRound(bracket: Bracket, _matches: Match[]): number;
    getRankings(bracket: Bracket): LadderRankingEntry[];
    getPendingChallenges(bracket: Bracket): ChallengeEntry[];
    getParticipantChallenges(bracket: Bracket, participantId: string): {
        pending: ChallengeEntry[];
        history: ChallengeEntry[];
    };
    canChallenge(bracket: Bracket, challengerId: string, defenderId: string): {
        can: boolean;
        reason?: string;
    };
}
export {};
//# sourceMappingURL=ladder.d.ts.map