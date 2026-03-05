import tryFn from "../../concerns/try-fn.js";
import requirePluginDependency from "../concerns/plugin-dependencies.js";

interface ParsedMessage {
  $body: unknown;
  $raw: { key: string; value: string };
}

type MessageHandler = (parsed: ParsedMessage) => Promise<void>;
type ErrorHandler = (error: Error, message?: unknown) => void;

interface RedisListConsumerOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  key: string;
  direction?: 'fifo' | 'lifo';
  blockTimeout?: number;
  reconnectInterval?: number;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  driver?: string;
  redisOptions?: Record<string, unknown>;
}

interface RedisClient {
  brpop(key: string, timeout: number): Promise<[string, string] | null>;
  blpop(key: string, timeout: number): Promise<[string, string] | null>;
  lpush(key: string, ...values: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  quit(): Promise<string>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  status: string;
}

type RedisConstructor = new (options: Record<string, unknown>) => RedisClient;

export class RedisListConsumer {
  driver: string;
  key: string;
  direction: 'fifo' | 'lifo';
  blockTimeout: number;
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
    key,
    direction = 'fifo',
    blockTimeout = 5,
    reconnectInterval = 2000,
    onMessage,
    onError,
    driver = 'redis-list',
    redisOptions = {}
  }: RedisListConsumerOptions) {
    this.driver = driver;
    this.key = key;
    this.direction = direction;
    this.blockTimeout = blockTimeout;
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
    await requirePluginDependency('redis-list-consumer');

    const [ok, err, mod] = await tryFn(() => import('ioredis'));
    if (!ok) {
      throw new Error(`RedisListConsumer requires ioredis: ${(err as Error).message}`);
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

    this._stopped = false;
    this._poll();
  }

  async publish(data: unknown): Promise<void> {
    if (!this.client) {
      throw new Error('RedisListConsumer not started. Call start() before publishing.');
    }

    const value = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.direction === 'fifo') {
      await this.client.lpush(this.key, value);
    } else {
      await this.client.rpush(this.key, value);
    }
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this.client) {
      const [ok] = await tryFn(() => this.client!.quit());
      if (!ok) {
        /* client already closed */
      }
      this.client = null;
    }
  }

  private async _poll(): Promise<void> {
    while (!this._stopped && this.client) {
      const popFn = this.direction === 'fifo'
        ? this.client.brpop.bind(this.client)
        : this.client.blpop.bind(this.client);

      const [ok, err, result] = await tryFn(() => popFn(this.key, this.blockTimeout));

      if (this._stopped) return;

      if (!ok) {
        if (this.onError) this.onError(err as Error);
        await new Promise(r => setTimeout(r, this.reconnectInterval));
        continue;
      }

      if (!result) continue;

      const [key, value] = result as [string, string];
      const [okParse, errParse] = await tryFn(async () => {
        let body: unknown;
        try {
          body = JSON.parse(value);
        } catch {
          body = value;
        }
        await this.onMessage({ $body: body, $raw: { key, value } });
      });

      if (!okParse && this.onError) {
        this.onError(errParse as Error, { key, value });
      }
    }
  }
}
