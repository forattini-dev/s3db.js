import { Plugin, type PluginConfig } from './plugin.class.js';
import { TournamentManager } from './tournament/tournament-manager.js';
import { MatchManager } from './tournament/match-manager.js';
import { RegistrationManager } from './tournament/registration-manager.js';
import { getAvailableFormats, getFormatMetadata, createFormat } from './tournament/formats/index.js';

interface Bracket {
  [key: string]: unknown;
}

interface LadderRankingEntry {
  participantId: string;
  rank: number;
  wins: number;
  losses: number;
  rating?: number;
  [key: string]: unknown;
}

interface PromotionRelegationBracket {
  divisions?: unknown[];
  [key: string]: unknown;
}

interface Standing {
  participantId: string;
  [key: string]: unknown;
}

interface MatchCreateData {
  tournamentId: string;
  [key: string]: unknown;
}

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Database {
  createResource(config: ResourceConfig): Promise<Resource>;
}

interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  partitions?: Record<string, { fields: Record<string, string> }>;
  asyncPartitions?: boolean;
  timestamps?: boolean;
  behavior?: string;
}

interface Resource {
  name: string;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  get(id: string): Promise<Record<string, unknown> | null>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<void>;
  list(options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  listPartition(options: { partition: string; partitionValues: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
}

interface ResourceNameDescriptor {
  defaultName: string;
  override?: string;
}

interface TournamentConfig {
  logLevel?: string;
}

interface TournamentStats {
  tournamentsCreated: number;
  matchesPlayed: number;
  registrations: number;
  errors: number;
}

type TournamentFormat = 'round-robin' | 'single-elimination' | 'double-elimination' | 'swiss' | 'group-stage' | 'league-playoffs' | 'ladder' | 'circuit' | 'promotion-relegation';
type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'completed' | 'cancelled';
type ParticipantType = 'player' | 'team';

interface TournamentCreateOptions {
  name: string;
  organizerId: string;
  format: TournamentFormat;
  participantType: ParticipantType;
  participantResource?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface TournamentUpdateData {
  name?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  bracket?: Record<string, unknown>;
  standings?: unknown[];
  currentPhase?: string;
  currentRound?: number;
  status?: TournamentStatus;
}

interface TournamentListFilters {
  organizerId?: string;
  status?: TournamentStatus;
  format?: TournamentFormat;
  limit?: number;
  offset?: number;
}

interface Tournament {
  id: string;
  name: string;
  organizerId: string;
  format: TournamentFormat;
  participantType: ParticipantType;
  participantResource?: string;
  status: TournamentStatus;
  config?: Record<string, unknown>;
  participants?: string[];
  bracket?: Record<string, unknown>;
  standings?: unknown[];
  currentPhase?: string;
  currentRound?: number;
  metadata?: Record<string, unknown>;
  startedAt?: number;
  completedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

interface Match {
  id: string;
  tournamentId: string;
  phase: string;
  round: number;
  matchNumber: number;
  groupId?: string;
  participant1Id?: string;
  participant2Id?: string;
  bestOf?: number;
  games?: Game[];
  score1?: number;
  score2?: number;
  winnerId?: string;
  loserId?: string;
  status: MatchStatus;
  nextMatchId?: string;
  loserNextMatchId?: string;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

interface Game {
  gameNumber: number;
  score1: number;
  score2: number;
  winnerId?: string;
  metadata?: Record<string, unknown>;
}

type MatchStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'cancelled';

interface MatchFilters {
  phase?: string;
  round?: number;
  status?: MatchStatus;
  groupId?: string;
}

interface MatchResult {
  score1: number;
  score2: number;
  winnerId?: string;
  games?: Game[];
  metadata?: Record<string, unknown>;
}

interface Registration {
  id: string;
  tournamentId: string;
  participantId: string;
  seed?: number;
  status: RegistrationStatus;
  registeredAt?: number;
  confirmedAt?: number;
  checkedInAt?: number;
  metadata?: Record<string, unknown>;
}

type RegistrationStatus = 'pending' | 'confirmed' | 'checked_in' | 'withdrawn' | 'disqualified';

interface RegistrationOptions {
  seed?: number;
  metadata?: Record<string, unknown>;
}

interface FormatMetadata {
  name: string;
  description: string;
  minParticipants: number;
  maxParticipants?: number;
  supportsSeeding: boolean;
  supportsGroups: boolean;
  [key: string]: unknown;
}

interface LadderBracket {
  rankings: LadderRanking[];
  activeChallenges?: LadderChallenge[];
  [key: string]: unknown;
}

interface LadderRanking {
  participantId: string;
  rank: number;
  wins: number;
  losses: number;
  rating?: number;
  [key: string]: unknown;
}

interface LadderChallenge {
  challengerId: string;
  defenderId: string;
  matchId?: string;
  createdAt: number;
  [key: string]: unknown;
}

interface CircuitBracket {
  events: CircuitEvent[];
  standings: CircuitStanding[];
  [key: string]: unknown;
}

interface CircuitEvent {
  id: string;
  name: string;
  date?: number;
  pointsMultiplier?: number;
  results?: CircuitEventResult[];
  [key: string]: unknown;
}

interface CircuitEventResult {
  participantId: string;
  placement: number;
  points: number;
  [key: string]: unknown;
}

interface CircuitStanding {
  participantId: string;
  totalPoints: number;
  eventsPlayed: number;
  [key: string]: unknown;
}

interface Division {
  id: string;
  name: string;
  tier: number;
  participants: string[];
  standings: unknown[];
  [key: string]: unknown;
}

interface PromotionZone {
  positions: number[];
  participants: string[];
}

interface RelegationZone {
  positions: number[];
  participants: string[];
}

export interface TournamentPluginOptions {
  resourceNames?: {
    tournaments?: string;
    matches?: string;
    registrations?: string;
  };
  logLevel?: string;
}

export class TournamentPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: TournamentConfig;

  private _tournamentsDescriptor: ResourceNameDescriptor;
  private _matchesDescriptor: ResourceNameDescriptor;
  private _registrationsDescriptor: ResourceNameDescriptor;

  tournamentsResource: Resource | null = null;
  matchesResource: Resource | null = null;
  registrationsResource: Resource | null = null;

  tournamentManager: TournamentManager | null = null;
  matchManager: MatchManager | null = null;
  registrationManager: RegistrationManager | null = null;

  stats: TournamentStats;

  constructor(options: TournamentPluginOptions = {}) {
    super(options as PluginConfig);

    const resourceNames = (this.options as TournamentPluginOptions).resourceNames || {};

    this.config = {
      logLevel: this.options.logLevel
    };

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

    this.tournamentsResource = null;
    this.matchesResource = null;
    this.registrationsResource = null;

    this.tournamentManager = null;
    this.matchManager = null;
    this.registrationManager = null;

    this.stats = {
      tournamentsCreated: 0,
      matchesPlayed: 0,
      registrations: 0,
      errors: 0
    };
  }

  override async onInstall(): Promise<void> {
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

  private async _createResources(): Promise<void> {
    this.tournamentsResource = await (this.database as any).createResource({
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

    this.matchesResource = await (this.database as any).createResource({
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

    this.registrationsResource = await (this.database as any).createResource({
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

  private _initializeManagers(): void {
    this.tournamentManager = new TournamentManager(this as any);
    this.matchManager = new MatchManager(this as any);
    this.registrationManager = new RegistrationManager(this as any);
  }

  private _resolveTournamentsName(): string {
    const base = this._tournamentsDescriptor.override || this._tournamentsDescriptor.defaultName;
    return this.namespace ? `${base}--${this.namespace}` : base;
  }

  private _resolveMatchesName(): string {
    const base = this._matchesDescriptor.override || this._matchesDescriptor.defaultName;
    return this.namespace ? `${base}--${this.namespace}` : base;
  }

  private _resolveRegistrationsName(): string {
    const base = this._registrationsDescriptor.override || this._registrationsDescriptor.defaultName;
    return this.namespace ? `${base}--${this.namespace}` : base;
  }

  override onNamespaceChanged(): void {
    // Re-resolve resource names if namespace changes
  }

  async create(options: TournamentCreateOptions): Promise<Tournament> {
    const result = await this.tournamentManager!.create(options);
    this.stats.tournamentsCreated++;
    return result as Tournament;
  }

  async get(tournamentId: string): Promise<Tournament | null> {
    return this.tournamentManager!.get(tournamentId) as Promise<Tournament | null>;
  }

  async update(tournamentId: string, data: TournamentUpdateData): Promise<Tournament> {
    return this.tournamentManager!.update(tournamentId, data as any) as unknown as Promise<Tournament>;
  }

  async delete(tournamentId: string): Promise<void> {
    return this.tournamentManager!.delete(tournamentId);
  }

  async list(filters: TournamentListFilters = {}): Promise<Tournament[]> {
    return this.tournamentManager!.list(filters) as Promise<Tournament[]>;
  }

  async openRegistration(tournamentId: string): Promise<Tournament> {
    return this.tournamentManager!.openRegistration(tournamentId) as unknown as Promise<Tournament>;
  }

  async closeRegistration(tournamentId: string): Promise<Tournament> {
    return this.tournamentManager!.closeRegistration(tournamentId) as unknown as Promise<Tournament>;
  }

  async startTournament(tournamentId: string): Promise<Tournament> {
    return this.tournamentManager!.start(tournamentId) as unknown as Promise<Tournament>;
  }

  async cancel(tournamentId: string, reason = ''): Promise<Tournament> {
    return this.tournamentManager!.cancel(tournamentId, reason) as unknown as Promise<Tournament>;
  }

  async complete(tournamentId: string): Promise<Tournament> {
    return this.tournamentManager!.complete(tournamentId) as unknown as Promise<Tournament>;
  }

  async register(tournamentId: string, participantId: string, options: RegistrationOptions = {}): Promise<Registration> {
    const result = await this.registrationManager!.register(tournamentId, participantId, options);
    this.stats.registrations++;
    return result as Registration;
  }

  async confirmRegistration(tournamentId: string, participantId: string): Promise<Registration> {
    return this.registrationManager!.confirm(tournamentId, participantId) as unknown as Promise<Registration>;
  }

  async checkIn(tournamentId: string, participantId: string): Promise<Registration> {
    return this.registrationManager!.checkIn(tournamentId, participantId) as unknown as Promise<Registration>;
  }

  async withdraw(tournamentId: string, participantId: string, reason = ''): Promise<Registration> {
    return this.registrationManager!.withdraw(tournamentId, participantId, reason) as unknown as Promise<Registration>;
  }

  async getParticipants(tournamentId: string): Promise<Registration[]> {
    return this.registrationManager!.getByTournament(tournamentId) as Promise<Registration[]>;
  }

  async setSeed(tournamentId: string, participantId: string, seed: number): Promise<Registration> {
    return this.registrationManager!.setSeed(tournamentId, participantId, seed) as unknown as Promise<Registration>;
  }

  async shuffleSeeds(tournamentId: string): Promise<Registration[]> {
    return this.registrationManager!.shuffleSeeds(tournamentId) as Promise<Registration[]>;
  }

  async getMatches(tournamentId: string, filters: MatchFilters = {}): Promise<Match[]> {
    return this.matchManager!.getByTournament(tournamentId, filters) as Promise<Match[]>;
  }

  async getMatch(matchId: string): Promise<Match | null> {
    return this.matchManager!.get(matchId) as Promise<Match | null>;
  }

  async scheduleMatch(matchId: string, scheduledAt: number): Promise<Match> {
    return this.matchManager!.schedule(matchId, scheduledAt) as unknown as Promise<Match>;
  }

  async startMatch(matchId: string): Promise<Match> {
    return this.matchManager!.start(matchId) as unknown as Promise<Match>;
  }

  async reportResult(matchId: string, result: MatchResult): Promise<Match> {
    const match = await this.matchManager!.reportResult(matchId, result);
    this.stats.matchesPlayed++;
    return match as Match;
  }

  async reportWalkover(matchId: string, winnerId: string, reason = ''): Promise<Match> {
    const match = await this.matchManager!.reportWalkover(matchId, winnerId, reason);
    this.stats.matchesPlayed++;
    return match as Match;
  }

  async reportGame(matchId: string, game: Game): Promise<Match> {
    return this.matchManager!.reportGame(matchId, game) as unknown as Promise<Match>;
  }

  async getUpcomingMatches(tournamentId: string, limit = 10): Promise<Match[]> {
    return this.matchManager!.getUpcoming(tournamentId, limit) as Promise<Match[]>;
  }

  async getLiveMatches(tournamentId: string): Promise<Match[]> {
    return this.matchManager!.getLive(tournamentId) as Promise<Match[]>;
  }

  async getStandings(tournamentId: string): Promise<unknown[]> {
    return this.tournamentManager!.getStandings(tournamentId);
  }

  async getBracket(tournamentId: string): Promise<Record<string, unknown>> {
    return this.tournamentManager!.getBracket(tournamentId) as Promise<Record<string, unknown>>;
  }

  async challenge(tournamentId: string, challengerId: string, defenderId: string): Promise<Match> {
    const tournament = await this.get(tournamentId);
    if (!tournament || tournament.format !== 'ladder') {
      throw new Error('Challenge is only available for ladder format');
    }

    const { LadderFormat } = await import('./tournament/formats/ladder.js');
    const format = new LadderFormat(tournament.config || {});

    const result = format.createChallenge(tournament.bracket as unknown as Bracket, challengerId, defenderId);

    if (!result.valid) {
      throw new Error(result.error);
    }

    const match = await (this.matchManager as any).create({
      tournamentId,
      ...result.match
    } as MatchCreateData);

    await this.tournamentManager!.update(tournamentId, { bracket: tournament.bracket } as any);

    return match as Match;
  }

  async getLadderRanking(tournamentId: string): Promise<LadderRanking[]> {
    const tournament = await this.get(tournamentId);
    if (!tournament || tournament.format !== 'ladder') {
      throw new Error('Only available for ladder format');
    }

    const { LadderFormat } = await import('./tournament/formats/ladder.js');
    const format = new LadderFormat(tournament.config || {});

    return format.getRankings(tournament.bracket as unknown as Bracket) as unknown as LadderRanking[];
  }

  async addCircuitEvent(circuitId: string, event: CircuitEvent): Promise<CircuitBracket> {
    const circuit = await this.get(circuitId);
    if (!circuit || circuit.format !== 'circuit') {
      throw new Error('Only available for circuit format');
    }

    const { CircuitFormat } = await import('./tournament/formats/circuit.js');
    const format = new CircuitFormat(circuit.config || {});

    const updatedBracket = format.addEvent(circuit.bracket as unknown as Bracket, event as any) as unknown as CircuitBracket;

    await this.tournamentManager!.update(circuitId, {
      bracket: updatedBracket as unknown as Record<string, unknown>,
      standings: format.getStandings(updatedBracket as unknown as Bracket, []) as unknown[]
    } as any);

    this.emit('plg:tournament:circuit-event-added', {
      circuitId,
      eventId: event.id
    });

    return updatedBracket;
  }

  async getCircuitStandings(circuitId: string): Promise<CircuitStanding[]> {
    const circuit = await this.get(circuitId);
    if (!circuit || circuit.format !== 'circuit') {
      throw new Error('Only available for circuit format');
    }

    const { CircuitFormat } = await import('./tournament/formats/circuit.js');
    const format = new CircuitFormat(circuit.config || {});

    return format.getStandings(circuit.bracket as unknown as Bracket, []) as unknown as CircuitStanding[];
  }

  async getDivisions(tournamentId: string): Promise<Division[]> {
    const tournament = await this.get(tournamentId);
    if (!tournament || tournament.format !== 'promotion-relegation') {
      throw new Error('Only available for promotion-relegation format');
    }

    const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
    const format = new PromotionRelegationFormat(tournament.config || {});

    return format.getDivisions(tournament.bracket as unknown as Bracket) as unknown as Division[];
  }

  async getPromotionZone(tournamentId: string, divisionId: string): Promise<PromotionZone> {
    const tournament = await this.get(tournamentId);
    if (!tournament || tournament.format !== 'promotion-relegation') {
      throw new Error('Only available for promotion-relegation format');
    }

    const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
    const format = new PromotionRelegationFormat(tournament.config || {});

    return (format as any)._getPromotionZone(tournament.bracket as unknown as PromotionRelegationBracket, divisionId) as PromotionZone;
  }

  async getRelegationZone(tournamentId: string, divisionId: string): Promise<RelegationZone> {
    const tournament = await this.get(tournamentId);
    if (!tournament || tournament.format !== 'promotion-relegation') {
      throw new Error('Only available for promotion-relegation format');
    }

    const { PromotionRelegationFormat } = await import('./tournament/formats/promotion-relegation.js');
    const format = new PromotionRelegationFormat(tournament.config || {});

    return (format as any)._getRelegationZone(tournament.bracket as unknown as PromotionRelegationBracket, divisionId) as RelegationZone;
  }

  getAvailableFormats(): TournamentFormat[] {
    return getAvailableFormats() as TournamentFormat[];
  }

  getFormatMetadata(): Record<TournamentFormat, FormatMetadata> {
    return getFormatMetadata() as unknown as Record<TournamentFormat, FormatMetadata>;
  }

  getStats(): TournamentStats {
    return { ...this.stats };
  }

  override async onStop(): Promise<void> {
    this.logger.debug('TournamentPlugin stopped');
  }
}
