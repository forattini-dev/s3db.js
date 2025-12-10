import type {
  FormatConfig,
  ValidationResult,
  Bracket,
  Match,
  MatchTemplateParams,
  OnMatchCompleteResult,
  Standing,
  SerializedFormat
} from '../types.js';

export abstract class BaseFormat {
  public config: FormatConfig;

  constructor(config: FormatConfig = {}) {
    this.config = config;
  }

  static get type(): string {
    throw new Error('Format must define static type getter');
  }

  static get displayName(): string {
    throw new Error('Format must define static displayName getter');
  }

  static get defaultConfig(): FormatConfig {
    return {
      bestOf: 1,
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0
    };
  }

  validate(participants: string[], _config: FormatConfig): ValidationResult {
    const errors: string[] = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    return { valid: errors.length === 0, errors };
  }

  abstract generateBracket(participants: string[], config: FormatConfig): Bracket;

  abstract getInitialMatches(bracket: Bracket): Match[];

  abstract onMatchComplete(bracket: Bracket, match: Match): OnMatchCompleteResult;

  getNextMatches(_bracket: Bracket, _completedMatches: Match[]): Match[] {
    return [];
  }

  abstract getStandings(bracket: Bracket, matches: Match[]): Standing[];

  abstract isComplete(bracket: Bracket, matches: Match[]): boolean;

  getWinner(bracket: Bracket, matches: Match[]): string | null {
    if (!this.isComplete(bracket, matches)) {
      return null;
    }
    const standings = this.getStandings(bracket, matches);
    return standings.length > 0 ? standings[0]!.participantId : null;
  }

  getCurrentPhase(_bracket: Bracket, _matches: Match[]): string {
    return 'main';
  }

  getCurrentRound(_bracket: Bracket, matches: Match[]): number {
    const completedMatches = matches.filter(m => m.status === 'completed');
    if (completedMatches.length === 0) return 1;
    return Math.max(...completedMatches.map(m => m.round)) + 1;
  }

  serialize(bracket: Bracket): SerializedFormat {
    return {
      type: (this.constructor as typeof BaseFormat).type,
      config: this.config,
      bracket
    };
  }

  static deserialize(data: SerializedFormat): Bracket {
    return data.bracket;
  }

  calculateTiebreaker(participantStats: Standing): number {
    return participantStats.goalDifference || 0;
  }

  sortStandings(standings: Standing[]): Standing[] {
    return standings.sort((a, b) => {
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      if ((b.wins ?? 0) !== (a.wins ?? 0)) return (b.wins ?? 0) - (a.wins ?? 0);
      const tiebreakerA = this.calculateTiebreaker(a);
      const tiebreakerB = this.calculateTiebreaker(b);
      if (tiebreakerB !== tiebreakerA) return tiebreakerB - tiebreakerA;
      return 0;
    });
  }

  createMatchTemplate({
    phase,
    round,
    matchNumber,
    participant1Id,
    participant2Id,
    bestOf,
    nextMatchId,
    loserNextMatchId,
    groupId
  }: MatchTemplateParams): Match {
    return {
      id: '',
      phase: phase || 'main',
      round,
      matchNumber,
      participant1Id: participant1Id || null,
      participant2Id: participant2Id || null,
      bestOf: bestOf || this.config.bestOf || 1,
      score1: 0,
      score2: 0,
      games: [],
      winnerId: null,
      loserId: null,
      status: 'pending',
      nextMatchId: nextMatchId || null,
      loserNextMatchId: loserNextMatchId || null,
      groupId: groupId || null,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      metadata: {}
    };
  }
}
