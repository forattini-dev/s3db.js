/**
 * Onboarding Manager - First-run setup for Identity Plugin
 *
 * Handles automatic admin account creation on first run with multiple modes:
 * - Interactive: CLI wizard with prompts (dev mode)
 * - Environment: IDENTITY_ADMIN_EMAIL/PASSWORD env vars (production)
 * - Config: Declarative admin object in config (Kubernetes/Docker)
 * - Callback: Custom onFirstRun function (advanced)
 *
 * Security:
 * - Strong password validation (min 12 chars, complexity)
 * - Optional leaked password check (haveibeenpwned)
 * - Audit trail for admin creation
 * - Idempotent - skips if admin exists
 */
export interface OnboardingConfig {
    enabled?: boolean;
    mode?: string;
    logLevel?: string;
    admin?: {
        email: string;
        password: string;
        name?: string;
        scopes?: string[];
        metadata?: Record<string, any>;
    };
    adminEmail?: string;
    adminPassword?: string;
    adminName?: string;
    passwordPolicy?: PasswordPolicy;
    onFirstRun?: OnFirstRunCallback;
    callback?: OnFirstRunCallback;
    force?: boolean;
}
export interface PasswordPolicy {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSymbols?: boolean;
}
export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}
export interface OnboardingManagerOptions {
    resources?: {
        users?: Resource;
        clients?: Resource;
        tenants?: Resource;
    };
    db?: any;
    database?: any;
    logger?: Logger;
    options?: {
        issuer?: string;
        logLevel?: string;
        [key: string]: unknown;
    };
    config?: OnboardingConfig;
    auditPlugin?: AuditPlugin;
    pluginStorageResource?: Resource;
    usersResource?: Resource;
    clientsResource?: Resource;
}
export interface AdminOptions {
    email: string;
    password: string;
    name?: string;
    scopes?: string[];
    metadata?: Record<string, any>;
}
export interface ClientOptions {
    name: string;
    clientId?: string;
    clientSecret?: string;
    grantTypes?: string[];
    allowedScopes?: string[];
    redirectUris?: string[];
    audiences?: string[];
    metadata?: Record<string, any>;
}
export interface ClientCredentials {
    id: string;
    clientId: string;
    clientSecret: string;
    name: string;
    grantTypes: string[];
    allowedScopes: string[];
    redirectUris: string[];
}
export interface OnboardingStatus {
    completed: boolean;
    adminExists?: boolean;
    completedAt?: string;
    mode?: string;
    clientsCount?: number;
    error?: string;
}
export interface OnFirstRunContext {
    createAdmin: (options: AdminOptions) => Promise<any>;
    createClient: (options: ClientOptions) => Promise<ClientCredentials>;
    db: any;
    logger: Logger;
    config: OnboardingConfig;
}
export type OnFirstRunCallback = (context: OnFirstRunContext) => Promise<void>;
interface Resource {
    query: (filter: Record<string, any>) => Promise<any[]>;
    insert: (data: Record<string, any>) => Promise<any>;
}
interface Logger {
    info?: (message: string, ...args: any[]) => void;
    error?: (message: string, ...args: any[]) => void;
}
interface AuditPlugin {
    log: (data: {
        action: string;
        resource: string;
        metadata: Record<string, any>;
    }) => Promise<void>;
}
export declare class OnboardingManager {
    private resources;
    private database;
    private logger;
    private config;
    private auditPlugin?;
    private pluginStorageResource?;
    private usersResource?;
    private clientsResource?;
    private passwordPolicy;
    private defaultAdminScopes;
    constructor(options?: OnboardingManagerOptions);
    detectFirstRun(): Promise<boolean>;
    validatePassword(password: string): PasswordValidationResult;
    validateEmail(email: string): boolean;
    createAdmin(options: AdminOptions): Promise<any>;
    createClient(options: ClientOptions): Promise<ClientCredentials>;
    getOnboardingStatus(): Promise<OnboardingStatus>;
    markOnboardingComplete(data?: Record<string, any>): Promise<void>;
    runEnvMode(): Promise<any>;
    runConfigMode(): Promise<any>;
    runCallbackMode(): Promise<void>;
    runInteractiveMode(): Promise<any>;
    private _getOnboardingMetadata;
    private _logAuditEvent;
    static resetCache(): void;
}
export {};
//# sourceMappingURL=onboarding-manager.d.ts.map