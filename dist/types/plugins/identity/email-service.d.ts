/**
 * Email Service for Identity Provider
 * Handles email sending via SMTP with template support
 */
export interface SMTPAuth {
    user: string;
    pass: string;
}
export interface SMTPTLSOptions {
    rejectUnauthorized: boolean;
}
export interface SMTPConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: SMTPAuth;
    tls: SMTPTLSOptions;
}
export interface TemplateConfig {
    baseUrl: string;
    brandName: string;
    brandLogo: string | null;
    brandColor: string;
    supportEmail: string | null;
    customFooter: string | null;
}
export interface EmailServiceConfig {
    enabled: boolean;
    from: string;
    replyTo: string | null;
    smtp: SMTPConfig;
    templates: TemplateConfig;
    logLevel: string | null;
}
export interface EmailServiceOptions {
    enabled?: boolean;
    from?: string;
    replyTo?: string | null;
    smtp?: Partial<{
        host: string;
        port: number;
        secure: boolean;
        auth: Partial<SMTPAuth>;
        tls: Partial<SMTPTLSOptions>;
    }>;
    templates?: Partial<TemplateConfig>;
    logLevel?: string | null;
}
export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
}
export interface SendEmailResult {
    success: boolean;
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
    reason?: string;
    error?: string;
}
interface PasswordResetEmailOptions {
    to: string;
    name: string;
    resetToken: string;
    expiresIn?: number;
}
interface EmailVerificationOptions {
    to: string;
    name: string;
    verificationToken: string;
    expiresIn?: number;
}
interface WelcomeEmailOptions {
    to: string;
    name: string;
}
export declare class EmailService {
    private config;
    private transporter;
    private initialized;
    private logger;
    constructor(options?: EmailServiceOptions);
    private _initialize;
    sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
    private _htmlToText;
    private _baseTemplate;
    sendPasswordResetEmail({ to, name, resetToken, expiresIn }: PasswordResetEmailOptions): Promise<SendEmailResult>;
    sendEmailVerificationEmail({ to, name, verificationToken, expiresIn }: EmailVerificationOptions): Promise<SendEmailResult>;
    sendWelcomeEmail({ to, name }: WelcomeEmailOptions): Promise<SendEmailResult>;
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}
export default EmailService;
//# sourceMappingURL=email-service.d.ts.map