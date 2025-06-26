import S3db from '../src/index.js';

// Exemplo prático de listagem com partições
async function partitionListingExample() {
  console.log('🚀 Partition Listing Example\n');

  // 1. Setup database e resource com partições
  const db = new S3db({
    connectionString: 'http://localhost:9000/example?accessKeyId=s3db&secretAccessKey=thisissecret&forcePathStyle=true',
    verbose: true
  });

  await db.connect();

  // 2. Criar resource com regras de partição
  const users = await db.createResource({
    name: 'users',
    attributes: {
      name: 'string',
      email: 'string',
      region: 'string',
      department: 'string', 
      salary: 'number',
      status: 'string',
      joinDate: 'string'
    },
    options: {
      timestamps: true,
      partitionRules: {
        region: 'string|maxlength:2',      // US, EU, AS
        department: 'string',              // engineering, sales, marketing
        status: 'string',                  // active, inactive, pending
        createdAt: 'date|maxlength:10'     // YYYY-MM-DD
      }
    }
  });

  console.log('✅ Resource criado com partições:', Object.keys(users.options.partitionRules));

  // 3. Inserir dados de exemplo em diferentes partições
  const sampleUsers = [
    { name: 'João Silva', email: 'joao@empresa.com', region: 'US-WEST', department: 'engineering', salary: 120000, status: 'active', joinDate: '2023-01-15' },
    { name: 'Maria Santos', email: 'maria@empresa.com', region: 'US-EAST', department: 'engineering', salary: 115000, status: 'active', joinDate: '2023-02-20' },
    { name: 'Carlos Lima', email: 'carlos@empresa.com', region: 'EU-WEST', department: 'sales', salary: 80000, status: 'active', joinDate: '2023-03-10' },
    { name: 'Ana Costa', email: 'ana@empresa.com', region: 'EU-NORTH', department: 'marketing', salary: 75000, status: 'pending', joinDate: '2023-04-05' },
    { name: 'Pedro Alves', email: 'pedro@empresa.com', region: 'AS-EAST', department: 'engineering', salary: 100000, status: 'inactive', joinDate: '2023-05-12' },
    { name: 'Lucia Rocha', email: 'lucia@empresa.com', region: 'US-WEST', department: 'sales', salary: 85000, status: 'active', joinDate: '2023-06-18' }
  ];

  console.log('\n📝 Inserindo usuários em diferentes partições...');
  for (const user of sampleUsers) {
    await users.insert(user);
    console.log(`   → ${user.name} (${user.region}/${user.department}/${user.status})`);
  }

  // 4. DESCOBERTA DE PARTIÇÕES
  console.log('\n🔍 DESCOBERTA DE PARTIÇÕES');
  console.log('=====================================');
  
  const partitions = await users.listPartitions();
  console.log('Partições disponíveis:', JSON.stringify(partitions, null, 2));

  const regions = await users.getPartitionValues('region');
  console.log('\nRegiões disponíveis:', regions);

  const departments = await users.getPartitionValues('department');
  console.log('Departamentos disponíveis:', departments);

  // 5. LISTAGEM POR PARTIÇÃO
  console.log('\n📋 LISTAGEM POR PARTIÇÃO');
  console.log('=====================================');

  // Listar todos os usuários ativos
  const activeUsers = await users.listByPartition({ status: 'active' });
  console.log(`\n👥 Usuários ativos (${activeUsers.length}):`, 
    activeUsers.map(u => `${u.name} (${u.region})`));

  // Listar usuários de engenharia na região US
  const usEngineers = await users.listByPartition({ 
    region: 'US', 
    department: 'engineering' 
  });
  console.log(`\n💻 Engenheiros US (${usEngineers.length}):`, 
    usEngineers.map(u => `${u.name} - $${u.salary}`));

  // 6. BUSCA AVANÇADA COM CRITÉRIOS
  console.log('\n🔎 BUSCA AVANÇADA');
  console.log('=====================================');

  // Buscar usuários com salário > 100k na região US
  const highEarners = await users.findBy({
    region: 'US',              // Critério de partição (eficiente)
    salary: { $gt: 100000 }    // Critério de dados (filtrado após)
  }, {
    sortBy: 'salary',
    sortOrder: 'desc'
  });
  console.log(`\n💰 High earners US (${highEarners.length}):`, 
    highEarners.map(u => `${u.name} - $${u.salary}`));

  // Buscar com regex no nome
  const joaoUsers = await users.findBy({
    name: /joão/i,
    status: 'active'
  });
  console.log(`\n👤 Usuários com "João" no nome (${joaoUsers.length}):`, 
    joaoUsers.map(u => `${u.name} (${u.status})`));

  // 7. AGRUPAMENTO POR PARTIÇÃO
  console.log('\n📊 AGRUPAMENTO POR PARTIÇÃO');
  console.log('=====================================');

  // Agrupar por departamento
  const byDepartment = await users.groupBy('department');
  console.log('\n🏢 Usuários por departamento:');
  Object.entries(byDepartment).forEach(([dept, { items, count }]) => {
    console.log(`  ${dept}: ${count} usuários`);
    items.forEach(user => console.log(`    - ${user.name} (${user.region})`));
  });

  // Agrupar por região, apenas usuários ativos
  const activeByRegion = await users.groupBy('region', { status: 'active' });
  console.log('\n🌍 Usuários ativos por região:');
  Object.entries(activeByRegion).forEach(([region, { items, count }]) => {
    console.log(`  ${region}: ${count} usuários ativos`);
  });

  // 8. ESTATÍSTICAS DE PARTIÇÕES
  console.log('\n📈 ESTATÍSTICAS DE PARTIÇÕES');
  console.log('=====================================');

  const stats = await users.getPartitionStats();
  console.log('\nEstatísticas completas:');
  console.log(`Total de objetos: ${stats.totalObjects}`);
  console.log(`Campos de partição: ${stats.partitionFields.join(', ')}`);
  
  console.log('\nDistribuição por partição:');
  Object.entries(stats.partitionCounts).forEach(([field, counts]) => {
    console.log(`  ${field}:`);
    Object.entries(counts).forEach(([value, count]) => {
      console.log(`    ${value}: ${count} objetos`);
    });
  });

  // 9. LISTAGEM COM PAGINAÇÃO
  console.log('\n📄 PAGINAÇÃO');
  console.log('=====================================');

  const page1 = await users.listByPartition({ status: 'active' }, { 
    limit: 2, 
    offset: 0 
  });
  console.log(`\nPágina 1 - usuários ativos (${page1.length}):`, 
    page1.map(u => u.name));

  const page2 = await users.listByPartition({ status: 'active' }, { 
    limit: 2, 
    offset: 2 
  });
  console.log(`Página 2 - usuários ativos (${page2.length}):`, 
    page2.map(u => u.name));

  // 10. DEMONSTRAÇÃO DE PERFORMANCE
  console.log('\n⚡ DEMONSTRAÇÃO DE PERFORMANCE');
  console.log('=====================================');

  console.time('Busca por partição (eficiente)');
  const regionResults = await users.listByPartition({ region: 'US' });
  console.timeEnd('Busca por partição (eficiente)');
  console.log(`Resultados: ${regionResults.length} usuários`);

  console.time('Busca geral (menos eficiente)');
  const allResults = await users.findBy({ region: /US/ });
  console.timeEnd('Busca geral (menos eficiente)');
  console.log(`Resultados: ${allResults.length} usuários`);

  console.log('\n🎉 Exemplo de listagem com partições concluído!');
  console.log('\n💡 DICAS IMPORTANTES:');
  console.log('- Use partições para queries frequentes e grandes datasets');
  console.log('- Combine critérios de partição com filtros de dados para máxima eficiência');
  console.log('- listByPartition() é mais eficiente que findBy() para grandes volumes');
  console.log('- Partições são especialmente úteis para dados com estrutura temporal ou geográfica');
}

// Executar exemplo
partitionListingExample().catch(console.error);