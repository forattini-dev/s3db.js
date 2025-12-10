/**
 * TlsAuditStage
 *
 * TLS/SSL security auditing using RedBlue:
 * - Protocol version detection
 * - Cipher suite enumeration
 * - Security vulnerability detection
 */
import type { CommandRunner } from '../concerns/command-runner.js';
export interface ReconPlugin {
    commandRunner: CommandRunner;
    config: Record<string, any>;
}
export interface Target {
    host: string;
    protocol?: string;
    port?: number;
    path?: string;
}
export interface TlsAuditFeatureConfig {
    timeout?: number;
}
export interface TlsProtocol {
    name: string;
    supported: boolean;
    deprecated?: boolean;
}
export interface TlsCipher {
    name: string;
    strength: string;
    keyExchange?: string | null;
    authentication?: string | null;
}
export interface TlsVulnerability {
    name: string;
    severity: string;
}
export interface TlsAuditData {
    protocols: TlsProtocol[];
    ciphers: TlsCipher[];
    vulnerabilities: TlsVulnerability[];
    certificate?: any | null;
    grade?: string | null;
    warnings?: string[];
}
export interface TlsAuditResult {
    status: 'ok' | 'unavailable' | 'error';
    message?: string;
    protocols?: TlsProtocol[];
    ciphers?: TlsCipher[];
    vulnerabilities?: TlsVulnerability[];
    certificate?: any | null;
    grade?: string | null;
    warnings?: string[];
    metadata?: Record<string, any>;
}
export declare class TlsAuditStage {
    private plugin;
    private commandRunner;
    private config;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: TlsAuditFeatureConfig): Promise<TlsAuditResult>;
    private _normalizeAudit;
    private _normalizeProtocols;
    private _normalizeCiphers;
    private _isDeprecated;
    private _cipherStrength;
    private _parseRawAudit;
}
//# sourceMappingURL=tls-audit-stage.d.ts.map