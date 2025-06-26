import S3db from '../src/index.js';

// Exemplo CORRETO de partições nomeadas
async function correctPartitionsExample() {
  console.log('🎯 CORRECT Partitions Example\n');

  // 1. Setup database
  const db = new S3db({
    connectionString: 'http://localhost:9000/correct-partitions?accessKeyId=s3db&secretAccessKey=thisissecret&forcePathStyle=true',
    verbose: true
  });

  await db.connect();

  // 2. Criar resource com PARTIÇÕES NOMEADAS
  const users = await db.createResource({
    name: 'users',
    attributes: {
      name: 'string',
      email: 'string',
      region: 'string',
      department: 'string',
      status: 'string',
    },
    options: {
      timestamps: true,  // Automaticamente adiciona byCreatedDate e byUpdatedDate
      partitions: {
        // Nome da partição: { field: 'campo', rule: 'regra' }
        byRegion: {
          field: 'region',
          rule: 'string|maxlength:2'  // US-WEST → US
        },
        byDepartment: {
          field: 'department', 
          rule: 'string'              // engineering, sales, marketing
        },
        byStatus: {
          field: 'status',
          rule: 'string'              // active, inactive, pending
        }
        // byCreatedDate e byUpdatedDate são adicionadas automaticamente pelo timestamps: true
      }
    }
  });

  console.log('✅ Resource criado com partições nomeadas:');
  console.log('Partições:', Object.keys(users.options.partitions));

  // 3. Inserir dados (objetos principais + referências nas partições)
  const userData = [
    { name: 'João Silva', email: 'joao@empresa.com', region: 'US-WEST', department: 'engineering', status: 'active' },
    { name: 'Maria Santos', email: 'maria@empresa.com', region: 'EU-NORTH', department: 'sales', status: 'active' },
    { name: 'Carlos Lima', email: 'carlos@empresa.com', region: 'AS-EAST', department: 'marketing', status: 'pending' }
  ];

  console.log('\n📝 Inserindo usuários...');
  for (const user of userData) {
    const inserted = await users.insert(user);
    console.log(`   → ${user.name} inserido com ID: ${inserted.id}`);
    console.log(`     Objeto principal: /resource=users/v=1/id=${inserted.id}`);
    console.log(`     Referência byRegion: /resource=users/partitions/byRegion/region=US/id=${inserted.id}`);
    console.log(`     Referência byDepartment: /resource=users/partitions/byDepartment/department=${user.department}/id=${inserted.id}`);
    console.log(`     Referência byStatus: /resource=users/partitions/byStatus/status=${user.status}/id=${inserted.id}`);
  }

  // 4. LISTAGEM SIMPLES (sem partições)
  console.log('\n📋 LISTAGEM SIMPLES (todos os usuários)');
  console.log('=====================================');
  
  const allUsers = await users.listByPartition();
  console.log(`Total de usuários: ${allUsers.length}`);
  allUsers.forEach(user => console.log(`  - ${user.name} (${user.region}/${user.department}/${user.status})`));

  // 5. LISTAGEM POR PARTIÇÃO NOMEADA
  console.log('\n🗂️ LISTAGEM POR PARTIÇÃO');
  console.log('=====================================');

  // Listar usuários ativos (usando partição byStatus)
  console.log('\n👥 Usuários ATIVOS (partição: byStatus):');
  const activeUsers = await users.listByPartition('byStatus', 'active');
  activeUsers.forEach(user => console.log(`  - ${user.name} (${user.region})`));

  // Listar usuários da região US (usando partição byRegion)  
  console.log('\n🇺🇸 Usuários da região US (partição: byRegion):');
  const usUsers = await users.listByPartition('byRegion', 'US');
  usUsers.forEach(user => console.log(`  - ${user.name} (${user.department})`));

  // Listar usuários de engenharia (usando partição byDepartment)
  console.log('\n💻 Usuários de Engineering (partição: byDepartment):');
  const engineeringUsers = await users.listByPartition('byDepartment', 'engineering');  
  engineeringUsers.forEach(user => console.log(`  - ${user.name} (${user.region})`));

  // 6. CONTAGEM POR PARTIÇÃO
  console.log('\n📊 CONTAGEM POR PARTIÇÃO');
  console.log('=====================================');

  const totalUsers = await users.count();
  console.log(`Total geral: ${totalUsers}`);

  const activeCount = await users.count('byStatus', 'active');
  console.log(`Usuários ativos: ${activeCount}`);

  const usCount = await users.count('byRegion', 'US');
  console.log(`Usuários US: ${usCount}`);

  const engineeringCount = await users.count('byDepartment', 'engineering');
  console.log(`Usuários Engineering: ${engineeringCount}`);

  // 7. PAGINAÇÃO COM PARTIÇÕES
  console.log('\n📄 PAGINAÇÃO COM PARTIÇÕES');
  console.log('=====================================');

  const page1 = await users.page(0, 2, 'byStatus', 'active');
  console.log(`Página 1 (${page1.items.length} de ${page1.totalItems}):`, 
    page1.items.map(u => u.name));

  // 8. DEMONSTRAÇÃO DA ESTRUTURA CORRETA
  console.log('\n🏗️ ESTRUTURA DE ARQUIVOS NO S3');
  console.log('=====================================');
  console.log('✅ OBJETOS PRINCIPAIS (dados completos):');
  console.log('  /resource=users/v=1/id=abc123  (João Silva)');
  console.log('  /resource=users/v=1/id=def456  (Maria Santos)');
  console.log('  /resource=users/v=1/id=ghi789  (Carlos Lima)');
  
  console.log('\n✅ REFERÊNCIAS DE PARTIÇÃO (ponteiros):');
  console.log('  /resource=users/partitions/byRegion/region=US/id=abc123  → aponta para objeto principal');
  console.log('  /resource=users/partitions/byRegion/region=EU/id=def456  → aponta para objeto principal');
  console.log('  /resource=users/partitions/byDepartment/department=engineering/id=abc123  → aponta para objeto principal');
  console.log('  /resource=users/partitions/byStatus/status=active/id=abc123  → aponta para objeto principal');

  console.log('\n🎉 Exemplo de partições CORRETAS concluído!');
  console.log('\n💡 PONTOS IMPORTANTES:');
  console.log('- Objetos SEMPRE salvos no path versionado principal');
  console.log('- Partições são REFERÊNCIAS que apontam para o objeto principal');
  console.log('- Partições têm NOMES para facilitar uso na listagem');
  console.log('- Timestamps automáticos criam partições byCreatedDate e byUpdatedDate');
  console.log('- Listagem eficiente usando prefix S3 nas partições');
}

// Executar exemplo
correctPartitionsExample().catch(console.error);