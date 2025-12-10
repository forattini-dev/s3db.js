/**
 * Session Manager - Handles user sessions for Identity Provider
 *
 * Manages session lifecycle using S3DB resource as storage:
 * - Create/validate/destroy sessions
 * - Cookie-based session handling
 * - Automatic session cleanup (expired sessions)
 * - IP address and user agent tracking
 */
export interface SessionConfig {
    sessionExpiry: string;
    cookieName: string;
    cookiePath: string;
    cookieHttpOnly: boolean;
    cookieSecure: boolean;
    cookieSameSite: 'Strict' | 'Lax' | 'None';
    cleanupInterval: number;
    enableCleanup: boolean;
}
export interface SessionManagerOptions {
    sessionResource: SessionResource;
    config?: Partial<SessionConfig>;
}
export interface CreateSessionData {
    userId: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    duration?: string;
}
export interface CreateSessionResult {
    sessionId: string;
    expiresAt: number;
    session: SessionRecord;
}
export interface ValidateSessionResult {
    valid: boolean;
    session: SessionRecord | null;
    reason: string | null;
}
export interface SessionStatistics {
    total: number;
    active: number;
    expired: number;
    users: number;
}
export interface SessionRecord {
    id: string;
    userId: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, any>;
    createdAt: string;
}
interface SessionResource {
    insert: (data: Record<string, any>) => Promise<SessionRecord>;
    get: (id: string) => Promise<SessionRecord | null>;
    update: (id: string, data: Record<string, any>) => Promise<SessionRecord>;
    delete: (id: string) => Promise<void>;
    query: (filter: Record<string, any>) => Promise<SessionRecord[]>;
    list: (options?: {
        limit?: number;
    }) => Promise<SessionRecord[]>;
}
interface HttpResponse {
    setHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => void;
}
interface HttpRequest {
    headers?: {
        cookie?: string;
    };
    header?: (name: string) => string | undefined;
}
export declare class SessionManager {
    private sessionResource;
    private config;
    private cronManager;
    private cleanupJobName;
    private logger;
    constructor(options: SessionManagerOptions);
    createSession(data: CreateSessionData): Promise<CreateSessionResult>;
    validateSession(sessionId: string): Promise<ValidateSessionResult>;
    getSession(sessionId: string): Promise<SessionRecord | null>;
    updateSession(sessionId: string, metadata: Record<string, any>): Promise<SessionRecord>;
    destroySession(sessionId: string): Promise<boolean>;
    destroyUserSessions(userId: string): Promise<number>;
    getUserSessions(userId: string): Promise<SessionRecord[]>;
    setSessionCookie(res: HttpResponse, sessionId: string, expiresAt: number): void;
    clearSessionCookie(res: HttpResponse): void;
    getSessionIdFromRequest(req: HttpRequest): string | null;
    cleanupExpiredSessions(): Promise<number>;
    private _startCleanup;
    stopCleanup(): void;
    getStatistics(): Promise<SessionStatistics>;
}
export default SessionManager;
//# sourceMappingURL=session-manager.d.ts.map