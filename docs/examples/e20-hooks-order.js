import dotenv from 'dotenv';
import { join } from 'path';
import S3db from '../src/index.js';

dotenv.config({ debug: false, silent: true });

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'hooks-debug-' + Date.now());

async function testHooks() {
  console.log('🔍 Testing hooks functionality with pre-existing s3db.json...');

  // 1. Cria banco e resource SEM hooks customizados, mas com hooks "antigos"
  const db1 = new S3db({
    verbose: true,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9100',
    forcePathStyle: true,
    prefix: testPrefix
  });
  await db1.connect();
  console.log('\n1. Criando resource com hooks antigos...');
  const oldOrder = [];
  const resource1 = await db1.createResource({
    name: 'views',
    behavior: 'body-overflow',
    timestamps: true,
    attributes: {
      sessionId: 'string',
      urlId: 'string',
      clickId: 'string|optional',
      requestId: 'string',
      fingerprintId: 'string',
      ip: 'string',
      address: {
        $$type: 'object|optional',
        continent: 'string|optional',
        country: 'string|optional',
        city: 'string|optional',
        postalCode: 'string|optional',
        latitude: 'number|optional',
        longitude: 'number|optional',
        accuracyRadius: 'number|optional',
      },
    },
    partitions: {
      byUrlId: {
        fields: { urlId: 'string' }
      },
      bySessionId: {
        fields: { sessionId: 'string' }
      },
      byFingerprintId: {
        fields: { fingerprintId: 'string' }
      }
    }
  });
  // Adiciona hooks antigos manualmente
  resource1.addHook('beforeInsert', (view) => {
    oldOrder.push('old-beforeInsert-1');
    console.log('🟦 old-beforeInsert-1');
    return view;
  });
  resource1.addHook('beforeInsert', (view) => {
    oldOrder.push('old-beforeInsert-2');
    console.log('🟦 old-beforeInsert-2');
    return view;
  });
  await db1.disconnect?.();

  // 2. Reabre banco e tenta criar resource COM hooks novos
  const db2 = new S3db({
    verbose: true,
    bucket: 's3db',
    accessKeyId: process.env.MINIO_USER,
    secretAccessKey: process.env.MINIO_PASSWORD,
    endpoint: 'http://localhost:9100',
    forcePathStyle: true,
    prefix: testPrefix
  });
  await db2.connect();
  console.log('\n2. Tentando criar resource COM hooks novos...');
  const executionOrder = [];
  const resource = await db2.createResource({
    name: 'views',
    behavior: 'body-overflow',
    timestamps: true,
    attributes: {
      sessionId: 'string',
      urlId: 'string',
      clickId: 'string|optional',
      requestId: 'string',
      fingerprintId: 'string',
      ip: 'string',
      address: {
        $$type: 'object|optional',
        continent: 'string|optional',
        country: 'string|optional',
        city: 'string|optional',
        postalCode: 'string|optional',
        latitude: 'number|optional',
        longitude: 'number|optional',
        accuracyRadius: 'number|optional',
      },
    },
    partitions: {
      byUrlId: {
        fields: { urlId: 'string' }
      },
      bySessionId: {
        fields: { sessionId: 'string' }
      },
      byFingerprintId: {
        fields: { fingerprintId: 'string' }
      }
    },
    hooks: {
      beforeInsert: [
        (view) => {
          executionOrder.push('new-beforeInsert-1');
          console.log('🟩 new-beforeInsert-1');
          return view;
        },
        (view) => {
          executionOrder.push('new-beforeInsert-2');
          console.log('🟩 new-beforeInsert-2');
          return view;
        }
      ]
    }
  });

  console.log('\n3. Testando insert (esperado: hooks antigos e novos, na ordem)...');
  const testData = {
    sessionId: 'session-123',
    urlId: 'url-456',
    requestId: 'req-789',
    fingerprintId: 'fp-abc',
    ip: '127.0.0.1'
  };
  console.log('Inserting data:', testData);
  executionOrder.length = 0;
  oldOrder.length = 0;
  await resource.insert(testData);
      console.log('\nbeforeInsert hooks execution order:', [...oldOrder, ...executionOrder]);

  await db2.disconnect?.();
  console.log('\n🧹 Cleanup completed');
}

testHooks().catch(console.error); 