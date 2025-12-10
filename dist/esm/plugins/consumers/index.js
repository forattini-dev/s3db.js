import { PluginError } from '../../errors.js';
export { SqsConsumer } from './sqs-consumer.js';
export { RabbitMqConsumer } from './rabbitmq-consumer.js';
const CONSUMER_DRIVER_LOADERS = {
    sqs: () => import('./sqs-consumer.js').then(m => m.SqsConsumer),
    rabbitmq: () => import('./rabbitmq-consumer.js').then(m => m.RabbitMqConsumer),
};
export async function createConsumer(driver, config) {
    const loader = CONSUMER_DRIVER_LOADERS[driver];
    if (!loader) {
        throw new PluginError(`Unknown consumer driver: ${driver}`, {
            pluginName: 'ConsumersPlugin',
            operation: 'createConsumer',
            statusCode: 400,
            retriable: false,
            suggestion: `Use one of the available drivers: ${Object.keys(CONSUMER_DRIVER_LOADERS).join(', ')}`,
            driver
        });
    }
    const ConsumerClass = await loader();
    return new ConsumerClass(config);
}
export const loadSqsConsumer = () => CONSUMER_DRIVER_LOADERS.sqs();
export const loadRabbitMqConsumer = () => CONSUMER_DRIVER_LOADERS.rabbitmq();
//# sourceMappingURL=index.js.map