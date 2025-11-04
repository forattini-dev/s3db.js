import { metadataEncode, calculateEncodedSize } from '../../src/concerns/metadata-encoding.js';

console.log('='.repeat(120));
console.log('COMPARAÇÃO: SOLUÇÃO ANTERIOR (base64 para tudo) vs SOLUÇÃO NOVA (encoding inteligente)');
console.log('='.repeat(120));

// Casos reais de uso comum em aplicações
const realWorldCases = [
  // Dados de usuário brasileiro
  {
    campo: 'nome_usuario',
    valor: 'João Silva',
    contexto: 'Nome brasileiro comum'
  },
  {
    campo: 'endereco',
    valor: 'Rua das Flores, 123 - São Paulo',
    contexto: 'Endereço brasileiro'
  },
  {
    campo: 'empresa',
    valor: 'Inovação & Tecnologia Ltda',
    contexto: 'Nome de empresa'
  },
  {
    campo: 'descricao',
    valor: 'Especialista em programação',
    contexto: 'Descrição profissional'
  },
  
  // IDs e códigos
  {
    campo: 'user_id',
    valor: 'usr_1234567890abcdef',
    contexto: 'ID de usuário'
  },
  {
    campo: 'session_token',
    valor: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    contexto: 'Token JWT (parte)'
  },
  {
    campo: 'transaction_id',
    valor: 'txn-2024-01-15-987654',
    contexto: 'ID de transação'
  },
  
  // Dados internacionais
  {
    campo: 'cliente_frances',
    valor: 'François Château',
    contexto: 'Nome francês'
  },
  {
    campo: 'produto_alemao',
    valor: 'Müller Großhandel GmbH',
    contexto: 'Empresa alemã'
  },
  {
    campo: 'restaurante',
    valor: 'José María - Paella & Tapas',
    contexto: 'Nome de restaurante espanhol'
  },
  
  // Campos com emoji (comuns em apps modernas)
  {
    campo: 'status_message',
    valor: 'Entrega realizada com sucesso ✅',
    contexto: 'Mensagem com emoji'
  },
  {
    campo: 'feedback',
    valor: 'Ótimo produto! 🌟🌟🌟🌟🌟',
    contexto: 'Avaliação com estrelas'
  },
  
  // Dados asiáticos
  {
    campo: 'nome_chines',
    valor: '李明',
    contexto: 'Nome chinês'
  },
  {
    campo: 'empresa_japonesa',
    valor: '株式会社トヨタ',
    contexto: 'Toyota em japonês'
  },
  
  // Campos comuns de e-commerce
  {
    campo: 'produto_nome',
    valor: 'Notebook Dell Inspiron 15',
    contexto: 'Nome de produto'
  },
  {
    campo: 'preco',
    valor: 'R$ 3.599,00',
    contexto: 'Preço em reais'
  },
  {
    campo: 'categoria',
    valor: 'Eletrônicos > Computadores',
    contexto: 'Categoria de produto'
  },
  {
    campo: 'cor',
    valor: 'Azul',
    contexto: 'Cor simples'
  },
  
  // Metadados técnicos
  {
    campo: 'created_at',
    valor: '2024-01-15T10:30:00Z',
    contexto: 'Timestamp ISO'
  },
  {
    campo: 'version',
    valor: '2.5.1',
    contexto: 'Versão'
  },
  {
    campo: 'hash',
    valor: 'sha256:e3b0c44298fc1c149afbf4c8996fb924',
    contexto: 'Hash SHA256'
  }
];

// Função para calcular tamanhos
function analyzeCase(campo, valor) {
  const originalBytes = Buffer.byteLength(valor, 'utf8');
  
  // Solução anterior: sempre base64
  const base64Value = Buffer.from(valor, 'utf8').toString('base64');
  const base64Bytes = base64Value.length;
  
  // Solução nova: encoding inteligente
  const smartResult = metadataEncode(valor);
  const smartBytes = smartResult.encoded.length;
  
  return {
    campo,
    valor,
    originalBytes,
    base64Value,
    base64Bytes,
    smartValue: smartResult.encoded,
    smartBytes,
    smartMethod: smartResult.encoding,
    economiBytes: base64Bytes - smartBytes,
    economiaPercent: ((1 - smartBytes/base64Bytes) * 100).toFixed(1)
  };
}

// Cabeçalho da tabela
console.log('\n' + '─'.repeat(120));
console.log('TABELA COMPARATIVA - CASOS REAIS');
console.log('─'.repeat(120));
console.log(
  'Campo'.padEnd(20) + '│' +
  'Valor Original'.padEnd(35) + '│' +
  'Bytes'.padEnd(7) + '│' +
  'Base64 (anterior)'.padEnd(20) + '│' +
  'Bytes'.padEnd(7) + '│' +
  'Smart (novo)'.padEnd(20) + '│' +
  'Bytes'.padEnd(7) + '│' +
  'Economia'
);
console.log('─'.repeat(20) + '┼' + '─'.repeat(35) + '┼' + '─'.repeat(7) + '┼' + '─'.repeat(20) + '┼' + '─'.repeat(7) + '┼' + '─'.repeat(20) + '┼' + '─'.repeat(7) + '┼' + '─'.repeat(10));

let totalOriginal = 0;
let totalBase64 = 0;
let totalSmart = 0;

// Processar cada caso
realWorldCases.forEach(({ campo, valor, contexto }) => {
  const analysis = analyzeCase(campo, valor);
  totalOriginal += analysis.originalBytes;
  totalBase64 += analysis.base64Bytes;
  totalSmart += analysis.smartBytes;
  
  // Truncar valores para caber na tabela
  const valorTrunc = valor.length > 33 ? valor.substring(0, 30) + '...' : valor;
  const base64Trunc = analysis.base64Value.length > 18 ? analysis.base64Value.substring(0, 15) + '...' : analysis.base64Value;
  const smartTrunc = analysis.smartValue.length > 18 ? analysis.smartValue.substring(0, 15) + '...' : analysis.smartValue;
  
  // Indicador visual da economia
  const indicator = analysis.economiBytes > 0 ? '✅' : analysis.economiBytes === 0 ? '➖' : '❌';
  
  console.log(
    campo.padEnd(20) + '│' +
    valorTrunc.padEnd(35) + '│' +
    String(analysis.originalBytes).padStart(6) + ' │' +
    base64Trunc.padEnd(20) + '│' +
    String(analysis.base64Bytes).padStart(6) + ' │' +
    smartTrunc.padEnd(20) + '│' +
    String(analysis.smartBytes).padStart(6) + ' │' +
    `${indicator} ${analysis.economiaPercent}%`
  );
});

console.log('─'.repeat(120));

// Estatísticas gerais
console.log('\n' + '='.repeat(120));
console.log('RESUMO ESTATÍSTICO');
console.log('='.repeat(120));

console.log('\n📊 TOTAIS:');
console.log(`  • Tamanho original total: ${totalOriginal} bytes`);
console.log(`  • Solução anterior (base64): ${totalBase64} bytes (+${((totalBase64/totalOriginal - 1) * 100).toFixed(1)}%)`);
console.log(`  • Solução nova (smart): ${totalSmart} bytes (+${((totalSmart/totalOriginal - 1) * 100).toFixed(1)}%)`);
console.log(`  • ECONOMIA TOTAL: ${totalBase64 - totalSmart} bytes (${((1 - totalSmart/totalBase64) * 100).toFixed(1)}% de redução)`);

// Análise por tipo de encoding
console.log('\n📈 DISTRIBUIÇÃO DOS MÉTODOS:');
const methodCount = { none: 0, url: 0, base64: 0 };
realWorldCases.forEach(({ valor }) => {
  const result = metadataEncode(valor);
  methodCount[result.encoding]++;
});

console.log(`  • Sem encoding (ASCII puro): ${methodCount.none} casos (${(methodCount.none/realWorldCases.length*100).toFixed(1)}%)`);
console.log(`  • URL encoding (u:prefix): ${methodCount.url} casos (${(methodCount.url/realWorldCases.length*100).toFixed(1)}%)`);
console.log(`  • Base64 (b:prefix): ${methodCount.base64} casos (${(methodCount.base64/realWorldCases.length*100).toFixed(1)}%)`);

// Casos específicos importantes
console.log('\n🔍 ANÁLISE DETALHADA DE CASOS IMPORTANTES:');
console.log('─'.repeat(120));

const importantCases = [
  { campo: 'user_id', valor: 'usr_1234567890abcdef' },
  { campo: 'nome_brasileiro', valor: 'João Silva' },
  { campo: 'empresa_acentos', valor: 'Inovação & Tecnologia Ltda' },
  { campo: 'com_emoji', valor: 'Pedido entregue ✅' },
  { campo: 'chines', valor: '李明' }
];

importantCases.forEach(({ campo, valor }) => {
  const analysis = analyzeCase(campo, valor);
  console.log(`\n${campo}: "${valor}"`);
  console.log(`  Original: ${analysis.originalBytes} bytes`);
  console.log(`  Solução anterior (base64): "${analysis.base64Value}" = ${analysis.base64Bytes} bytes`);
  console.log(`  Solução nova (${analysis.smartMethod}): "${analysis.smartValue}" = ${analysis.smartBytes} bytes`);
  console.log(`  Economia: ${analysis.economiBytes} bytes (${analysis.economiaPercent}% menor)`);
});

// Explicação sobre os prefixos
console.log('\n' + '='.repeat(120));
console.log('SOBRE OS PREFIXOS "u:" e "b:" (2 bytes):');
console.log('='.repeat(120));
console.log(`
Os prefixos são necessários para identificar o tipo de encoding usado, mas veja o impacto real:

1. Para ASCII puro: NÃO usa prefixo, ZERO overhead
   Exemplo: "user_123" → "user_123" (0% overhead)

2. Para texto com acentos (u:): 
   • "João" seria 6 bytes em UTF-8
   • Base64: "Sm/Do28=" = 8 bytes (33% overhead)
   • URL encode: "u:Jo%C3%A3o" = 11 bytes, MAS:
     - É reversível sem ambiguidade
     - Funciona em TODOS os S3 providers
     - Para textos maiores, a diferença diminui

3. Para emoji/CJK (b:):
   • "🚀" são 4 bytes em UTF-8
   • Base64 sem prefixo: "8J+agA==" = 8 bytes
   • Base64 com prefixo: "b:8J+agA==" = 10 bytes
   • Os 2 bytes do prefixo são apenas 25% do encoding base64
   • Para strings maiores, o impacto é mínimo

IMPORTANTE: Os 2 bytes do prefixo são um investimento pequeno para:
• Decodificação 100% confiável
• Compatibilidade com valores legados
• Evitar falsos positivos (string que parece base64 mas não é)
`);

// Limite de 2KB do S3
console.log('\n' + '='.repeat(120));
console.log('IMPACTO NO LIMITE DE 2KB DO S3:');
console.log('='.repeat(120));

const limit = 2047; // 2KB - 1 byte
const sampleLargeText = 'João Silva com texto grande de teste ação '.repeat(30);
const largeOriginal = Buffer.byteLength(sampleLargeText, 'utf8');
const largeBase64 = Buffer.from(sampleLargeText).toString('base64').length;
const largeSmart = metadataEncode(sampleLargeText).encoded.length;

console.log(`
Exemplo com texto grande (${largeOriginal} bytes):
• Solução anterior (base64): ${largeBase64} bytes - usa ${(largeBase64/limit*100).toFixed(1)}% do limite
• Solução nova: ${largeSmart} bytes - usa ${(largeSmart/limit*100).toFixed(1)}% do limite
• Você ganha ${largeBase64 - largeSmart} bytes extras para usar no limite de 2KB!

Isso significa que com a solução nova você pode armazenar aproximadamente 
${((largeBase64/largeSmart - 1) * 100).toFixed(0)}% MAIS dados nos metadados antes de atingir o limite.
`);