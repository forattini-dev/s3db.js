import path from "path";
import { config } from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../../.env') });

import { Database } from '../../src/index.js';
import { createDatabaseForTest } from '../config.js';

// Configurações de HTTP client para testar
const httpConfigs = {
  default: {
    name: 'Default (Keep-alive enabled)',
    config: {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
    }
  },
  noKeepAlive: {
    name: 'No Keep-alive',
    config: {
      keepAlive: false,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
    }
  },
  aggressive: {
    name: 'Aggressive Keep-alive',
    config: {
      keepAlive: true,
      keepAliveMsecs: 5000,
      maxSockets: 200,
      maxFreeSockets: 50,
      timeout: 120000,
    }
  },
  conservative: {
    name: 'Conservative',
    config: {
      keepAlive: true,
      keepAliveMsecs: 500,
      maxSockets: 10,
      maxFreeSockets: 2,
      timeout: 15000,
    }
  },
  highConcurrency: {
    name: 'High Concurrency',
    config: {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 100,
      maxFreeSockets: 20,
      timeout: 60000,
    }
  },
  lowConcurrency: {
    name: 'Low Concurrency',
    config: {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 5,
      maxFreeSockets: 1,
      timeout: 60000,
    }
  }
};

// Função para medir performance de operações S3 reais
async function benchmarkS3Operations(db, configName, operations = 20) {
  // Create the resource if it doesn't exist
  if (!db.resourceExists('benchmark')) {
    await db.createResource({
      name: 'benchmark',
      attributes: {
        id: 'string',
        name: 'string',
        value: 'number',
        timestamp: 'string',
        category: 'string',
        priority: 'number',
        tags: 'array|items:string',
        metadata: {
          category: 'string',
          priority: 'number',
          tags: 'array|items:string'
        }
      },
      partitions: {
        byCategory: {
          fields: {
            category: 'string'
          }
        },
        byPriority: {
          fields: {
            priority: 'number'
          }
        }
      }
    });
  }
  const resource = db.resource('benchmark');
  
  // Preparar dados de teste
  const testData = Array.from({ length: operations }, (_, i) => ({
    id: `test-${i}`,
    name: `Item ${i}`,
    value: Math.random() * 1000,
    timestamp: new Date().toISOString(),
    category: `cat-${i % 10}`,
    priority: i % 3,
    tags: [`tag${i}`, `benchmark`],
    metadata: {
      category: `cat-${i % 10}`,
      priority: i % 3,
      tags: [`tag${i}`, `benchmark`]
    }
  }));

  const results = {
    insert: { times: [], avg: 0, total: 0 },
    get: { times: [], avg: 0, total: 0 },
    update: { times: [], avg: 0, total: 0 },
    delete: { times: [], avg: 0, total: 0 }
  };

  console.log(`\n=== Testing ${configName} ===`);

  // Teste de INSERT
  console.log(`Running ${operations} INSERT operations...`);
  const insertStart = process.hrtime.bigint();
  for (let i = 0; i < operations; i++) {
    const start = process.hrtime.bigint();
    await resource.insert(testData[i]);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    results.insert.times.push(ms);
  }
  const insertEnd = process.hrtime.bigint();
  results.insert.total = Number(insertEnd - insertStart) / 1e6;
  results.insert.avg = results.insert.times.reduce((a, b) => a + b, 0) / operations;

  // Teste de GET
  console.log(`Running ${operations} GET operations...`);
  const getStart = process.hrtime.bigint();
  for (let i = 0; i < operations; i++) {
    const start = process.hrtime.bigint();
    await resource.get(testData[i].id);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    results.get.times.push(ms);
  }
  const getEnd = process.hrtime.bigint();
  results.get.total = Number(getEnd - getStart) / 1e6;
  results.get.avg = results.get.times.reduce((a, b) => a + b, 0) / operations;

  // Teste de UPDATE
  console.log(`Running ${operations} UPDATE operations...`);
  const updateStart = process.hrtime.bigint();
  for (let i = 0; i < operations; i++) {
    const start = process.hrtime.bigint();
    await resource.update(testData[i].id, { ...testData[i], updated: true });
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    results.update.times.push(ms);
  }
  const updateEnd = process.hrtime.bigint();
  results.update.total = Number(updateEnd - updateStart) / 1e6;
  results.update.avg = results.update.times.reduce((a, b) => a + b, 0) / operations;

  // Teste de DELETE
  console.log(`Running ${operations} DELETE operations...`);
  const deleteStart = process.hrtime.bigint();
  for (let i = 0; i < operations; i++) {
    const start = process.hrtime.bigint();
    await resource.delete(testData[i].id);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    results.delete.times.push(ms);
  }
  const deleteEnd = process.hrtime.bigint();
  results.delete.total = Number(deleteEnd - deleteStart) / 1e6;
  results.delete.avg = results.delete.times.reduce((a, b) => a + b, 0) / operations;

  return results;
}

// Função para medir performance de operações em paralelo
async function benchmarkParallelOperations(db, configName, operations = 10, concurrency = 3) {
  // Create the resource if it doesn't exist
  if (!db.resourceExists('parallel-benchmark')) {
    await db.createResource({
      name: 'parallel-benchmark',
      attributes: {
        id: 'string',
        name: 'string',
        value: 'number',
        timestamp: 'string'
      }
    });
  }
  const resource = db.resource('parallel-benchmark');
  
  const testData = Array.from({ length: operations }, (_, i) => ({
    id: `parallel-${i}`,
    name: `Parallel Item ${i}`,
    value: Math.random() * 1000,
    timestamp: new Date().toISOString()
  }));

  console.log(`\n=== Testing ${configName} (Parallel - ${concurrency} concurrent) ===`);

  // Função para executar operações em paralelo
  async function runParallelOperations(operationType, operationFn) {
    const start = process.hrtime.bigint();
    const promises = [];
    
    for (let i = 0; i < operations; i += concurrency) {
      const batch = testData.slice(i, i + concurrency);
      const batchPromises = batch.map(item => operationFn(item));
      promises.push(...batchPromises);
    }
    
    await Promise.all(promises);
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6;
  }

  // INSERT paralelo - usar insertMany para melhor performance
  console.log(`Running ${operations} parallel INSERT operations using insertMany...`);
  const insertStart = process.hrtime.bigint();
  const insertResults = await resource.insertMany(testData);
  const insertEnd = process.hrtime.bigint();
  const insertTime = Number(insertEnd - insertStart) / 1e6;

  // GET paralelo
  console.log(`Running ${operations} parallel GET operations...`);
  const getTime = await runParallelOperations('GET', async (item) => {
    await resource.get(item.id);
  });

  // UPDATE paralelo
  console.log(`Running ${operations} parallel UPDATE operations...`);
  const updateTime = await runParallelOperations('UPDATE', async (item) => {
    await resource.update(item.id, { ...item, updated: true });
  });

  // DELETE paralelo
  console.log(`Running ${operations} parallel DELETE operations...`);
  const deleteTime = await runParallelOperations('DELETE', async (item) => {
    await resource.delete(item.id);
  });

  return {
    insert: { total: insertTime, avg: insertTime / operations },
    get: { total: getTime, avg: getTime / operations },
    update: { total: updateTime, avg: updateTime / operations },
    delete: { total: deleteTime, avg: deleteTime / operations }
  };
}

// Função para benchmark de operações em massa (1000 elementos)
async function benchmarkBulkOperations(db, configName) {
  // Create the resource if it doesn't exist
  if (!db.resourceExists('bulk-benchmark')) {
    await db.createResource({
      name: 'bulk-benchmark',
      attributes: {
        id: 'string',
        name: 'string',
        value: 'number',
        timestamp: 'string',
        category: 'string',
        priority: 'number',
        tags: 'array|items:string',
        metadata: {
          category: 'string',
          priority: 'number',
          tags: 'array|items:string'
        }
      },
      partitions: {
        byCategory: {
          fields: {
            category: 'string'
          }
        },
        byPriority: {
          fields: {
            priority: 'number'
          }
        }
      }
    });
  }
  const resource = db.resource('bulk-benchmark');
  
  const totalElements = 1000;
  const pageSize = 100;
  
  console.log(`\n=== Testing ${configName} (Bulk Operations - ${totalElements} elements) ===`);

  // Gerar dados de teste
  console.log(`Generating ${totalElements} test elements...`);
  const testData = Array.from({ length: totalElements }, (_, i) => ({
    id: `bulk-${i}`,
    name: `Bulk Item ${i}`,
    value: Math.random() * 1000,
    timestamp: new Date().toISOString(),
    category: `category-${i % 20}`,
    priority: i % 5,
    tags: [`tag${i % 50}`, `bulk`, `benchmark`],
    metadata: {
      category: `category-${i % 20}`,
      priority: i % 5,
      tags: [`tag${i % 50}`, `bulk`, `benchmark`]
    }
  }));

  const results = {
    bulkInsert: { total: 0, avg: 0 },
    pagination: { total: 0, avg: 0, pages: 0 },
    partitionQuery: { total: 0, avg: 0 },
    bulkDelete: { total: 0, avg: 0 }
  };

  // BULK INSERT - 1000 elementos usando insertMany
  console.log(`Running BULK INSERT of ${totalElements} elements using insertMany...`);
  const bulkInsertStart = process.hrtime.bigint();
  
  // Usar insertMany para inserção em massa
  const insertResults = await resource.insertMany(testData);
  
  const bulkInsertEnd = process.hrtime.bigint();
  results.bulkInsert.total = Number(bulkInsertEnd - bulkInsertStart) / 1e6;
  results.bulkInsert.avg = results.bulkInsert.total / totalElements;

  // PAGINAÇÃO - Buscar todos os elementos em páginas de 100
  console.log(`Running PAGINATION with ${pageSize} items per page...`);
  const paginationStart = process.hrtime.bigint();
  
  let page = 1;
  let hasMore = true;
  let totalRetrieved = 0;
  
  while (hasMore) {
    const start = process.hrtime.bigint();
    const result = await resource.list({ 
      limit: pageSize, 
      offset: (page - 1) * pageSize 
    });
    const end = process.hrtime.bigint();
    
    totalRetrieved += result.items.length;
    hasMore = result.items.length === pageSize;
    page++;
  }
  
  const paginationEnd = process.hrtime.bigint();
  results.pagination.total = Number(paginationEnd - paginationStart) / 1e6;
  results.pagination.avg = results.pagination.total / page;
  results.pagination.pages = page - 1;

  // QUERY POR PARTIÇÃO - Buscar por categoria específica
  console.log(`Running PARTITION QUERY...`);
  const partitionStart = process.hrtime.bigint();
  
  const categoryToSearch = 'category-5';
  const partitionResult = await resource.list({ 
    where: { category: categoryToSearch },
    limit: 100 
  });
  
  const partitionEnd = process.hrtime.bigint();
  results.partitionQuery.total = Number(partitionEnd - partitionStart) / 1e6;
  results.partitionQuery.avg = results.partitionQuery.total;

  // BULK DELETE - Remover todos os elementos usando deleteMany
  console.log(`Running BULK DELETE of ${totalElements} elements using deleteMany...`);
  const bulkDeleteStart = process.hrtime.bigint();
  
  // Usar deleteMany para remoção em massa
  const deleteIds = testData.map(item => item.id);
  const deleteResults = await resource.deleteMany(deleteIds);
  
  const bulkDeleteEnd = process.hrtime.bigint();
  results.bulkDelete.total = Number(bulkDeleteEnd - bulkDeleteStart) / 1e6;
  results.bulkDelete.avg = results.bulkDelete.total / totalElements;

  return results;
}

// Função para calcular estatísticas
function calculateStats(times) {
  const sorted = times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  
  return { avg, min, max, median, p95, p99 };
}

// Função principal do benchmark
async function runHttpClientS3Benchmark() {
  console.log('🚀 HTTP Client S3 Operations Benchmark - Extended');
  console.log('================================================');
  
  const baseDb = await createDatabaseForTest('http-client-s3-bench');
  const results = {};
  const parallelResults = {};
  const bulkResults = {};
  
  // Store the connection string for reuse
  const connectionString = process.env.BUCKET_CONNECTION_STRING + '/http-client-benchmark-' + Date.now();

  // Testar cada configuração
  for (const [key, config] of Object.entries(httpConfigs)) {
    console.log(`\n📊 Testing: ${config.name}`);
    console.log(`Config:`, config.config);
    
    // Criar nova instância do database com a configuração específica
    const testDb = new Database({
      connectionString: connectionString,
      httpClientOptions: config.config,
      verbose: false
    });
    
    await testDb.connect();
    
    // Benchmark sequencial (reduzido para 15 operações para ser mais rápido)
    results[key] = await benchmarkS3Operations(testDb, config.name, 15);
    
    // Benchmark paralelo (reduzido para 8 operações)
    parallelResults[key] = await benchmarkParallelOperations(testDb, config.name, 8, 2);
    
    // Benchmark de operações em massa (apenas para algumas configurações para não demorar muito)
    if (key === 'default' || key === 'highConcurrency' || key === 'aggressive') {
      bulkResults[key] = await benchmarkBulkOperations(testDb, config.name);
    }
    
    await testDb.disconnect();
  }

  // Limpar dados de teste
  await baseDb.client.deleteAll();
  await baseDb.disconnect();

  // Preparar resultados para console.table
  const sequentialTable = [];
  const parallelTable = [];
  const bulkTable = [];
  const summaryTable = [];

  for (const [key, config] of Object.entries(httpConfigs)) {
    const result = results[key];
    const parallelResult = parallelResults[key];
    
    // Tabela sequencial
    sequentialTable.push({
      'Configuration': config.name,
      'INSERT (ms)': result.insert.avg.toFixed(2),
      'GET (ms)': result.get.avg.toFixed(2),
      'UPDATE (ms)': result.update.avg.toFixed(2),
      'DELETE (ms)': result.delete.avg.toFixed(2),
      'Total Time (s)': ((result.insert.total + result.get.total + result.update.total + result.delete.total) / 1000).toFixed(2)
    });

    // Tabela paralela
    parallelTable.push({
      'Configuration': config.name,
      'INSERT (ms)': parallelResult.insert.avg.toFixed(2),
      'GET (ms)': parallelResult.get.avg.toFixed(2),
      'UPDATE (ms)': parallelResult.update.avg.toFixed(2),
      'DELETE (ms)': parallelResult.delete.avg.toFixed(2),
      'Total Time (s)': ((parallelResult.insert.total + parallelResult.get.total + parallelResult.update.total + parallelResult.delete.total) / 1000).toFixed(2)
    });

    // Tabela de operações em massa (se disponível)
    if (bulkResults[key]) {
      const bulkResult = bulkResults[key];
      bulkTable.push({
        'Configuration': config.name,
        'Bulk Insert (s)': (bulkResult.bulkInsert.total / 1000).toFixed(2),
        'Pagination (s)': (bulkResult.pagination.total / 1000).toFixed(2),
        'Partition Query (ms)': bulkResult.partitionQuery.avg.toFixed(2),
        'Bulk Delete (s)': (bulkResult.bulkDelete.total / 1000).toFixed(2),
        'Total Bulk Time (s)': ((bulkResult.bulkInsert.total + bulkResult.pagination.total + bulkResult.partitionQuery.total + bulkResult.bulkDelete.total) / 1000).toFixed(2)
      });
    }

    // Tabela de resumo com melhorias
    const defaultResult = results.default;
    const defaultParallel = parallelResults.default;
    
    const insertImprovement = ((defaultResult.insert.avg - result.insert.avg) / defaultResult.insert.avg * 100).toFixed(1);
    const getImprovement = ((defaultResult.get.avg - result.get.avg) / defaultResult.get.avg * 100).toFixed(1);
    const parallelImprovement = ((defaultParallel.insert.avg - parallelResult.insert.avg) / defaultParallel.insert.avg * 100).toFixed(1);
    
    summaryTable.push({
      'Configuration': config.name,
      'Sequential vs Default': `${insertImprovement}%`,
      'Parallel vs Default': `${parallelImprovement}%`,
      'Keep-alive': config.config.keepAlive ? 'Yes' : 'No',
      'Max Sockets': config.config.maxSockets,
      'Keep-alive (ms)': config.config.keepAliveMsecs || 'N/A'
    });
  }

  // Exibir resultados
  console.log('\n📈 SEQUENTIAL S3 OPERATIONS PERFORMANCE');
  console.log('========================================');
  console.table(sequentialTable);

  console.log('\n⚡ PARALLEL S3 OPERATIONS PERFORMANCE');
  console.log('=====================================');
  console.table(parallelTable);

  if (bulkTable.length > 0) {
    console.log('\n🔥 BULK OPERATIONS PERFORMANCE (1000 elements)');
    console.log('==============================================');
    console.table(bulkTable);
  }

  console.log('\n📊 PERFORMANCE SUMMARY');
  console.log('======================');
  console.table(summaryTable);

  // Análise detalhada
  console.log('\n🔍 DETAILED ANALYSIS');
  console.log('===================');
  
  const bestSequential = sequentialTable.reduce((best, current) => 
    parseFloat(current['Total Time (s)']) < parseFloat(best['Total Time (s)']) ? current : best
  );
  
  const bestParallel = parallelTable.reduce((best, current) => 
    parseFloat(current['Total Time (s)']) < parseFloat(best['Total Time (s)']) ? current : best
  );

  console.log(`🏆 Best Sequential Performance: ${bestSequential.Configuration} (${bestSequential['Total Time (s)']}s)`);
  console.log(`🏆 Best Parallel Performance: ${bestParallel.Configuration} (${bestParallel['Total Time (s)']}s)`);
  
  if (bulkTable.length > 0) {
    const bestBulk = bulkTable.reduce((best, current) => 
      parseFloat(current['Total Bulk Time (s)']) < parseFloat(best['Total Bulk Time (s)']) ? current : best
    );
    console.log(`🏆 Best Bulk Performance: ${bestBulk.Configuration} (${bestBulk['Total Bulk Time (s)']}s)`);
  }
  
  // Recomendações
  console.log('\n💡 RECOMMENDATIONS');
  console.log('==================');
  
  const noKeepAlive = results.noKeepAlive;
  const defaultResult = results.default;
  const improvement = ((noKeepAlive.insert.avg - defaultResult.insert.avg) / noKeepAlive.insert.avg * 100).toFixed(1);
  
  console.log(`• Keep-alive provides ${improvement}% improvement over no keep-alive`);
  console.log(`• High concurrency settings work best for parallel operations`);
  console.log(`• Conservative settings may be better for resource-constrained environments`);
  console.log(`• Default settings provide good balance between performance and resource usage`);
  
  if (bulkTable.length > 0) {
    console.log(`• Bulk operations show real-world performance with 1000+ elements`);
    console.log(`• Pagination with 100 items per page demonstrates scalable querying`);
    console.log(`• Partition queries enable efficient filtering by category/priority`);
  }
  
  // Análise de latência
  console.log('\n📊 LATENCY ANALYSIS');
  console.log('==================');
  
  const allInsertTimes = Object.values(results).map(r => r.insert.avg);
  const avgLatency = allInsertTimes.reduce((a, b) => a + b, 0) / allInsertTimes.length;
  const minLatency = Math.min(...allInsertTimes);
  const maxLatency = Math.max(...allInsertTimes);
  
  console.log(`• Average INSERT latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`• Best INSERT latency: ${minLatency.toFixed(2)}ms`);
  console.log(`• Worst INSERT latency: ${maxLatency.toFixed(2)}ms`);
  console.log(`• Latency variation: ${((maxLatency - minLatency) / avgLatency * 100).toFixed(1)}%`);
  
  if (bulkTable.length > 0) {
    const bulkInsertTimes = bulkTable.map(row => parseFloat(row['Bulk Insert (s)']) * 1000 / 1000); // ms per element
    const avgBulkLatency = bulkInsertTimes.reduce((a, b) => a + b, 0) / bulkInsertTimes.length;
    console.log(`• Average bulk INSERT latency per element: ${avgBulkLatency.toFixed(2)}ms`);
  }
}

// Executar o benchmark
runHttpClientS3Benchmark().catch(console.error); 