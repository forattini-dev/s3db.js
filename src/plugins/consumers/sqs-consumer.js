import tryFn from "../../concerns/try-fn.js";
// Remove static SDK import
// import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

export class SqsConsumer {
  constructor({ queueUrl, onMessage, onError, poolingInterval = 5000, maxMessages = 10, region = 'us-east-1', credentials, endpoint, driver = 'sqs' }) {
    this.driver = driver;
    this.queueUrl = queueUrl;
    this.onMessage = onMessage;
    this.onError = onError;
    this.poolingInterval = poolingInterval;
    this.maxMessages = maxMessages;
    this.region = region;
    this.credentials = credentials;
    this.endpoint = endpoint;
    this.sqs = null; // will be initialized dynamically
    this._stopped = false;
    this._timer = null;
    this._pollPromise = null;
    this._pollResolve = null;
    // SDK classes
    this._SQSClient = null;
    this._ReceiveMessageCommand = null;
    this._DeleteMessageCommand = null;
  }

  async start() {
    // Carregar SDK dinamicamente
    const [ok, err, sdk] = await tryFn(() => import('@aws-sdk/client-sqs'));
    if (!ok) throw new Error('SqsConsumer: @aws-sdk/client-sqs is not installed. Please install it to use the SQS consumer.');
    const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = sdk;
    this._SQSClient = SQSClient;
    this._ReceiveMessageCommand = ReceiveMessageCommand;
    this._DeleteMessageCommand = DeleteMessageCommand;
    this.sqs = new SQSClient({ region: this.region, credentials: this.credentials, endpoint: this.endpoint });
    this._stopped = false;
    this._pollPromise = new Promise((resolve) => { this._pollResolve = resolve; });
    this._poll();
  }

  async stop() {
    this._stopped = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    // Don't wait for poll promise as it might hang for up to 10 seconds
    // The _poll method checks _stopped and will resolve the promise
    if (this._pollResolve) {
      this._pollResolve();
    }
  }

  async _poll() {
    if (this._stopped) {
      if (this._pollResolve) this._pollResolve();
      return;
    }
    const [ok, err, result] = await tryFn(async () => {
      const cmd = new this._ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.maxMessages,
        WaitTimeSeconds: 10,
        MessageAttributeNames: ['All'],
      });
      const { Messages } = await this.sqs.send(cmd);
      if (Messages && Messages.length > 0) {
        for (const msg of Messages) {
          const [okMsg, errMsg] = await tryFn(async () => {
            const parsedMsg = this._parseMessage(msg);
            await this.onMessage(parsedMsg, msg);
            // Delete after successful processing
            await this.sqs.send(new this._DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: msg.ReceiptHandle
            }));
          });
          if (!okMsg && this.onError) {
            this.onError(errMsg, msg);
          }
        }
      }
    });
    if (!ok && this.onError) {
      this.onError(err);
    }
    this._timer = setTimeout(() => this._poll(), this.poolingInterval);
  }

  _parseMessage(msg) {
    let body;
    const [ok, err, parsed] = tryFn(() => JSON.parse(msg.Body));
    body = ok ? parsed : msg.Body;
    const attributes = {};
    if (msg.MessageAttributes) {
      for (const [k, v] of Object.entries(msg.MessageAttributes)) {
        attributes[k] = v.StringValue;
      }
    }
    return { $body: body, $attributes: attributes, $raw: msg };
  }
} 