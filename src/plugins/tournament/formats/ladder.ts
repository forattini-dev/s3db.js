import { BaseFormat } from './base-format.js';
import { calculateLadderRankings } from '../standings-calculator.js';
import type {
  FormatConfig,
  ValidationResult,
  Bracket,
  Match,
  OnMatchCompleteResult,
  Standing,
  LadderRanking,
  PendingChallenge,
  ChallengeResult
} from '../types.js';

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

export class LadderFormat extends BaseFormat {
  declare config: LadderConfig;

  static override get type(): string {
    return 'ladder';
  }

  static override get displayName(): string {
    return 'Ladder (Ranking/Desafios)';
  }

  static override get defaultConfig(): LadderConfig {
    return {
      bestOf: 1,
      initialRating: 1000,
      kFactor: 32,
      challengeRange: 5,
      challengeCooldown: 86400000,
      protectionPeriod: 86400000,
      maxActiveChallenges: 1,
      autoQualifyTop: 0,
      seasonDuration: null
    };
  }

  override validate(participants: string[], config: LadderConfig): ValidationResult {
    const errors: string[] = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    if (config.challengeRange && config.challengeRange < 1) {
      errors.push('Challenge range must be at least 1');
    }

    return { valid: errors.length === 0, errors };
  }

  override generateBracket(participants: string[], config: FormatConfig): Bracket {
    const ladderConfig = config as LadderConfig;
    const rankings: LadderRankingEntry[] = participants.map((participantId, index) => ({
      participantId,
      rank: index + 1,
      rating: (ladderConfig.initialRating ?? 1000) as number,
      wins: 0,
      losses: 0,
      streak: 0,
      lastActivity: Date.now(),
      challengesMade: 0,
      challengesReceived: 0,
      lastChallengeAt: null,
      lastDefendAt: null,
      protectedUntil: undefined
    }));

    return {
      type: 'ladder',
      config: { ...this.config, ...config },
      rankings,
      pendingChallenges: [],
      challengeHistory: [],
      startedAt: Date.now(),
      seasonEndsAt: ladderConfig.seasonDuration ? Date.now() + ladderConfig.seasonDuration : null
    } as Bracket;
  }

  getInitialMatches(_bracket: Bracket): Match[] {
    return [];
  }

  onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult {
    const ladderBracket = bracket as unknown as LadderBracket;
    const { winnerId, loserId } = completedMatch;
    const newMatches: Match[] = [];

    const winnerRanking = ladderBracket.rankings.find(r => r.participantId === winnerId);
    const loserRanking = ladderBracket.rankings.find(r => r.participantId === loserId);

    if (!winnerRanking || !loserRanking) {
      return { bracket: ladderBracket as unknown as Bracket, newMatches };
    }

    winnerRanking.wins++;
    loserRanking.losses++;

    const kFactor = (ladderBracket.config as LadderConfig).kFactor || 32;
    const expectedWinner = 1 / (1 + Math.pow(10, ((loserRanking.rating as number) - (winnerRanking.rating as number)) / 400));
    const expectedLoser = 1 - expectedWinner;

    winnerRanking.rating = Math.round((winnerRanking.rating as number) + kFactor * (1 - expectedWinner)) as number;
    loserRanking.rating = Math.round((loserRanking.rating as number) + kFactor * (0 - expectedLoser)) as number;

    if (loserRanking.rank < winnerRanking.rank) {
      const tempRank = loserRanking.rank;
      loserRanking.rank = winnerRanking.rank;
      winnerRanking.rank = tempRank;
    }

    if ((completedMatch.metadata?.challengerId as string) === loserId) {
      winnerRanking.protectedUntil = Date.now() + ((ladderBracket.config as LadderConfig).protectionPeriod || 86400000);
      winnerRanking.lastDefendAt = Date.now();
    }

    const challengeIndex = ladderBracket.pendingChallenges.findIndex(c =>
      c.matchId === completedMatch.id
    );
    if (challengeIndex >= 0) {
      const challenge = ladderBracket.pendingChallenges.splice(challengeIndex, 1)[0]!;
      ladderBracket.challengeHistory.push({
        ...challenge,
        winnerId: winnerId!,
        loserId: loserId!,
        completedAt: Date.now()
      } as ChallengeEntry);
    }

    const challenger = ladderBracket.rankings.find(r =>
      r.participantId === (completedMatch.metadata?.challengerId as string)
    );
    if (challenger) {
      challenger.lastChallengeAt = Date.now();
    }

    ladderBracket.rankings.sort((a, b) => a.rank - b.rank);

    return { bracket: ladderBracket as unknown as Bracket, newMatches };
  }

  createChallenge(bracket: Bracket, challengerId: string, defenderId: string): ChallengeResult {
    const ladderBracket = bracket as unknown as LadderBracket;
    const challengerRanking = ladderBracket.rankings.find(r => r.participantId === challengerId);
    const defenderRanking = ladderBracket.rankings.find(r => r.participantId === defenderId);

    if (!challengerRanking || !defenderRanking) {
      return { valid: false, error: 'Participant not found' };
    }

    const validation = this.validateChallenge(ladderBracket, challengerRanking, defenderRanking);
    if (!validation.valid) {
      return validation;
    }

    const matchId = `L${Date.now()}_${challengerId.slice(0, 4)}v${defenderId.slice(0, 4)}`;
    const match: Match = {
      id: matchId,
      phase: 'ladder',
      round: ladderBracket.challengeHistory.length + ladderBracket.pendingChallenges.length + 1,
      matchNumber: 1,
      participant1Id: challengerId,
      participant2Id: defenderId,
      bestOf: (ladderBracket.config as LadderConfig).bestOf || 1,
      score1: 0,
      score2: 0,
      games: [],
      winnerId: null,
      loserId: null,
      status: 'pending',
      nextMatchId: null,
      groupId: null,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      metadata: {
        challengerId,
        defenderId,
        challengerRank: challengerRanking.rank,
        defenderRank: defenderRanking.rank,
        createdAt: Date.now()
      }
    };

    ladderBracket.pendingChallenges.push({
      matchId,
      challengerId,
      defenderId,
      challengerRank: challengerRanking.rank,
      defenderRank: defenderRanking.rank,
      createdAt: Date.now()
    });

    challengerRanking.challengesMade = (challengerRanking.challengesMade || 0) + 1;
    defenderRanking.challengesReceived = (defenderRanking.challengesReceived || 0) + 1;

    return { valid: true, match };
  }

  validateChallenge(bracket: LadderBracket, challenger: LadderRankingEntry, defender: LadderRankingEntry): { valid: boolean; error?: string } {
    const config = bracket.config as LadderConfig;
    const now = Date.now();

    if (challenger.participantId === defender.participantId) {
      return { valid: false, error: 'Cannot challenge yourself' };
    }

    if (defender.rank >= challenger.rank) {
      return { valid: false, error: 'Can only challenge higher-ranked participants' };
    }

    const rankDiff = challenger.rank - defender.rank;
    if (rankDiff > (config.challengeRange || 5)) {
      return { valid: false, error: `Can only challenge up to ${config.challengeRange} positions above` };
    }

    if (challenger.lastChallengeAt) {
      const cooldown = config.challengeCooldown || 86400000;
      if (now - challenger.lastChallengeAt < cooldown) {
        const remaining = Math.ceil((cooldown - (now - challenger.lastChallengeAt)) / 60000);
        return { valid: false, error: `Challenge cooldown: ${remaining} minutes remaining` };
      }
    }

    if (defender.protectedUntil && now < defender.protectedUntil) {
      const remaining = Math.ceil((defender.protectedUntil - now) / 60000);
      return { valid: false, error: `Defender is protected for ${remaining} more minutes` };
    }

    const activeChallenges = bracket.pendingChallenges.filter(c =>
      c.challengerId === challenger.participantId
    );
    if (activeChallenges.length >= (config.maxActiveChallenges || 1)) {
      return { valid: false, error: 'Maximum active challenges reached' };
    }

    const existingChallenge = bracket.pendingChallenges.find(c =>
      c.challengerId === challenger.participantId && c.defenderId === defender.participantId
    );
    if (existingChallenge) {
      return { valid: false, error: 'Already have a pending challenge against this participant' };
    }

    return { valid: true };
  }

  getStandings(bracket: Bracket, _matches: Match[]): Standing[] {
    const ladderBracket = bracket as unknown as LadderBracket;
    return calculateLadderRankings(ladderBracket.rankings);
  }

  isComplete(bracket: Bracket, _matches: Match[]): boolean {
    const ladderBracket = bracket as unknown as LadderBracket;
    if (ladderBracket.seasonEndsAt && Date.now() >= ladderBracket.seasonEndsAt) {
      return true;
    }
    return false;
  }

  override getWinner(bracket: Bracket, matches: Match[]): string | null {
    if (!this.isComplete(bracket, matches)) return null;

    const standings = this.getStandings(bracket, matches);
    return standings.length > 0 ? standings[0]!.participantId : null;
  }

  override getCurrentPhase(_bracket: Bracket, _matches: Match[]): string {
    return 'ladder';
  }

  override getCurrentRound(bracket: Bracket, _matches: Match[]): number {
    const ladderBracket = bracket as unknown as LadderBracket;
    return ladderBracket.challengeHistory.length + ladderBracket.pendingChallenges.length;
  }

  getRankings(bracket: Bracket): LadderRankingEntry[] {
    const ladderBracket = bracket as unknown as LadderBracket;
    return [...ladderBracket.rankings].sort((a, b) => a.rank - b.rank);
  }

  getPendingChallenges(bracket: Bracket): ChallengeEntry[] {
    return (bracket as unknown as LadderBracket).pendingChallenges;
  }

  getParticipantChallenges(bracket: Bracket, participantId: string): { pending: ChallengeEntry[]; history: ChallengeEntry[] } {
    const ladderBracket = bracket as unknown as LadderBracket;
    return {
      pending: ladderBracket.pendingChallenges.filter(c =>
        c.challengerId === participantId || c.defenderId === participantId
      ),
      history: ladderBracket.challengeHistory.filter(c =>
        c.challengerId === participantId || c.defenderId === participantId
      )
    };
  }

  canChallenge(bracket: Bracket, challengerId: string, defenderId: string): { can: boolean; reason?: string } {
    const ladderBracket = bracket as unknown as LadderBracket;
    const challenger = ladderBracket.rankings.find(r => r.participantId === challengerId);
    const defender = ladderBracket.rankings.find(r => r.participantId === defenderId);

    if (!challenger || !defender) return { can: false, reason: 'Participant not found' };

    const validation = this.validateChallenge(ladderBracket, challenger, defender);
    return { can: validation.valid, reason: validation.error };
  }
}
