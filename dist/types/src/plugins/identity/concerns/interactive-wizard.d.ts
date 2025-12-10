/**
 * Interactive Onboarding Wizard - CLI prompts for admin account creation
 *
 * Uses enquirer for beautiful CLI prompts (lazy-loaded peer dependency)
 * Only works in TTY environments (development)
 *
 * Security:
 * - Masks password input
 * - Validates password strength
 * - Max 3 password attempts
 * - Timeout after 5 minutes
 */
export interface InteractiveWizardOptions {
    logger?: Logger;
    config?: WizardConfig;
    passwordPolicy?: PasswordPolicy;
}
export interface WizardConfig {
    issuer?: string;
    interactive?: {
        maxPasswordAttempts?: number;
        maxEmailAttempts?: number;
        timeout?: number;
    };
}
export interface PasswordPolicy {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSymbols?: boolean;
}
export interface AdminData {
    email: string;
    password: string;
    name: string;
}
export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}
interface Logger {
    info?: (message: string, ...args: any[]) => void;
    error?: (message: string, ...args: any[]) => void;
}
export declare class InteractiveWizard {
    private logger;
    private config;
    private passwordPolicy;
    private maxPasswordAttempts;
    private maxEmailAttempts;
    private timeout;
    constructor(options?: InteractiveWizardOptions);
    run(): Promise<AdminData>;
    private _printBanner;
    private _printSuccess;
    private _promptEmail;
    private _promptPassword;
    private _promptPasswordOnce;
    private _promptPasswordConfirm;
    private _promptName;
    private _validatePassword;
    private _loadEnquirer;
}
export {};
//# sourceMappingURL=interactive-wizard.d.ts.map