import Database from '../src/database.class.js';
import Client from '../src/client.class.js';
import QueueConsumerPlugin from '../src/plugins/queue-consumer.plugin.js';

// Exemplo didático: simula consumo de fila SQS
async function main() {
  // Inicializa database
  const client = new Client({
    connectionString: 's3db://minio:password@localhost:9000/s3db-test-queue-consumer'
  });
  const database = new Database({ client });
  await database.connect();

  // Cria resource
  const users = await database.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required'
    }
  });

  const plugin = new QueueConsumerPlugin({
    enabled: true,
    consumers: [
      {
        driver: 'sqs',
        resources: ['users', 'admins'],
        config: {
          queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    region: 'us-east-1',
          credentials: { accessKeyId: '...', secretAccessKey: '...' },
          poolingInterval: 1000,
          maxMessages: 10,
        }
      },
      {
        driver: 'rabbitmq',
        resources: 'orders',
        config: {
          amqpUrl: 'amqp://user:pass@localhost:5672',
          queue: 'orders-queue',
          prefetch: 10,
          reconnectInterval: 2000,
        }
      }
    ]
  });
  // await plugin.setup(database);
  // await plugin.start();

  // Simula recebimento de mensagem (em produção, viria do SQS)
  // Aqui chamamos o handler diretamente para demonstrar
  await plugin._handleMessage({
    $body: { resource: 'users', action: 'insert', data: { id: 'u1', name: 'Alice', email: 'alice@example.com' } },
    $attributes: {},
    $raw: {}
  }, 'users');

  const user = await users.get('u1');
  console.log('User inserted via SQS consumer:', user);

  await plugin.stop();
  await database.disconnect();
}

// --- Example: SQS Consumer ---
import QueueConsumerPlugin from '../src/plugins/queue-consumer.plugin.js';

const sqsPlugin = new QueueConsumerPlugin({
  driver: 'sqs',
  queues: { users: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue' },
  driverOptions: {
    region: 'us-east-1',
    credentials: { accessKeyId: '...', secretAccessKey: '...' },
    poolingInterval: 1000,
    maxMessages: 10,
  }
});
// await sqsPlugin.setup(database);
// await sqsPlugin.start();

// --- Example: RabbitMQ Consumer ---
const rabbitPlugin = new QueueConsumerPlugin({
  driver: 'rabbitmq',
  queues: { users: 'users-queue' },
  driverOptions: {
    amqpUrl: 'amqp://user:pass@localhost:5672',
    prefetch: 10,
    reconnectInterval: 2000,
  }
});
// await rabbitPlugin.setup(database);
// await rabbitPlugin.start();

main().catch(console.error); 