import { metadataEncode } from '../../src/concerns/metadata-encoding.js';
import { optimizedEncode, compareEncodings } from '../src/concerns/optimized-encoding.js';

console.log('='.repeat(150));
console.log('COMPARAÇÃO FINAL: Base64 sempre vs Smart (com prefixos) vs Otimizado (sem prefixos quando possível)');
console.log('='.repeat(150));

const realCases = [
  // IDs e tokens (mais comuns em metadados)
  'user_123456',
  'session_abc123xyz',
  'txn-2024-01-15-001',
  'v2.5.1',
  '2024-01-15T10:30:00Z',
  
  // Nomes com acentos (comum no Brasil)
  'João Silva',
  'Maria José',
  'São Paulo',
  'Ação Completa',
  
  // Textos mistos
  'Status: OK',
  'Pedido #123',
  'R$ 1.500,00',
  
  // Com emoji
  'Aprovado ✅',
  'Nota: ⭐⭐⭐⭐⭐',
  
  // Asiático
  '李明',
  '東京',
  
  // Casos especiais
  'null',
  'true',
  'false',
  '{}',
  '[]',
  
  // Strings que parecem base64
  'AbCd1234=',
  'SGVsbG8=',
];

console.log('\nTABELA COMPARATIVA DETALHADA:');
console.log('─'.repeat(150));
console.log(
  'Valor'.padEnd(25) + '│' +
  'Bytes'.padEnd(7) + '│' +
  'Base64'.padEnd(8) + '│' +
  'Smart'.padEnd(8) + '│' +
  'Método'.padEnd(10) + '│' +
  'Otimiz'.padEnd(8) + '│' +
  'Método'.padEnd(12) + '│' +
  'Economia vs B64'.padEnd(16) + '│' +
  'Economia vs Smart'
);
console.log('─'.repeat(150));

let totalOriginal = 0;
let totalBase64 = 0;
let totalSmart = 0;
let totalOptimized = 0;

realCases.forEach(value => {
  const comp = compareEncodings(value);
  const smartResult = metadataEncode(value);
  
  totalOriginal += comp.original;
  totalBase64 += comp.base64Pure;
  totalSmart += smartResult.encoded.length;
  totalOptimized += comp.optimized;
  
  const savingsVsBase64 = ((1 - comp.optimized/comp.base64Pure) * 100).toFixed(1);
  const savingsVsSmart = ((1 - comp.optimized/smartResult.encoded.length) * 100).toFixed(1);
  
  console.log(
    value.padEnd(25).substring(0, 25) + '│' +
    String(comp.original).padStart(6) + ' │' +
    String(comp.base64Pure).padStart(7) + ' │' +
    String(smartResult.encoded.length).padStart(7) + ' │' +
    smartResult.encoding.padEnd(10).substring(0, 10) + '│' +
    String(comp.optimized).padStart(7) + ' │' +
    comp.optimizedMethod.padEnd(12).substring(0, 12) + '│' +
    (savingsVsBase64 + '%').padStart(15) + ' │' +
    (savingsVsSmart + '%').padStart(15)
  );
});

console.log('─'.repeat(150));

// Resumo
console.log('\n📊 RESUMO ESTATÍSTICO:');
console.log('─'.repeat(80));
console.log(`Tamanho original total: ${totalOriginal} bytes`);
console.log(`Base64 sempre: ${totalBase64} bytes (+${((totalBase64/totalOriginal - 1) * 100).toFixed(1)}%)`);
console.log(`Smart com prefixos: ${totalSmart} bytes (+${((totalSmart/totalOriginal - 1) * 100).toFixed(1)}%)`);
console.log(`Otimizado minimal: ${totalOptimized} bytes (+${((totalOptimized/totalOriginal - 1) * 100).toFixed(1)}%)`);
console.log('─'.repeat(80));
console.log(`Economia vs Base64: ${totalBase64 - totalOptimized} bytes (${((1 - totalOptimized/totalBase64) * 100).toFixed(1)}%)`);
console.log(`Economia vs Smart: ${totalSmart - totalOptimized} bytes (${((1 - totalOptimized/totalSmart) * 100).toFixed(1)}%)`);

// Análise específica
console.log('\n🔍 CASOS INTERESSANTES:');
console.log('─'.repeat(80));

const interesting = [
  { value: 'user_123456', desc: 'ID típico' },
  { value: 'João Silva', desc: 'Nome brasileiro' },
  { value: 'Aprovado ✅', desc: 'Com emoji' },
  { value: 'SGVsbG8=', desc: 'Parece base64' },
  { value: '李明', desc: 'Chinês' }
];

interesting.forEach(({ value, desc }) => {
  const comp = compareEncodings(value);
  const smart = metadataEncode(value);
  const opt = optimizedEncode(value);
  
  console.log(`\n"${value}" (${desc}):`);
  console.log(`  Original: ${comp.original} bytes`);
  console.log(`  Base64 puro: ${comp.base64Pure} bytes`);
  console.log(`  Smart (${smart.encoding}): "${smart.encoded}" = ${smart.encoded.length} bytes`);
  console.log(`  Otimizado (${comp.optimizedMethod}): "${opt}" = ${opt.length} bytes`);
  
  if (opt.length < smart.encoded.length) {
    console.log(`  ✅ Otimizado economiza ${smart.encoded.length - opt.length} bytes vs Smart`);
  }
});

console.log('\n' + '='.repeat(150));
console.log('CONCLUSÃO:');
console.log('='.repeat(150));
console.log(`
A abordagem otimizada SEM prefixos quando possível oferece:

1. ZERO overhead para ASCII puro (mais comum em IDs, timestamps, etc)
2. Apenas 1 byte de prefixo (% ou !) quando necessário (vs 2 bytes u: ou b:)
3. Escolha automática entre URL encoding e Base64 baseada no menor tamanho
4. Tratamento especial para strings que parecem base64 (adiciona ! para distinguir)

Resultado: ${((1 - totalOptimized/totalBase64) * 100).toFixed(1)}% de economia vs base64 puro
          ${((1 - totalOptimized/totalSmart) * 100).toFixed(1)}% de economia vs smart com prefixos de 2 bytes
`);