/**
 * Tournament Manager
 * Handles tournament lifecycle and operations
 */
import { idGenerator } from '../../concerns/id.js';
import { createFormat, getAvailableFormats } from './formats/index.js';

export class TournamentManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.logger = plugin.logger;
  }

  get resource() {
    return this.plugin.tournamentsResource;
  }

  /**
   * Create a new tournament
   */
  async create(options) {
    const {
      name,
      organizerId,
      format,
      participantType = 'team',
      participantResource = null,
      config = {},
      metadata = {}
    } = options;

    if (!name) throw new Error('Tournament name is required');
    if (!organizerId) throw new Error('Organizer ID is required');
    if (!format) throw new Error('Tournament format is required');

    const availableFormats = getAvailableFormats();
    if (!availableFormats.includes(format)) {
      throw new Error(`Invalid format: ${format}. Available: ${availableFormats.join(', ')}`);
    }

    const formatInstance = createFormat(format, config);
    const defaultConfig = formatInstance.constructor.defaultConfig;

    const tournament = await this.resource.insert({
      id: idGenerator(),
      name,
      organizerId,
      format,
      participantType,
      participantResource,
      status: 'draft',
      config: { ...defaultConfig, ...config },
      participants: [],
      bracket: null,
      standings: [],
      currentPhase: null,
      currentRound: 0,
      metadata,
      startedAt: null,
      completedAt: null
    });

    this.plugin.emit('plg:tournament:created', { tournament });
    this.logger.info({ tournamentId: tournament.id, format }, 'Tournament created');

    return tournament;
  }

  /**
   * Get tournament by ID
   */
  async get(id) {
    return this.resource.get(id);
  }

  /**
   * Update tournament
   */
  async update(id, data) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    // Prevent updates to certain fields when tournament is in progress
    if (tournament.status === 'in-progress') {
      const immutableFields = ['format', 'participantType', 'organizerId'];
      for (const field of immutableFields) {
        if (data[field] && data[field] !== tournament[field]) {
          throw new Error(`Cannot modify ${field} while tournament is in progress`);
        }
      }
    }

    const updated = await this.resource.update(id, data);
    this.plugin.emit('plg:tournament:updated', { tournament: updated });

    return updated;
  }

  /**
   * Delete tournament
   */
  async delete(id) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status === 'in-progress') {
      throw new Error('Cannot delete tournament in progress. Cancel it first.');
    }

    // Delete all related matches
    await this.plugin.matchManager.deleteByTournament(id);

    // Delete all registrations
    await this.plugin.registrationManager.deleteByTournament(id);

    await this.resource.delete(id);
    this.plugin.emit('plg:tournament:deleted', { tournamentId: id });

    this.logger.info({ tournamentId: id }, 'Tournament deleted');
  }

  /**
   * List tournaments with filters
   */
  async list(filters = {}) {
    const { organizerId, status, format, limit = 100 } = filters;

    if (organizerId) {
      return this.resource.listPartition({
        partition: 'byOrganizer',
        partitionValues: { organizerId },
        limit
      });
    }

    if (status) {
      return this.resource.listPartition({
        partition: 'byStatus',
        partitionValues: { status },
        limit
      });
    }

    const all = await this.resource.list({ limit });

    if (format) {
      return all.filter(t => t.format === format);
    }

    return all;
  }

  /**
   * Open registration for tournament
   */
  async openRegistration(id) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status !== 'draft') {
      throw new Error(`Cannot open registration. Current status: ${tournament.status}`);
    }

    await this.resource.update(id, { status: 'registration' });
    this.plugin.emit('plg:tournament:registration-opened', { tournamentId: id });

    this.logger.info({ tournamentId: id }, 'Registration opened');
  }

  /**
   * Close registration for tournament
   */
  async closeRegistration(id) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status !== 'registration') {
      throw new Error(`Cannot close registration. Current status: ${tournament.status}`);
    }

    await this.resource.update(id, { status: 'registration-closed' });
    this.plugin.emit('plg:tournament:registration-closed', { tournamentId: id });

    this.logger.info({ tournamentId: id }, 'Registration closed');
  }

  /**
   * Start the tournament
   */
  async start(id) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (!['registration', 'registration-closed'].includes(tournament.status)) {
      throw new Error(`Cannot start tournament. Current status: ${tournament.status}`);
    }

    // Get confirmed participants
    const registrations = await this.plugin.registrationManager.getConfirmed(id);
    const participants = registrations.map(r => r.participantId);

    if (participants.length < 2) {
      throw new Error('Need at least 2 confirmed participants to start');
    }

    // Create format instance and validate
    const formatInstance = createFormat(tournament.format, tournament.config);
    const validation = formatInstance.validate(participants, tournament.config);

    if (!validation.valid) {
      throw new Error(`Invalid tournament configuration: ${validation.errors.join(', ')}`);
    }

    // Generate bracket
    const bracket = formatInstance.generateBracket(participants, tournament.config);

    // Get initial matches
    const initialMatches = formatInstance.getInitialMatches(bracket);

    // Create match records
    for (const match of initialMatches) {
      await this.plugin.matchManager.create({
        tournamentId: id,
        ...match
      });
    }

    // Update tournament
    await this.resource.update(id, {
      status: 'in-progress',
      participants,
      bracket,
      currentPhase: formatInstance.getCurrentPhase(bracket, []),
      currentRound: 1,
      startedAt: Date.now()
    });

    this.plugin.emit('plg:tournament:started', {
      tournamentId: id,
      participantCount: participants.length,
      matchCount: initialMatches.length
    });

    this.logger.info({ tournamentId: id, participants: participants.length }, 'Tournament started');
  }

  /**
   * Cancel tournament
   */
  async cancel(id, reason = '') {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status === 'completed') {
      throw new Error('Cannot cancel completed tournament');
    }

    await this.resource.update(id, {
      status: 'cancelled',
      metadata: { ...tournament.metadata, cancelReason: reason, cancelledAt: Date.now() }
    });

    this.plugin.emit('plg:tournament:cancelled', { tournamentId: id, reason });
    this.logger.info({ tournamentId: id, reason }, 'Tournament cancelled');
  }

  /**
   * Complete tournament (called after final match)
   */
  async complete(id) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status !== 'in-progress') {
      throw new Error(`Cannot complete tournament. Current status: ${tournament.status}`);
    }

    const matches = await this.plugin.matchManager.getByTournament(id);
    const formatInstance = createFormat(tournament.format, tournament.config);

    if (!formatInstance.isComplete(tournament.bracket, matches)) {
      throw new Error('Tournament is not complete. There are pending matches.');
    }

    const winner = formatInstance.getWinner(tournament.bracket, matches);
    const standings = formatInstance.getStandings(tournament.bracket, matches);

    await this.resource.update(id, {
      status: 'completed',
      standings,
      completedAt: Date.now(),
      metadata: { ...tournament.metadata, winner }
    });

    this.plugin.emit('plg:tournament:completed', {
      tournamentId: id,
      winner,
      standings
    });

    this.logger.info({ tournamentId: id, winner }, 'Tournament completed');
  }

  /**
   * Get current standings
   */
  async getStandings(id) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (!['in-progress', 'completed'].includes(tournament.status)) {
      return [];
    }

    const matches = await this.plugin.matchManager.getByTournament(id);
    const formatInstance = createFormat(tournament.format, tournament.config);

    return formatInstance.getStandings(tournament.bracket, matches);
  }

  /**
   * Get bracket structure
   */
  async getBracket(id) {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    return tournament.bracket;
  }

  /**
   * Update bracket after match completion
   */
  async updateBracket(tournamentId, completedMatch) {
    const tournament = await this.resource.get(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const formatInstance = createFormat(tournament.format, tournament.config);
    const { bracket: updatedBracket, newMatches } = formatInstance.onMatchComplete(
      tournament.bracket,
      completedMatch
    );

    // Create new matches
    for (const match of newMatches) {
      await this.plugin.matchManager.create({
        tournamentId,
        ...match
      });
    }

    // Get all matches to check completion
    const matches = await this.plugin.matchManager.getByTournament(tournamentId);

    // Update tournament
    const updateData = {
      bracket: updatedBracket,
      currentPhase: formatInstance.getCurrentPhase(updatedBracket, matches),
      currentRound: formatInstance.getCurrentRound(updatedBracket, matches),
      standings: formatInstance.getStandings(updatedBracket, matches)
    };

    await this.resource.update(tournamentId, updateData);

    this.plugin.emit('plg:tournament:bracket-updated', {
      tournamentId,
      newMatchCount: newMatches.length
    });

    // Check if tournament is complete
    if (formatInstance.isComplete(updatedBracket, matches)) {
      await this.complete(tournamentId);
    }

    return { bracket: updatedBracket, newMatches };
  }
}
