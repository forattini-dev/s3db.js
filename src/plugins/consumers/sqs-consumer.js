import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

export class SqsConsumer {
  constructor({ queueUrl, onMessage, onError, poolingInterval = 5000, maxMessages = 10, region = 'us-east-1', credentials, endpoint }) {
    this.queueUrl = queueUrl;
    this.onMessage = onMessage;
    this.onError = onError;
    this.poolingInterval = poolingInterval;
    this.maxMessages = maxMessages;
    this.region = region;
    this.credentials = credentials;
    this.endpoint = endpoint;
    this.sqs = new SQSClient({ region, credentials, endpoint });
    this._stopped = false;
    this._timer = null;
  }

  async start() {
    this._stopped = false;
    this._poll();
  }

  async stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
  }

  async _poll() {
    if (this._stopped) return;
    try {
      const cmd = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.maxMessages,
        WaitTimeSeconds: 10,
        MessageAttributeNames: ['All'],
      });
      const { Messages } = await this.sqs.send(cmd);
      if (Messages && Messages.length > 0) {
        for (const msg of Messages) {
          try {
            await this.onMessage(this._parseMessage(msg), msg);
            // Delete after successful processing
            await this.sqs.send(new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: msg.ReceiptHandle
            }));
          } catch (err) {
            if (this.onError) this.onError(err, msg);
          }
        }
      }
    } catch (err) {
      if (this.onError) this.onError(err);
    }
    this._timer = setTimeout(() => this._poll(), this.poolingInterval);
  }

  _parseMessage(msg) {
    let body;
    try {
      body = JSON.parse(msg.Body);
    } catch {
      body = msg.Body;
    }
    const attributes = {};
    if (msg.MessageAttributes) {
      for (const [k, v] of Object.entries(msg.MessageAttributes)) {
        attributes[k] = v.StringValue;
      }
    }
    return { $body: body, $attributes: attributes, $raw: msg };
  }
} 