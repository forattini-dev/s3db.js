/**
 * CertificateStage
 *
 * TLS certificate inspection using RedBlue:
 * - Subject and issuer details
 * - Validity period
 * - Fingerprint
 * - Subject Alternative Names (SANs)
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
export interface CertificateFeatureConfig {
    timeout?: number;
}
export interface CertificateData {
    subject: string | null;
    issuer: string | null;
    validFrom: string | null;
    validTo: string | null;
    fingerprint?: string | null;
    subjectAltName?: string[];
    serialNumber?: string | null;
    version?: number | null;
    signatureAlgorithm?: string | null;
    chain?: any[];
}
export interface CertificateResult {
    status: 'ok' | 'skipped' | 'unavailable' | 'error';
    message?: string;
    subject?: string | null;
    issuer?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
    fingerprint?: string | null;
    subjectAltName?: string[];
    serialNumber?: string | null;
    version?: number | null;
    signatureAlgorithm?: string | null;
    chain?: any[];
    metadata?: Record<string, any>;
}
export declare class CertificateStage {
    private plugin;
    private commandRunner;
    constructor(plugin: ReconPlugin);
    execute(target: Target, featureConfig?: CertificateFeatureConfig): Promise<CertificateResult>;
    private _normalizeCertificate;
    private _normalizeAltNames;
    private _parseRawCert;
}
//# sourceMappingURL=certificate-stage.d.ts.map