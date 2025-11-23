/**
 * Circuit Format
 * Multiple independent events that accumulate points
 * Used in ATP/WTA, F1, Capcom Pro Tour, RLCS
 */
import { BaseFormat } from './base-format.js';
import { calculateCircuitStandings } from '../standings-calculator.js';

export class CircuitFormat extends BaseFormat {
  static get type() {
    return 'circuit';
  }

  static get displayName() {
    return 'Circuit (Circuito de Pontos)';
  }

  static get defaultConfig() {
    return {
      // Points distribution
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

      // Circuit rules
      countBestN: null,         // Only count top N results (null = all)
      qualifyTop: 8,            // Top N qualify for finals
      seasonDuration: null,     // Season length in ms (null = manual)

      // Event tiers (multipliers)
      eventTiers: {
        major: 2.0,
        premier: 1.5,
        standard: 1.0,
        minor: 0.5
      }
    };
  }

  validate(participants, config) {
    const errors = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants, config) {
    return {
      type: 'circuit',
      config: { ...this.config, ...config },
      participants: [...participants],
      events: [],           // List of completed events
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

  getInitialMatches(bracket) {
    // Circuit doesn't have initial matches - events are added separately
    return [];
  }

  onMatchComplete(bracket, completedMatch) {
    // Circuit format doesn't process individual matches
    // Events are added via addEvent()
    return { bracket, newMatches: [] };
  }

  /**
   * Add a completed event to the circuit
   * @param {Object} bracket - Circuit bracket
   * @param {Object} event - Event data
   * @param {string} event.id - Event ID
   * @param {string} event.name - Event name
   * @param {string} event.tier - Event tier (major, premier, standard, minor)
   * @param {Array} event.results - Array of { participantId, placement }
   * @returns {Object} Updated bracket
   */
  addEvent(bracket, event) {
    const { id, name, tier = 'standard', results } = event;

    const multiplier = bracket.config.eventTiers[tier] || 1.0;
    const pointsTable = bracket.config.pointsTable;

    // Calculate points for each participant
    const eventWithPoints = {
      id,
      name,
      tier,
      multiplier,
      completedAt: Date.now(),
      results: results.map(r => ({
        participantId: r.participantId,
        placement: r.placement,
        basePoints: pointsTable[r.placement] || 0,
        points: Math.round((pointsTable[r.placement] || 0) * multiplier)
      }))
    };

    bracket.events.push(eventWithPoints);

    // Update standings
    for (const result of eventWithPoints.results) {
      const standing = bracket.standings.find(s => s.participantId === result.participantId);
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

    // Recalculate total points
    this._recalculateStandings(bracket);

    return bracket;
  }

  _recalculateStandings(bracket) {
    const countBestN = bracket.config.countBestN;

    for (const standing of bracket.standings) {
      let pointsToCount = standing.eventResults.map(r => r.points);

      // If counting only best N results
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

    // Sort standings
    bracket.standings.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      // Tiebreaker: more events played
      if (b.eventsPlayed !== a.eventsPlayed) return b.eventsPlayed - a.eventsPlayed;
      // Tiebreaker: best placement
      const bestA = Math.min(...a.bestPlacements) || 999;
      const bestB = Math.min(...b.bestPlacements) || 999;
      return bestA - bestB;
    });
  }

  getStandings(bracket, matches) {
    return calculateCircuitStandings(bracket.events, bracket.config);
  }

  isComplete(bracket, matches) {
    if (bracket.seasonEndsAt && Date.now() >= bracket.seasonEndsAt) {
      return true;
    }
    return false; // Manual completion
  }

  getWinner(bracket, matches) {
    if (!this.isComplete(bracket, matches)) return null;

    const standings = this.getStandings(bracket, matches);
    return standings.length > 0 ? standings[0].participantId : null;
  }

  getCurrentPhase(bracket, matches) {
    return 'circuit';
  }

  getCurrentRound(bracket, matches) {
    return bracket.events.length;
  }

  getQualifiedParticipants(bracket) {
    const qualifyTop = bracket.config.qualifyTop || 8;
    return bracket.standings
      .slice(0, qualifyTop)
      .map(s => s.participantId);
  }

  getParticipantHistory(bracket, participantId) {
    const standing = bracket.standings.find(s => s.participantId === participantId);
    if (!standing) return null;

    return {
      participantId,
      totalPoints: standing.totalPoints,
      eventsPlayed: standing.eventsPlayed,
      results: standing.eventResults,
      rank: bracket.standings.indexOf(standing) + 1
    };
  }

  getEventList(bracket) {
    return bracket.events.map(e => ({
      id: e.id,
      name: e.name,
      tier: e.tier,
      multiplier: e.multiplier,
      completedAt: e.completedAt,
      participantCount: e.results.length
    }));
  }

  completeCircuit(bracket) {
    bracket.seasonEndsAt = Date.now();
    return bracket;
  }
}
