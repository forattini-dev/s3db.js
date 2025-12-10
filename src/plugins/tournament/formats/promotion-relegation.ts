import { BaseFormat } from './base-format.js';
import { RoundRobinFormat, RoundRobinConfig } from './round-robin.js';
import type {
  FormatConfig,
  ValidationResult,
  Bracket,
  Match,
  OnMatchCompleteResult,
  Standing
} from '../types.js';

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

export class PromotionRelegationFormat extends BaseFormat {
  declare config: PromotionRelegationConfig;

  static override get type(): string {
    return 'promotion-relegation';
  }

  static override get displayName(): string {
    return 'Promotion/Relegation (Divisões)';
  }

  static override get defaultConfig(): PromotionRelegationConfig {
    return {
      divisions: 2,
      teamsPerDivision: 10,
      rounds: 2,
      bestOf: 1,
      promotionSpots: 2,
      relegationSpots: 2,
      playoffSpots: 0,
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      seasonDuration: null
    };
  }

  override validate(participants: string[], config: PromotionRelegationConfig): ValidationResult {
    const errors: string[] = [];

    const divisions = config.divisions || 2;
    const perDivision = config.teamsPerDivision || 10;
    const totalNeeded = divisions * perDivision;

    if (!participants || participants.length < totalNeeded) {
      errors.push(`Need ${totalNeeded} participants for ${divisions} divisions with ${perDivision} teams each`);
    }

    if (config.promotionSpots && config.promotionSpots >= perDivision / 2) {
      errors.push('Promotion spots too high');
    }

    return { valid: errors.length === 0, errors };
  }

  override generateBracket(participants: string[], config: FormatConfig): Bracket {
    const prConfig = config as PromotionRelegationConfig;
    const divisions = prConfig.divisions || 2;
    const perDivision = prConfig.teamsPerDivision || Math.ceil(participants.length / divisions);

    const divisionBrackets: DivisionBracket[] = [];

    for (let i = 0; i < divisions; i++) {
      const divisionParticipants = participants.slice(i * perDivision, (i + 1) * perDivision);

      const leagueFormat = new RoundRobinFormat({
        rounds: prConfig.rounds || 2,
        bestOf: prConfig.bestOf || 1,
        pointsWin: prConfig.pointsWin,
        pointsDraw: prConfig.pointsDraw,
        pointsLoss: prConfig.pointsLoss
      });

      divisionBrackets.push({
        divisionId: i + 1,
        divisionName: this._getDivisionName(i),
        participants: divisionParticipants,
        bracket: leagueFormat.generateBracket(divisionParticipants, config as RoundRobinConfig),
        standings: [],
        complete: false
      });
    }

    return {
      type: 'promotion-relegation',
      config: { ...this.config, ...config },
      divisions: divisionBrackets,
      promotions: [],
      relegations: [],
      playoffMatches: [],
      season: 1,
      seasonStartedAt: Date.now(),
      seasonComplete: false
    } as unknown as Bracket;
  }

  private _getDivisionName(index: number): string {
    const names = ['Premier', 'Championship', 'League One', 'League Two', 'National'];
    return names[index] || `Division ${index + 1}`;
  }

  getInitialMatches(bracket: Bracket): Match[] {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    const matches: Match[] = [];

    for (const division of prBracket.divisions) {
      const leagueFormat = new RoundRobinFormat(division.bracket.config as RoundRobinConfig);
      const divisionMatches = leagueFormat.getInitialMatches(division.bracket);

      for (const match of divisionMatches) {
        matches.push({
          ...match,
          id: `D${division.divisionId}_${match.id}`,
          metadata: {
            ...match.metadata,
            divisionId: division.divisionId,
            divisionName: division.divisionName
          }
        });
      }
    }

    return matches;
  }

  onMatchComplete(bracket: Bracket, completedMatch: Match): OnMatchCompleteResult {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    const divisionId = (completedMatch.metadata?.divisionId as number) || parseInt(completedMatch.id.split('_')[0]!.replace('D', ''));
    const division = prBracket.divisions.find(d => d.divisionId === divisionId);
    const newMatches: Match[] = [];

    if (!division) return { bracket: prBracket as unknown as Bracket, newMatches };

    const leagueFormat = new RoundRobinFormat(division.bracket.config as RoundRobinConfig);

    const strippedMatch: Match = {
      ...completedMatch,
      id: completedMatch.id.replace(`D${divisionId}_`, '')
    };

    const { bracket: updatedDivisionBracket, newMatches: divisionNewMatches } =
      leagueFormat.onMatchComplete(division.bracket, strippedMatch);

    division.bracket = updatedDivisionBracket;

    const allMatches = division.bracket.schedule!.flatMap(r => r.matches);
    const completedCount = allMatches.filter(m => m.status === 'completed').length;

    if (completedCount >= allMatches.length) {
      division.complete = true;
      division.standings = leagueFormat.getStandings(division.bracket, allMatches as unknown as Match[]);
    }

    for (const match of divisionNewMatches) {
      newMatches.push({
        ...match,
        id: `D${divisionId}_${match.id}`,
        metadata: {
          ...match.metadata,
          divisionId,
          divisionName: division.divisionName
        }
      });
    }

    if (prBracket.divisions.every(d => d.complete)) {
      this._processEndOfSeason(prBracket);
    }

    return { bracket: prBracket as unknown as Bracket, newMatches };
  }

  private _processEndOfSeason(bracket: PromotionRelegationBracket): void {
    const config = bracket.config as PromotionRelegationConfig;
    const promotionSpots = config.promotionSpots || 2;
    const relegationSpots = config.relegationSpots || 2;

    bracket.promotions = [];
    bracket.relegations = [];

    for (let i = 0; i < bracket.divisions.length; i++) {
      const division = bracket.divisions[i]!;
      const standings = division.standings;
      const teamCount = standings.length;

      if (i > 0) {
        for (let j = 0; j < promotionSpots && j < standings.length; j++) {
          bracket.promotions.push({
            participantId: standings[j]!.participantId,
            fromDivision: division.divisionId,
            toDivision: division.divisionId - 1,
            type: 'direct'
          });
        }
      }

      if (i < bracket.divisions.length - 1) {
        for (let j = 0; j < relegationSpots && j < standings.length; j++) {
          const idx = teamCount - 1 - j;
          bracket.relegations.push({
            participantId: standings[idx]!.participantId,
            fromDivision: division.divisionId,
            toDivision: division.divisionId + 1,
            type: 'direct'
          });
        }
      }
    }

    bracket.seasonComplete = true;
  }

  getStandings(bracket: Bracket, matches: Match[]): Standing[] {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    const allStandings: Standing[] = [];

    for (const division of prBracket.divisions) {
      const divisionMatches = matches.filter(m =>
        (m.metadata?.divisionId as number) === division.divisionId ||
        m.id.startsWith(`D${division.divisionId}_`)
      );
      const leagueFormat = new RoundRobinFormat(division.bracket.config as RoundRobinConfig);
      const standings = leagueFormat.getStandings(division.bracket, divisionMatches);

      for (const s of standings) {
        allStandings.push({
          ...s,
          divisionId: division.divisionId,
          divisionName: division.divisionName
        } as Standing & { divisionId: number; divisionName: string });
      }
    }

    return allStandings;
  }

  isComplete(bracket: Bracket, _matches: Match[]): boolean {
    return (bracket as unknown as PromotionRelegationBracket).seasonComplete;
  }

  override getWinner(bracket: Bracket, matches: Match[]): string | null {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    if (!this.isComplete(bracket, matches)) return null;

    const topDivision = prBracket.divisions[0]!;
    return topDivision.standings[0]?.participantId || null;
  }

  override getCurrentPhase(_bracket: Bracket, _matches: Match[]): string {
    return 'league';
  }

  override getCurrentRound(bracket: Bracket, matches: Match[]): number {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    let minRound = Infinity;

    for (const division of prBracket.divisions) {
      if (!division.complete) {
        const leagueFormat = new RoundRobinFormat(division.bracket.config as RoundRobinConfig);
        const divisionMatches = matches.filter(m =>
          (m.metadata?.divisionId as number) === division.divisionId ||
          m.id.startsWith(`D${division.divisionId}_`)
        );
        const round = leagueFormat.getCurrentRound(division.bracket, divisionMatches);
        minRound = Math.min(minRound, round);
      }
    }

    return minRound === Infinity ? 1 : minRound;
  }

  getDivisionStandings(bracket: Bracket, divisionId: number): {
    divisionId: number;
    divisionName: string;
    standings: Standing[];
    promotionZone: string[];
    relegationZone: string[];
  } | null {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    const division = prBracket.divisions.find(d => d.divisionId === divisionId);
    if (!division) return null;

    return {
      divisionId,
      divisionName: division.divisionName,
      standings: division.standings,
      promotionZone: this._getPromotionZone(prBracket, divisionId),
      relegationZone: this._getRelegationZone(prBracket, divisionId)
    };
  }

  _getPromotionZone(bracket: PromotionRelegationBracket, divisionId: number): string[] {
    const division = bracket.divisions.find(d => d.divisionId === divisionId);
    if (!division || divisionId === 1) return [];

    const spots = (bracket.config as PromotionRelegationConfig).promotionSpots || 2;
    return division.standings.slice(0, spots).map(s => s.participantId);
  }

  _getRelegationZone(bracket: PromotionRelegationBracket, divisionId: number): string[] {
    const division = bracket.divisions.find(d => d.divisionId === divisionId);
    if (!division || divisionId === bracket.divisions.length) return [];

    const spots = (bracket.config as PromotionRelegationConfig).relegationSpots || 2;
    return division.standings.slice(-spots).map(s => s.participantId);
  }

  getPromotions(bracket: Bracket): PromotionEntry[] {
    return (bracket as unknown as PromotionRelegationBracket).promotions;
  }

  getRelegations(bracket: Bracket): PromotionEntry[] {
    return (bracket as unknown as PromotionRelegationBracket).relegations;
  }

  getDivisions(bracket: Bracket): {
    divisionId: number;
    divisionName: string;
    participantCount: number;
    complete: boolean;
  }[] {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    return prBracket.divisions.map(d => ({
      divisionId: d.divisionId,
      divisionName: d.divisionName,
      participantCount: d.participants.length,
      complete: d.complete
    }));
  }

  newSeason(bracket: Bracket): Bracket {
    const prBracket = bracket as unknown as PromotionRelegationBracket;
    if (!prBracket.seasonComplete) {
      throw new Error('Current season not complete');
    }

    for (const promo of prBracket.promotions) {
      this._moveParticipant(prBracket, promo.participantId, promo.fromDivision, promo.toDivision);
    }

    for (const releg of prBracket.relegations) {
      this._moveParticipant(prBracket, releg.participantId, releg.fromDivision, releg.toDivision);
    }

    prBracket.season++;
    prBracket.seasonStartedAt = Date.now();
    prBracket.seasonComplete = false;
    prBracket.promotions = [];
    prBracket.relegations = [];

    for (const division of prBracket.divisions) {
      const leagueFormat = new RoundRobinFormat({
        rounds: (prBracket.config as PromotionRelegationConfig).rounds || 2,
        bestOf: (prBracket.config as PromotionRelegationConfig).bestOf || 1,
        pointsWin: (prBracket.config as PromotionRelegationConfig).pointsWin,
        pointsDraw: (prBracket.config as PromotionRelegationConfig).pointsDraw,
        pointsLoss: (prBracket.config as PromotionRelegationConfig).pointsLoss
      });

      division.bracket = leagueFormat.generateBracket(division.participants, prBracket.config as RoundRobinConfig);
      division.standings = [];
      division.complete = false;
    }

    return prBracket as unknown as Bracket;
  }

  private _moveParticipant(bracket: PromotionRelegationBracket, participantId: string, fromDivisionId: number, toDivisionId: number): void {
    const fromDivision = bracket.divisions.find(d => d.divisionId === fromDivisionId);
    const toDivision = bracket.divisions.find(d => d.divisionId === toDivisionId);

    if (fromDivision && toDivision) {
      const idx = fromDivision.participants.indexOf(participantId);
      if (idx >= 0) {
        fromDivision.participants.splice(idx, 1);
        toDivision.participants.push(participantId);
      }
    }
  }
}
