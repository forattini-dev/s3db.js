import tryFn from "../../concerns/try-fn.js";
import requirePluginDependency from "../concerns/plugin-dependencies.js";

interface RabbitMQMessage {
  content: Buffer;
  fields: Record<string, unknown>;
  properties: Record<string, unknown>;
}

interface ParsedMessage {
  $body: unknown;
  $raw: RabbitMQMessage;
}

type MessageHandler = (parsed: ParsedMessage) => Promise<void>;
type ErrorHandler = (error: Error, message?: RabbitMQMessage | null) => void;

interface Channel {
  assertQueue(queue: string, options: { durable: boolean }): Promise<void>;
  prefetch(count: number): void;
  consume(queue: string, callback: (msg: RabbitMQMessage | null) => void): Promise<void>;
  ack(message: RabbitMQMessage): void;
  nack(message: RabbitMQMessage, allUpTo?: boolean, requeue?: boolean): void;
  close(): Promise<void>;
}

interface Connection {
  createChannel(): Promise<Channel>;
  close(): Promise<void>;
}

interface RabbitMqConsumerOptions {
  amqpUrl: string;
  queue: string;
  prefetch?: number;
  reconnectInterval?: number;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  driver?: string;
}

export class RabbitMqConsumer {
  amqpUrl: string;
  queue: string;
  prefetch: number;
  reconnectInterval: number;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  driver: string;
  connection: Connection | null = null;
  channel: Channel | null = null;
  private _stopped: boolean = false;

  constructor({
    amqpUrl,
    queue,
    prefetch = 10,
    reconnectInterval = 2000,
    onMessage,
    onError,
    driver = 'rabbitmq'
  }: RabbitMqConsumerOptions) {
    this.amqpUrl = amqpUrl;
    this.queue = queue;
    this.prefetch = prefetch;
    this.reconnectInterval = reconnectInterval;
    this.onMessage = onMessage;
    this.onError = onError;
    this.driver = driver;
  }

  async start(): Promise<void> {
    await requirePluginDependency('rabbitmq-consumer');

    this._stopped = false;
    await this._connect();
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }

  private async _connect(): Promise<void> {
    const [ok, err] = await tryFn(async () => {
      // @ts-ignore - amqplib does not have type definitions
      const amqp = (await import('amqplib')).default as {
        connect(url: string): Promise<Connection>;
      };
      this.connection = await amqp.connect(this.amqpUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(this.queue, { durable: true });
      this.channel.prefetch(this.prefetch);
      this.channel.consume(this.queue, async (msg) => {
        if (msg !== null) {
          const [okMsg, errMsg] = await tryFn(async () => {
            const content = JSON.parse(msg.content.toString());
            await this.onMessage({ $body: content, $raw: msg });
            this.channel!.ack(msg);
          });
          if (!okMsg) {
            if (this.onError) this.onError(errMsg as Error, msg);
            this.channel!.nack(msg, false, false);
          }
        }
      });
    });

    if (!ok) {
      if (this.onError) this.onError(err as Error);
      if (!this._stopped) {
        setTimeout(() => this._connect(), this.reconnectInterval);
      }
    }
  }
}
