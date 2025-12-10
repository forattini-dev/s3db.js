import { SqsConsumer } from './sqs-consumer.js';
import { RabbitMqConsumer } from './rabbitmq-consumer.js';
export { SqsConsumer } from './sqs-consumer.js';
export { RabbitMqConsumer } from './rabbitmq-consumer.js';
export declare function createConsumer<T extends Record<string, unknown>>(driver: string, config: T): Promise<SqsConsumer | RabbitMqConsumer>;
export declare const loadSqsConsumer: () => Promise<typeof SqsConsumer>;
export declare const loadRabbitMqConsumer: () => Promise<typeof RabbitMqConsumer>;
//# sourceMappingURL=index.d.ts.map