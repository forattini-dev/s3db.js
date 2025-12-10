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
        list(options: {
            limit: number;
        }): Promise<TournamentRecord[]>;
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
export declare class TournamentManager {
    private plugin;
    private logger;
    constructor(plugin: TournamentPlugin);
    get resource(): {
        insert(data: Record<string, unknown>): Promise<TournamentRecord>;
        get(id: string): Promise<TournamentRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<TournamentRecord>;
        delete(id: string): Promise<void>;
        list(options: {
            limit: number;
        }): Promise<TournamentRecord[]>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
            limit?: number;
        }): Promise<TournamentRecord[]>;
    };
    create(options: TournamentCreateOptions): Promise<TournamentRecord>;
    get(id: string): Promise<TournamentRecord | null>;
    update(id: string, data: Partial<TournamentRecord>): Promise<TournamentRecord>;
    delete(id: string): Promise<void>;
    list(filters?: TournamentListFilters): Promise<TournamentRecord[]>;
    openRegistration(id: string): Promise<void>;
    closeRegistration(id: string): Promise<void>;
    start(id: string): Promise<void>;
    cancel(id: string, reason?: string): Promise<void>;
    complete(id: string): Promise<void>;
    getStandings(id: string): Promise<Standing[]>;
    getBracket(id: string): Promise<Bracket | null>;
    updateBracket(tournamentId: string, completedMatch: Match): Promise<{
        bracket: Bracket;
        newMatches: Match[];
    }>;
}
export {};
//# sourceMappingURL=tournament-manager.d.ts.map