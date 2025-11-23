/**
 * Promotion/Relegation Format
 * Multi-division system with teams moving between divisions
 * Used in football worldwide, esports tier systems (Ascension)
 */
import { BaseFormat } from './base-format.js';
import { RoundRobinFormat } from './round-robin.js';
import { calculateRoundRobinStandings } from '../standings-calculator.js';

export class PromotionRelegationFormat extends BaseFormat {
  static get type() {
    return 'promotion-relegation';
  }

  static get displayName() {
    return 'Promotion/Relegation (Divisões)';
  }

  static get defaultConfig() {
    return {
      divisions: 2,           // Number of divisions
      teamsPerDivision: 10,   // Teams in each division
      rounds: 2,              // Round robin turns per season
      bestOf: 1,

      // Promotion/Relegation rules
      promotionSpots: 2,      // Direct promotion spots
      relegationSpots: 2,     // Direct relegation spots
      playoffSpots: 0,        // Playoff spots (promotion/relegation playoffs)

      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,

      seasonDuration: null    // Season length in ms
    };
  }

  validate(participants, config) {
    const errors = [];

    const divisions = config.divisions || 2;
    const perDivision = config.teamsPerDivision || 10;
    const totalNeeded = divisions * perDivision;

    if (!participants || participants.length < totalNeeded) {
      errors.push(`Need ${totalNeeded} participants for ${divisions} divisions with ${perDivision} teams each`);
    }

    if (config.promotionSpots >= perDivision / 2) {
      errors.push('Promotion spots too high');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants, config) {
    const divisions = config.divisions || 2;
    const perDivision = config.teamsPerDivision || Math.ceil(participants.length / divisions);

    // Distribute participants into divisions
    const divisionBrackets = [];

    for (let i = 0; i < divisions; i++) {
      const divisionParticipants = participants.slice(i * perDivision, (i + 1) * perDivision);

      const leagueFormat = new RoundRobinFormat({
        rounds: config.rounds || 2,
        bestOf: config.bestOf || 1,
        pointsWin: config.pointsWin,
        pointsDraw: config.pointsDraw,
        pointsLoss: config.pointsLoss
      });

      divisionBrackets.push({
        divisionId: i + 1,
        divisionName: this._getDivisionName(i),
        participants: divisionParticipants,
        bracket: leagueFormat.generateBracket(divisionParticipants, config),
        standings: [],
        complete: false
      });
    }

    return {
      type: 'promotion-relegation',
      config: { ...this.config, ...config },
      divisions: divisionBrackets,
      promotions: [],      // { participantId, fromDivision, toDivision }
      relegations: [],
      playoffMatches: [],  // If playoff spots > 0
      season: 1,
      seasonStartedAt: Date.now(),
      seasonComplete: false
    };
  }

  _getDivisionName(index) {
    const names = ['Premier', 'Championship', 'League One', 'League Two', 'National'];
    return names[index] || `Division ${index + 1}`;
  }

  getInitialMatches(bracket) {
    const matches = [];

    for (const division of bracket.divisions) {
      const leagueFormat = new RoundRobinFormat(division.bracket.config);
      const divisionMatches = leagueFormat.getInitialMatches(division.bracket);

      for (const match of divisionMatches) {
        matches.push({
          ...match,
          id: `D${division.divisionId}_${match.id}`,
          divisionId: division.divisionId,
          divisionName: division.divisionName
        });
      }
    }

    return matches;
  }

  onMatchComplete(bracket, completedMatch) {
    const { divisionId } = completedMatch;
    const division = bracket.divisions.find(d => d.divisionId === divisionId);
    const newMatches = [];

    if (!division) return { bracket, newMatches };

    const leagueFormat = new RoundRobinFormat(division.bracket.config);

    // Strip division prefix from match ID for processing
    const strippedMatch = {
      ...completedMatch,
      id: completedMatch.id.replace(`D${divisionId}_`, '')
    };

    const { bracket: updatedDivisionBracket, newMatches: divisionNewMatches } =
      leagueFormat.onMatchComplete(division.bracket, strippedMatch);

    division.bracket = updatedDivisionBracket;

    // Check if division is complete
    const allMatches = division.bracket.schedule.matches.flat();
    const completedCount = allMatches.filter(m => m.status === 'completed').length;

    if (completedCount >= allMatches.length) {
      division.complete = true;
      division.standings = leagueFormat.getStandings(division.bracket, allMatches);
    }

    // Add division prefix to new matches
    for (const match of divisionNewMatches) {
      newMatches.push({
        ...match,
        id: `D${divisionId}_${match.id}`,
        divisionId,
        divisionName: division.divisionName
      });
    }

    // Check if all divisions are complete
    if (bracket.divisions.every(d => d.complete)) {
      this._processEndOfSeason(bracket, newMatches);
    }

    return { bracket, newMatches };
  }

  _processEndOfSeason(bracket, newMatches) {
    const config = bracket.config;
    const promotionSpots = config.promotionSpots || 2;
    const relegationSpots = config.relegationSpots || 2;
    const playoffSpots = config.playoffSpots || 0;

    bracket.promotions = [];
    bracket.relegations = [];

    // Process each division (except top and bottom for special cases)
    for (let i = 0; i < bracket.divisions.length; i++) {
      const division = bracket.divisions[i];
      const standings = division.standings;
      const teamCount = standings.length;

      // Promotion (except top division)
      if (i > 0) {
        // Direct promotion - top spots
        for (let j = 0; j < promotionSpots && j < standings.length; j++) {
          bracket.promotions.push({
            participantId: standings[j].participantId,
            fromDivision: division.divisionId,
            toDivision: division.divisionId - 1,
            type: 'direct'
          });
        }
      }

      // Relegation (except bottom division)
      if (i < bracket.divisions.length - 1) {
        // Direct relegation - bottom spots
        for (let j = 0; j < relegationSpots && j < standings.length; j++) {
          const idx = teamCount - 1 - j;
          bracket.relegations.push({
            participantId: standings[idx].participantId,
            fromDivision: division.divisionId,
            toDivision: division.divisionId + 1,
            type: 'direct'
          });
        }
      }

      // Playoff spots (if configured)
      if (playoffSpots > 0 && i > 0 && i < bracket.divisions.length - 1) {
        // Teams just above relegation zone vs teams just below promotion zone
        // This creates promotion/relegation playoffs
      }
    }

    bracket.seasonComplete = true;
  }

  getStandings(bracket, matches) {
    const allStandings = [];

    for (const division of bracket.divisions) {
      const divisionMatches = matches.filter(m => m.divisionId === division.divisionId);
      const leagueFormat = new RoundRobinFormat(division.bracket.config);
      const standings = leagueFormat.getStandings(division.bracket, divisionMatches);

      for (const s of standings) {
        allStandings.push({
          ...s,
          divisionId: division.divisionId,
          divisionName: division.divisionName
        });
      }
    }

    return allStandings;
  }

  isComplete(bracket, matches) {
    return bracket.seasonComplete;
  }

  getWinner(bracket, matches) {
    // Winner is top of first division
    if (!this.isComplete(bracket, matches)) return null;

    const topDivision = bracket.divisions[0];
    return topDivision.standings[0]?.participantId || null;
  }

  getCurrentPhase(bracket, matches) {
    return 'league';
  }

  getCurrentRound(bracket, matches) {
    // Return minimum incomplete round across all divisions
    let minRound = Infinity;

    for (const division of bracket.divisions) {
      if (!division.complete) {
        const leagueFormat = new RoundRobinFormat(division.bracket.config);
        const divisionMatches = matches.filter(m => m.divisionId === division.divisionId);
        const round = leagueFormat.getCurrentRound(division.bracket, divisionMatches);
        minRound = Math.min(minRound, round);
      }
    }

    return minRound === Infinity ? 1 : minRound;
  }

  getDivisionStandings(bracket, divisionId) {
    const division = bracket.divisions.find(d => d.divisionId === divisionId);
    if (!division) return null;

    return {
      divisionId,
      divisionName: division.divisionName,
      standings: division.standings,
      promotionZone: this._getPromotionZone(bracket, divisionId),
      relegationZone: this._getRelegationZone(bracket, divisionId)
    };
  }

  _getPromotionZone(bracket, divisionId) {
    const division = bracket.divisions.find(d => d.divisionId === divisionId);
    if (!division || divisionId === 1) return []; // Top division can't promote

    const spots = bracket.config.promotionSpots || 2;
    return division.standings.slice(0, spots).map(s => s.participantId);
  }

  _getRelegationZone(bracket, divisionId) {
    const division = bracket.divisions.find(d => d.divisionId === divisionId);
    if (!division || divisionId === bracket.divisions.length) return []; // Bottom division can't relegate

    const spots = bracket.config.relegationSpots || 2;
    return division.standings.slice(-spots).map(s => s.participantId);
  }

  getPromotions(bracket) {
    return bracket.promotions;
  }

  getRelegations(bracket) {
    return bracket.relegations;
  }

  getDivisions(bracket) {
    return bracket.divisions.map(d => ({
      divisionId: d.divisionId,
      divisionName: d.divisionName,
      participantCount: d.participants.length,
      complete: d.complete
    }));
  }

  /**
   * Apply promotions/relegations and start new season
   */
  newSeason(bracket) {
    if (!bracket.seasonComplete) {
      throw new Error('Current season not complete');
    }

    // Swap participants between divisions based on promotions/relegations
    for (const promo of bracket.promotions) {
      this._moveParticipant(bracket, promo.participantId, promo.fromDivision, promo.toDivision);
    }

    for (const releg of bracket.relegations) {
      this._moveParticipant(bracket, releg.participantId, releg.fromDivision, releg.toDivision);
    }

    // Reset for new season
    bracket.season++;
    bracket.seasonStartedAt = Date.now();
    bracket.seasonComplete = false;
    bracket.promotions = [];
    bracket.relegations = [];

    // Regenerate brackets for each division
    for (const division of bracket.divisions) {
      const leagueFormat = new RoundRobinFormat({
        rounds: bracket.config.rounds || 2,
        bestOf: bracket.config.bestOf || 1,
        pointsWin: bracket.config.pointsWin,
        pointsDraw: bracket.config.pointsDraw,
        pointsLoss: bracket.config.pointsLoss
      });

      division.bracket = leagueFormat.generateBracket(division.participants, bracket.config);
      division.standings = [];
      division.complete = false;
    }

    return bracket;
  }

  _moveParticipant(bracket, participantId, fromDivisionId, toDivisionId) {
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
