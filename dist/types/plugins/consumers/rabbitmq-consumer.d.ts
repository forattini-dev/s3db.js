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
    assertQueue(queue: string, options: {
        durable: boolean;
    }): Promise<void>;
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
export declare class RabbitMqConsumer {
    amqpUrl: string;
    queue: string;
    prefetch: number;
    reconnectInterval: number;
    onMessage: MessageHandler;
    onError?: ErrorHandler;
    driver: string;
    connection: Connection | null;
    channel: Channel | null;
    private _stopped;
    constructor({ amqpUrl, queue, prefetch, reconnectInterval, onMessage, onError, driver }: RabbitMqConsumerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private _connect;
}
export {};
//# sourceMappingURL=rabbitmq-consumer.d.ts.map