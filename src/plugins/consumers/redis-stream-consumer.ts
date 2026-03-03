import tryFn from "../../concerns/try-fn.js";
import requirePluginDependency from "../concerns/plugin-dependencies.js";

interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

interface ParsedMessage {
  $body: unknown;
  $raw: { stream: string; id: string; fields: Record<string, string> };
}

type MessageHandler = (parsed: ParsedMessage) => Promise<void>;
type ErrorHandler = (error: Error, message?: unknown) => void;

interface RedisStreamConsumerOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  stream: string;
  group: string;
  consumer: string;
  blockTimeout?: number;
  count?: number;
  startId?: string;
  claimInterval?: number;
  claimMinIdleTime?: number;
  reconnectInterval?: number;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  driver?: string;
  redisOptions?: Record<string, unknown>;
}

interface RedisClient {
  xgroup(command: string, ...args: (string | number)[]): Promise<unknown>;
  xreadgroup(
    groupCmd: string, group: string,
    consumerArg: string, consumer: string,
    countCmd: string, count: number,
    blockCmd: string, block: number,
    streamsCmd: string, stream: string,
    id: string
  ): Promise<[string, [string, string[]][]][] | null>;
  xack(stream: string, group: string, ...ids: string[]): Promise<number>;
  xautoclaim(
    stream: string, group: string, consumer: string,
    minIdleTime: number, startId: string,
    countCmd: string, count: number
  ): Promise<[string, [string, string[]][], string[]]>;
  quit(): Promise<string>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  status: string;
}

type RedisConstructor = new (options: Record<string, unknown>) => RedisClient;

export class RedisStreamConsumer {
  driver: string;
  stream: string;
  group: string;
  consumer: string;
  blockTimeout: number;
  count: number;
  startId: string;
  claimInterval: number;
  claimMinIdleTime: number;
  reconnectInterval: number;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  client: RedisClient | null = null;
  private _stopped: boolean = false;
  private _claimTimer: ReturnType<typeof setInterval> | null = null;
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
    stream,
    group,
    consumer,
    blockTimeout = 5000,
    count = 10,
    startId = '0',
    claimInterval = 30000,
    claimMinIdleTime = 60000,
    reconnectInterval = 2000,
    onMessage,
    onError,
    driver = 'redis-stream',
    redisOptions = {}
  }: RedisStreamConsumerOptions) {
    this.driver = driver;
    this.stream = stream;
    this.group = group;
    this.consumer = consumer;
    this.blockTimeout = blockTimeout;
    this.count = count;
    this.startId = startId;
    this.claimInterval = claimInterval;
    this.claimMinIdleTime = claimMinIdleTime;
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
    await requirePluginDependency('redis-stream-consumer');

    const [ok, err, mod] = await tryFn(() => import('ioredis'));
    if (!ok) {
      throw new Error(`RedisStreamConsumer requires ioredis: ${(err as Error).message}`);
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

    const [okGroup, errGroup] = await tryFn(() =>
      this.client!.xgroup('CREATE', this.stream, this.group, this.startId, 'MKSTREAM')
    );
    if (!okGroup) {
      const msg = (errGroup as Error).message || '';
      if (!msg.includes('BUSYGROUP')) throw errGroup;
    }

    this._stopped = false;
    this._poll();
    this._claimTimer = setInterval(() => this._claimLoop(), this.claimInterval);
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._claimTimer) {
      clearInterval(this._claimTimer);
      this._claimTimer = null;
    }
    if (this.client) {
      const [ok] = await tryFn(() => this.client!.quit());
      if (!ok) { /* client already closed */ }
      this.client = null;
    }
  }

  private async _poll(): Promise<void> {
    while (!this._stopped && this.client) {
      const [ok, err, result] = await tryFn(() =>
        this.client!.xreadgroup(
          'GROUP', this.group,
          this.consumer, this.consumer,
          'COUNT', this.count,
          'BLOCK', this.blockTimeout,
          'STREAMS', this.stream,
          '>'
        )
      );

      if (this._stopped) return;

      if (!ok) {
        if (this.onError) this.onError(err as Error);
        await new Promise(r => setTimeout(r, this.reconnectInterval));
        continue;
      }

      if (!result) continue;

      const streams = result as [string, [string, string[]][]][];
      for (const [, entries] of streams) {
        for (const [id, fieldArray] of entries) {
          await this._processEntry(id, fieldArray);
        }
      }
    }
  }

  private async _claimLoop(): Promise<void> {
    if (this._stopped || !this.client) return;

    const [ok, err, result] = await tryFn(() =>
      this.client!.xautoclaim(
        this.stream, this.group, this.consumer,
        this.claimMinIdleTime, '0-0',
        'COUNT', this.count
      )
    );

    if (!ok) {
      if (this.onError) this.onError(err as Error);
      return;
    }

    if (!result) return;
    const [, entries] = result as [string, [string, string[]][], string[]];
    if (!entries || entries.length === 0) return;

    for (const [id, fieldArray] of entries) {
      await this._processEntry(id, fieldArray);
    }
  }

  private async _processEntry(id: string, fieldArray: string[]): Promise<void> {
    const fields = this._parseFields(fieldArray);
    const body = this._extractBody(fields);

    const [okMsg, errMsg] = await tryFn(async () => {
      await this.onMessage({
        $body: body,
        $raw: { stream: this.stream, id, fields }
      });
      await this.client!.xack(this.stream, this.group, id);
    });

    if (!okMsg && this.onError) {
      this.onError(errMsg as Error, { stream: this.stream, id, fields });
    }
  }

  private _parseFields(fieldArray: string[]): Record<string, string> {
    const fields: Record<string, string> = {};
    for (let i = 0; i < fieldArray.length; i += 2) {
      fields[fieldArray[i]!] = fieldArray[i + 1]!;
    }
    return fields;
  }

  private _extractBody(fields: Record<string, string>): unknown {
    const raw = fields['data'] || fields['payload'] || fields['message'] || fields['body'];
    if (raw) {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    const singleValues = Object.values(fields);
    if (singleValues.length === 1) {
      try { return JSON.parse(singleValues[0]!); } catch { return singleValues[0]; }
    }
    return fields;
  }
}
