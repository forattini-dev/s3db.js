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

export interface WebSocketTicketAuthConfig {
  enabled: boolean;
  ttl?: number;
}

export interface WebSocketTokenRefreshConfig {
  enabled: boolean;
  validateRefreshToken: (token: string) => Promise<any | null>;
}

export interface WebSocketRecoveryConfig {
  enabled: boolean;
  ttl?: number;
}

export interface WebSocketChannelRateLimits {
  maxChannelsPerClient?: number;
  maxSubscribesPerSecond?: number;
  maxPublishesPerSecond?: number;
  maxMessagesPerSecond?: number;
  onRateLimited?: (socketId: string, operation: string, limit: number) => void;
}

export interface WebSocketChannelHistoryConfig {
  enabled: boolean;
  maxSize?: number;
  ttl?: number;
}

export interface WebSocketChannelTransformFn {
  (channel: string, event: string, data: unknown, ctx: { socketId: string; userId?: string }): unknown | null | Promise<unknown | null>;
}

export interface WebSocketChannelTypingConfig {
  enabled?: boolean;
  timeout?: number;
}

export interface WebSocketChannelRestApiConfig {
  enabled: boolean;
  path?: string;
  apiKey?: string;
  auth?: (req: any) => boolean | Promise<boolean>;
}

export interface WebSocketCompressionConfig {
  threshold?: number;
  level?: number;
}

export interface WebSocketChannelsConfig {
  enabled?: boolean;
  guards?: Record<string, Function>;
  rateLimits?: WebSocketChannelRateLimits;
  history?: WebSocketChannelHistoryConfig;
  transform?: WebSocketChannelTransformFn;
  maxSubscribersPerChannel?: number | ((channel: string) => number);
  typing?: WebSocketChannelTypingConfig;
  restApi?: WebSocketChannelRestApiConfig;
}

export type WebSocketSendFn = (message: unknown) => void;

export interface WebSocketHookContext {
  database: Database;
  server: any;
  adapter: any;
  getUser: (socketId: string) => any;
}

export type WebSocketMessageHandler = (
  socketId: string,
  payload: any,
  context: { send: WebSocketSendFn; user: any; server: any; database: Database; adapter: any }
) => any | Promise<any>;

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
  compression?: boolean | WebSocketCompressionConfig;

  /**
   * Ticket-based authentication for WebSocket connections.
   * Generate single-use tickets via HTTP, clients connect with ?ticket=xxx.
   * More secure than passing JWTs in query strings.
   */
  ticketAuth?: WebSocketTicketAuthConfig;

  /**
   * Allow clients to refresh their auth token mid-connection without reconnecting.
   * Client sends { type: 'auth:refresh', token: 'new-jwt' }.
   */
  tokenRefresh?: WebSocketTokenRefreshConfig;

  /**
   * Connection state recovery — saves session on disconnect, restores on reconnect.
   * Client receives a recoveryToken on connect, sends { type: 'recover', recoveryToken }
   * on reconnect to restore subscriptions and replay missed messages.
   */
  recovery?: WebSocketRecoveryConfig;

  /**
   * Custom message handlers keyed by message type.
   * Called when a message with matching `type` is received.
   * If a handler is registered for a type, it takes priority over built-in handlers.
   *
   * @example
   * messageHandlers: {
   *   'game:move': async (socketId, payload, { send, user }) => {
   *     return { type: 'game:moved', position: payload.position };
   *   }
   * }
   */
  messageHandlers?: Record<string, WebSocketMessageHandler>;

  /**
   * Raw message interceptor — called BEFORE any built-in processing.
   * Return `true` to indicate the message was fully handled (skip all built-in handlers).
   * Return `false` to let the server process it normally.
   *
   * The context object provides access to the database and server internals.
   *
   * @example
   * onMessage: (socketId, raw, send, ctx) => {
   *   const msg = JSON.parse(raw.toString());
   *   if (msg.type === 'custom-query') {
   *     const records = await ctx.database.resources.users.list();
   *     send({ type: 'result', data: records });
   *     return true;
   *   }
   *   return false;
   * }
   */
  onMessage?: (socketId: string, raw: string | Buffer, send: WebSocketSendFn, ctx: WebSocketHookContext) => boolean | Promise<boolean>;

  /**
   * Called when a new client connects (after auth).
   * The context object provides access to the database and server internals.
   *
   * @example
   * onConnection: (socketId, send, req, ctx) => {
   *   const count = ctx.adapter.clientCount;
   *   send({ type: 'welcome', onlineUsers: count });
   * }
   */
  onConnection?: (socketId: string, send: WebSocketSendFn, req: any, ctx: WebSocketHookContext) => void | Promise<void>;

  /**
   * Called when a client disconnects.
   *
   * @example
   * onClose: (socketId, code, reason, ctx) => {
   *   console.log(`Client ${socketId} disconnected: ${code}`);
   * }
   */
  onClose?: (socketId: string, code: number, reason: string, ctx: WebSocketHookContext) => void | Promise<void>;
}

export interface WebSocketMetrics {
  connections: number;
  disconnections: number;
  messagesReceived: number;
  messagesSent: number;
  broadcasts: number;
  errors: number;
}
