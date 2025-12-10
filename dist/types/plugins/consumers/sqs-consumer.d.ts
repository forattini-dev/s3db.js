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
    send(command: unknown): Promise<{
        Messages?: SQSMessage[];
    }>;
}
export declare class SqsConsumer {
    driver: string;
    queueUrl: string;
    onMessage: MessageHandler;
    onError?: ErrorHandler;
    poolingInterval: number;
    maxMessages: number;
    region: string;
    credentials?: SQSCredentials;
    endpoint?: string;
    sqs: SQSClientInstance | null;
    private _stopped;
    private _timer;
    private _pollPromise;
    private _pollResolve;
    private _SQSClient;
    private _ReceiveMessageCommand;
    private _DeleteMessageCommand;
    constructor({ queueUrl, onMessage, onError, poolingInterval, maxMessages, region, credentials, endpoint, driver }: SqsConsumerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private _poll;
    private _parseMessage;
}
export {};
//# sourceMappingURL=sqs-consumer.d.ts.map