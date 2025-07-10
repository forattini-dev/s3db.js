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

  // Configura plugin para consumir de uma fila (mock url)
  const plugin = new QueueConsumerPlugin({
    queues: { users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-test' },
    region: 'us-east-1',
    poolingInterval: 2000,
    maxMessages: 5
  });
  await plugin.setup(database);

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

main().catch(console.error); 