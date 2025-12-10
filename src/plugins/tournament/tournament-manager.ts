import { idGenerator } from '../../concerns/id.js';
import { createFormat, getAvailableFormats } from './formats/index.js';
import type { Bracket, Match, Standing, FormatConfig } from './types.js';

interface TournamentCreateOptions {
  name: string;
  organizerId: string;
  format: string;
  participantType?: string;
  participantResource?: string | null;
  config?: FormatConfig;
  metadata?: Record<string, unknown>;
}

interface TournamentRecord {
  id: string;
  name: string;
  organizerId: string;
  format: string;
  participantType: string;
  participantResource: string | null;
  status: string;
  config: FormatConfig;
  participants: string[];
  bracket: Bracket | null;
  standings: Standing[];
  currentPhase: string | null;
  currentRound: number;
  metadata: Record<string, unknown>;
  startedAt: number | null;
  completedAt: number | null;
}

interface TournamentListFilters {
  organizerId?: string;
  status?: string;
  format?: string;
  limit?: number;
}

interface RegistrationRecord {
  participantId: string;
}

interface MatchRecord extends Match {
  tournamentId: string;
}

interface TournamentPlugin {
  tournamentsResource: {
    insert(data: Record<string, unknown>): Promise<TournamentRecord>;
    get(id: string): Promise<TournamentRecord | null>;
    update(id: string, data: Record<string, unknown>): Promise<TournamentRecord>;
    delete(id: string): Promise<void>;
    list(options: { limit: number }): Promise<TournamentRecord[]>;
    listPartition(options: {
      partition: string;
      partitionValues: Record<string, string>;
      limit?: number;
    }): Promise<TournamentRecord[]>;
  };
  logger: {
    debug(data: Record<string, unknown>, message: string): void;
    info(data: Record<string, unknown>, message: string): void;
    warn(data: Record<string, unknown>, message: string): void;
  };
  emit(event: string, data: Record<string, unknown>): void;
  matchManager: {
    create(data: Record<string, unknown>): Promise<MatchRecord>;
    deleteByTournament(id: string): Promise<number>;
    getByTournament(id: string): Promise<MatchRecord[]>;
  };
  registrationManager: {
    getConfirmed(id: string): Promise<RegistrationRecord[]>;
    deleteByTournament(id: string): Promise<number>;
  };
}

export class TournamentManager {
  private plugin: TournamentPlugin;
  private logger: TournamentPlugin['logger'];

  constructor(plugin: TournamentPlugin) {
    this.plugin = plugin;
    this.logger = plugin.logger;
  }

  get resource() {
    return this.plugin.tournamentsResource;
  }

  async create(options: TournamentCreateOptions): Promise<TournamentRecord> {
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
    const FormatClass = formatInstance.constructor as unknown as { defaultConfig: FormatConfig };
    const defaultConfig = FormatClass.defaultConfig;

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

  async get(id: string): Promise<TournamentRecord | null> {
    return this.resource.get(id);
  }

  async update(id: string, data: Partial<TournamentRecord>): Promise<TournamentRecord> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status === 'in-progress') {
      const immutableFields = ['format', 'participantType', 'organizerId'];
      for (const field of immutableFields) {
        if ((data as unknown as Record<string, unknown>)[field] && (data as unknown as Record<string, unknown>)[field] !== (tournament as unknown as Record<string, unknown>)[field]) {
          throw new Error(`Cannot modify ${field} while tournament is in progress`);
        }
      }
    }

    const updated = await this.resource.update(id, data);
    this.plugin.emit('plg:tournament:updated', { tournament: updated });

    return updated;
  }

  async delete(id: string): Promise<void> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status === 'in-progress') {
      throw new Error('Cannot delete tournament in progress. Cancel it first.');
    }

    await this.plugin.matchManager.deleteByTournament(id);
    await this.plugin.registrationManager.deleteByTournament(id);

    await this.resource.delete(id);
    this.plugin.emit('plg:tournament:deleted', { tournamentId: id });

    this.logger.info({ tournamentId: id }, 'Tournament deleted');
  }

  async list(filters: TournamentListFilters = {}): Promise<TournamentRecord[]> {
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

  async openRegistration(id: string): Promise<void> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status !== 'draft') {
      throw new Error(`Cannot open registration. Current status: ${tournament.status}`);
    }

    await this.resource.update(id, { status: 'registration' });
    this.plugin.emit('plg:tournament:registration-opened', { tournamentId: id });

    this.logger.info({ tournamentId: id }, 'Registration opened');
  }

  async closeRegistration(id: string): Promise<void> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status !== 'registration') {
      throw new Error(`Cannot close registration. Current status: ${tournament.status}`);
    }

    await this.resource.update(id, { status: 'registration-closed' });
    this.plugin.emit('plg:tournament:registration-closed', { tournamentId: id });

    this.logger.info({ tournamentId: id }, 'Registration closed');
  }

  async start(id: string): Promise<void> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (!['registration', 'registration-closed'].includes(tournament.status)) {
      throw new Error(`Cannot start tournament. Current status: ${tournament.status}`);
    }

    const registrations = await this.plugin.registrationManager.getConfirmed(id);
    const participants = registrations.map(r => r.participantId);

    if (participants.length < 2) {
      throw new Error('Need at least 2 confirmed participants to start');
    }

    const formatInstance = createFormat(tournament.format, tournament.config);
    const validation = formatInstance.validate(participants, tournament.config);

    if (!validation.valid) {
      throw new Error(`Invalid tournament configuration: ${validation.errors.join(', ')}`);
    }

    const bracket = formatInstance.generateBracket(participants, tournament.config);
    const initialMatches = formatInstance.getInitialMatches(bracket);

    for (const match of initialMatches) {
      await this.plugin.matchManager.create({
        tournamentId: id,
        ...match
      });
    }

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

  async cancel(id: string, reason = ''): Promise<void> {
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

  async complete(id: string): Promise<void> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status !== 'in-progress') {
      throw new Error(`Cannot complete tournament. Current status: ${tournament.status}`);
    }

    const matches = await this.plugin.matchManager.getByTournament(id);
    const formatInstance = createFormat(tournament.format, tournament.config);

    if (!formatInstance.isComplete(tournament.bracket!, matches)) {
      throw new Error('Tournament is not complete. There are pending matches.');
    }

    const winner = formatInstance.getWinner(tournament.bracket!, matches);
    const standings = formatInstance.getStandings(tournament.bracket!, matches);

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

  async getStandings(id: string): Promise<Standing[]> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    if (!['in-progress', 'completed'].includes(tournament.status)) {
      return [];
    }

    const matches = await this.plugin.matchManager.getByTournament(id);
    const formatInstance = createFormat(tournament.format, tournament.config);

    return formatInstance.getStandings(tournament.bracket!, matches);
  }

  async getBracket(id: string): Promise<Bracket | null> {
    const tournament = await this.resource.get(id);
    if (!tournament) throw new Error('Tournament not found');

    return tournament.bracket;
  }

  async updateBracket(tournamentId: string, completedMatch: Match): Promise<{ bracket: Bracket; newMatches: Match[] }> {
    const tournament = await this.resource.get(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const formatInstance = createFormat(tournament.format, tournament.config);
    const { bracket: updatedBracket, newMatches } = formatInstance.onMatchComplete(
      tournament.bracket!,
      completedMatch
    );

    for (const match of newMatches) {
      await this.plugin.matchManager.create({
        tournamentId,
        ...match
      });
    }

    const matches = await this.plugin.matchManager.getByTournament(tournamentId);

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

    if (formatInstance.isComplete(updatedBracket, matches)) {
      await this.complete(tournamentId);
    }

    return { bracket: updatedBracket, newMatches };
  }
}
