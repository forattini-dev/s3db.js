export interface EmailHeadersOptions {
    customHeaders?: Record<string, string>;
    dkim?: DkimConfig | null;
    spf?: SpfConfig | null;
    dmarc?: DmarcConfig | null;
    messageIdDomain?: string;
    customUnsubscribeHeaders?: Record<string, string> | null;
}
export interface DkimConfig {
    domain?: string;
    selector?: string;
    privateKey?: string;
    algorithm?: string;
    canonicalization?: string;
    includeBodyLength?: boolean;
    includeTimestamp?: boolean;
    includeExpiration?: boolean;
}
export interface SpfConfig {
    [key: string]: unknown;
}
export interface DmarcConfig {
    [key: string]: unknown;
}
export interface EmailAddress {
    name?: string;
    address?: string;
}
export interface UnsubscribeInfo {
    url?: string;
    email?: string;
}
export interface EmailMessage {
    from?: string | EmailAddress;
    replyTo?: string | EmailAddress;
    inReplyTo?: string;
    references?: string | string[];
    listUnsubscribe?: string | UnsubscribeInfo;
    priority?: string;
    customHeaders?: Record<string, string>;
}
export interface GeneratedHeaders {
    [key: string]: string;
}
export interface DkimHeaderConfig {
    v: string;
    a: string;
    c: string;
    d: string;
    s: string;
    h: string;
    bh: string;
    b: string;
}
export interface ArcHeaders {
    'ARC-Seal': string;
    'ARC-Message-Signature': string;
    'ARC-Authentication-Results': string;
}
export declare class EmailHeadersBuilder {
    options: EmailHeadersOptions;
    headers: Record<string, string>;
    customHeaders: Record<string, string>;
    dkim: DkimConfig | null;
    spf: SpfConfig | null;
    dmarc: DmarcConfig | null;
    messageIdDomain: string;
    customUnsubscribeHeaders: Record<string, string> | null;
    constructor(options?: EmailHeadersOptions);
    generateHeaders(message?: EmailMessage): GeneratedHeaders;
    generateDkimSignature(_messageData: unknown): string | null;
    generateAuthenticationHeaders(domain?: string): GeneratedHeaders;
    generateArcHeaders(_messageData: unknown): ArcHeaders;
    addUnsubscribeLink(unsubscribeUrl: string, oneClickOnly?: boolean): Record<string, string>;
    addBounceAddress(bounceAddress: string): Record<string, string>;
    addFeedbackLoopHeaders(feedbackEmail: string): Record<string, string>;
    getHeaders(): Record<string, string>;
    getHeadersAsString(): string;
    private _formatEmailAddress;
    private _generateMessageId;
    private _generateListUnsubscribe;
    private _buildDkimHeader;
    private _generateSpfHeader;
    private _generateDmarcHeader;
    private _generateArcSeal;
    private _generateArcMessageSig;
    private _generateArcAuthResults;
    private _generateFeedbackId;
}
export interface DkimPreset {
    domain: string;
    selector: string;
    algorithm: string;
    canonicalization: string;
}
export declare const dkimPresets: Record<string, DkimPreset>;
export declare const dmarcAlignmentModes: {
    readonly RELAXED: "relaxed";
    readonly STRICT: "strict";
};
export type DmarcAlignmentMode = typeof dmarcAlignmentModes[keyof typeof dmarcAlignmentModes];
export declare const dmarcPolicies: {
    readonly NONE: "none";
    readonly QUARANTINE: "quarantine";
    readonly REJECT: "reject";
};
export type DmarcPolicy = typeof dmarcPolicies[keyof typeof dmarcPolicies];
//# sourceMappingURL=email-headers.d.ts.map