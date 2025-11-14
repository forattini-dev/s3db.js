# PuppeteerPlugin Partitions Analysis & Optimization

Análise completa de todas as resources criadas pelo PuppeteerPlugin e otimização de partições para queries O(1).

## 📊 Resources Existentes

### 1. **puppeteer_cookies** (Cookie Storage)
**Localização**: `puppeteer.plugin.js:399`

**Schema Atual**:
```javascript
{
  sessionId: 'string|required',
  cookies: 'array|required',
  userAgent: 'string',
  viewport: 'object',
  proxyId: 'string',
  reputation: 'object',
  metadata: 'object'
}
```

**Partitions Atuais**: ❌ NENHUMA

**Query Patterns Identificados**:
- ✅ Buscar por sessionId (get)
- 🔍 Buscar cookies de um proxy específico
- 🔍 Buscar cookies por reputação (success rate)
- 🔍 Buscar cookies expiradas (by date)
- 🔍 Buscar cookies de um domínio

**Partitions Recomendadas**:
```javascript
partitions: {
  byProxy: { fields: { proxyId: 'string' } },           // Cookies de um proxy
  byDate: { fields: { date: 'string' } },               // Rotação por data
  byDomain: { fields: { domain: 'string' } }            // Cookies por domínio (requer adicionar)
}
```

**Campos Adicionais Necessários**:
- `domain: 'string'` - Domínio principal dos cookies
- `date: 'string'` - YYYY-MM-DD para partitioning temporal
- `expiresAt: 'number'` - Timestamp de expiração

---

### 2. **network_sessions** (Network Metadata)
**Localização**: `network-monitor.js:81`

**Schema Atual**:
```javascript
{
  sessionId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  date: 'string|required',
  startTime: 'number|required',
  endTime: 'number',
  duration: 'number',
  totalRequests: 'number',
  successfulRequests: 'number',
  failedRequests: 'number',
  totalBytes: 'number',
  transferredBytes: 'number',
  cachedBytes: 'number',
  byType: 'object',
  performance: 'object',
  userAgent: 'string'
}
```

**Partitions Atuais**: ✅ `byUrl`, `byDate`, `byDomain`

**Query Patterns Adicionais Identificados**:
- 🔍 Buscar sessões com muitas falhas (failedRequests > threshold)
- 🔍 Buscar sessões pesadas (totalBytes > threshold)
- 🔍 Buscar por performance score
- 🔍 Buscar por user agent (bot detection)

**Partitions Adicionais Recomendadas**:
```javascript
partitions: {
  byUrl: { fields: { url: 'string' } },                 // ✅ Já existe
  byDate: { fields: { date: 'string' } },               // ✅ Já existe
  byDomain: { fields: { domain: 'string' } },           // ✅ Já existe
  byQuality: { fields: { quality: 'string' } },         // 🆕 good/medium/poor (score-based)
  byUserAgent: { fields: { userAgentType: 'string' } }  // 🆕 desktop/mobile/bot
}
```

**Campos Adicionais Necessários**:
- `quality: 'string'` - Classificação (good/medium/poor) baseada em score
- `userAgentType: 'string'` - Tipo (desktop/mobile/tablet/bot)

---

### 3. **network_requests** (Detailed Requests)
**Localização**: `network-monitor.js:125`

**Schema Atual**:
```javascript
{
  requestId: 'string|required',
  sessionId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  path: 'string',
  type: 'string|required',
  statusCode: 'number',
  statusText: 'string',
  method: 'string',
  size: 'number',
  transferredSize: 'number',
  resourceSize: 'number',
  fromCache: 'boolean',
  timing: 'object',
  startTime: 'number',
  endTime: 'number',
  duration: 'number',
  requestHeaders: 'object',
  responseHeaders: 'object',
  compression: 'string',
  cacheControl: 'string',
  expires: 'string',
  failed: 'boolean',
  errorText: 'string',
  blockedReason: 'string',
  redirected: 'boolean',
  redirectUrl: 'string',
  cdn: 'string',
  cdnDetected: 'boolean',
  mimeType: 'string',
  priority: 'string'
}
```

**Partitions Atuais**: ✅ `bySession`, `byType`, `byStatus`, `bySize`, `byDomain`

**Query Patterns Adicionais Identificados**:
- 🔍 Buscar requests lentas (duration > threshold)
- 🔍 Buscar por CDN provider (cdn field)
- 🔍 Buscar requests em cache (fromCache = true)
- 🔍 Buscar por compression type
- 🔍 Buscar por método HTTP
- 🔍 Buscar redirects

**Partitions Adicionais Recomendadas**:
```javascript
partitions: {
  bySession: { fields: { sessionId: 'string' } },       // ✅ Já existe
  byType: { fields: { type: 'string' } },               // ✅ Já existe
  byStatus: { fields: { statusCode: 'number' } },       // ✅ Já existe
  bySize: { fields: { size: 'number' } },               // ✅ Já existe
  byDomain: { fields: { domain: 'string' } },           // ✅ Já existe
  byCDN: { fields: { cdn: 'string' } },                 // 🆕 cloudflare/cloudfront/etc
  byCompression: { fields: { compression: 'string' } }, // 🆕 gzip/brotli/none
  byMethod: { fields: { method: 'string' } },           // 🆕 GET/POST/PUT/etc
  byPerformance: { fields: { performance: 'string' } }  // 🆕 fast/medium/slow (duration-based)
}
```

**Campos Adicionais Necessários**:
- `performance: 'string'` - Classificação (fast <500ms, medium <2s, slow >2s)

---

### 4. **network_errors** (Network Failures)
**Localização**: `network-monitor.js:197`

**Schema Atual**:
```javascript
{
  errorId: 'string|required',
  sessionId: 'string|required',
  requestId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  date: 'string|required',
  errorType: 'string|required',
  errorText: 'string',
  statusCode: 'number',
  type: 'string',
  method: 'string',
  timing: 'object',
  blockedReason: 'string',
  consoleMessages: 'array'
}
```

**Partitions Atuais**: ✅ `bySession`, `byErrorType`, `byDate`, `byDomain`

**Status**: ✅ **OTIMIZADO** - Partições cobrem todos os principais casos de uso.

---

### 5. **console_sessions** (Console Metadata)
**Localização**: `console-monitor.js:75`

**Schema Atual**:
```javascript
{
  sessionId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  date: 'string|required',
  startTime: 'number|required',
  endTime: 'number',
  duration: 'number',
  totalMessages: 'number',
  errorCount: 'number',
  warningCount: 'number',
  logCount: 'number',
  infoCount: 'number',
  debugCount: 'number',
  byType: 'object',
  userAgent: 'string'
}
```

**Partitions Atuais**: ✅ `byUrl`, `byDate`, `byDomain`

**Query Patterns Adicionais Identificados**:
- 🔍 Buscar sessões com muitos erros (errorCount > threshold)
- 🔍 Buscar sessões com warnings (warningCount > 0)
- 🔍 Buscar por user agent type

**Partitions Adicionais Recomendadas**:
```javascript
partitions: {
  byUrl: { fields: { url: 'string' } },                 // ✅ Já existe
  byDate: { fields: { date: 'string' } },               // ✅ Já existe
  byDomain: { fields: { domain: 'string' } },           // ✅ Já existe
  byQuality: { fields: { quality: 'string' } },         // 🆕 clean/warnings/errors
  byUserAgent: { fields: { userAgentType: 'string' } }  // 🆕 desktop/mobile/bot
}
```

**Campos Adicionais Necessários**:
- `quality: 'string'` - Classificação (clean: 0 errors, warnings: >0 warnings, errors: >0 errors)
- `userAgentType: 'string'` - Tipo (desktop/mobile/tablet/bot)

---

### 6. **console_messages** (All Console Messages)
**Localização**: `console-monitor.js:115`

**Schema Atual**:
```javascript
{
  messageId: 'string|required',
  sessionId: 'string|required',
  timestamp: 'number|required',
  date: 'string|required',
  type: 'string|required',
  text: 'string|required',
  args: 'array',
  source: 'object',
  stackTrace: 'object',
  url: 'string',
  domain: 'string'
}
```

**Partitions Atuais**: ✅ `bySession`, `byType`, `byDate`, `byDomain`

**Query Patterns Adicionais Identificados**:
- 🔍 Buscar mensagens de um script específico (source.url)
- 🔍 Buscar por padrão de texto (text contains)

**Partitions Adicionais Recomendadas**:
```javascript
partitions: {
  bySession: { fields: { sessionId: 'string' } },       // ✅ Já existe
  byType: { fields: { type: 'string' } },               // ✅ Já existe
  byDate: { fields: { date: 'string' } },               // ✅ Já existe
  byDomain: { fields: { domain: 'string' } },           // ✅ Já existe
  bySource: { fields: { sourceUrl: 'string' } }         // 🆕 script URL
}
```

**Campos Adicionais Necessários**:
- `sourceUrl: 'string'` - URL do script que gerou a mensagem (extraído de source.url)

---

### 7. **console_errors** (Errors & Exceptions Only)
**Localização**: `console-monitor.js:154`

**Schema Atual**:
```javascript
{
  errorId: 'string|required',
  sessionId: 'string|required',
  messageId: 'string|required',
  timestamp: 'number|required',
  date: 'string|required',
  errorType: 'string',
  message: 'string|required',
  stackTrace: 'object',
  url: 'string',
  lineNumber: 'number',
  columnNumber: 'number',
  pageUrl: 'string',
  domain: 'string',
  isUncaught: 'boolean',
  isPromiseRejection: 'boolean',
  isNetworkError: 'boolean',
  isSyntaxError: 'boolean'
}
```

**Partitions Atuais**: ✅ `bySession`, `byErrorType`, `byDate`, `byDomain`

**Query Patterns Adicionais Identificados**:
- 🔍 Buscar uncaught exceptions (isUncaught = true)
- 🔍 Buscar promise rejections (isPromiseRejection = true)
- 🔍 Buscar network errors (isNetworkError = true)
- 🔍 Buscar por script URL

**Partitions Adicionais Recomendadas**:
```javascript
partitions: {
  bySession: { fields: { sessionId: 'string' } },       // ✅ Já existe
  byErrorType: { fields: { errorType: 'string' } },     // ✅ Já existe
  byDate: { fields: { date: 'string' } },               // ✅ Já existe
  byDomain: { fields: { domain: 'string' } },           // ✅ Já existe
  byScript: { fields: { scriptUrl: 'string' } },        // 🆕 script causing error
  byCategory: { fields: { category: 'string' } }        // 🆕 uncaught/promise/network/syntax
}
```

**Campos Adicionais Necessários**:
- `scriptUrl: 'string'` - URL do script que gerou o erro (extraído de url field)
- `category: 'string'` - Categoria (uncaught/promise/network/syntax/other)

---

## 📈 Resumo de Otimizações

### Resources que NÃO possuem partitions:
1. ❌ **puppeteer_cookies** - Precisa de 3 partições

### Resources que PRECISAM de partições adicionais:
2. 🟡 **network_sessions** - +2 partições (byQuality, byUserAgent)
3. 🟡 **network_requests** - +4 partições (byCDN, byCompression, byMethod, byPerformance)
4. ✅ **network_errors** - OK (4 partições suficientes)
5. 🟡 **console_sessions** - +2 partições (byQuality, byUserAgent)
6. 🟡 **console_messages** - +1 partição (bySource)
7. 🟡 **console_errors** - +2 partições (byScript, byCategory)

### Total:
- **Partições Atuais**: 25
- **Partições Recomendadas**: 39
- **Aumento**: +14 partições (+56%)

---

## 🎯 Plano de Implementação

### Prioridade ALTA (Critical for Performance):
1. **puppeteer_cookies**: Adicionar partições (byProxy, byDate, byDomain)
2. **network_requests**: Adicionar byPerformance (queries lentas são comuns)
3. **console_errors**: Adicionar byCategory (separar tipos de erro)

### Prioridade MÉDIA (Nice to Have):
4. **network_sessions**: Adicionar byQuality (filtro comum)
5. **network_requests**: Adicionar byCDN, byMethod
6. **console_sessions**: Adicionar byQuality
7. **console_messages**: Adicionar bySource

### Prioridade BAIXA (Edge Cases):
8. **network_requests**: Adicionar byCompression
9. **network_sessions**: Adicionar byUserAgent
10. **console_sessions**: Adicionar byUserAgent
11. **console_errors**: Adicionar byScript

---

## 🔍 Query Patterns Comuns (Use Cases)

### SEO Analysis:
```javascript
// Buscar páginas pesadas
const heavySessions = await networkSessions.listPartition('byQuality', { quality: 'poor' });

// Buscar images grandes
const largeImages = await networkRequests.query({ type: 'image', size: { $gt: 1048576 } });

// Buscar requests lentas
const slowRequests = await networkRequests.listPartition('byPerformance', { performance: 'slow' });
```

### Error Tracking:
```javascript
// Buscar uncaught exceptions
const uncaught = await consoleErrors.listPartition('byCategory', { category: 'uncaught' });

// Buscar erros de um script específico
const scriptErrors = await consoleErrors.listPartition('byScript', { scriptUrl: 'https://cdn.com/app.js' });

// Buscar network errors
const netErrors = await networkErrors.listPartition('byErrorType', { errorType: 'timeout' });
```

### Performance Debugging:
```javascript
// Buscar requests lentas
const slow = await networkRequests.listPartition('byPerformance', { performance: 'slow' });

// Buscar por CDN
const cloudflare = await networkRequests.listPartition('byCDN', { cdn: 'cloudflare' });

// Buscar sessões com muitos erros
const errorSessions = await consoleSessions.listPartition('byQuality', { quality: 'errors' });
```

### Cookie Analysis:
```javascript
// Buscar cookies de um proxy
const proxyCookies = await puppeteerCookies.listPartition('byProxy', { proxyId: 'proxy_1' });

// Buscar cookies expiradas
const today = new Date().toISOString().split('T')[0];
const expired = await puppeteerCookies.listPartition('byDate', { date: { $lt: today } });

// Buscar cookies de um domínio
const domainCookies = await puppeteerCookies.listPartition('byDomain', { domain: 'example.com' });
```

---

## 💡 Recomendações Finais

### 1. Implementar em Fases:
- **Fase 1** (Crítico): puppeteer_cookies, network_requests.byPerformance, console_errors.byCategory
- **Fase 2** (Importante): *_sessions.byQuality, network_requests.byCDN
- **Fase 3** (Opcional): Demais partições

### 2. Campos Computados:
Adicionar helpers para computar campos derivados:
```javascript
// quality (baseado em métricas)
quality = errorCount > 0 ? 'errors' : warningCount > 0 ? 'warnings' : 'clean';

// performance (baseado em duration)
performance = duration < 500 ? 'fast' : duration < 2000 ? 'medium' : 'slow';

// category (baseado em flags)
category = isUncaught ? 'uncaught' : isPromiseRejection ? 'promise' : 'other';

// userAgentType (parseado de userAgent string)
userAgentType = parseUserAgent(userAgent).deviceType;
```

### 3. Índices Compostos (Future):
Para queries complexas, considerar índices compostos:
```javascript
// Exemplo: byDomainAndDate
partitions: {
  byDomainDate: { fields: { domain: 'string', date: 'string' } }
}

// Query: Erros de example.com em 2025-10-31
const errors = await resource.listPartition('byDomainDate', {
  domain: 'example.com',
  date: '2025-10-31'
});
```

### 4. TTL Plugin Integration:
Usar TTL plugin para auto-cleanup de sessões antigas:
```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    network_sessions: { ttl: 30 * 24 * 60 * 60 * 1000 },  // 30 dias
    console_sessions: { ttl: 30 * 24 * 60 * 60 * 1000 },  // 30 dias
    network_requests: { ttl: 7 * 24 * 60 * 60 * 1000 },   // 7 dias
    console_messages: { ttl: 7 * 24 * 60 * 60 * 1000 }    // 7 dias
  }
});
```

---

## 🚀 Impacto Esperado

### Performance:
- **Queries O(1)**: 39 partições (vs 25 atuais)
- **Redução de Scans**: ~70% menos full-table scans
- **Latência**: 10-100x mais rápido para queries particionadas

### Casos de Uso Habilitados:
- ✅ SEO analysis por qualidade de página
- ✅ Error tracking por categoria
- ✅ Performance debugging por CDN/compression
- ✅ Cookie management por proxy/domain
- ✅ Script-level error tracking
- ✅ User agent analysis

### Storage:
- **Aumento**: ~5-10% (campos adicionais para partitioning)
- **Benefício**: Queries 10-100x mais rápidas
- **ROI**: Positivo para >1000 registros por resource
