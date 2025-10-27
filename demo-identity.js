/**
 * 🚀 Demo: Identity Provider Plugin
 *
 * Este exemplo demonstra o Identity Provider funcionando.
 *
 * Acesse: http://localhost:4000/login
 */

import { Database } from './src/index.js';
import { IdentityPlugin } from './src/plugins/identity/index.js';
import bcrypt from 'bcrypt';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9100/identity-demo'
});

async function main() {
  console.log('🔧 Inicializando S3DB...');
  await db.initialize();

  console.log('🔧 Criando Identity Provider...');
  const identityPlugin = new IdentityPlugin({
    issuer: 'http://localhost:4000',
    database: db,

    // Configuração simplificada para demo
    registration: {
      enabled: true,
      requireEmailVerification: false // Desabilitado para facilitar demo
    },

    passwordPolicy: {
      minLength: 6,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSymbols: false,
      bcryptRounds: 8
    },

    email: {
      enabled: false // Desabilitado para demo
    },

    ui: {
      companyName: 'S3DB Demo',
      tagline: 'Identity Provider Demo',
      primaryColor: '#0066CC',
      successColor: '#00B894'
    },

    server: {
      port: 4000,
      host: '0.0.0.0',
      verbose: true
    }
  });

  console.log('🔧 Inicializando Identity Provider...');
  await identityPlugin.initialize();

  // Criar usuário admin de demonstração
  console.log('👤 Criando usuário admin de demonstração...');
  const usersResource = db.resources.users;

  try {
    const passwordHash = await bcrypt.hash('admin123', 8);

    await usersResource.insert({
      email: 'admin@demo.com',
      name: 'Admin Demo',
      passwordHash: passwordHash,
      status: 'active',
      emailVerified: true,
      role: 'admin'
    });

    console.log('✅ Usuário admin criado:');
    console.log('   Email: admin@demo.com');
    console.log('   Senha: admin123');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Usuário admin já existe');
    } else {
      throw error;
    }
  }

  // Criar usuário normal de demonstração
  console.log('👤 Criando usuário normal de demonstração...');
  try {
    const passwordHash = await bcrypt.hash('user123', 8);

    await usersResource.insert({
      email: 'user@demo.com',
      name: 'User Demo',
      passwordHash: passwordHash,
      status: 'active',
      emailVerified: true,
      role: 'user'
    });

    console.log('✅ Usuário normal criado:');
    console.log('   Email: user@demo.com');
    console.log('   Senha: user123');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Usuário normal já existe');
    } else {
      throw error;
    }
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log('');
  console.log('🎉 Identity Provider está rodando!');
  console.log('');
  console.log('🌐  URLs:');
  console.log('   Login:         http://localhost:4000/login');
  console.log('   Registro:      http://localhost:4000/register');
  console.log('   Admin Panel:   http://localhost:4000/admin');
  console.log('   Perfil:        http://localhost:4000/profile');
  console.log('');
  console.log('🔑 Credenciais de Teste:');
  console.log('   Admin:  admin@demo.com / admin123');
  console.log('   User:   user@demo.com / user123');
  console.log('');
  console.log('📚 Features disponíveis:');
  console.log('   ✅ Login/Logout');
  console.log('   ✅ Registro de novos usuários');
  console.log('   ✅ Admin Panel (usuário admin)');
  console.log('   ✅ Gerenciamento de perfil');
  console.log('   ✅ OAuth2/OIDC endpoints');
  console.log('');
  console.log('💡 Dica: Faça login como admin para acessar o painel administrativo!');
  console.log('');
  console.log('━'.repeat(60));
  console.log('');
  console.log('Pressione Ctrl+C para parar o servidor');
  console.log('');
}

main().catch(error => {
  console.error('❌ Erro:', error.message);
  process.exit(1);
});
