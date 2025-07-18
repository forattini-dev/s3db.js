import amqp from 'amqplib';
import tryFn from "../../concerns/try-fn.js";

export class RabbitMqConsumer {
  constructor({ amqpUrl, queue, prefetch = 10, reconnectInterval = 2000, onMessage, onError, driver = 'rabbitmq' }) {
    this.amqpUrl = amqpUrl;
    this.queue = queue;
    this.prefetch = prefetch;
    this.reconnectInterval = reconnectInterval;
    this.onMessage = onMessage;
    this.onError = onError;
    this.driver = driver;
    this.connection = null;
    this.channel = null;
    this._stopped = false;
  }

  async start() {
    this._stopped = false;
    await this._connect();
  }

  async stop() {
    this._stopped = true;https://github.com/browserbase/stagehand
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }

  async _connect() {
    const [ok, err] = await tryFn(async () => {
      this.connection = await amqp.connect(this.amqpUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(this.queue, { durable: true });
      this.channel.prefetch(this.prefetch);
      this.channel.consume(this.queue, async (msg) => {
        if (msg !== null) {
          const [okMsg, errMsg] = await tryFn(async () => {
            const content = JSON.parse(msg.content.toString());
            await this.onMessage({ $body: content, $raw: msg });
            this.channel.ack(msg);
          });
          if (!okMsg) {
            if (this.onError) this.onError(errMsg, msg);
            this.channel.nack(msg, false, false);
          }
        }
      });
    });
    if (!ok) {
      if (this.onError) this.onError(err);
      if (!this._stopped) {
        setTimeout(() => this._connect(), this.reconnectInterval);
      }
    }
  }
} 