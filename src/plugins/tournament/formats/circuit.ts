import { BaseFormat } from './base-format.js';
import { calculateCircuitStandings } from '../standings-calculator.js';
import type {
  FormatConfig,
  ValidationResult,
  Bracket,
  Match,
  OnMatchCompleteResult,
  Standing,
  CircuitEvent,
  CircuitResult
} from '../types.js';

export interface CircuitConfig extends FormatConfig {
  pointsTable?: Record<number, number>;
  countBestN?: number | null;
  qualifyTop?: number;
  seasonDuration?: number | null;
  eventTiers?: Record<string, number>;
}

interface CircuitStandingEntry {
  participantId: string;
  totalPoints: number;
  eventResults: {
    eventId: string;
    eventName: string;
    placement: number;
    points: number;
  }[];
  eventsPlayed: number;
  bestPlacements: number[];
}

interface CircuitEventEntry extends CircuitEvent {
  multiplier: number;
  completedAt: number;
}

interface CircuitBracket extends Bracket {
  events: CircuitEventEntry[];
  standings: CircuitStandingEntry[];
  currentSeason: number;
  seasonStartedAt: number;
  seasonEndsAt: number | null;
}

export interface AddEventInput {
  id: string;
  name: string;
  tier?: string;
  results: { participantId: string; placement: number }[];
}

export class CircuitFormat extends BaseFormat {
  declare config: CircuitConfig;

  static override get type(): string {
    return 'circuit';
  }

  static override get displayName(): string {
    return 'Circuit (Circuito de Pontos)';
  }

  static override get defaultConfig(): CircuitConfig {
    return {
      pointsTable: {
        1: 100,
        2: 75,
        3: 50,
        4: 40,
        5: 32,
        6: 24,
        7: 18,
        8: 12,
        9: 8,
        10: 4,
        11: 2,
        12: 1
      },
      countBestN: null,
      qualifyTop: 8,
      seasonDuration: null,
      eventTiers: {
        major: 2.0,
        premier: 1.5,
        standard: 1.0,
        minor: 0.5
      }
    };
  }

  override validate(participants: string[], _config: CircuitConfig): ValidationResult {
    const errors: string[] = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants: string[], config: CircuitConfig): CircuitBracket {
    return {
      type: 'circuit',
      config: { ...this.config, ...config },
      participants: [...participants],
      events: [],
      standings: participants.map(p => ({
        participantId: p,
        totalPoints: 0,
        eventResults: [],
        eventsPlayed: 0,
        bestPlacements: []
      })),
      currentSeason: 1,
      seasonStartedAt: Date.now(),
      seasonEndsAt: config.seasonDuration ? Date.now() + config.seasonDuration : null
    };
  }

  getInitialMatches(_bracket: Bracket): Match[] {
    return [];
  }

  onMatchComplete(bracket: Bracket, _completedMatch: Match): OnMatchCompleteResult {
    return { bracket, newMatches: [] };
  }

  addEvent(bracket: Bracket, event: AddEventInput): Bracket {
    const circuitBracket = bracket as CircuitBracket;
    const { id, name, tier = 'standard', results } = event;
    const config = circuitBracket.config as CircuitConfig;

    const multiplier = config.eventTiers?.[tier] || 1.0;
    const pointsTable = config.pointsTable || {};

    const eventWithPoints: CircuitEventEntry = {
      id,
      name,
      tier,
      multiplier,
      completedAt: Date.now(),
      points: {},
      results: results.map(r => ({
        participantId: r.participantId,
        placement: r.placement,
        points: Math.round((pointsTable[r.placement] || 0) * multiplier)
      }))
    };

    circuitBracket.events.push(eventWithPoints);

    for (const result of eventWithPoints.results) {
      const standing = circuitBracket.standings.find(s => s.participantId === result.participantId);
      if (standing) {
        standing.eventResults.push({
          eventId: id,
          eventName: name,
          placement: result.placement,
          points: result.points
        });
        standing.eventsPlayed++;
        standing.bestPlacements.push(result.placement);
      }
    }

    this._recalculateStandings(circuitBracket);

    return circuitBracket;
  }

  private _recalculateStandings(bracket: CircuitBracket): void {
    const config = bracket.config as CircuitConfig;
    const countBestN = config.countBestN;

    for (const standing of bracket.standings) {
      let pointsToCount = standing.eventResults.map(r => r.points);

      if (countBestN && pointsToCount.length > countBestN) {
        pointsToCount = pointsToCount
          .sort((a, b) => b - a)
          .slice(0, countBestN);
      }

      standing.totalPoints = pointsToCount.reduce((sum, p) => sum + p, 0);
      standing.bestPlacements = standing.eventResults
        .map(r => r.placement)
        .sort((a, b) => a - b)
        .slice(0, 5);
    }

    bracket.standings.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.eventsPlayed !== a.eventsPlayed) return b.eventsPlayed - a.eventsPlayed;
      const bestA = Math.min(...a.bestPlacements) || 999;
      const bestB = Math.min(...b.bestPlacements) || 999;
      return bestA - bestB;
    });
  }

  getStandings(bracket: Bracket, _matches: Match[]): Standing[] {
    const circuitBracket = bracket as CircuitBracket;
    return calculateCircuitStandings(circuitBracket.events);
  }

  isComplete(bracket: Bracket, _matches: Match[]): boolean {
    const circuitBracket = bracket as CircuitBracket;
    if (circuitBracket.seasonEndsAt && Date.now() >= circuitBracket.seasonEndsAt) {
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
    return 'circuit';
  }

  override getCurrentRound(bracket: Bracket, _matches: Match[]): number {
    return (bracket as CircuitBracket).events.length;
  }

  getQualifiedParticipants(bracket: Bracket): string[] {
    const circuitBracket = bracket as CircuitBracket;
    const qualifyTop = (circuitBracket.config as CircuitConfig).qualifyTop || 8;
    return circuitBracket.standings
      .slice(0, qualifyTop)
      .map(s => s.participantId);
  }

  getParticipantHistory(bracket: Bracket, participantId: string): {
    participantId: string;
    totalPoints: number;
    eventsPlayed: number;
    results: CircuitStandingEntry['eventResults'];
    rank: number;
  } | null {
    const circuitBracket = bracket as CircuitBracket;
    const standing = circuitBracket.standings.find(s => s.participantId === participantId);
    if (!standing) return null;

    return {
      participantId,
      totalPoints: standing.totalPoints,
      eventsPlayed: standing.eventsPlayed,
      results: standing.eventResults,
      rank: circuitBracket.standings.indexOf(standing) + 1
    };
  }

  getEventList(bracket: Bracket): {
    id: string;
    name: string;
    tier: string;
    multiplier: number;
    completedAt: number;
    participantCount: number;
  }[] {
    const circuitBracket = bracket as CircuitBracket;
    return circuitBracket.events.map(e => ({
      id: e.id,
      name: e.name,
      tier: e.tier,
      multiplier: e.multiplier,
      completedAt: e.completedAt,
      participantCount: e.results.length
    }));
  }

  completeCircuit(bracket: Bracket): Bracket {
    const circuitBracket = bracket as CircuitBracket;
    circuitBracket.seasonEndsAt = Date.now();
    return circuitBracket;
  }
}
