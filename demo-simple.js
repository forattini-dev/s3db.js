/**
 * Demo Simples: S3DB com tipo secret (sem bcrypt)
 */

import S3db from './src/index.js';

console.log('🚀 Criando banco de dados...');

const db = new S3db({
  connectionString: 'http://minioadmin:minioadmin@localhost:9100/demo-identity'
});

await db.connect();

console.log('✅ Banco inicializado!');
console.log('📦 Resources disponíveis:', Object.keys(db.resources));

// Criar um resource simples de usuários
console.log('\n📝 Criando resource de usuários...');

await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    password: 'secret|required',  // secret type = encrypted automaticamente!
    role: 'string',
    status: 'string'
  },
  timestamps: true
});

console.log('✅ Resource "users" criado!');

// Criar um usuário demo
console.log('\n👤 Criando usuário demo...');

const user = await db.resources.users.insert({
  email: 'demo@test.com',
  name: 'Demo User',
  password: 'senha123',  // Será criptografado automaticamente!
  role: 'admin',
  status: 'active'
});

console.log('✅ Usuário criado:', { id: user.id, email: user.email, name: user.name });
console.log('🔐 Password está criptografado no S3:', user.password.substring(0, 30) + '...');

// Buscar o usuário
console.log('\n🔍 Buscando usuário...');

const found = await db.resources.users.get(user.id);

console.log('✅ Usuário encontrado:', {
  id: found.id,
  email: found.email,
  password: found.password.substring(0, 30) + '...'  // Ainda criptografado
});

console.log('\n━'.repeat(60));
console.log('🎉 Demo concluído!');
console.log('\n💡 O tipo "secret" no schema criptografa automaticamente usando');
console.log('   as funções encrypt/decrypt nativas do S3DB (AES-256-GCM)');
console.log('\n📚 Vantagens sobre bcrypt externo:');
console.log('   ✅ Zero dependências externas');
console.log('   ✅ Integrado com o S3DB');
console.log('   ✅ Usa PBKDF2 com 100k iterations');
console.log('   ✅ Suporta qualquer tipo de secret, não só passwords');
console.log('━'.repeat(60));

process.exit(0);
