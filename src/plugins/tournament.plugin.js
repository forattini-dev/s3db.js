/**
 * Tournament Plugin
 * Comprehensive tournament management for s3db.js
 *
 * Supports multiple tournament formats:
 * - Round Robin (pontos corridos)
 * - Single Elimination (mata-mata)
 * - Double Elimination (chave dupla)
 * - Swiss System
 * - Group Stage (round-robin or GSL)
 * - League + Playoffs
 * - Ladder (ranking)
 * - Circuit (pontos acumulados)
 * - Promotion/Relegation (divisões)
 */
import { Plugin } from './plugin.class.js';
import { TournamentManager } from './tournament/tournament-manager.js';
import { MatchManager } from './tournament/match-manager.js';
import { RegistrationManager } from './tournament/registration-manager.js';
import { getAvailableFormats, getFormatMetadata, createFormat } from './tournament/formats/index.js';

export class TournamentPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    const {
      resourceNames = {}
    } = this.options;

    this.config = {
      logLevel: this.options.logLevel
    };

    // Resource name configuration
    this._tournamentsDescriptor = {
      defaultName: 'plg_tournaments',
      override: resourceNames.tournaments
    };
    this._matchesDescriptor = {
      defaultName: 'plg_tournament_matches',
      override: resourceNames.matches
    };
    this._registrationsDescriptor = {
      defaultName: 'plg_tournament_registrations',
      override: resourceNames.registrations
    };

    // Internal resources (set during install)
    this.tournamentsResource = null;
    this.matchesResource = null;
    this.registrationsResource = null;

    // Managers
    this.tournamentManager = null;
    this.matchManager = null;
    this.registrationManager = null;

    // Statistics
    this.stats = {
      tournamentsCreated: 0,
      matchesPlayed: 0,
      registrations: 0,
      errors: 0
    };
  }

  async onInstall() {
    await this._createResources();
    this._initializeManagers();

    this.logger.debug(
      { formats: getAvailableFormats() },
      'TournamentPlugin installed'
    );

    this.emit('plg:tournament:installed', {
      formats: getAvailableFormats(),
      timestamp: Date.now()
    });
  }

  async _createResources() {
    // Tournaments resource
    this.tournamentsResource = await this.database.createResource({
      name: this._resolveTournamentsName(),
      attributes: {
        name: 'string|required',
        organizerId: 'string|required',
        format: 'string|required',
        participantType: 'string|required',
        participantResource: 'string|optional',
        status: 'string|required',
        config: 'object|optional',
        participants: 'array|items:string|optional',
        bracket: 'object|optional',
        standings: 'array|optional',
        currentPhase: 'string|optional',
        currentRound: 'number|optional|default:0',
        metadata: 'object|optional',
        startedAt: 'number|optional',
        completedAt: 'number|optional'
      },
      partitions: {
        byOrganizer: { fields: { organizerId: 'string' } },
        byStatus: { fields: { status: 'string' } },
        byFormat: { fields: { format: 'string' } }
      },
      timestamps: true,
      behavior: 'body-overflow'
    });

    // Matches resource
    this.matchesResource = await this.database.createResource({
      name: this._resolveMatchesName(),
      attributes: {
        tournamentId: 'string|required',
        phase: 'string|required',
        round: 'number|required',
        matchNumber: 'number|required',
        groupId: 'string|optional',
        participant1Id: 'string|optional',
        participant2Id: 'string|optional',
        bestOf: 'number|optional|default:1',
        games: 'array|optional',
        score1: 'number|optional|default:0',
        score2: 'number|optional|default:0',
        winnerId: 'string|optional',
        loserId: 'string|optional',
        status: 'string|required',
        nextMatchId: 'string|optional',
        loserNextMatchId: 'string|optional',
        scheduledAt: 'number|optional',
        startedAt: 'number|optional',
        completedAt: 'number|optional',
        metadata: 'object|optional'
      },
      partitions: {
        byTournament: { fields: { tournamentId: 'string' } },
        byStatus: { fields: { status: 'string' } },
        byPhase: { fields: { phase: 'string' } }
      },
      asyncPartitions: false,
      timestamps: true,
      behavior: 'body-overflow'
    });

    // Registrations resource
    this.registrationsResource = await this.database.createResource({
      name: this._resolveRegistrationsName(),
      attributes: {
        tournamentId: 'string|required',
        participantId: 'string|required',
        seed: 'number|optional',
        status: 'string|required',
        registeredAt: 'number|optional',
        confirmedAt: 'number|optional',
        checkedInAt: 'number|optional',
        metadata: 'object|optional'
      },
      partitions: {
        byTournament: { fields: { tournamentId: 'string' } },
        byParticipant: { fields: { participantId: 'string' } },
        byStatus: { fields: { status: 'string' } }
      },
      asyncPartitions: false,
      timestamps: true
    });
  }

  _initializeManagers() {
    this.tournamentManager = new TournamentManager(this);
    this.matchManager = new MatchManager(this);
    this.registrationManager = new RegistrationManager(this);
  }

  _resolveTournamentsName() {
    const base = this._tournamentsDescriptor.override || this._tournamentsDescriptor.defaultName;
    return this.namespace ? `${base}--${this.namespace}` : base;
  }

  _resolveMatchesName() {
    const base = this._matchesDescriptor.override || this._matchesDescriptor.defaultName;
    return this.namespace ? `${base}--${this.namespace}` : base;
  }

  _resolveRegistrationsName() {
    const base = this._registrationsDescriptor.override || this._registrationsDescriptor.defaultName;
    return this.namespace ? `${base}--${this.namespace}` : base;
  }

  onNamespaceChanged() {
    // Re-resolve resource names if namespace changes
  }

  // ==================== PUBLIC API: Tournament Management ====================

  /**
   * Create a new tournament
   */
  async create(options) {
    const result = await this.tournamentManager.create(options);
    this.stats.tournamentsCreated++;
    return result;
  }

  /**
   * Get tournament by ID
   */
  async get(tournamentId) {
    return this.tournamentManager.get(tournamentId);
  }

  /**
   * Update tournament
   */
  async update(tournamentId, data) {
    return this.tournamentManager.update(tournamentId, data);
  }

  /**
   * Delete tournament
   */
  async delete(tournamentId) {
    return this.tournamentManager.delete(tournamentId);
  }

  /**
   * List tournaments with filters
   */
  async list(filters = {}) {
    return this.tournamentManager.list(filters);
  }

  // ==================== PUBLIC API: Tournament Lifecycle ====================

  /**
   * Open registration
   */
  async openRegistration(tournamentId) {
    return this.tournamentManager.openRegistration(tournamentId);
  }

  /**
   * Close registration
   */
  async closeRegistration(tournamentId) {
    return this.tournamentManager.closeRegistration(tournamentId);
  }

  /**
   * Start tournament
   */
  async startTournament(tournamentId) {
    return this.tournamentManager.start(tournamentId);
  }

  /**
   * Cancel tournament
   */
  async cancel(tournamentId, reason = '') {
    return this.tournamentManager.cancel(tournamentId, reason);
  }

  /**
   * Complete tournament (usually called automatically)
   */
  async complete(tournamentId) {
    return this.tournamentManager.complete(tournamentId);
  }

  // ==================== PUBLIC API: Registration ====================

  /**
   * Register participant for tournament
   */
  async register(tournamentId, participantId, options = {}) {
    const result = await this.registrationManager.register(tournamentId, participantId, options);
    this.stats.registrations++;
    return result;
  }

  /**
   * Confirm registration
   */
  async confirmRegistration(tournamentId, participantId) {
    return this.registrationManager.confirm(tournamentId, participantId);
  }

  /**
   * Check-in participant
   */
  async checkIn(tournamentId, participantId) {
    return this.registrationManager.checkIn(tournamentId, participantId);
  }

  /**
   * Withdraw participant
   */
  async withdraw(tournamentId, participantId, reason = '') {
    return this.registrationManager.withdraw(tournamentId, participantId, reason);
  }

  /**
   * Get participants for tournament
   */
  async getParticipants(tournamentId) {
    return this.registrationManager.getByTournament(tournamentId);
  }

  /**
   * Set participant seed
   */
  async setSeed(tournamentId, participantId, seed) {
    return this.registrationManager.setSeed(tournamentId, participantId, seed);
  }

  /**
   * Shuffle seeds randomly
   */
  async shuffleSeeds(tournamentId) {
    return this.registrationManager.shuffleSeeds(tournamentId);
  }

  // ==================== PUBLIC API: Matches ====================

  /**
   * Get matches for tournament
   */
  async getMatches(tournamentId, filters = {}) {
    return this.matchManager.getByTournament(tournamentId, filters);
  }

  /**
   * Get single match
   */
  async getMatch(matchId) {
    return this.matchManager.get(matchId);
  }

  /**
   * Schedule match
   */
  async scheduleMatch(matchId, scheduledAt) {
    return this.matchManager.schedule(matchId, scheduledAt);
  }

  /**
   * Start match
   */
  async startMatch(matchId) {
    return this.matchManager.start(matchId);
  }

  /**
   * Report match result
   */
  async reportResult(matchId, result) {
    const match = await this.matchManager.reportResult(matchId, result);
    this.stats.matchesPlayed++;
    return match;
  }

  /**
   * Report walkover
   */
  async reportWalkover(matchId, winnerId, reason = '') {
    const match = await this.matchManager.reportWalkover(matchId, winnerId, reason);
    this.stats.matchesPlayed++;
    return match;
  }

  /**
   * Report individual game in Bo series
   */
  async reportGame(matchId, game) {
    return this.matchManager.reportGame(matchId, game);
  }

  /**
   * Get upcoming matches
   */
  async getUpcomingMatches(tournamentId, limit = 10) {
    return this.matchManager.getUpcoming(tournamentId, limit);
  }

  /**
   * Get live matches
   */
  async getLiveMatches(tournamentId) {
    return this.matchManager.getLive(tournamentId);
  }

  // ==================== PUBLIC API: Standings & Bracket ====================

  /**
   * Get current standings
   */
  async getStandings(tournamentId) {
    return this.tournamentManager.getStandings(tournamentId);
  }

  /**
   * Get bracket structure
   */
  async getBracket(tournamentId) {
    return this.tournamentManager.getBracket(tournamentId);
  }

  // ==================== PUBLIC API: Ladder-specific ====================

  /**
   * Create a ladder challenge
   */
  async challenge(tournamentId, challengerId, defenderId) {
    const tournament = await this.get(tournamentId);
    if (tournament.format !== 'ladder') {
      throw new Error('Challenge is only available for ladder format');
    }

    const { LadderFormat } = await import('./tournament/formats/ladder.js');
    const format = new LadderFormat(tournament.config);

    const result = format.createChallenge(tournament.bracket, challengerId, defenderId);

    if (!result.valid) {
      throw new Error(result.error);
    }

    // Create match record
    const match = await this.matchManager.create({
      tournamentId,
      ...result.match
    });

    // Update tournament bracket
    await this.tournamentManager.update(tournamentId, { bracket: tournament.bracket });

    return match;
  }

  /**
   * Get ladder rankings
   */
  async getLadderRanking(tournamentId) {
    const tournament = await this.get(tournamentId);
    if (tournament.format !== 'ladder') {
      throw new Error('Only available for ladder format');
    }

    const { LadderFormat } = await import('./tournament/formats/ladder.js');
    const format = new LadderFormat(tournament.config);

    return format.getRankings(tournament.bracket);
  }

  // ==================== PUBLIC API: Circuit-specific ====================

  /**
   * Add event to circuit
   */
  async addCircuitEvent(circuitId, event) {
    const circuit = await this.get(circuitId);
    if (circuit.format !== 'circuit') {
      throw new Error('Only available for circuit format');
    }

    const { CircuitFormat } = await import('./tournament/formats/circuit.js');
    const format = new CircuitFormat(circuit.config);

    const updatedBracket = format.addEvent(circuit.bracket, event);

    await this.tournamentManager.update(circuitId, {
      bracket: updatedBracket,
      standings: format.getStandings(updatedBracket, [])
    });

    this.emit('plg:tournament:circuit-event-added', {
      circuitId,
      eventId: event.id
    });

    return updatedBracket;
  }

  /**
   * Get circuit standings
   */
  async getCircuitStandings(circuitId) {
    const circuit = await this.get(circuitId);
    if (circuit.format !== 'circuit') {
      throw new Error('Only available for circuit format');
    }

    const { CircuitFormat } = await import('./tournament/formats/circuit.js');
    const format = new CircuitFormat(circuit.config);

    return format.getStandings(circuit.bracket, []);
  }

  // ==================== PUBLIC API: Promotion/Relegation-specific ====================

  /**
   * Get divisions
   */
  async getDivisions(tournamentId) {
    const tournament = await this.get(tournamentId);
    if (tournament.format !== 'promotion-relegation') {
      throw new Error('Only available for promotion-relegation format');
    }

    const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
    const format = new PromotionRelegationFormat(tournament.config);

    return format.getDivisions(tournament.bracket);
  }

  /**
   * Get promotion zone for a division
   */
  async getPromotionZone(tournamentId, divisionId) {
    const tournament = await this.get(tournamentId);
    if (tournament.format !== 'promotion-relegation') {
      throw new Error('Only available for promotion-relegation format');
    }

    const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
    const format = new PromotionRelegationFormat(tournament.config);

    return format._getPromotionZone(tournament.bracket, divisionId);
  }

  /**
   * Get relegation zone for a division
   */
  async getRelegationZone(tournamentId, divisionId) {
    const tournament = await this.get(tournamentId);
    if (tournament.format !== 'promotion-relegation') {
      throw new Error('Only available for promotion-relegation format');
    }

    const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
    const format = new PromotionRelegationFormat(tournament.config);

    return format._getRelegationZone(tournament.bracket, divisionId);
  }

  // ==================== PUBLIC API: Utilities ====================

  /**
   * Get available tournament formats
   */
  getAvailableFormats() {
    return getAvailableFormats();
  }

  /**
   * Get format metadata
   */
  getFormatMetadata() {
    return getFormatMetadata();
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return { ...this.stats };
  }

  async onStop() {
    this.logger.debug('TournamentPlugin stopped');
  }
}
