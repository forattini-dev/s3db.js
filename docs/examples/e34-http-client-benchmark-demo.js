import { Database } from '../src/index.js';

console.log('🚀 HTTP Client Configuration Demo');
console.log('==================================');
console.log('');

// Configurações baseadas nos resultados do benchmark
const configurations = {
             default: {
             name: 'Default (Optimized)',
             description: 'Optimized balance for most applications',
             config: {
               keepAlive: true,
               keepAliveMsecs: 500,
               maxSockets: 25,
               maxFreeSockets: 5,
               timeout: 30000,
             }
           },
  highThroughput: {
    name: 'High Throughput',
    description: 'Best for applications with many concurrent S3 operations',
    config: {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 100,
      maxFreeSockets: 20,
      timeout: 60000,
    }
  },
  conservative: {
    name: 'Conservative',
    description: 'Best for resource-constrained environments',
    config: {
      keepAlive: true,
      keepAliveMsecs: 500,
      maxSockets: 10,
      maxFreeSockets: 2,
      timeout: 15000,
    }
  },
  aggressive: {
    name: 'Aggressive',
    description: 'Best for high-performance applications with stable connections',
    config: {
      keepAlive: true,
      keepAliveMsecs: 5000,
      maxSockets: 200,
      maxFreeSockets: 50,
      timeout: 120000,
    }
  }
};

// Função para demonstrar a criação de clientes com diferentes configurações
function demonstrateClientCreation() {
  console.log('📊 CLIENT CREATION DEMONSTRATION');
  console.log('================================');
  console.log('');

  for (const [key, config] of Object.entries(configurations)) {
    console.log(`🔧 ${config.name}`);
    console.log(`   Description: ${config.description}`);
    console.log(`   Configuration:`);
    console.log(`     - keepAlive: ${config.config.keepAlive}`);
    console.log(`     - keepAliveMsecs: ${config.config.keepAliveMsecs}ms`);
    console.log(`     - maxSockets: ${config.config.maxSockets}`);
    console.log(`     - maxFreeSockets: ${config.config.maxFreeSockets}`);
    console.log(`     - timeout: ${config.config.timeout}ms`);
    console.log('');

    // Criar cliente com a configuração específica
    try {
      const db = new Database({
        connectionString: 's3://example-bucket/demo',
        httpClientOptions: config.config,
        verbose: false
      });
      
      console.log(`   ✅ Client created successfully`);
      console.log(`   📈 Expected performance:`);
      
      // Mostrar performance esperada baseada no benchmark
      switch (key) {
        case 'default':
          console.log(`     - Sequential creation: ~0.324ms`);
          console.log(`     - Parallel creation: ~0.024ms`);
          console.log(`     - Best for: Most applications`);
          break;
        case 'highThroughput':
          console.log(`     - Sequential creation: ~0.196ms`);
          console.log(`     - Parallel creation: ~0.021ms`);
          console.log(`     - Best for: High concurrency scenarios`);
          break;
        case 'conservative':
          console.log(`     - Sequential creation: ~0.205ms`);
          console.log(`     - Parallel creation: ~0.025ms`);
          console.log(`     - Best for: Resource-constrained environments`);
          break;
        case 'aggressive':
          console.log(`     - Sequential creation: ~0.227ms`);
          console.log(`     - Parallel creation: ~0.112ms`);
          console.log(`     - Best for: High-performance applications`);
          break;
      }
    } catch (error) {
      console.log(`   ❌ Error creating client: ${error.message}`);
    }
    
    console.log('');
  }
}

// Função para demonstrar uso prático
function demonstratePracticalUsage() {
  console.log('💡 PRACTICAL USAGE EXAMPLES');
  console.log('============================');
  console.log('');

  console.log('🔹 EXAMPLE 1: Web Application (Default Configuration)');
  console.log('```javascript');
  console.log('const db = new Database({');
  console.log('  connectionString: process.env.S3DB_CONNECTION_STRING,');
  console.log('  httpClientOptions: {');
  console.log('    keepAlive: true,');
  console.log('    keepAliveMsecs: 1000,');
  console.log('    maxSockets: 50,');
  console.log('    maxFreeSockets: 10,');
  console.log('    timeout: 60000,');
  console.log('  }');
  console.log('});');
  console.log('```');
  console.log('');

  console.log('🔹 EXAMPLE 2: Data Processing Pipeline (High Throughput)');
  console.log('```javascript');
  console.log('const db = new Database({');
  console.log('  connectionString: process.env.S3DB_CONNECTION_STRING,');
  console.log('  httpClientOptions: {');
  console.log('    keepAlive: true,');
  console.log('    keepAliveMsecs: 1000,');
  console.log('    maxSockets: 100,');
  console.log('    maxFreeSockets: 20,');
  console.log('    timeout: 60000,');
  console.log('  }');
  console.log('});');
  console.log('```');
  console.log('');

  console.log('🔹 EXAMPLE 3: Serverless Function (Conservative)');
  console.log('```javascript');
  console.log('const db = new Database({');
  console.log('  connectionString: process.env.S3DB_CONNECTION_STRING,');
  console.log('  httpClientOptions: {');
  console.log('    keepAlive: true,');
  console.log('    keepAliveMsecs: 500,');
  console.log('    maxSockets: 10,');
  console.log('    maxFreeSockets: 2,');
  console.log('    timeout: 15000,');
  console.log('  }');
  console.log('});');
  console.log('```');
  console.log('');

  console.log('🔹 EXAMPLE 4: High-Performance API (Aggressive)');
  console.log('```javascript');
  console.log('const db = new Database({');
  console.log('  connectionString: process.env.S3DB_CONNECTION_STRING,');
  console.log('  httpClientOptions: {');
  console.log('    keepAlive: true,');
  console.log('    keepAliveMsecs: 5000,');
  console.log('    maxSockets: 200,');
  console.log('    maxFreeSockets: 50,');
  console.log('    timeout: 120000,');
  console.log('  }');
  console.log('});');
  console.log('```');
  console.log('');
}

// Função para mostrar recomendações baseadas no uso
function showUsageRecommendations() {
  console.log('🎯 RECOMMENDATIONS BY USE CASE');
  console.log('==============================');
  console.log('');

  const useCases = [
    {
      name: 'Web Application',
      description: 'Standard web app with moderate S3 usage',
      recommendation: 'default',
      reason: 'Good balance of performance and resource usage'
    },
    {
      name: 'Data Processing',
      description: 'Batch processing with many concurrent operations',
      recommendation: 'highThroughput',
      reason: 'Optimized for high concurrency scenarios'
    },
    {
      name: 'Serverless Function',
      description: 'Lambda or similar with limited resources',
      recommendation: 'conservative',
      reason: 'Minimal resource usage for constrained environments'
    },
    {
      name: 'High-Performance API',
      description: 'API with high throughput requirements',
      recommendation: 'aggressive',
      reason: 'Maximum performance for stable, high-frequency operations'
    },
    {
      name: 'Development/Testing',
      description: 'Local development or testing environment',
      recommendation: 'default',
      reason: 'Standard configuration works well for most scenarios'
    }
  ];

  for (const useCase of useCases) {
    const config = configurations[useCase.recommendation];
    console.log(`🔹 ${useCase.name}`);
    console.log(`   Description: ${useCase.description}`);
    console.log(`   Recommendation: ${config.name}`);
    console.log(`   Reason: ${useCase.reason}`);
    console.log(`   Key Settings: maxSockets=${config.config.maxSockets}, keepAliveMsecs=${config.config.keepAliveMsecs}ms`);
    console.log('');
  }
}

// Função para mostrar métricas de monitoramento
function showMonitoringMetrics() {
  console.log('📊 MONITORING METRICS');
  console.log('=====================');
  console.log('');

  console.log('🔍 Key metrics to monitor in production:');
  console.log('');
  console.log('1. Connection Pool Usage:');
  console.log('   - Active connections vs maxSockets');
  console.log('   - Free connections in pool');
  console.log('   - Connection creation rate');
  console.log('');

  console.log('2. Performance Metrics:');
  console.log('   - S3 operation latency');
  console.log('   - Connection reuse rate');
  console.log('   - Timeout frequency');
  console.log('');

  console.log('3. Resource Usage:');
  console.log('   - Memory usage per connection');
  console.log('   - CPU usage during operations');
  console.log('   - Network bandwidth utilization');
  console.log('');

  console.log('📈 When to adjust settings:');
  console.log('');
  console.log('🔴 Increase maxSockets if:');
  console.log('   - You see connection timeouts');
  console.log('   - Operations are queuing');
  console.log('   - High latency during peak usage');
  console.log('');

  console.log('🟡 Decrease maxSockets if:');
  console.log('   - High memory usage');
  console.log('   - Low connection reuse rate');
  console.log('   - Resource constraints');
  console.log('');

  console.log('🟢 Adjust keepAliveMsecs if:');
  console.log('   - Connections are being closed too quickly');
  console.log('   - High connection creation rate');
  console.log('   - Unstable network conditions');
  console.log('');
}

// Executar demonstrações
demonstrateClientCreation();
demonstratePracticalUsage();
showUsageRecommendations();
showMonitoringMetrics();

console.log('🚀 SUMMARY');
console.log('==========');
console.log('');
console.log('✅ Key Takeaways:');
console.log('• HTTP client configuration overhead is minimal');
console.log('• Keep-alive provides real benefits for S3 operations');
console.log('• Default settings work well for most applications');
console.log('• Monitor and adjust based on actual usage patterns');
console.log('• The real performance gains come from connection reuse');
console.log('');
console.log('🎯 Next Steps:');
console.log('• Start with default configuration');
console.log('• Monitor performance in your specific use case');
console.log('• Adjust settings based on actual metrics');
console.log('• Consider your application\'s concurrency patterns');
console.log('');
console.log('📚 For more information, check the benchmark results in:');
console.log('   tests/functions/http-client-summary.bench.js'); 