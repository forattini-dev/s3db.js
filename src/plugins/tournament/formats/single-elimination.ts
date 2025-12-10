import { BaseFormat } from './base-format.js';
import { generateSingleEliminationBracket } from '../bracket-generator.js';
import { calculateEliminationStandings } from '../standings-calculator.js';
import { nextPowerOf2 } from '../seeding-strategies.js';
import type {
  FormatConfig,
  ValidationResult,
  Bracket,
  Match,
  OnMatchCompleteResult,
  Standing,
  BracketMatch
} from '../types.js';

export interface SingleEliminationConfig extends FormatConfig {
  finalsBestOf?: number;
  thirdPlaceMatch?: boolean;
  seedingStrategy?: 'bracket' | 'random' | 'manual';
}

export class SingleEliminationFormat extends BaseFormat {
  declare config: SingleEliminationConfig;

  static override get type(): string {
    return 'single-elimination';
  }

  static override get displayName(): string {
    return 'Single Elimination (Mata-Mata)';
  }

  static override get defaultConfig(): SingleEliminationConfig {
    return {
      bestOf: 1,
      finalsBestOf: 3,
      thirdPlaceMatch: false,
      seedingStrategy: 'bracket'
    };
  }

  override validate(participants: string[], _config: FormatConfig): ValidationResult {
    const errors: string[] = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    if (participants.length > 256) {
      errors.push('Maximum 256 participants for single elimination');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants: string[], config: SingleEliminationConfig): Bracket {
    const bracket = generateSingleEliminationBracket(participants, {
      bestOf: config.bestOf || 1,
      finalsBestOf: config.finalsBestOf || config.bestOf || 1
    });

    bracket.config = { ...this.config, ...config };
    bracket.thirdPlaceMatch = config.thirdPlaceMatch ? {
      id: '3RD',
      round: bracket.rounds!,
      participant1Id: null,
      participant2Id: null,
      status: 'pending',
      winnerId: null
    } : null;

    return bracket;
  }

  getInitialMatches(bracket: Bracket): Match[] {
    const firstRound = bracket.matches![0]!;

    return firstRound
      .filter(m => m.status === 'pending')
      .map(match => ({
        ...this.createMatchTemplate({
          phase: 'bracket',
          round: match.round,
          matchNumber: match.matchNumber,
          participant1Id: match.participant1Id,
          participant2Id: match.participant2Id,
          bestOf: match.bestOf,
          nextMatchId: match.nextMatchId
        }),
        id: match.id
      }));
  }

  onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult {
    const newMatches: Match[] = [];
    const completedMatchId = (completedMatch.metadata?.matchRef as string) || completedMatch.id;

    for (const round of bracket.matches!) {
      const match = round.find(m => m.id === completedMatchId);
      if (match) {
        match.winnerId = completedMatch.winnerId;
        match.loserId = completedMatch.loserId;
        match.status = 'completed';
        match.score1 = completedMatch.score1;
        match.score2 = completedMatch.score2;

        if (bracket.thirdPlaceMatch && match.round === bracket.rounds! - 1) {
          if (!bracket.thirdPlaceMatch.participant1Id) {
            bracket.thirdPlaceMatch.participant1Id = completedMatch.loserId;
          } else if (!bracket.thirdPlaceMatch.participant2Id) {
            bracket.thirdPlaceMatch.participant2Id = completedMatch.loserId;

            newMatches.push({
              ...this.createMatchTemplate({
                phase: 'third-place',
                round: bracket.rounds!,
                matchNumber: 1,
                participant1Id: bracket.thirdPlaceMatch.participant1Id,
                participant2Id: bracket.thirdPlaceMatch.participant2Id,
                bestOf: this.config.bestOf
              }),
              id: '3RD'
            });
          }
        }

        break;
      }
    }

    if (completedMatch.winnerId && completedMatch.nextMatchId) {
      const regexMatch = completedMatch.nextMatchId.match(/R(\d+)M(\d+)/);
      const [, roundStr, matchStr] = regexMatch || [];
      if (roundStr && matchStr) {
        const roundIndex = parseInt(roundStr) - 1;
        const matchIndex = parseInt(matchStr) - 1;

        if (bracket.matches![roundIndex] && bracket.matches![roundIndex][matchIndex]) {
          const nextMatch = bracket.matches![roundIndex][matchIndex];

          if (!nextMatch.participant1Id) {
            nextMatch.participant1Id = completedMatch.winnerId;
          } else if (!nextMatch.participant2Id) {
            nextMatch.participant2Id = completedMatch.winnerId;
          }

          if (nextMatch.participant1Id && nextMatch.participant2Id && nextMatch.status === 'pending') {
            newMatches.push({
              ...this.createMatchTemplate({
                phase: roundIndex === bracket.matches!.length - 1 ? 'finals' : 'bracket',
                round: nextMatch.round,
                matchNumber: nextMatch.matchNumber,
                participant1Id: nextMatch.participant1Id,
                participant2Id: nextMatch.participant2Id,
                bestOf: nextMatch.bestOf,
                nextMatchId: nextMatch.nextMatchId
              }),
              id: nextMatch.id
            });
          }
        }
      }
    }

    return { bracket, newMatches };
  }

  getStandings(bracket: Bracket, matches: Match[]): Standing[] {
    return calculateEliminationStandings(matches, bracket);
  }

  isComplete(bracket: Bracket, matches: Match[]): boolean {
    const finalRound = bracket.matches![bracket.matches!.length - 1]!;
    const finalMatch = finalRound[0]!;

    const finalComplete = matches.some(m =>
      ((m.metadata?.matchRef as string) || m.id) === finalMatch.id && m.status === 'completed'
    );

    if (bracket.thirdPlaceMatch) {
      const thirdPlaceComplete = matches.some(m =>
        ((m.metadata?.matchRef as string) || m.id) === '3RD' && m.status === 'completed'
      );
      return finalComplete && thirdPlaceComplete;
    }

    return finalComplete;
  }

  override getWinner(bracket: Bracket, matches: Match[]): string | null {
    if (!this.isComplete(bracket, matches)) return null;

    const finalRound = bracket.matches![bracket.matches!.length - 1]!;
    const finalMatch = matches.find(m =>
      ((m.metadata?.matchRef as string) || m.id) === finalRound[0]!.id
    );

    return finalMatch?.winnerId || null;
  }

  override getCurrentPhase(bracket: Bracket, matches: Match[]): string {
    const completedRounds = this.getCompletedRounds(bracket, matches);

    if (completedRounds >= bracket.rounds! - 1) return 'finals';
    if (completedRounds >= bracket.rounds! - 2) return 'semifinals';
    if (completedRounds >= bracket.rounds! - 3) return 'quarterfinals';
    return 'bracket';
  }

  override getCurrentRound(bracket: Bracket, matches: Match[]): number {
    return this.getCompletedRounds(bracket, matches) + 1;
  }

  getCompletedRounds(bracket: Bracket, matches: Match[]): number {
    let completedRounds = 0;

    for (let i = 0; i < bracket.matches!.length; i++) {
      const roundMatches = bracket.matches![i]!;
      const roundMatchIds = roundMatches.map(m => m.id);

      const allComplete = roundMatchIds.every(id => {
        const match = matches.find(m => m.id === id);
        return match && (match.status === 'completed' || match.status === 'bye');
      });

      if (allComplete) {
        completedRounds++;
      } else {
        break;
      }
    }

    return completedRounds;
  }

  getRoundName(round: number, totalRounds: number): string {
    const fromFinal = totalRounds - round;

    switch (fromFinal) {
      case 0: return 'Final';
      case 1: return 'Semifinal';
      case 2: return 'Quarterfinal';
      default: return `Round ${round}`;
    }
  }

  getBracketSize(participantCount: number): number {
    return nextPowerOf2(participantCount);
  }
}
