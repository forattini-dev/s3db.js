/**
 * League + Playoffs Format
 * Regular season with points/standings followed by elimination playoffs
 * Used in LoL (LCS, LEC, CBLOL), VCT, NBA, NFL
 */
import { BaseFormat } from './base-format.js';
import { RoundRobinFormat } from './round-robin.js';
import { SingleEliminationFormat } from './single-elimination.js';
import { DoubleEliminationFormat } from './double-elimination.js';

export class LeaguePlayoffsFormat extends BaseFormat {
  static get type() {
    return 'league-playoffs';
  }

  static get displayName() {
    return 'League + Playoffs (Liga + Mata-Mata)';
  }

  static get defaultConfig() {
    return {
      // League phase config
      leagueRounds: 2,          // Double round robin
      leagueBestOf: 1,
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,

      // Playoffs config
      playoffsFormat: 'single-elimination', // 'single-elimination' or 'double-elimination'
      playoffsSize: 8,          // Top N qualify for playoffs
      playoffsBestOf: 3,
      playoffsFinalsBestOf: 5,

      // Special rules
      byesForTopSeeds: 0,       // Top N seeds get first round byes
      thirdPlaceMatch: false
    };
  }

  validate(participants, config) {
    const errors = [];

    if (!participants || participants.length < 4) {
      errors.push('Minimum 4 participants required');
    }

    const playoffsSize = config.playoffsSize || 8;
    if (playoffsSize > participants.length) {
      errors.push(`Playoffs size (${playoffsSize}) cannot exceed participant count`);
    }

    if (playoffsSize < 2) {
      errors.push('Playoffs must have at least 2 participants');
    }

    return { valid: errors.length === 0, errors };
  }

  generateBracket(participants, config) {
    // Create league phase
    const leagueFormat = new RoundRobinFormat({
      rounds: config.leagueRounds || 2,
      bestOf: config.leagueBestOf || 1,
      pointsWin: config.pointsWin,
      pointsDraw: config.pointsDraw,
      pointsLoss: config.pointsLoss
    });

    const leagueBracket = leagueFormat.generateBracket(participants, config);

    return {
      type: 'league-playoffs',
      config: { ...this.config, ...config },
      phase: 'league', // 'league' or 'playoffs'
      participants: [...participants],

      // League phase
      league: {
        bracket: leagueBracket,
        standings: [],
        complete: false
      },

      // Playoffs phase (generated when league completes)
      playoffs: {
        bracket: null,
        qualifiedParticipants: [],
        complete: false
      }
    };
  }

  getInitialMatches(bracket) {
    const leagueFormat = new RoundRobinFormat(bracket.league.bracket.config);
    return leagueFormat.getInitialMatches(bracket.league.bracket);
  }

  onMatchComplete(bracket, completedMatch) {
    const newMatches = [];

    if (bracket.phase === 'league') {
      return this._processLeagueMatch(bracket, completedMatch, newMatches);
    } else if (bracket.phase === 'playoffs') {
      return this._processPlayoffsMatch(bracket, completedMatch, newMatches);
    }

    return { bracket, newMatches };
  }

  _processLeagueMatch(bracket, match, newMatches) {
    const leagueFormat = new RoundRobinFormat(bracket.league.bracket.config);
    const { bracket: updatedLeagueBracket, newMatches: leagueNewMatches } =
      leagueFormat.onMatchComplete(bracket.league.bracket, match);

    bracket.league.bracket = updatedLeagueBracket;

    // Check if league is complete
    const allMatches = bracket.league.bracket.schedule.matches.flat();
    const completedCount = allMatches.filter(m => m.status === 'completed').length;

    if (completedCount >= allMatches.length) {
      bracket.league.complete = true;

      // Calculate final standings
      bracket.league.standings = leagueFormat.getStandings(bracket.league.bracket, allMatches);

      // Transition to playoffs
      bracket.phase = 'playoffs';
      const playoffsMatches = this._initializePlayoffs(bracket);
      newMatches.push(...playoffsMatches);
    } else {
      newMatches.push(...leagueNewMatches);
    }

    return { bracket, newMatches };
  }

  _initializePlayoffs(bracket) {
    const config = bracket.config;
    const playoffsSize = config.playoffsSize || 8;

    // Get top N from league standings
    const qualifiedParticipants = bracket.league.standings
      .slice(0, playoffsSize)
      .map(s => s.participantId);

    bracket.playoffs.qualifiedParticipants = qualifiedParticipants;

    // Create playoffs bracket
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat({
      bestOf: config.playoffsBestOf || 3,
      finalsBestOf: config.playoffsFinalsBestOf || 5,
      thirdPlaceMatch: config.thirdPlaceMatch
    });

    // Apply byes for top seeds
    let seededParticipants = [...qualifiedParticipants];
    if (config.byesForTopSeeds > 0) {
      // Top seeds will be placed to get byes
      // This is handled by the bracket generation
    }

    bracket.playoffs.bracket = playoffsFormat.generateBracket(seededParticipants, config);

    // Get initial playoffs matches
    return playoffsFormat.getInitialMatches(bracket.playoffs.bracket).map(m => ({
      ...m,
      phase: 'playoffs'
    }));
  }

  _processPlayoffsMatch(bracket, match, newMatches) {
    const config = bracket.config;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(bracket.playoffs.bracket.config);
    const { bracket: updatedPlayoffsBracket, newMatches: playoffsNewMatches } =
      playoffsFormat.onMatchComplete(bracket.playoffs.bracket, match);

    bracket.playoffs.bracket = updatedPlayoffsBracket;

    // Check if playoffs complete
    const allPlayoffsMatches = this._getAllPlayoffsMatches(bracket.playoffs.bracket);
    if (playoffsFormat.isComplete(bracket.playoffs.bracket, allPlayoffsMatches)) {
      bracket.playoffs.complete = true;
    }

    newMatches.push(...playoffsNewMatches.map(m => ({
      ...m,
      phase: 'playoffs'
    })));

    return { bracket, newMatches };
  }

  _getAllPlayoffsMatches(playoffsBracket) {
    if (playoffsBracket.type === 'double-elimination') {
      return [
        ...playoffsBracket.winnersMatches.flat(),
        ...playoffsBracket.losersMatches.flat(),
        playoffsBracket.grandFinals
      ].filter(Boolean);
    }
    return playoffsBracket.matches.flat();
  }

  getStandings(bracket, matches) {
    if (bracket.phase === 'league' || !bracket.playoffs.complete) {
      // Return league standings
      const leagueFormat = new RoundRobinFormat(bracket.league.bracket.config);
      return leagueFormat.getStandings(bracket.league.bracket, matches);
    }

    // Combine league and playoffs for final standings
    const standings = [];
    const playoffsMatches = matches.filter(m => m.phase === 'playoffs');

    const config = bracket.config;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(bracket.playoffs.bracket.config);
    const playoffsStandings = playoffsFormat.getStandings(bracket.playoffs.bracket, playoffsMatches);

    // Playoffs participants get top positions
    for (const ps of playoffsStandings) {
      standings.push({
        ...ps,
        qualifiedForPlayoffs: true
      });
    }

    // Non-qualified participants
    const qualifiedIds = new Set(bracket.playoffs.qualifiedParticipants);
    const nonQualified = bracket.league.standings.filter(s => !qualifiedIds.has(s.participantId));

    for (const s of nonQualified) {
      standings.push({
        ...s,
        placement: standings.length + 1,
        qualifiedForPlayoffs: false
      });
    }

    return standings;
  }

  isComplete(bracket, matches) {
    return bracket.league.complete && bracket.playoffs.complete;
  }

  getWinner(bracket, matches) {
    if (!this.isComplete(bracket, matches)) return null;

    const config = bracket.config;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(bracket.playoffs.bracket.config);
    const playoffsMatches = matches.filter(m => m.phase === 'playoffs');

    return playoffsFormat.getWinner(bracket.playoffs.bracket, playoffsMatches);
  }

  getCurrentPhase(bracket, matches) {
    return bracket.phase;
  }

  getCurrentRound(bracket, matches) {
    if (bracket.phase === 'league') {
      const leagueFormat = new RoundRobinFormat(bracket.league.bracket.config);
      return leagueFormat.getCurrentRound(bracket.league.bracket, matches);
    }

    const config = bracket.config;
    const PlayoffsFormat = config.playoffsFormat === 'double-elimination'
      ? DoubleEliminationFormat
      : SingleEliminationFormat;

    const playoffsFormat = new PlayoffsFormat(bracket.playoffs.bracket.config);
    const playoffsMatches = matches.filter(m => m.phase === 'playoffs');

    return playoffsFormat.getCurrentRound(bracket.playoffs.bracket, playoffsMatches);
  }

  getLeagueStandings(bracket, matches) {
    const leagueFormat = new RoundRobinFormat(bracket.league.bracket.config);
    const leagueMatches = matches.filter(m => m.phase === 'league' || !m.phase);
    return leagueFormat.getStandings(bracket.league.bracket, leagueMatches);
  }

  getQualifiedParticipants(bracket) {
    return bracket.playoffs.qualifiedParticipants;
  }
}
