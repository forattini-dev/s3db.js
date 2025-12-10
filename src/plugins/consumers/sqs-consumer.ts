import tryFn from "../../concerns/try-fn.js";
import requirePluginDependency from "../concerns/plugin-dependencies.js";
import { PluginError } from '../../errors.js';

interface SQSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

interface SQSMessageAttribute {
  StringValue?: string;
  DataType?: string;
}

interface SQSMessage {
  MessageId?: string;
  ReceiptHandle?: string;
  Body?: string;
  MessageAttributes?: Record<string, SQSMessageAttribute>;
}

interface ParsedMessage {
  $body: unknown;
  $attributes: Record<string, string | undefined>;
  $raw: SQSMessage;
}

type MessageHandler = (parsed: ParsedMessage, raw: SQSMessage) => Promise<void>;
type ErrorHandler = (error: Error, message?: SQSMessage) => void;

interface SqsConsumerOptions {
  queueUrl: string;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  poolingInterval?: number;
  maxMessages?: number;
  region?: string;
  credentials?: SQSCredentials;
  endpoint?: string;
  driver?: string;
}

interface SQSClientInstance {
  send(command: unknown): Promise<{ Messages?: SQSMessage[] }>;
}

type SQSClientConstructor = new (config: {
  region: string;
  credentials?: SQSCredentials;
  endpoint?: string;
}) => SQSClientInstance;

type CommandConstructor = new (params: Record<string, unknown>) => unknown;

export class SqsConsumer {
  driver: string;
  queueUrl: string;
  onMessage: MessageHandler;
  onError?: ErrorHandler;
  poolingInterval: number;
  maxMessages: number;
  region: string;
  credentials?: SQSCredentials;
  endpoint?: string;
  sqs: SQSClientInstance | null = null;
  private _stopped: boolean = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _pollPromise: Promise<void> | null = null;
  private _pollResolve: (() => void) | null = null;
  private _SQSClient: SQSClientConstructor | null = null;
  private _ReceiveMessageCommand: CommandConstructor | null = null;
  private _DeleteMessageCommand: CommandConstructor | null = null;

  constructor({
    queueUrl,
    onMessage,
    onError,
    poolingInterval = 5000,
    maxMessages = 10,
    region = 'us-east-1',
    credentials,
    endpoint,
    driver = 'sqs'
  }: SqsConsumerOptions) {
    this.driver = driver;
    this.queueUrl = queueUrl;
    this.onMessage = onMessage;
    this.onError = onError;
    this.poolingInterval = poolingInterval;
    this.maxMessages = maxMessages;
    this.region = region;
    this.credentials = credentials;
    this.endpoint = endpoint;
  }

  async start(): Promise<void> {
    await requirePluginDependency('sqs-consumer');

    const [ok, err, sdk] = await tryFn(() => import('@aws-sdk/client-sqs'));
    if (!ok) {
      throw new PluginError('SqsConsumer requires @aws-sdk/client-sqs', {
        pluginName: 'ConsumersPlugin',
        operation: 'SqsConsumer.start',
        statusCode: 500,
        retriable: false,
        suggestion: 'Install @aws-sdk/client-sqs as a dependency to enable SQS consumption.',
        original: err
      });
    }

    const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = sdk as unknown as {
      SQSClient: SQSClientConstructor;
      ReceiveMessageCommand: CommandConstructor;
      DeleteMessageCommand: CommandConstructor;
    };

    this._SQSClient = SQSClient;
    this._ReceiveMessageCommand = ReceiveMessageCommand;
    this._DeleteMessageCommand = DeleteMessageCommand;
    this.sqs = new SQSClient({
      region: this.region,
      credentials: this.credentials,
      endpoint: this.endpoint
    });
    this._stopped = false;
    this._pollPromise = new Promise((resolve) => {
      this._pollResolve = resolve;
    });
    this._poll();
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._pollResolve) {
      this._pollResolve();
    }
  }

  private async _poll(): Promise<void> {
    if (this._stopped) {
      if (this._pollResolve) this._pollResolve();
      return;
    }

    const [ok, err] = await tryFn(async () => {
      const cmd = new this._ReceiveMessageCommand!({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.maxMessages,
        WaitTimeSeconds: 10,
        MessageAttributeNames: ['All'],
      });
      const { Messages } = await this.sqs!.send(cmd);
      if (Messages && Messages.length > 0) {
        for (const msg of Messages) {
          const [okMsg, errMsg] = await tryFn(async () => {
            const parsedMsg = this._parseMessage(msg);
            await this.onMessage(parsedMsg, msg);
            await this.sqs!.send(new this._DeleteMessageCommand!({
              QueueUrl: this.queueUrl,
              ReceiptHandle: msg.ReceiptHandle
            }));
          });
          if (!okMsg && this.onError) {
            this.onError(errMsg as Error, msg);
          }
        }
      }
    });

    if (!ok && this.onError) {
      this.onError(err as Error);
    }

    this._timer = setTimeout(() => this._poll(), this.poolingInterval);
  }

  private _parseMessage(msg: SQSMessage): ParsedMessage {
    let body: unknown;
    const [ok, , parsed] = tryFn(() => JSON.parse(msg.Body || ''));
    body = ok ? parsed : msg.Body;

    const attributes: Record<string, string | undefined> = {};
    if (msg.MessageAttributes) {
      for (const [k, v] of Object.entries(msg.MessageAttributes)) {
        attributes[k] = v.StringValue;
      }
    }

    return { $body: body, $attributes: attributes, $raw: msg };
  }
}
