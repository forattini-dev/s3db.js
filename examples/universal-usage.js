/**
 * Exemplo de uso universal do s3db.js
 * 
 * Este arquivo demonstra como usar o s3db.js em diferentes ambientes:
 * - Node.js (ES Modules)
 * - Node.js (CommonJS)
 * - Browser (IIFE)
 */

// ============================================================================
// NODE.JS - ES MODULES (import/export)
// ============================================================================

// Importação padrão
import S3db from 's3db.js';

// Importação nomeada
import { S3db as S3dbNamed, Resource, ConnectionString } from 's3db.js';

async function nodejsESModulesExample() {
  console.log('=== Node.js ES Modules Example ===');
  
  const db = new S3db({
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: 'my-s3db-bucket'
  });

  await db.connect();
  
  const users = db.resource('users', {
    schema: {
      name: { type: 'string', required: true },
      email: { type: 'string', required: true },
      age: { type: 'number' }
    }
  });

  const user = await users.insert({
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  });

  console.log('User created:', user);
  await db.disconnect();
}

// ============================================================================
// NODE.JS - COMMONJS (require)
// ============================================================================

// Descomente para usar CommonJS
/*
const S3db = require('s3db.js');

async function nodejsCommonJSExample() {
  console.log('=== Node.js CommonJS Example ===');
  
  const db = new S3db({
    connectionString: 's3://access-key:secret-key@bucket-name/prefix?region=us-east-1'
  });

  await db.connect();
  
  const users = db.resource('users');
  
  const user = await users.insert({
    name: 'Jane Doe',
    email: 'jane@example.com',
    age: 25
  });

  console.log('User created:', user);
  await db.disconnect();
}
*/

// ============================================================================
// BROWSER - IIFE (script tag)
// ============================================================================

// HTML para usar no browser:
/*
<!DOCTYPE html>
<html>
<head>
  <title>S3db.js Browser Example</title>
  <!-- Via unpkg CDN -->
  <script src="https://unpkg.com/s3db.js@latest/dist/s3db.iife.min.js"></script>
  
  <!-- Via jsdelivr CDN -->
  <!-- <script src="https://cdn.jsdelivr.net/npm/s3db.js@latest/dist/s3db.iife.min.js"></script> -->
</head>
<body>
  <h1>S3db.js Browser Example</h1>
  <button onclick="createUser()">Create User</button>
  <div id="output"></div>

  <script>
    // O objeto global 's3db' está disponível
    const db = new s3db.S3db({
      region: 'us-east-1',
      accessKeyId: 'your-access-key',
      secretAccessKey: 'your-secret-key',
      bucket: 'your-bucket-name'
    });

    async function createUser() {
      try {
        await db.connect();
        
        const users = db.resource('users', {
          schema: {
            name: { type: 'string', required: true },
            email: { type: 'string', required: true }
          }
        });

        const user = await users.insert({
          name: 'Browser User',
          email: 'browser@example.com'
        });

        document.getElementById('output').innerHTML = 
          `<p>User created: ${JSON.stringify(user, null, 2)}</p>`;
          
        await db.disconnect();
      } catch (error) {
        document.getElementById('output').innerHTML = 
          `<p style="color: red;">Error: ${error.message}</p>`;
      }
    }
  </script>
</body>
</html>
*/

// ============================================================================
// EXEMPLOS DE USO AVANÇADO
// ============================================================================

async function advancedExamples() {
  console.log('=== Advanced Examples ===');
  
  const db = new S3db({
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: 'my-s3db-bucket',
    cache: true,
    cacheTTL: 300
  });

  await db.connect();

  // 1. Resource com schema complexo
  const products = db.resource('products', {
    schema: {
      name: { type: 'string', required: true },
      price: { type: 'number', required: true },
      category: { type: 'string' },
      tags: { type: 'array', items: 'string' },
      metadata: { type: 'object' },
      isActive: { type: 'boolean', default: true }
    }
  });

  // 2. Inserção com dados complexos
  const product = await products.insert({
    name: 'Wireless Headphones',
    price: 99.99,
    category: 'electronics',
    tags: ['wireless', 'bluetooth', 'audio'],
    metadata: {
      brand: 'TechCorp',
      warranty: '2 years',
      features: ['noise-cancelling', 'touch-controls']
    }
  });

  console.log('Product created:', product);

  // 3. Busca com filtros
  const electronics = await products.find({ category: 'electronics' });
  console.log('Electronics products:', electronics.length);

  // 4. Stream para processar grandes datasets
  const readStream = products.createReadStream();
  
  readStream.on('data', (product) => {
    console.log('Processing product:', product.name);
  });

  readStream.on('end', () => {
    console.log('Finished processing all products');
  });

  await db.disconnect();
}

// ============================================================================
// EXEMPLO DE CONFIGURAÇÃO DE AMBIENTE
// ============================================================================

function environmentConfig() {
  console.log('=== Environment Configuration ===');
  
  // Desenvolvimento
  const devConfig = {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: 'my-s3db-dev',
    cache: false, // Desabilitar cache em desenvolvimento
    verbose: true // Logs detalhados
  };

  // Produção
  const prodConfig = {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: 'my-s3db-prod',
    cache: true,
    cacheTTL: 600, // 10 minutos
    encryption: true, // Habilitar criptografia
    compression: true // Habilitar compressão
  };

  // MinIO (S3-compatible)
  const minioConfig = {
    region: 'us-east-1',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    bucket: 'my-s3db',
    endpoint: 'http://localhost:9000' // MinIO endpoint
  };

  console.log('Configurations ready for different environments');
}

// ============================================================================
// EXECUÇÃO DOS EXEMPLOS
// ============================================================================

async function runExamples() {
  try {
    // Verificar se estamos no Node.js
    if (typeof window === 'undefined') {
      console.log('Running in Node.js environment');
      
      // Executar exemplo ES Modules
      await nodejsESModulesExample();
      
      // Executar exemplos avançados
      await advancedExamples();
      
      // Mostrar configurações
      environmentConfig();
      
    } else {
      console.log('Running in browser environment');
      console.log('Please see the HTML example above for browser usage');
    }
    
  } catch (error) {
    console.error('Error running examples:', error.message);
  }
}

// Executar se este arquivo for executado diretamente
if (typeof require !== 'undefined' && require.main === module) {
  runExamples();
}

export {
  nodejsESModulesExample,
  advancedExamples,
  environmentConfig
}; 