/**
 * WhoisStage
 *
 * WHOIS lookup using RedBlue:
 * - Domain registration information
 * - Registrar, dates, nameservers
 * - Contact information (if available)
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface WhoisFeatureConfig {
    timeout?: number;
    raw?: boolean;
}
export interface Registrant {
    name: string | null;
    organization: string | null;
    email: string | null;
    country: string | null;
}
export interface Dates {
    created: string | null;
    updated: string | null;
    expiration: string | null;
    daysUntilExpiration?: number;
}
export interface WhoisData {
    domain: string | null;
    registrar: string | null;
    registrant: Registrant;
    dates: Dates;
    nameservers: string[];
    domainStatus: string[];
    dnssec: string | null;
    raw?: string | null;
    expirationStatus?: string;
}
export interface WhoisResult {
    status: 'ok' | 'empty' | 'unavailable' | 'error';
    message?: string;
    domain?: string;
    registrar?: string | null;
    registrant?: Registrant;
    dates?: Dates;
    nameservers?: string[];
    domainStatus?: string[];
    dnssec?: string | null;
    raw?: string | null;
    expirationStatus?: string;
    metadata?: Record<string, any>;
}
export declare class WhoisStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: WhoisFeatureConfig): Promise<WhoisResult>;
    private _extractBaseDomain;
    private _normalizeWhois;
    private _parseRawWhois;
    private _parseDate;
}
//# sourceMappingURL=whois-stage.d.ts.map