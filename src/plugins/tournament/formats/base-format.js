/**
 * Base class for tournament formats
 * All format implementations must extend this class
 */
export class BaseFormat {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Format type identifier
   * @returns {string}
   */
  static get type() {
    throw new Error('Format must define static type getter');
  }

  /**
   * Human-readable format name
   * @returns {string}
   */
  static get displayName() {
    throw new Error('Format must define static displayName getter');
  }

  /**
   * Default configuration for this format
   * @returns {Object}
   */
  static get defaultConfig() {
    return {
      bestOf: 1,
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0
    };
  }

  /**
   * Validate tournament configuration for this format
   * @param {Array} participants - List of participant IDs
   * @param {Object} config - Format configuration
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(participants, config) {
    const errors = [];

    if (!participants || participants.length < 2) {
      errors.push('Minimum 2 participants required');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate initial bracket/structure for the tournament
   * @param {Array} participants - Seeded list of participant IDs
   * @param {Object} config - Format configuration
   * @returns {Object} Bracket structure
   */
  generateBracket(participants, config) {
    throw new Error('Format must implement generateBracket()');
  }

  /**
   * Get initial matches for the tournament (first round)
   * @param {Object} bracket - Generated bracket structure
   * @returns {Array<Object>} List of match objects
   */
  getInitialMatches(bracket) {
    throw new Error('Format must implement getInitialMatches()');
  }

  /**
   * Process a completed match and update bracket
   * @param {Object} bracket - Current bracket structure
   * @param {Object} match - Completed match object
   * @returns {{ bracket: Object, newMatches: Array<Object> }}
   */
  onMatchComplete(bracket, match) {
    throw new Error('Format must implement onMatchComplete()');
  }

  /**
   * Get pending matches that can be scheduled
   * @param {Object} bracket - Current bracket structure
   * @param {Array<Object>} completedMatches - List of completed matches
   * @returns {Array<Object>} List of schedulable matches
   */
  getNextMatches(bracket, completedMatches) {
    return [];
  }

  /**
   * Calculate current standings/rankings
   * @param {Object} bracket - Current bracket structure
   * @param {Array<Object>} matches - All matches (completed and pending)
   * @returns {Array<Object>} Sorted standings array
   */
  getStandings(bracket, matches) {
    throw new Error('Format must implement getStandings()');
  }

  /**
   * Check if tournament is complete
   * @param {Object} bracket - Current bracket structure
   * @param {Array<Object>} matches - All matches
   * @returns {boolean}
   */
  isComplete(bracket, matches) {
    throw new Error('Format must implement isComplete()');
  }

  /**
   * Get tournament winner(s)
   * @param {Object} bracket - Current bracket structure
   * @param {Array<Object>} matches - All matches
   * @returns {string|Array<string>|null} Winner ID(s) or null if not complete
   */
  getWinner(bracket, matches) {
    if (!this.isComplete(bracket, matches)) {
      return null;
    }
    const standings = this.getStandings(bracket, matches);
    return standings.length > 0 ? standings[0].participantId : null;
  }

  /**
   * Get current phase of the tournament
   * @param {Object} bracket - Current bracket structure
   * @param {Array<Object>} matches - All matches
   * @returns {string}
   */
  getCurrentPhase(bracket, matches) {
    return 'main';
  }

  /**
   * Get current round number
   * @param {Object} bracket - Current bracket structure
   * @param {Array<Object>} matches - All matches
   * @returns {number}
   */
  getCurrentRound(bracket, matches) {
    const completedMatches = matches.filter(m => m.status === 'completed');
    if (completedMatches.length === 0) return 1;
    return Math.max(...completedMatches.map(m => m.round)) + 1;
  }

  /**
   * Serialize format state for storage
   * @param {Object} bracket - Current bracket structure
   * @returns {Object}
   */
  serialize(bracket) {
    return {
      type: this.constructor.type,
      config: this.config,
      bracket
    };
  }

  /**
   * Deserialize format state from storage
   * @param {Object} data - Serialized data
   * @returns {Object} Bracket structure
   */
  static deserialize(data) {
    return data.bracket;
  }

  /**
   * Calculate tiebreaker score for a participant
   * @param {Object} participantStats - Participant statistics
   * @returns {number}
   */
  calculateTiebreaker(participantStats) {
    return participantStats.goalDifference || 0;
  }

  /**
   * Sort standings by points and tiebreakers
   * @param {Array<Object>} standings - Unsorted standings
   * @returns {Array<Object>} Sorted standings
   */
  sortStandings(standings) {
    return standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      const tiebreakerA = this.calculateTiebreaker(a);
      const tiebreakerB = this.calculateTiebreaker(b);
      if (tiebreakerB !== tiebreakerA) return tiebreakerB - tiebreakerA;
      return 0;
    });
  }

  /**
   * Create a match object template
   * @param {Object} params - Match parameters
   * @returns {Object}
   */
  createMatchTemplate({ phase, round, matchNumber, participant1Id, participant2Id, bestOf, nextMatchId, loserNextMatchId, groupId }) {
    return {
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
