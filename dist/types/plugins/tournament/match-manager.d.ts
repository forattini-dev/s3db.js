import type { Match } from './types.js';
interface GameResult {
    score1: number;
    score2: number;
    metadata?: Record<string, unknown>;
}
interface MatchResult {
    score1: number;
    score2: number;
    games?: GameResult[];
    metadata?: Record<string, unknown>;
}
interface MatchCreateData {
    id?: string;
    tournamentId: string;
    phase?: string;
    round: number;
    matchNumber: number;
    participant1Id?: string | null;
    participant2Id?: string | null;
    bestOf?: number;
    groupId?: string | null;
    nextMatchId?: string | null;
    loserNextMatchId?: string | null;
    scheduledAt?: number | null;
    metadata?: Record<string, unknown>;
}
interface MatchFilters {
    phase?: string;
    round?: number;
    status?: string;
    limit?: number;
}
interface MatchRecord extends Match {
    tournamentId: string;
    loserNextMatchId?: string | null;
}
interface TournamentPlugin {
    matchesResource: {
        insert(data: Record<string, unknown>): Promise<MatchRecord>;
        get(id: string): Promise<MatchRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<MatchRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
            limit?: number;
        }): Promise<MatchRecord[]>;
    };
    logger: {
        debug(data: Record<string, unknown>, message: string): void;
        info(data: Record<string, unknown>, message: string): void;
        warn(data: Record<string, unknown>, message: string): void;
    };
    emit(event: string, data: Record<string, unknown>): void;
    tournamentManager: {
        updateBracket(tournamentId: string, match: MatchRecord): Promise<void>;
    };
}
export declare class MatchManager {
    private plugin;
    private logger;
    constructor(plugin: TournamentPlugin);
    get resource(): {
        insert(data: Record<string, unknown>): Promise<MatchRecord>;
        get(id: string): Promise<MatchRecord | null>;
        update(id: string, data: Record<string, unknown>): Promise<MatchRecord>;
        delete(id: string): Promise<void>;
        listPartition(options: {
            partition: string;
            partitionValues: Record<string, string>;
            limit?: number;
        }): Promise<MatchRecord[]>;
    };
    create(data: MatchCreateData): Promise<MatchRecord>;
    _determineInitialStatus(p1: string | null | undefined, p2: string | null | undefined): string;
    get(id: string): Promise<MatchRecord | null>;
    getByTournament(tournamentId: string, filters?: MatchFilters): Promise<MatchRecord[]>;
    deleteByTournament(tournamentId: string): Promise<number>;
    schedule(matchId: string, scheduledAt: number): Promise<void>;
    start(matchId: string): Promise<void>;
    reportResult(matchId: string, result: MatchResult): Promise<MatchRecord>;
    reportWalkover(matchId: string, winnerId: string, reason?: string): Promise<MatchRecord>;
    reportGame(matchId: string, game: GameResult): Promise<MatchRecord>;
    getUpcoming(tournamentId: string, limit?: number): Promise<MatchRecord[]>;
    getLive(tournamentId: string): Promise<MatchRecord[]>;
    _advanceToMatch(matchId: string, participantId: string, _slot: string, tournamentId?: string | null): Promise<void>;
    setParticipant(matchId: string, participantId: string, slot: 1 | 2): Promise<void>;
}
export {};
//# sourceMappingURL=match-manager.d.ts.map