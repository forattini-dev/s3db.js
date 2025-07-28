import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({
  debug: true,
  path: path.resolve(__dirname, '../../.env'),
});

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
  highConcurrency: {
    name: 'High Concurrency',
    config: {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 100,
      maxFreeSockets: 20,
      timeout: 60000,
    }
  }
};

// Função para benchmark de operações básicas
async function benchmarkBasicOperations(db, configName, operations = 10) {
  // Create the resource if it doesn't exist
  if (!db.resourceExists('basic-benchmark')) {
    console.log('Creating basic-benchmark resource...');
    await db.createResource({
      name: 'basic-benchmark',
      attributes: {
        id: 'string',
        name: 'string',
        value: 'number',
        timestamp: 'string',
        category: 'string',
        priority: 'number',
        tags: 'array|items:string'
      }
    });
  }
  const resource = db.resource('basic-benchmark');
  
  // Preparar dados de teste
  const testData = Array.from({ length: operations }, (_, i) => ({
    id: `test-${i}`,
    name: `Item ${i}`,
    value: Math.random() * 1000,
    timestamp: new Date().toISOString(),
    category: `cat-${i % 10}`,
    priority: i % 3,
    tags: [`tag${i}`, `benchmark`]
  }));

  const results = {
    insert: { times: [], avg: 0, total: 0 },
    get: { times: [], avg: 0, total: 0 },
    update: { times: [], avg: 0, total: 0 },
    delete: { times: [], avg: 0, total: 0 }
  };

  console.log(`\n=== Testing ${configName} (Basic Operations) ===`);

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

// Função para benchmark de operações em massa
async function benchmarkBulkOperations(db, configName) {
  // Create the resource if it doesn't exist
  if (!db.resourceExists('bulk-benchmark')) {
    console.log('Creating bulk-benchmark resource...');
    await db.createResource({
      name: 'bulk-benchmark',
      attributes: {
        id: 'string',
        name: 'string',
        value: 'number',
        timestamp: 'string',
        category: 'string',
        priority: 'number',
        tags: 'array|items:string'
      }
    });
  }
  const resource = db.resource('bulk-benchmark');
  
  const totalElements = 500; // Aumentado para 500 elementos
  const pageSize = 50; // Páginas de 50 elementos
  
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
    tags: [`tag${i % 50}`, `bulk`, `benchmark`]
  }));

  const results = {
    bulkInsert: { total: 0, avg: 0 },
    pagination: { total: 0, avg: 0, pages: 0 },
    query: { total: 0, avg: 0 },
    bulkDelete: { total: 0, avg: 0 }
  };

  // BULK INSERT - usando insertMany
  console.log(`Running BULK INSERT of ${totalElements} elements using insertMany...`);
  const bulkInsertStart = process.hrtime.bigint();
  
  try {
    const insertResults = await resource.insertMany(testData);
    console.log(`Inserted ${insertResults.length} items successfully`);
  } catch (error) {
    console.error('Error during bulk insert:', error);
    throw error;
  }
  
  const bulkInsertEnd = process.hrtime.bigint();
  results.bulkInsert.total = Number(bulkInsertEnd - bulkInsertStart) / 1e6;
  results.bulkInsert.avg = results.bulkInsert.total / totalElements;

  // PAGINAÇÃO - Buscar todos os elementos em páginas
  console.log(`Running PAGINATION with ${pageSize} items per page...`);
  const paginationStart = process.hrtime.bigint();
  
  let page = 1;
  let hasMore = true;
  let totalRetrieved = 0;
  
  while (hasMore) {
    console.log(`  Fetching page ${page}...`);
    const start = process.hrtime.bigint();
    const result = await resource.list({ 
      limit: pageSize, 
      offset: (page - 1) * pageSize 
    });
    const end = process.hrtime.bigint();
    
    totalRetrieved += result.length;
    console.log(`  Page ${page}: ${result.length} items retrieved`);
    hasMore = result.length === pageSize;
    page++;
  }
  
  const paginationEnd = process.hrtime.bigint();
  results.pagination.total = Number(paginationEnd - paginationStart) / 1e6;
  results.pagination.avg = results.pagination.total / page;
  results.pagination.pages = page - 1;

  // QUERY - Buscar por categoria específica
  console.log(`Running QUERY by category...`);
  const queryStart = process.hrtime.bigint();
  
  const categoryToSearch = 'category-5';
  const queryResult = await resource.list({ 
    where: { category: categoryToSearch },
    limit: 100 
  });
  
  const queryEnd = process.hrtime.bigint();
  results.query.total = Number(queryEnd - queryStart) / 1e6;
  results.query.avg = results.query.total;

  // BULK DELETE - usando deleteMany
  console.log(`Running BULK DELETE of ${totalElements} elements using deleteMany...`);
  const bulkDeleteStart = process.hrtime.bigint();
  
  try {
    const deleteIds = testData.map(item => item.id);
    const deleteResults = await resource.deleteMany(deleteIds);
    console.log(`Deleted ${deleteIds.length} items successfully`);
  } catch (error) {
    console.error('Error during bulk delete:', error);
    throw error;
  }
  
  const bulkDeleteEnd = process.hrtime.bigint();
  results.bulkDelete.total = Number(bulkDeleteEnd - bulkDeleteStart) / 1e6;
  results.bulkDelete.avg = results.bulkDelete.total / totalElements;

  return results;
}

// Função principal do benchmark
async function runHttpClientS3Benchmark() {
  console.log('🚀 HTTP Client S3 Operations Benchmark - Realistic Version');
  console.log('==========================================================');
  
  const baseDb = await createDatabaseForTest();
  const results = {};
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
    
    // Benchmark básico (10 operações)
    results[key] = await benchmarkBasicOperations(testDb, config.name, 10);
    
    // Benchmark de operações em massa (500 elementos)
    bulkResults[key] = await benchmarkBulkOperations(testDb, config.name);
    
    await testDb.disconnect();
  }

  // Limpar dados de teste
  await baseDb.client.deleteAll();
  await baseDb.disconnect();

  // Preparar resultados para console.table
  const basicTable = [];
  const bulkTable = [];
  const summaryTable = [];

  for (const [key, config] of Object.entries(httpConfigs)) {
    const result = results[key];
    
    // Tabela básica
    basicTable.push({
      'Configuration': config.name,
      'INSERT (ms)': result.insert.avg.toFixed(2),
      'GET (ms)': result.get.avg.toFixed(2),
      'UPDATE (ms)': result.update.avg.toFixed(2),
      'DELETE (ms)': result.delete.avg.toFixed(2),
      'Total Time (s)': ((result.insert.total + result.get.total + result.update.total + result.delete.total) / 1000).toFixed(2)
    });

    // Tabela de operações em massa
    const bulkResult = bulkResults[key];
    bulkTable.push({
      'Configuration': config.name,
      'Bulk Insert (s)': (bulkResult.bulkInsert.total / 1000).toFixed(2),
      'Pagination (s)': (bulkResult.pagination.total / 1000).toFixed(2),
      'Query (ms)': bulkResult.query.avg.toFixed(2),
      'Bulk Delete (s)': (bulkResult.bulkDelete.total / 1000).toFixed(2),
      'Total Bulk Time (s)': ((bulkResult.bulkInsert.total + bulkResult.pagination.total + bulkResult.query.total + bulkResult.bulkDelete.total) / 1000).toFixed(2)
    });

    // Tabela de resumo
    const defaultResult = results.default;
    const insertImprovement = ((defaultResult.insert.avg - result.insert.avg) / defaultResult.insert.avg * 100).toFixed(1);
    
    summaryTable.push({
      'Configuration': config.name,
      'Basic vs Default': `${insertImprovement}%`,
      'Keep-alive': config.config.keepAlive ? 'Yes' : 'No',
      'Max Sockets': config.config.maxSockets,
      'Keep-alive (ms)': config.config.keepAliveMsecs || 'N/A'
    });
  }

  // Exibir resultados
  console.log('\n📈 BASIC S3 OPERATIONS PERFORMANCE (10 operations)');
  console.log('==================================================');
  console.table(basicTable);

  console.log('\n🔥 BULK OPERATIONS PERFORMANCE (500 elements)');
  console.log('==============================================');
  console.table(bulkTable);

  console.log('\n📊 PERFORMANCE SUMMARY');
  console.log('======================');
  console.table(summaryTable);

  // Análise detalhada
  console.log('\n🔍 DETAILED ANALYSIS');
  console.log('===================');
  
  const bestBasic = basicTable.reduce((best, current) => 
    parseFloat(current['Total Time (s)']) < parseFloat(best['Total Time (s)']) ? current : best
  );
  
  const bestBulk = bulkTable.reduce((best, current) => 
    parseFloat(current['Total Bulk Time (s)']) < parseFloat(best['Total Bulk Time (s)']) ? current : best
  );

  console.log(`🏆 Best Basic Performance: ${bestBasic.Configuration} (${bestBasic['Total Time (s)']}s)`);
  console.log(`🏆 Best Bulk Performance: ${bestBulk.Configuration} (${bestBulk['Total Bulk Time (s)']}s)`);
  
  // Recomendações
  console.log('\n💡 RECOMMENDATIONS');
  console.log('==================');
  
  const noKeepAlive = results.noKeepAlive;
  const defaultResult = results.default;
  const improvement = ((noKeepAlive.insert.avg - defaultResult.insert.avg) / noKeepAlive.insert.avg * 100).toFixed(1);
  
  console.log(`• Keep-alive provides ${improvement}% improvement over no keep-alive`);
  console.log(`• insertMany is much more efficient than individual inserts`);
  console.log(`• deleteMany provides efficient bulk deletion`);
  console.log(`• Pagination works well for large datasets`);
  
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
  
  const bulkInsertTimes = bulkTable.map(row => parseFloat(row['Bulk Insert (s)']) * 1000 / 500); // ms per element
  const avgBulkLatency = bulkInsertTimes.reduce((a, b) => a + b, 0) / bulkInsertTimes.length;
  console.log(`• Average bulk INSERT latency per element: ${avgBulkLatency.toFixed(2)}ms`);
}

// Executar o benchmark
runHttpClientS3Benchmark().catch(console.error); 