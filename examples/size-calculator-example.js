import { calculateAttributeSizes, calculateTotalSize, getSizeBreakdown } from '../src/concerns/calculator.js';

// Exemplo de um objeto mapeado (como retornado pelo schema.mapper())
const mappedObject = {
  '_v': '1',
  'name': 'João Silva',
  'age': '30',
  'active': '1',
  'tags': 'admin|user|moderator',
  'metadata': '{"lastLogin":"2024-01-15","preferences":{"theme":"dark"}}',
  'bio': 'Desenvolvedor full-stack com experiência em Node.js e React',
  'empty_array': '[]',
  'null_value': '',
  'unicode_text': 'Olá mundo! 🌍 你好世界!'
};

console.log('=== Exemplo de Cálculo de Tamanho em Bytes ===\n');

// 1. Calcular tamanho de cada atributo
const attributeSizes = calculateAttributeSizes(mappedObject);
console.log('Tamanho de cada atributo:');
Object.entries(attributeSizes).forEach(([key, size]) => {
  console.log(`  ${key}: ${size} bytes`);
});

console.log('\n' + '='.repeat(50) + '\n');

// 2. Calcular tamanho total
const totalSize = calculateTotalSize(mappedObject);
console.log(`Tamanho total: ${totalSize} bytes`);

console.log('\n' + '='.repeat(50) + '\n');

// 3. Obter breakdown detalhado
const breakdown = getSizeBreakdown(mappedObject);
console.log('Breakdown detalhado (ordenado por tamanho):');
breakdown.breakdown.forEach(item => {
  console.log(`  ${item.attribute}: ${item.size} bytes (${item.percentage})`);
});

console.log(`\nTotal: ${breakdown.total} bytes`);

console.log('\n' + '='.repeat(50) + '\n');

// 4. Exemplo com diferentes tipos de dados
console.log('Exemplos de diferentes tipos de dados:');

const examples = {
  'ASCII string': 'Hello World',
  'Unicode string': 'Olá mundo! 🌍',
  'Number as string': '12345',
  'Boolean true': '1',
  'Boolean false': '0',
  'Empty array': '[]',
  'Array with items': 'item1|item2|item3',
  'JSON object': '{"key":"value","number":42}',
  'Empty string': '',
  'Null/undefined': ''
};

console.log('\nTamanho em bytes de diferentes tipos:');
Object.entries(examples).forEach(([description, value]) => {
  const size = calculateAttributeSizes({ test: value }).test;
  console.log(`  ${description}: ${size} bytes`);
}); 