import { advancedEncode, advancedDecode } from '../../src/concerns/advanced-metadata-encoding.js';

console.log('='.repeat(120));
console.log('📚 DICIONÁRIO COMPLETO DE ENCODING - VISUALIZAÇÃO DETALHADA');
console.log('='.repeat(120));

// O dicionário completo
const DICTIONARY = {
  // Status values (0x01-0x08)
  'active': '\x01',
  'inactive': '\x02',
  'pending': '\x03',
  'completed': '\x04',
  'failed': '\x05',
  'deleted': '\x06',
  'archived': '\x07',
  'draft': '\x08',
  
  // Booleans (0x10-0x15)
  'true': '\x10',
  'false': '\x11',
  'yes': '\x12',
  'no': '\x13',
  '1': '\x14',
  '0': '\x15',
  
  // HTTP methods (0x20-0x26)
  'get': '\x20',
  'post': '\x21',
  'put': '\x22',
  'delete': '\x23',
  'patch': '\x24',
  'head': '\x25',
  'options': '\x26',
  
  // Common words (0x30-0x37)
  'enabled': '\x30',
  'disabled': '\x31',
  'success': '\x32',
  'error': '\x33',
  'warning': '\x34',
  'info': '\x35',
  'debug': '\x36',
  'critical': '\x37',
  
  // Null-like values (0x40-0x44)
  'null': '\x40',
  'undefined': '\x41',
  'none': '\x42',
  'empty': '\x43',
  'nil': '\x44',
};

console.log('\n📋 TABELA COMPLETA DO DICIONÁRIO:');
console.log('─'.repeat(120));

// Organizar por categoria
const categories = [
  { 
    name: '🔹 STATUS VALUES', 
    range: '(0x01-0x08)',
    description: 'Estados comuns de objetos/processos',
    keys: ['active', 'inactive', 'pending', 'completed', 'failed', 'deleted', 'archived', 'draft'] 
  },
  { 
    name: '🔹 BOOLEANS', 
    range: '(0x10-0x15)',
    description: 'Valores booleanos e binários',
    keys: ['true', 'false', 'yes', 'no', '1', '0'] 
  },
  { 
    name: '🔹 HTTP METHODS', 
    range: '(0x20-0x26)',
    description: 'Métodos HTTP (armazenados em lowercase)',
    keys: ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] 
  },
  { 
    name: '🔹 COMMON WORDS', 
    range: '(0x30-0x37)',
    description: 'Palavras comuns em logs e configurações',
    keys: ['enabled', 'disabled', 'success', 'error', 'warning', 'info', 'debug', 'critical'] 
  },
  { 
    name: '🔹 NULL-LIKE VALUES', 
    range: '(0x40-0x44)',
    description: 'Valores que representam ausência',
    keys: ['null', 'undefined', 'none', 'empty', 'nil'] 
  },
];

categories.forEach(category => {
  console.log(`\n${category.name} ${category.range}`);
  console.log(`📝 ${category.description}`);
  console.log('─'.repeat(80));
  
  const tableData = category.keys.map(key => {
    const code = DICTIONARY[key];
    const hexCode = '0x' + code.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase();
    const decimalCode = code.charCodeAt(0);
    
    // Testar encoding/decoding
    const encoded = advancedEncode(key);
    const decoded = advancedDecode(encoded.encoded);
    
    // Calcular economia
    const originalSize = Buffer.byteLength(key, 'utf8');
    const encodedSize = 2; // sempre 2 bytes (prefixo 'd' + código)
    const savings = Math.round((1 - encodedSize/originalSize) * 100);
    
    return {
      'String': key,
      'Hex Code': hexCode,
      'Decimal': decimalCode,
      'Bytes Orig': originalSize,
      'Bytes Enc': encodedSize,
      'Economia': `${savings}%`,
      'Encoded': 'd' + hexCode.toLowerCase().replace('0x', '\\x'),
      'Decoded': decoded === key ? '✅' : `⚠️ ${decoded}`
    };
  });
  
  console.table(tableData);
});

console.log('\n' + '='.repeat(120));
console.log('📊 ESTATÍSTICAS DO DICIONÁRIO:');
console.log('='.repeat(120) + '\n');

const allKeys = Object.keys(DICTIONARY);
const totalEntries = allKeys.length;
const totalOriginalBytes = allKeys.reduce((sum, key) => sum + Buffer.byteLength(key, 'utf8'), 0);
const totalEncodedBytes = allKeys.length * 2; // todos viram 2 bytes
const averageSavings = Math.round((1 - totalEncodedBytes/totalOriginalBytes) * 100);

console.log(`📈 Resumo Geral:`);
console.log(`  • Total de entradas: ${totalEntries}`);
console.log(`  • Bytes originais (soma): ${totalOriginalBytes}`);
console.log(`  • Bytes encoded (soma): ${totalEncodedBytes}`);
console.log(`  • Economia média: ${averageSavings}%`);
console.log(`  • Faixas de códigos usadas:`);
console.log(`    - 0x01-0x08: Status (8 valores)`);
console.log(`    - 0x10-0x15: Booleans (6 valores)`);
console.log(`    - 0x20-0x26: HTTP (7 valores)`);
console.log(`    - 0x30-0x37: Common (8 valores)`);
console.log(`    - 0x40-0x44: Null-like (5 valores)`);

console.log('\n' + '='.repeat(120));
console.log('🎯 EXEMPLOS DE USO REAL:');
console.log('='.repeat(120) + '\n');

// Exemplos práticos
const examples = [
  {
    original: { status: 'active', enabled: 'true', method: 'POST' },
    description: 'Configuração típica de API endpoint'
  },
  {
    original: { state: 'completed', success: 'true', errors: 'none' },
    description: 'Resultado de processo'
  },
  {
    original: { visibility: 'public', status: 'draft', deleted: 'false' },
    description: 'Estado de documento'
  },
];

examples.forEach((example, idx) => {
  console.log(`\n📌 Exemplo ${idx + 1}: ${example.description}`);
  console.log('─'.repeat(60));
  
  const results = Object.entries(example.original).map(([key, value]) => {
    const encoded = advancedEncode(value);
    const originalSize = Buffer.byteLength(value, 'utf8');
    const encodedSize = Buffer.byteLength(encoded.encoded, 'utf8');
    
    return {
      Campo: key,
      'Valor Original': value,
      'Tamanho Orig': originalSize,
      'Valor Encoded': encoded.encoded.replace(/[\x00-\x1f]/g, c => 
        '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')),
      'Tamanho Enc': encodedSize,
      'Método': encoded.method,
      'Economia': encoded.method === 'dictionary' ? 
        `${Math.round((1 - encodedSize/originalSize) * 100)}%` : '-'
    };
  });
  
  console.table(results);
  
  const totalOrig = results.reduce((sum, r) => sum + r['Tamanho Orig'], 0);
  const totalEnc = results.reduce((sum, r) => sum + r['Tamanho Enc'], 0);
  console.log(`  💾 Total: ${totalOrig} bytes → ${totalEnc} bytes (economia: ${Math.round((1 - totalEnc/totalOrig) * 100)}%)`);
});

console.log('\n' + '='.repeat(120));
console.log('💡 OBSERVAÇÕES IMPORTANTES:');
console.log('='.repeat(120) + '\n');

console.log(`
1️⃣ CASE INSENSITIVE:
   • O dicionário usa lowercase internamente
   • "GET", "get", "Get" → todos viram "get" → '\x20'
   • Importante: ao decodificar sempre retorna lowercase!

2️⃣ PREFIXO 'd':
   • Todo valor do dicionário é prefixado com 'd'
   • Exemplo: "active" → 'd\x01' (d + código)
   • Isso permite detectar que é um valor de dicionário

3️⃣ CÓDIGOS HEXADECIMAIS:
   • Organizados em faixas lógicas:
     - 0x01-0x0F: Status e estados
     - 0x10-0x1F: Valores booleanos
     - 0x20-0x2F: Métodos e verbos
     - 0x30-0x3F: Palavras comuns
     - 0x40-0x4F: Valores nulos

4️⃣ ECONOMIA MÁXIMA:
   • "undefined" (9 bytes) → "d\x41" (2 bytes) = 78% economia!
   • "completed" (9 bytes) → "d\x04" (2 bytes) = 78% economia!
   • Média geral: ${averageSavings}% de economia

5️⃣ QUANDO NÃO USA DICIONÁRIO:
   • Valores não listados usam outros métodos
   • Exemplo: "custom_value" → usa encoding normal
   • UUIDs, timestamps, hashes têm seus próprios métodos

6️⃣ EXPANSIBILIDADE:
   • Ainda há espaço para mais valores:
     - 0x09-0x0F: 7 slots livres para mais status
     - 0x16-0x1F: 10 slots livres para mais booleans
     - 0x27-0x2F: 9 slots livres para mais métodos
     - 0x38-0x3F: 8 slots livres para mais palavras
     - 0x45-0x4F: 11 slots livres para mais null-like
   • Total: 45 slots disponíveis para expansão futura!
`);

console.log('='.repeat(120));