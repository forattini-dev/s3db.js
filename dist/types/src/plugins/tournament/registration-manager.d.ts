interface RegistrationOptions {
    seed?: number | null;
    metadata?: Record<string, unknown>;
}
interface RegistrationFilters {
    status?: string;
}
interface RegistrationRecord {
    id: string;
    tournamentId: string;
    participantId: string;
    seed: number | null;
    status: string;
    registeredAt: number;
    confirmedAt: number | null;
    checkedInAt: number | null;
    metadata: Record<string, unknown>;
}
interface TournamentRecord {
    id: string;
    status: string;
    config: {
        maxParticipants?: number;
    };
}
interface BulkParticipant {
    participantId?: string;
    seed?: number;
    metadata?: Record<string, unknown>;
}
interface BulkResult {
    success: boolean;
    registration?: RegistrationRecord;
    participantId?: string;
    error?: string;
}
interface TournamentPlugin {
    registrationsResource: {
        insert(data: Record<string, unknown>): Promise<RegistrationRecord>;
        get(id: string): Promise<RegistrationRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<RegistrationRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
        }): Promise<RegistrationRecord[]>;
    };
    logger: {
        debug(data: Record<string, unknown>, message: string): void;
        info(data: Record<string, unknown>, message: string): void;
        warn(data: Record<string, unknown>, message: string): void;
    };
    emit(event: string, data: Record<string, unknown>): void;
    tournamentManager: {
        get(id: string): Promise<TournamentRecord | null>;
    };
}
export declare class RegistrationManager {
    private plugin;
    private logger;
    constructor(plugin: TournamentPlugin);
    get resource(): {
        insert(data: Record<string, unknown>): Promise<RegistrationRecord>;
        get(id: string): Promise<RegistrationRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<RegistrationRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
        }): Promise<RegistrationRecord[]>;
    };
    register(tournamentId: string, participantId: string, options?: RegistrationOptions): Promise<RegistrationRecord>;
    confirm(tournamentId: string, participantId: string): Promise<void>;
    checkIn(tournamentId: string, participantId: string): Promise<void>;
    withdraw(tournamentId: string, participantId: string, reason?: string): Promise<void>;
    getRegistration(tournamentId: string, participantId: string): Promise<RegistrationRecord | undefined>;
    getByTournament(tournamentId: string, filters?: RegistrationFilters): Promise<RegistrationRecord[]>;
    getConfirmed(tournamentId: string): Promise<RegistrationRecord[]>;
    getCount(tournamentId: string, status?: string | null): Promise<number>;
    deleteByTournament(tournamentId: string): Promise<number>;
    setSeed(tournamentId: string, participantId: string, seed: number): Promise<void>;
    shuffleSeeds(tournamentId: string): Promise<{
        participantId: string;
        seed: number;
    }[]>;
    getByParticipant(participantId: string, filters?: RegistrationFilters): Promise<RegistrationRecord[]>;
    bulkRegister(tournamentId: string, participants: (string | BulkParticipant)[]): Promise<BulkResult[]>;
    confirmAll(tournamentId: string): Promise<number>;
}
export {};
//# sourceMappingURL=registration-manager.d.ts.map