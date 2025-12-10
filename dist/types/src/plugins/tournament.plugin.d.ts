import { Plugin } from './plugin.class.js';
import { TournamentManager } from './tournament/tournament-manager.js';
import { MatchManager } from './tournament/match-manager.js';
import { RegistrationManager } from './tournament/registration-manager.js';
interface Resource {
    name: string;
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    get(id: string): Promise<Record<string, unknown> | null>;
    update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    delete(id: string): Promise<void>;
    list(options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
    listPartition(options: {
        partition: string;
        partitionValues: Record<string, unknown>;
    }): Promise<Record<string, unknown>[]>;
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
interface LadderRanking {
    participantId: string;
    rank: number;
    wins: number;
    losses: number;
    rating?: number;
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
export declare class TournamentPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    config: TournamentConfig;
    private _tournamentsDescriptor;
    private _matchesDescriptor;
    private _registrationsDescriptor;
    tournamentsResource: Resource | null;
    matchesResource: Resource | null;
    registrationsResource: Resource | null;
    tournamentManager: TournamentManager | null;
    matchManager: MatchManager | null;
    registrationManager: RegistrationManager | null;
    stats: TournamentStats;
    constructor(options?: TournamentPluginOptions);
    onInstall(): Promise<void>;
    private _createResources;
    private _initializeManagers;
    private _resolveTournamentsName;
    private _resolveMatchesName;
    private _resolveRegistrationsName;
    onNamespaceChanged(): void;
    create(options: TournamentCreateOptions): Promise<Tournament>;
    get(tournamentId: string): Promise<Tournament | null>;
    update(tournamentId: string, data: TournamentUpdateData): Promise<Tournament>;
    delete(tournamentId: string): Promise<void>;
    list(filters?: TournamentListFilters): Promise<Tournament[]>;
    openRegistration(tournamentId: string): Promise<Tournament>;
    closeRegistration(tournamentId: string): Promise<Tournament>;
    startTournament(tournamentId: string): Promise<Tournament>;
    cancel(tournamentId: string, reason?: string): Promise<Tournament>;
    complete(tournamentId: string): Promise<Tournament>;
    register(tournamentId: string, participantId: string, options?: RegistrationOptions): Promise<Registration>;
    confirmRegistration(tournamentId: string, participantId: string): Promise<Registration>;
    checkIn(tournamentId: string, participantId: string): Promise<Registration>;
    withdraw(tournamentId: string, participantId: string, reason?: string): Promise<Registration>;
    getParticipants(tournamentId: string): Promise<Registration[]>;
    setSeed(tournamentId: string, participantId: string, seed: number): Promise<Registration>;
    shuffleSeeds(tournamentId: string): Promise<Registration[]>;
    getMatches(tournamentId: string, filters?: MatchFilters): Promise<Match[]>;
    getMatch(matchId: string): Promise<Match | null>;
    scheduleMatch(matchId: string, scheduledAt: number): Promise<Match>;
    startMatch(matchId: string): Promise<Match>;
    reportResult(matchId: string, result: MatchResult): Promise<Match>;
    reportWalkover(matchId: string, winnerId: string, reason?: string): Promise<Match>;
    reportGame(matchId: string, game: Game): Promise<Match>;
    getUpcomingMatches(tournamentId: string, limit?: number): Promise<Match[]>;
    getLiveMatches(tournamentId: string): Promise<Match[]>;
    getStandings(tournamentId: string): Promise<unknown[]>;
    getBracket(tournamentId: string): Promise<Record<string, unknown>>;
    challenge(tournamentId: string, challengerId: string, defenderId: string): Promise<Match>;
    getLadderRanking(tournamentId: string): Promise<LadderRanking[]>;
    addCircuitEvent(circuitId: string, event: CircuitEvent): Promise<CircuitBracket>;
    getCircuitStandings(circuitId: string): Promise<CircuitStanding[]>;
    getDivisions(tournamentId: string): Promise<Division[]>;
    getPromotionZone(tournamentId: string, divisionId: string): Promise<PromotionZone>;
    getRelegationZone(tournamentId: string, divisionId: string): Promise<RelegationZone>;
    getAvailableFormats(): TournamentFormat[];
    getFormatMetadata(): Record<TournamentFormat, FormatMetadata>;
    getStats(): TournamentStats;
    onStop(): Promise<void>;
}
export {};
//# sourceMappingURL=tournament.plugin.d.ts.map