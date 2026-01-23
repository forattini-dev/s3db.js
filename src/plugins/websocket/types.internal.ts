/**
 * Internal Types for WebSocket Plugin
 *
 * These types are used internally by the WebSocket plugin and should not be
 * exported to users. Users should only interact with WebSocketPlugin and WebSocketServer.
 */

import type { Database } from '../../database.class.js';

export interface WebSocketAuthDriver {
  driver: 'jwt' | 'apiKey';
  config?: any;
}

export interface WebSocketAuth {
  drivers?: WebSocketAuthDriver[];
  required?: boolean;
}

export interface WebSocketResourceConfig {
  auth?: string[] | Record<string, any>;
  protected?: string[];
  guard?: {
    get?: Function;
    list?: Function;
    create?: Function;
    update?: Function;
    delete?: Function;
  };
  publishAuth?: string[] | Record<string, any>;
}

export interface WebSocketRateLimitConfig {
  enabled: boolean;
  windowMs?: number;
  maxRequests?: number;
}

export interface WebSocketCorsConfig {
  enabled: boolean;
  origin?: string;
}

export interface WebSocketHealthConfig {
  enabled?: boolean;
  [key: string]: any;
}

export interface WebSocketChannelsConfig {
  enabled?: boolean;
  guards?: Record<string, Function>;
}

export interface WebSocketOptions {
  port?: number;
  host?: string;
  database: Database;
  namespace?: string;
  logger?: any;
  logLevel?: string;
  auth?: WebSocketAuth;
  resources?: Record<string, WebSocketResourceConfig>;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  maxPayloadSize?: number;
  rateLimit?: WebSocketRateLimitConfig;
  cors?: WebSocketCorsConfig;
  startupBanner?: boolean;
  health?: WebSocketHealthConfig;
  channels?: WebSocketChannelsConfig;
  messageHandlers?: Record<string, Function>;
}

export interface ClientInfo {
  ws: any;
  user: any | null;
  subscriptions: Set<string>;
  connectedAt: string;
  lastActivity: number;
  metadata: {
    ip?: string;
    userAgent?: string;
  };
}

export interface WebSocketMetrics {
  connections: number;
  disconnections: number;
  messagesReceived: number;
  messagesSent: number;
  broadcasts: number;
  errors: number;
}
