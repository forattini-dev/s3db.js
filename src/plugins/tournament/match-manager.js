/**
 * Match Manager
 * Handles match operations and result reporting
 */
import { idGenerator } from '../../concerns/id.js';

export class MatchManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.logger = plugin.logger;
  }

  get resource() {
    return this.plugin.matchesResource;
  }

  /**
   * Create a new match
   */
  async create(data) {
    const {
      tournamentId,
      phase = 'main',
      round,
      matchNumber,
      participant1Id = null,
      participant2Id = null,
      bestOf = 1,
      groupId = null,
      nextMatchId = null,
      loserNextMatchId = null,
      scheduledAt = null,
      metadata = {}
    } = data;

    if (!tournamentId) throw new Error('Tournament ID is required');

    // Always generate unique ID - use provided id as a reference in metadata
    const matchRefId = data.id;
    const match = await this.resource.insert({
      id: idGenerator(),
      tournamentId,
      phase,
      round,
      matchNumber,
      participant1Id,
      participant2Id,
      bestOf,
      games: [],
      score1: 0,
      score2: 0,
      winnerId: null,
      loserId: null,
      status: this._determineInitialStatus(participant1Id, participant2Id),
      groupId,
      nextMatchId,
      loserNextMatchId,
      scheduledAt,
      startedAt: null,
      completedAt: null,
      metadata: { ...metadata, matchRef: matchRefId }
    });

    this.plugin.emit('plg:tournament:match-created', { match });

    return match;
  }

  /**
   * Determine initial match status
   */
  _determineInitialStatus(p1, p2) {
    if (p1 && p2) return 'pending';
    if (p1 || p2) return 'waiting'; // Waiting for opponent
    return 'empty'; // No participants yet
  }

  /**
   * Get match by ID
   */
  async get(id) {
    return this.resource.get(id);
  }

  /**
   * Get matches by tournament
   */
  async getByTournament(tournamentId, filters = {}) {
    const { phase, round, status, limit = 1000 } = filters;

    let matches = await this.resource.listPartition({
      partition: 'byTournament',
      partitionValues: { tournamentId },
      limit
    });

    if (phase) matches = matches.filter(m => m.phase === phase);
    if (round) matches = matches.filter(m => m.round === round);
    if (status) matches = matches.filter(m => m.status === status);

    return matches.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.matchNumber - b.matchNumber;
    });
  }

  /**
   * Delete all matches for a tournament
   */
  async deleteByTournament(tournamentId) {
    const matches = await this.getByTournament(tournamentId);

    for (const match of matches) {
      await this.resource.delete(match.id);
    }

    return matches.length;
  }

  /**
   * Schedule a match
   */
  async schedule(matchId, scheduledAt) {
    const match = await this.resource.get(matchId);
    if (!match) throw new Error('Match not found');

    if (match.status === 'completed') {
      throw new Error('Cannot schedule completed match');
    }

    await this.resource.update(matchId, {
      scheduledAt,
      status: match.status === 'empty' ? 'empty' : 'scheduled'
    });

    this.plugin.emit('plg:tournament:match-scheduled', {
      matchId,
      tournamentId: match.tournamentId,
      scheduledAt
    });

    this.logger.debug({ matchId, scheduledAt }, 'Match scheduled');
  }

  /**
   * Start a match
   */
  async start(matchId) {
    const match = await this.resource.get(matchId);
    if (!match) throw new Error('Match not found');

    if (!match.participant1Id || !match.participant2Id) {
      throw new Error('Cannot start match without both participants');
    }

    if (!['pending', 'scheduled'].includes(match.status)) {
      throw new Error(`Cannot start match. Current status: ${match.status}`);
    }

    await this.resource.update(matchId, {
      status: 'in-progress',
      startedAt: Date.now()
    });

    this.plugin.emit('plg:tournament:match-started', {
      matchId,
      tournamentId: match.tournamentId,
      participant1Id: match.participant1Id,
      participant2Id: match.participant2Id
    });

    this.logger.debug({ matchId }, 'Match started');
  }

  /**
   * Report match result
   */
  async reportResult(matchId, result) {
    const { score1, score2, games = [], metadata = {} } = result;

    const match = await this.resource.get(matchId);
    if (!match) throw new Error('Match not found');

    if (!['pending', 'scheduled', 'in-progress'].includes(match.status)) {
      throw new Error(`Cannot report result. Current status: ${match.status}`);
    }

    if (typeof score1 !== 'number' || typeof score2 !== 'number') {
      throw new Error('Scores must be numbers');
    }

    // Determine winner for best-of series
    const winsNeeded = Math.ceil(match.bestOf / 2);
    let winnerId = null;
    let loserId = null;

    if (score1 >= winsNeeded) {
      winnerId = match.participant1Id;
      loserId = match.participant2Id;
    } else if (score2 >= winsNeeded) {
      winnerId = match.participant2Id;
      loserId = match.participant1Id;
    } else if (match.bestOf === 1) {
      // Bo1 - higher score wins
      if (score1 > score2) {
        winnerId = match.participant1Id;
        loserId = match.participant2Id;
      } else if (score2 > score1) {
        winnerId = match.participant2Id;
        loserId = match.participant1Id;
      }
      // Draw allowed in some formats
    }

    const updatedMatch = await this.resource.update(matchId, {
      score1,
      score2,
      games: games.length > 0 ? games : match.games,
      winnerId,
      loserId,
      status: 'completed',
      completedAt: Date.now(),
      metadata: { ...match.metadata, ...metadata }
    });

    this.plugin.emit('plg:tournament:match-completed', {
      matchId,
      tournamentId: match.tournamentId,
      winnerId,
      loserId,
      score1,
      score2
    });

    this.logger.info({
      matchId,
      tournamentId: match.tournamentId,
      winnerId,
      score: `${score1}-${score2}`
    }, 'Match completed');

    // Trigger bracket update
    await this.plugin.tournamentManager.updateBracket(match.tournamentId, updatedMatch);

    // Advance winner to next match if applicable
    if (winnerId && match.nextMatchId) {
      await this._advanceToMatch(match.nextMatchId, winnerId, 'winner');
    }

    // Move loser to losers bracket if applicable (double elimination)
    if (loserId && match.loserNextMatchId) {
      await this._advanceToMatch(match.loserNextMatchId, loserId, 'loser');
    }

    return updatedMatch;
  }

  /**
   * Report a walkover (one participant wins by default)
   */
  async reportWalkover(matchId, winnerId, reason = '') {
    const match = await this.resource.get(matchId);
    if (!match) throw new Error('Match not found');

    if (winnerId !== match.participant1Id && winnerId !== match.participant2Id) {
      throw new Error('Winner must be one of the match participants');
    }

    const loserId = winnerId === match.participant1Id
      ? match.participant2Id
      : match.participant1Id;

    const updatedMatch = await this.resource.update(matchId, {
      winnerId,
      loserId,
      status: 'walkover',
      completedAt: Date.now(),
      metadata: { ...match.metadata, walkoverReason: reason }
    });

    this.plugin.emit('plg:tournament:match-walkover', {
      matchId,
      tournamentId: match.tournamentId,
      winnerId,
      loserId,
      reason
    });

    this.logger.info({ matchId, winnerId, reason }, 'Walkover reported');

    // Trigger bracket update
    await this.plugin.tournamentManager.updateBracket(match.tournamentId, updatedMatch);

    // Advance winner
    if (match.nextMatchId) {
      await this._advanceToMatch(match.nextMatchId, winnerId, 'winner');
    }

    if (loserId && match.loserNextMatchId) {
      await this._advanceToMatch(match.loserNextMatchId, loserId, 'loser');
    }

    return updatedMatch;
  }

  /**
   * Report individual game in a best-of series
   */
  async reportGame(matchId, game) {
    const { score1, score2, metadata = {} } = game;

    const match = await this.resource.get(matchId);
    if (!match) throw new Error('Match not found');

    if (!['pending', 'scheduled', 'in-progress'].includes(match.status)) {
      throw new Error(`Cannot report game. Match status: ${match.status}`);
    }

    const gameNumber = match.games.length + 1;
    const newGame = {
      gameNumber,
      score1,
      score2,
      winner: score1 > score2 ? match.participant1Id : (score2 > score1 ? match.participant2Id : null),
      reportedAt: Date.now(),
      metadata
    };

    const updatedGames = [...match.games, newGame];

    // Calculate series score
    const p1Wins = updatedGames.filter(g => g.winner === match.participant1Id).length;
    const p2Wins = updatedGames.filter(g => g.winner === match.participant2Id).length;

    // Check if series is complete
    const winsNeeded = Math.ceil(match.bestOf / 2);
    const seriesComplete = p1Wins >= winsNeeded || p2Wins >= winsNeeded;

    if (seriesComplete) {
      return this.reportResult(matchId, {
        score1: p1Wins,
        score2: p2Wins,
        games: updatedGames
      });
    }

    // Update with new game
    await this.resource.update(matchId, {
      games: updatedGames,
      score1: p1Wins,
      score2: p2Wins,
      status: 'in-progress'
    });

    this.plugin.emit('plg:tournament:game-reported', {
      matchId,
      tournamentId: match.tournamentId,
      gameNumber,
      currentScore: `${p1Wins}-${p2Wins}`
    });

    return this.resource.get(matchId);
  }

  /**
   * Get upcoming matches (scheduled but not started)
   */
  async getUpcoming(tournamentId, limit = 10) {
    const matches = await this.getByTournament(tournamentId, { status: 'scheduled' });
    return matches
      .filter(m => m.scheduledAt && m.scheduledAt > Date.now())
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .slice(0, limit);
  }

  /**
   * Get live matches (in progress)
   */
  async getLive(tournamentId) {
    return this.getByTournament(tournamentId, { status: 'in-progress' });
  }

  /**
   * Advance participant to next match
   */
  async _advanceToMatch(matchId, participantId, slot) {
    const match = await this.resource.get(matchId);
    if (!match) {
      this.logger.warn({ matchId, participantId }, 'Next match not found for advancement');
      return;
    }

    // Determine which slot to fill
    const update = {};
    if (!match.participant1Id) {
      update.participant1Id = participantId;
    } else if (!match.participant2Id) {
      update.participant2Id = participantId;
    } else {
      this.logger.warn({ matchId }, 'Both slots already filled');
      return;
    }

    // Update status if both participants are now set
    if (update.participant1Id && match.participant2Id) {
      update.status = 'pending';
    } else if (update.participant2Id && match.participant1Id) {
      update.status = 'pending';
    }

    await this.resource.update(matchId, update);

    this.logger.debug({ matchId, participantId, slot }, 'Participant advanced');
  }

  /**
   * Set participant for a specific match slot
   */
  async setParticipant(matchId, participantId, slot) {
    const match = await this.resource.get(matchId);
    if (!match) throw new Error('Match not found');

    if (slot !== 1 && slot !== 2) {
      throw new Error('Slot must be 1 or 2');
    }

    const update = slot === 1
      ? { participant1Id: participantId }
      : { participant2Id: participantId };

    // Check if both slots are now filled
    const otherParticipant = slot === 1 ? match.participant2Id : match.participant1Id;
    if (otherParticipant && participantId) {
      update.status = 'pending';
    }

    await this.resource.update(matchId, update);
  }
}
