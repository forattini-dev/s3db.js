/**
 * Internal Types for SMTP Plugin
 *
 * These types are used internally by the SMTP plugin and should not be
 * exported to users. Users should only interact with SMTPPluginOptions.
 */

import type { EmailAttachment, SendResult } from '../smtp.plugin.js';

export type RelayStrategy = 'failover' | 'round-robin' | 'domain-based';
export type TemplateEngineType = 'handlebars' | 'custom';
export type WebhookProvider = 'sendgrid' | 'aws-ses' | 'mailgun' | 'postmark' | string;
export type BounceType = 'hard' | 'soft';
export type ComplaintType = 'abuse' | 'fraud' | 'general' | 'not-spam';

export interface SMTPAuth {
  user?: string;
  pass?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: number;
}

export interface RateLimitConfig {
  maxPerSecond: number;
  maxQueueDepth: number;
}

export interface RelayConfig {
  driver: string;
  config: Record<string, unknown>;
  from?: string;
  [key: string]: unknown;
}

export interface WebhookEvent {
  type: string;
  messageId: string;
  timestamp: number;
  bounceType?: BounceType;
  complaintType?: ComplaintType;
  reason?: string;
  userAgent?: string;
  ip?: string;
  url?: string;
}

export interface WebhookProcessResult {
  processed: boolean;
  eventType?: string;
  [key: string]: unknown;
}

export interface PluginStatus {
  name: string;
  mode: 'relay' | 'server';
  queuedEmails: number;
  rateLimitTokens: number;
  configType?: 'multi-relay' | 'driver' | 'legacy';
  relayStatus?: unknown;
  driver?: string;
  driverInfo?: unknown;
  connected?: boolean;
}

export interface SMTPDriverInstance {
  name: string;
  sendEmail: (options: {
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body?: string;
    html?: string;
    attachments: EmailAttachment[];
  }) => Promise<SendResult>;
  getInfo: () => unknown;
}

export interface MultiRelayManagerInstance {
  initialize: (relays: RelayConfig[]) => Promise<void>;
  sendEmail: (options: {
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body?: string;
    html?: string;
    attachments: EmailAttachment[];
  }) => Promise<SendResult>;
  getStatus: () => unknown;
}

export interface SMTPConnectionManagerInstance {
  initialize: () => Promise<void>;
  sendEmail: (options: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
    attachments: EmailAttachment[];
  }) => Promise<SendResult>;
  close: () => Promise<void>;
  _isConnected: boolean;
}

export interface SMTPTemplateEngineInstance {
  render: (templateName: string, data: Record<string, unknown>) => Promise<{ subject?: string; body?: string; html?: string }>;
  registerHelper: (name: string, fn: Function) => void;
  registerPartial: (name: string, template: string) => void;
  clearCache: () => void;
  getCacheStats: () => unknown;
}

export interface WebhookReceiverInstance {
  processWebhook: (body: unknown, headers: Record<string, string>) => Promise<WebhookProcessResult>;
  on: (eventType: string, handler: (event: WebhookEvent) => Promise<void>) => void;
  getEventLog: (limit?: number) => unknown[];
  clearEventLog: () => void;
  getHandlerCount: () => number;
}
