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

export type WebSocketSendFn = (message: unknown) => void;

export type WebSocketMessageHandler = (
  socketId: string,
  payload: any,
  context: { send: WebSocketSendFn; user: any; server: any }
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
   * Use this for full custom protocol implementation.
   *
   * @example
   * // Full custom protocol — no built-in CRUD
   * onMessage: (socketId, raw, send) => {
   *   const msg = JSON.parse(raw.toString());
   *   send({ type: 'echo', data: msg });
   *   return true;
   * }
   */
  onMessage?: (socketId: string, raw: string | Buffer, send: WebSocketSendFn) => boolean | Promise<boolean>;

  /**
   * Called when a new client connects (after auth).
   * Receives the socket ID, a send function, and the HTTP upgrade request.
   *
   * @example
   * onConnection: (socketId, send, req) => {
   *   send({ type: 'welcome', message: 'Hello!' });
   * }
   */
  onConnection?: (socketId: string, send: WebSocketSendFn, req: any) => void | Promise<void>;

  /**
   * Called when a client disconnects.
   *
   * @example
   * onClose: (socketId, code, reason) => {
   *   console.log(`Client ${socketId} disconnected: ${code}`);
   * }
   */
  onClose?: (socketId: string, code: number, reason: string) => void | Promise<void>;
}

export interface WebSocketMetrics {
  connections: number;
  disconnections: number;
  messagesReceived: number;
  messagesSent: number;
  broadcasts: number;
  errors: number;
}
