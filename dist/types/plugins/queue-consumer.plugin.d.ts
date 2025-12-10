import { Plugin } from './plugin.class.js';
interface Logger {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
}
interface Consumer {
    start(): Promise<void>;
    stop(): Promise<void>;
}
interface ConsumerDefinition {
    resources: string | string[];
    queueUrl?: string;
    queueName?: string;
    [key: string]: unknown;
}
interface DriverDefinition {
    driver: string;
    config?: Record<string, unknown>;
    consumers?: ConsumerDefinition[];
}
interface QueueMessage {
    resource?: string;
    action?: string;
    data?: Record<string, unknown>;
    $body?: QueueMessage;
}
export interface QueueConsumerPluginOptions {
    consumers?: DriverDefinition[];
    startConcurrency?: number;
    stopConcurrency?: number;
    logger?: Logger;
    logLevel?: string;
}
export declare class QueueConsumerPlugin extends Plugin {
    namespace: string;
    logLevel: string;
    driversConfig: DriverDefinition[];
    consumers: Consumer[];
    startConcurrency: number;
    stopConcurrency: number;
    constructor(options?: QueueConsumerPluginOptions);
    onInstall(): Promise<void>;
    stop(): Promise<void>;
    _handleMessage(msg: QueueMessage, configuredResource: string): Promise<unknown>;
    _handleError(_err: Error, _raw: unknown, _resourceName: string): void;
}
export {};
//# sourceMappingURL=queue-consumer.plugin.d.ts.map