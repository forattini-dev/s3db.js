import { Resource } from '../src/index.js';
import { setupDatabase, teardownDatabase } from './database.js';

// Criar um resource simples para testar o mapeamento base36
const testResource = new Resource({
  name: 'test-users',
  client: null, // Não precisamos de cliente para testar o schema
  attributes: {
    name: 'string|required',
    email: 'string|required',
    age: 'number|optional',
    active: 'boolean|optional',
    password: 'secret|required',
    profile: {
      bio: 'string|optional',
      avatar: 'string|optional'
    },
    settings: {
      notifications: 'boolean|optional',
      theme: 'string|optional'
    }  await teardownDatabase();

  },
  passphrase: 'test-secret'
});

console.log('=== Teste de Mapeamento Base36 ===');
console.log('Schema Map:', testResource.schema.map);
console.log('Schema ReversedMap:', testResource.schema.reversedMap);

// Testar o mapeamento
const testData = {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  active: true,
  password: 'secret123',
  profile: {
    bio: 'Software Developer',
    avatar: 'https://example.com/avatar.jpg'
  },
  settings: {
    notifications: true,
    theme: 'dark'
  }
};

console.log('\n=== Teste de Mapper/Unmapper ===');
console.log('Dados originais:', testData);

// Testar mapper
testResource.schema.mapper(testData).then(mapped => {
  console.log('Dados mapeados:', mapped);
  
  // Testar unmapper
  return testResource.schema.unmapper(mapped);
}).then(unmapped => {
  console.log('Dados desmapeados:', unmapped);
  
  // Verificar se os dados são idênticos
  const isIdentical = JSON.stringify(testData) === JSON.stringify(unmapped);
  console.log('Dados são idênticos?', isIdentical);
  
  if (!isIdentical) {
    console.log('Diferenças encontradas!');
    console.log('Original:', JSON.stringify(testData, null, 2));
    console.log('Unmapped:', JSON.stringify(unmapped, null, 2));
  }
}).catch(error => {
  console.error('Erro no teste:', error);
}); 