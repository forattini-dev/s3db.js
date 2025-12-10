export interface SMTPAuth {
    user?: string | ((config: DriverConfig) => string);
    pass?: string | ((config: DriverConfig) => string);
}
export interface ProviderConfig {
    host: string | ((config: DriverConfig) => string);
    port: number;
    secure: boolean;
    auth: SMTPAuth;
}
export interface DriverConfig {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
        user?: string;
        pass?: string;
    };
    apiKey?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    domain?: string;
    serverToken?: string;
    email?: string;
    appPassword?: string;
    maxConnections?: number;
    maxMessages?: number;
    rateDelta?: number;
    rateLimit?: number;
    [key: string]: unknown;
}
export interface DriverOptions {
    [key: string]: unknown;
}
export interface EmailData {
    from?: string;
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    body?: string;
    html?: string;
    attachments?: unknown[];
}
export interface SendResult {
    messageId: string;
    response: string;
    accepted: string[];
    rejected: string[];
    pending?: string[];
}
export interface DriverInfo {
    name: string;
    initialized: boolean;
    host: string | null;
}
export declare class SMTPRelayDriver {
    name: string;
    config: DriverConfig;
    options: DriverOptions;
    private _transport;
    private _nodemailer;
    private _isInitialized;
    constructor(driverName: string, config?: DriverConfig, options?: DriverOptions);
    initialize(): Promise<void>;
    private _buildSmtpConfig;
    sendEmail(emailData: EmailData): Promise<SendResult>;
    close(): Promise<void>;
    getInfo(): DriverInfo;
}
//# sourceMappingURL=relay-driver.d.ts.map