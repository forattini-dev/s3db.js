/**
 * Round Robin Format
 * All participants play against each other
 * Supports single and double round-robin (1 or 2 turns)
 */
import { BaseFormat } from './base-format.js';
import { generateRoundRobinSchedule } from '../bracket-generator.js';
import { calculateRoundRobinStandings, applyHeadToHead } from '../standings-calculator.js';

export class RoundRobinFormat extends BaseFormat {
  static get type() {
    return 'round-robin';
  }

  static get displayName() {
    return 'Round Robin (Pontos Corridos)';
  }

  static get defaultConfig() {
    return {
      rounds: 1,        // 1 = single, 2 = double (turno e returno)
      bestOf: 1,
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreaker: 'goal-difference', // goal-difference, head-to-head, goals-scored
      allowDraws: true
    };
  }

  validate(participants, config) {
    const errors = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    if (participants.length > 30) {
      errors.push('Round robin not recommended for more than 30 participants');
    }

    if (config.rounds && config.rounds < 1) {
      errors.push('At least 1 round required');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants, config) {
    const schedule = generateRoundRobinSchedule(participants, {
      rounds: config.rounds || 1,
      bestOf: config.bestOf || 1
    });

    return {
      type: 'round-robin',
      participants: [...participants],
      config: { ...this.config, ...config },
      schedule,
      currentRound: 1
    };
  }

  getInitialMatches(bracket) {
    // Return first round matches
    if (!bracket.schedule.matches.length) return [];

    return bracket.schedule.matches[0].map(match => ({
      ...this.createMatchTemplate({
        phase: 'league',
        round: match.round,
        matchNumber: match.matchNumber,
        participant1Id: match.participant1Id,
        participant2Id: match.participant2Id,
        bestOf: match.bestOf || this.config.bestOf
      }),
      id: match.id
    }));
  }

  onMatchComplete(bracket, completedMatch) {
    const newMatches = [];
    const roundMatches = bracket.schedule.matches.flat();

    // Find completed matches in current round
    const currentRoundMatches = roundMatches.filter(m => m.round === bracket.currentRound);
    const completedInRound = currentRoundMatches.filter(m =>
      m.status === 'completed' || m.id === completedMatch.id
    );

    // Check if round is complete
    if (completedInRound.length === currentRoundMatches.length) {
      // Move to next round
      const nextRoundIndex = bracket.currentRound;

      if (nextRoundIndex < bracket.schedule.matches.length) {
        bracket.currentRound++;

        // Return next round matches
        for (const match of bracket.schedule.matches[nextRoundIndex]) {
          newMatches.push({
            ...this.createMatchTemplate({
              phase: 'league',
              round: match.round,
              matchNumber: match.matchNumber,
              participant1Id: match.participant1Id,
              participant2Id: match.participant2Id,
              bestOf: match.bestOf || this.config.bestOf
            }),
            id: match.id
          });
        }
      }
    }

    return { bracket, newMatches };
  }

  getNextMatches(bracket, completedMatches) {
    const completedIds = new Set(completedMatches.map(m => m.id));
    const allMatches = bracket.schedule.matches.flat();

    return allMatches.filter(m =>
      !completedIds.has(m.id) &&
      m.round === bracket.currentRound
    );
  }

  getStandings(bracket, matches) {
    const standings = calculateRoundRobinStandings(
      bracket.participants,
      matches,
      {
        pointsWin: this.config.pointsWin,
        pointsDraw: this.config.pointsDraw,
        pointsLoss: this.config.pointsLoss
      }
    );

    // Apply tiebreaker if needed
    if (this.config.tiebreaker === 'head-to-head') {
      // Group by points
      const pointGroups = new Map();
      for (const s of standings) {
        const key = s.points;
        if (!pointGroups.has(key)) pointGroups.set(key, []);
        pointGroups.get(key).push(s);
      }

      // Apply head-to-head within each group
      const result = [];
      for (const [points, group] of pointGroups) {
        if (group.length > 1) {
          result.push(...applyHeadToHead(group, matches));
        } else {
          result.push(...group);
        }
      }

      return result.sort((a, b) => b.points - a.points);
    }

    return standings;
  }

  isComplete(bracket, matches) {
    const totalMatchesExpected = bracket.schedule.matches.flat().length;
    const completedMatches = matches.filter(m => m.status === 'completed');

    return completedMatches.length >= totalMatchesExpected;
  }

  getWinner(bracket, matches) {
    if (!this.isComplete(bracket, matches)) return null;

    const standings = this.getStandings(bracket, matches);
    return standings.length > 0 ? standings[0].participantId : null;
  }

  getCurrentPhase(bracket, matches) {
    return 'league';
  }

  getCurrentRound(bracket, matches) {
    return bracket.currentRound;
  }

  calculateTiebreaker(participantStats) {
    switch (this.config.tiebreaker) {
      case 'goals-scored':
        return participantStats.goalsFor || 0;
      case 'head-to-head':
        return participantStats.h2hPoints || 0;
      case 'goal-difference':
      default:
        return participantStats.goalDifference || 0;
    }
  }

  getTotalRounds(participants, config) {
    const n = participants.length;
    const matchesPerRound = n % 2 === 0 ? n - 1 : n;
    return matchesPerRound * (config.rounds || 1);
  }

  getTotalMatches(participants, config) {
    const n = participants.length;
    const matchesPerTurn = (n * (n - 1)) / 2;
    return matchesPerTurn * (config.rounds || 1);
  }
}
