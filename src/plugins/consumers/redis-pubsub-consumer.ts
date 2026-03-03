import tryFn from "../../concerns/try-fn.js";
import requirePluginDependency from "../concerns/plugin-dependencies.js";

interface ParsedMessage {
  $body: unknown;
  $raw: { channel: string; message: string; pattern?: string };
}

type MessageHandler = (parsed: ParsedMessage) => Promise<void>;
type ErrorHandler = (error: Error, message?: unknown) => void;

interface RedisPubSubConsumerOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  channels?: string[];
  patterns?: string[];
  reconnectInterval?: number;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  driver?: string;
  redisOptions?: Record<string, unknown>;
}

interface RedisClient {
  subscribe(...channels: string[]): Promise<number>;
  psubscribe(...patterns: string[]): Promise<number>;
  unsubscribe(...channels: string[]): Promise<void>;
  punsubscribe(...patterns: string[]): Promise<void>;
  quit(): Promise<string>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  status: string;
}

type RedisConstructor = new (options: Record<string, unknown>) => RedisClient;

export class RedisPubSubConsumer {
  driver: string;
  channels: string[];
  patterns: string[];
  reconnectInterval: number;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  client: RedisClient | null = null;
  private _stopped: boolean = false;
  private _host: string;
  private _port: number;
  private _password?: string;
  private _db: number;
  private _redisOptions: Record<string, unknown>;

  constructor({
    host = 'localhost',
    port = 6379,
    password,
    db = 0,
    channels = [],
    patterns = [],
    reconnectInterval = 2000,
    onMessage,
    onError,
    driver = 'redis-pubsub',
    redisOptions = {}
  }: RedisPubSubConsumerOptions) {
    if (channels.length === 0 && patterns.length === 0) {
      throw new Error('RedisPubSubConsumer requires at least one channel or pattern');
    }
    this.driver = driver;
    this.channels = channels;
    this.patterns = patterns;
    this.reconnectInterval = reconnectInterval;
    this.onMessage = onMessage;
    this.onError = onError;
    this._host = host;
    this._port = port;
    this._password = password;
    this._db = db;
    this._redisOptions = redisOptions;
  }

  async start(): Promise<void> {
    await requirePluginDependency('redis-pubsub-consumer');

    const [ok, err, mod] = await tryFn(() => import('ioredis'));
    if (!ok) {
      throw new Error(`RedisPubSubConsumer requires ioredis: ${(err as Error).message}`);
    }

    const Redis = (mod as unknown as { default: RedisConstructor }).default;
    this.client = new Redis({
      host: this._host,
      port: this._port,
      password: this._password,
      db: this._db,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        if (this._stopped) return null;
        return Math.min(times * this.reconnectInterval, 30000);
      },
      ...this._redisOptions
    });

    this.client.on('error', (error: unknown) => {
      if (this.onError && !this._stopped) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    });

    this.client.on('message', (channel: unknown, message: unknown) => {
      this._handleIncoming(channel as string, message as string);
    });

    this.client.on('pmessage', (pattern: unknown, channel: unknown, message: unknown) => {
      this._handleIncoming(channel as string, message as string, pattern as string);
    });

    this._stopped = false;

    if (this.channels.length > 0) {
      await this.client.subscribe(...this.channels);
    }
    if (this.patterns.length > 0) {
      await this.client.psubscribe(...this.patterns);
    }
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this.client) {
      const [ok] = await tryFn(async () => {
        if (this.channels.length > 0) await this.client!.unsubscribe(...this.channels);
        if (this.patterns.length > 0) await this.client!.punsubscribe(...this.patterns);
        await this.client!.quit();
      });
      if (!ok) { /* client already closed */ }
      this.client = null;
    }
  }

  private _handleIncoming(channel: string, message: string, pattern?: string): void {
    let body: unknown;
    try {
      body = JSON.parse(message);
    } catch {
      body = message;
    }

    const raw: ParsedMessage['$raw'] = { channel, message };
    if (pattern !== undefined) raw.pattern = pattern;

    const [okMsg, errMsg] = tryFn(() => {
      this.onMessage({ $body: body, $raw: raw });
    });

    if (!okMsg && this.onError) {
      this.onError(errMsg as Error, { channel, message, pattern });
    }
  }
}
