export type SMTPMode = 'relay' | 'server';
export interface SMTPAuth {
    user?: string;
    pass?: string;
}
export interface SMTPPoolOptions {
    maxConnections?: number;
    maxMessages?: number;
    rateDelta?: number;
    rateLimit?: number;
    [key: string]: unknown;
}
export interface SMTPSession {
    [key: string]: unknown;
}
export interface SMTPAuthResult {
    user: string;
    [key: string]: unknown;
}
export type SMTPAuthHandler = (auth: SMTPAuth, session: SMTPSession) => Promise<SMTPAuthResult>;
export type SMTPAddressHandler = (address: {
    address: string;
}, session: SMTPSession) => Promise<void>;
export type SMTPDataHandler = (stream: NodeJS.ReadableStream, session: SMTPSession) => Promise<void>;
export interface SMTPConnectionOptions {
    mode?: SMTPMode;
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: SMTPAuth;
    pool?: SMTPPoolOptions;
    maxConnections?: number;
    maxMessages?: number;
    rateDelta?: number;
    rateLimit?: number;
    requireAuth?: boolean;
    authHandler?: SMTPAuthHandler | null;
    onMailFrom?: SMTPAddressHandler | null;
    onRcptTo?: SMTPAddressHandler | null;
    onData?: SMTPDataHandler | null;
    [key: string]: unknown;
}
export interface EmailMessage {
    from?: string;
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    attachments?: unknown[];
    [key: string]: unknown;
}
export interface SendResult {
    messageId: string;
    response: string;
    accepted: string[];
    rejected: string[];
}
export interface ConnectionStatus {
    mode: SMTPMode;
    isConnected: boolean;
    transportType: 'nodemailer' | 'smtp-server' | null;
}
export declare class SMTPConnectionManager {
    mode: SMTPMode;
    options: SMTPConnectionOptions;
    private _nodemailer;
    private _transport;
    private _server;
    private _isConnected;
    constructor(options?: SMTPConnectionOptions);
    initialize(): Promise<void>;
    private _initializeRelay;
    private _initializeServer;
    sendEmail(message: EmailMessage): Promise<SendResult>;
    verify(): Promise<boolean>;
    close(): Promise<void>;
    getStatus(): ConnectionStatus;
}
//# sourceMappingURL=connection-manager.d.ts.map