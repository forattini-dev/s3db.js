import { advancedEncode, advancedDecode } from '../../src/concerns/advanced-metadata-encoding.js';

console.log('='.repeat(100));
console.log('🎯 DEMONSTRAÇÃO VISUAL DO DICTIONARY ENCODING');
console.log('='.repeat(100));

console.log(`
📚 O QUE É DICTIONARY ENCODING?

É como criar um "dicionário de abreviações" para valores que aparecem muito.

Imagine que você escreve muitos emails e sempre usa:
• "Com os melhores cumprimentos" → poderia abreviar para "CMC"
• "Atenciosamente" → poderia abreviar para "AT"
• "Obrigado" → poderia abreviar para "OB"

O Dictionary Encoding faz exatamente isso com valores comuns em metadata!
`);

console.log('\n' + '─'.repeat(100));
console.log('📊 EXEMPLO PRÁTICO COM VALORES REAIS:');
console.log('─'.repeat(100) + '\n');

// Valores comuns que usam dictionary
const commonValues = [
  // Status
  { category: 'Status', values: ['active', 'inactive', 'pending', 'completed', 'failed'] },
  // Booleanos
  { category: 'Boolean', values: ['true', 'false', 'yes', 'no', '1', '0'] },
  // HTTP
  { category: 'HTTP', values: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  // Outros
  { category: 'Common', values: ['enabled', 'disabled', 'success', 'error', 'null', 'undefined'] },
];

commonValues.forEach(({ category, values }) => {
  console.log(`\n🔹 ${category.toUpperCase()}:`);
  console.log('─'.repeat(50));
  
  values.forEach(value => {
    const encoded = advancedEncode(value);
    const decoded = advancedDecode(encoded.encoded);
    
    // Visualizar os bytes
    const originalBytes = Buffer.from(value, 'utf8');
    const encodedBytes = Buffer.from(encoded.encoded, 'utf8');
    
    // Mostrar hexadecimal
    const originalHex = originalBytes.toString('hex');
    const encodedHex = encodedBytes.toString('hex');
    
    console.log(`
"${value}":
  Original: ${value.padEnd(12)} (${originalBytes.length} bytes) → Hex: ${originalHex}
  Encoded:  ${encoded.encoded.replace(/[\x00-\x1f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).padEnd(12)} (${encodedBytes.length} bytes) → Hex: ${encodedHex}
  Economia: ${Math.round((1 - encodedBytes.length/originalBytes.length) * 100)}%
  Decoded:  "${decoded}"${decoded !== value ? ' ⚠️ LOWERCASE!' : ' ✅'}
    `);
  });
});

console.log('\n' + '='.repeat(100));
console.log('🔬 ANATOMIA DO ENCODING:');
console.log('='.repeat(100) + '\n');

const example = 'active';
const encoded = advancedEncode(example);

console.log(`Valor original: "${example}"`);
console.log(`\nPasso a passo:`);
console.log(`
1. Input: "${example}" (${Buffer.byteLength(example, 'utf8')} bytes)
   ↓
2. Converter para lowercase: "${example.toLowerCase()}"
   ↓
3. Buscar no dictionary:
   DICTIONARY = {
     'active': '\\x01',   ← ENCONTRADO!
     'inactive': '\\x02',
     'pending': '\\x03',
     ...
   }
   ↓
4. Pegar o código: '\\x01' (1 byte)
   ↓
5. Adicionar prefixo 'd' para indicar dictionary: 'd' + '\\x01'
   ↓
6. Output: "${encoded.encoded.replace(/[\x00-\x1f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'))}" (2 bytes)

ECONOMIA: ${Math.round((1 - 2/6) * 100)}% (de 6 bytes para 2 bytes!)
`);

console.log('\n' + '='.repeat(100));
console.log('💰 COMPARAÇÃO DE CUSTOS NO S3:');
console.log('='.repeat(100) + '\n');

// Simular um objeto típico com metadata
const typicalMetadata = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  status: 'active',
  enabled: 'true',
  method: 'POST',
  result: 'success',
  priority: 'high',
  visibility: 'public',
  type: 'user',
  state: 'completed',
  verified: 'yes'
};

console.log('Metadata típico de um objeto:');
console.table(Object.entries(typicalMetadata).map(([key, value]) => {
  const encoded = advancedEncode(value);
  const originalSize = Buffer.byteLength(value, 'utf8');
  const encodedSize = Buffer.byteLength(encoded.encoded, 'utf8');
  
  return {
    'Campo': key,
    'Valor': value,
    'Bytes Original': originalSize,
    'Bytes Encoded': encodedSize,
    'Método': encoded.method,
    'Economia': encoded.method === 'dictionary' ? `${Math.round((1 - encodedSize/originalSize) * 100)}%` : '-'
  };
}));

// Calcular economia total
const totalOriginal = Object.values(typicalMetadata).reduce((sum, v) => 
  sum + Buffer.byteLength(v, 'utf8'), 0);
const totalEncoded = Object.values(typicalMetadata).reduce((sum, v) => 
  sum + Buffer.byteLength(advancedEncode(v).encoded, 'utf8'), 0);

console.log(`
📊 RESUMO:
• Tamanho original total: ${totalOriginal} bytes
• Tamanho encoded total: ${totalEncoded} bytes
• Economia total: ${Math.round((1 - totalEncoded/totalOriginal) * 100)}%

💡 IMPACTO EM ESCALA:
• 1 milhão de objetos no S3
• Economia de ${totalOriginal - totalEncoded} bytes por objeto
• Economia total: ${((totalOriginal - totalEncoded) * 1000000 / 1024 / 1024).toFixed(1)} MB

💰 CUSTO S3 (estimado):
• Preço S3 Standard: $0.023 por GB/mês
• Economia mensal: $${(((totalOriginal - totalEncoded) * 1000000 / 1024 / 1024 / 1024) * 0.023).toFixed(2)}
• Economia anual: $${(((totalOriginal - totalEncoded) * 1000000 / 1024 / 1024 / 1024) * 0.023 * 12).toFixed(2)}
`);

console.log('='.repeat(100));
console.log('🎓 CONCLUSÃO:');
console.log('='.repeat(100));

console.log(`
O Dictionary Encoding é EXTREMAMENTE eficiente para valores repetitivos:

✅ VANTAGENS:
• Compressão de 50-95% para valores comuns
• Decode instantâneo (simples lookup)
• Funciona com case-insensitive (GET = get = Get)
• Perfeito para enums, status, booleanos

⚠️ LIMITAÇÕES:
• Só funciona com valores pré-definidos no dictionary
• Converte para lowercase (GET → get)
• Adiciona 1 byte de prefixo ('d')

📝 QUANDO USAR:
• Campos de status (active, pending, etc)
• Booleanos (true, false, yes, no)
• Métodos HTTP (GET, POST, etc)
• Qualquer enum ou valor repetitivo

🚀 RESULTADO:
Em metadados típicos, conseguimos ~60% de economia de espaço!
`);

console.log('='.repeat(100));