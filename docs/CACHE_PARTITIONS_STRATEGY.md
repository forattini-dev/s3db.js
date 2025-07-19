# 🚀 Estratégia de Cache Inteligente com Partições

Este documento descreve a implementação de cache otimizado para operações com partições no S3DB MCP Server.

## 📋 **Visão Geral**

A integração entre **cache** e **partições** permite:

- ✅ **Cache granular** por partições específicas
- ✅ **Invalidação inteligente** baseada em mudanças de dados
- ✅ **Performance otimizada** para queries particionadas
- ✅ **Chaves de cache consistentes** e previsíveis

## 🔑 **Estrutura de Chaves de Cache**

### **Formato Padrão**
```
resource={name}/action={operation}[/partition={name}/values={key=value&...}][/params={key=value&...}].json.gz
```

### **Exemplos Práticos**

```bash
# Cache geral (sem partições)
resource=users/action=list.json.gz
resource=users/action=count.json.gz

# Cache particionado por idade
resource=users/action=list/partition=byAge/values=ageGroup=18-25.json.gz
resource=users/action=count/partition=byAge/values=ageGroup=adult.json.gz

# Cache particionado por região com parâmetros
resource=posts/action=list/partition=byRegion/values=country=US&state=CA/params=limit=50&offset=0.json.gz

# Cache específico com ID
resource=users/action=get/params=id=user_123.json.gz

# Cache multi-partição
resource=orders/action=list/partition=byCustomerAndDate/values=customerId=cust_456&year=2024.json.gz
```

## 🎯 **Cache Hints nos Responses**

### **Operações de Leitura**
```javascript
// resourceList com partição
{
  "success": true,
  "data": [...],
  "count": 25,
  "pagination": { "limit": 10, "offset": 0, "hasMore": true },
  "cacheKeyHint": "resource=users/action=list/partition=byAge/values=ageGroup=adult/params=limit=10&offset=0.json.gz",
  "partition": "byAge",
  "partitionValues": { "ageGroup": "adult" }
}

// resourceCount com partição
{
  "success": true,
  "count": 142,
  "resource": "users",
  "cacheKeyHint": "resource=users/action=count/partition=byRegion/values=country=BR.json.gz",
  "partition": "byRegion",
  "partitionValues": { "country": "BR" }
}
```

### **Operações de Escrita**
```javascript
// resourceInsert com invalidação
{
  "success": true,
  "data": { "id": "user_789", "name": "João", "ageGroup": "adult", "country": "BR" },
  "partitionInfo": {
    "byAge": { "ageGroup": "adult" },
    "byRegion": { "country": "BR" }
  },
  "cacheInvalidationPatterns": [
    "resource=users/action=list",
    "resource=users/action=count",
    "resource=users/action=list/partition=byAge/values=ageGroup=adult",
    "resource=users/action=count/partition=byAge/values=ageGroup=adult",
    "resource=users/action=list/partition=byRegion/values=country=BR",
    "resource=users/action=count/partition=byRegion/values=country=BR"
  ]
}
```

## 🔄 **Invalidação Inteligente**

### **Padrões de Invalidação**

#### **Sempre Invalidados (em writes)**
- `resource={name}/action=list*` - Todas as listas gerais
- `resource={name}/action=count*` - Todos os counts gerais
- `resource={name}/action=getAll*` - Dados completos

#### **Invalidação por Partição**
- `resource={name}/action=list/partition={name}/values={...}` - Lista específica da partição
- `resource={name}/action=count/partition={name}/values={...}` - Count específico da partição
- `resource={name}/action=listIds/partition={name}/values={...}` - IDs específicos da partição

#### **Invalidação por Documento**
- `resource={name}/action=get/params=id={id}` - Documento específico
- `resource={name}/action=exists/params=id={id}` - Existência específica

### **Exemplo de Invalidação**
```javascript
// Inserindo user: { id: "user_123", ageGroup: "adult", country: "BR" }
// Invalida automaticamente:

// Cache geral
"resource=users/action=list"
"resource=users/action=count"

// Cache por idade
"resource=users/action=list/partition=byAge/values=ageGroup=adult"
"resource=users/action=count/partition=byAge/values=ageGroup=adult"

// Cache por região  
"resource=users/action=list/partition=byRegion/values=country=BR"
"resource=users/action=count/partition=byRegion/values=country=BR"

// Cache específico (após criação)
"resource=users/action=get/params=id=user_123"
"resource=users/action=exists/params=id=user_123"
```

## 🛠️ **Implementação no Client**

### **1. Uso com Partições**
```javascript
// Cache miss → S3 request → Cache store
const result1 = await agent.callTool('resourceList', {
  resourceName: 'users',
  partition: 'byAge',
  partitionValues: { ageGroup: 'adult' },
  limit: 20
});

// Cache hit → Fast response
const result2 = await agent.callTool('resourceList', {
  resourceName: 'users', 
  partition: 'byAge',
  partitionValues: { ageGroup: 'adult' },
  limit: 20  // Same query, cached!
});

// Different partition → Cache miss → S3 request
const result3 = await agent.callTool('resourceList', {
  resourceName: 'users',
  partition: 'byAge', 
  partitionValues: { ageGroup: 'teen' }, // Different partition
  limit: 20
});
```

### **2. Invalidação Automática**
```javascript
// Insert invalida caches relacionados
const inserted = await agent.callTool('resourceInsert', {
  resourceName: 'users',
  data: { name: 'Maria', ageGroup: 'adult', country: 'BR' }
});

// Os próximos calls serão cache miss (invalidados):
// - Lista geral de users
// - Count geral de users  
// - Lista de users adultos
// - Count de users adultos
// - Lista de users do Brasil
// - Count de users do Brasil
```

## 🔧 **Configuração Recomendada**

### **Memory Cache (Desenvolvimento)**
```javascript
await agent.callTool('dbConnect', {
  connectionString: 's3://...',
  cacheDriver: 'memory',
  cacheMaxSize: 2000,          // 2k items para partições
  cacheTtl: 600000             // 10 minutes
});
```

### **Filesystem Cache (Produção)**
```javascript
await agent.callTool('dbConnect', {
  connectionString: 's3://...',
  cacheDriver: 'filesystem',
  cacheDirectory: './data/cache',
  cachePrefix: 'partitioned',
  cacheTtl: 1800000            // 30 minutes
});
```

### **Environment Variables**
```bash
# Cache com partições otimizado
S3DB_CACHE_ENABLED=true
S3DB_CACHE_DRIVER=filesystem
S3DB_CACHE_DIRECTORY=/app/data/cache
S3DB_CACHE_PREFIX=s3db-partitioned
S3DB_CACHE_TTL=1800000        # 30 minutes
```

## 📊 **Benefícios de Performance**

### **Antes (sem cache particionado)**
```javascript
// Toda query vai para S3, mesmo com partições
resourceList({ partition: 'byAge', partitionValues: { ageGroup: 'adult' }})  // 200ms
resourceList({ partition: 'byAge', partitionValues: { ageGroup: 'adult' }})  // 200ms  
resourceList({ partition: 'byAge', partitionValues: { ageGroup: 'teen' }})   // 200ms
```

### **Depois (com cache particionado)**
```javascript
resourceList({ partition: 'byAge', partitionValues: { ageGroup: 'adult' }})  // 200ms (miss)
resourceList({ partition: 'byAge', partitionValues: { ageGroup: 'adult' }})  // 2ms (hit)
resourceList({ partition: 'byAge', partitionValues: { ageGroup: 'teen' }})   // 200ms (miss, different partition)
```

### **Economia de Requests S3**
- 🎯 **90%+ cache hit rate** para queries repetidas na mesma partição
- 💰 **Redução significativa** de custos S3 GET/LIST operations  
- ⚡ **Sub-10ms response time** para cache hits
- 🔄 **Invalidação granular** - apenas partições afetadas

## 🎛️ **Monitoramento**

### **Cache Stats por Partição**
```javascript
const stats = await agent.callTool('dbGetStats');

console.log('Cache Performance:', {
  totalSize: stats.stats.cache.size,
  hitRate: stats.stats.cache.hits / (stats.stats.cache.hits + stats.stats.cache.misses),
  partitionedKeys: stats.stats.cache.sampleKeys.filter(k => k.includes('/partition=')),
  costsWithCache: stats.stats.costs.estimatedCostUSD
});
```

## 🧪 **Testing Cache + Partitions**

### **Teste de Cache Hit/Miss**
```javascript
// 1. Clear cache
await agent.callTool('dbClearCache');

// 2. First call - cache miss
console.time('cache-miss');
const result1 = await agent.callTool('resourceList', {
  resourceName: 'users',
  partition: 'byAge', 
  partitionValues: { ageGroup: 'adult' }
});
console.timeEnd('cache-miss'); // ~200ms

// 3. Second call - cache hit  
console.time('cache-hit');
const result2 = await agent.callTool('resourceList', {
  resourceName: 'users',
  partition: 'byAge',
  partitionValues: { ageGroup: 'adult' }
});
console.timeEnd('cache-hit'); // ~2ms

// 4. Verify cache key hint
console.log('Cache Key:', result2.cacheKeyHint);
// "resource=users/action=list/partition=byAge/values=ageGroup=adult.json.gz"
```

## 🚀 **Best Practices**

### **DO's ✅**
- Use partições para queries frequentes
- Configure TTL baseado no padrão de updates
- Monitore cache hit rate via `dbGetStats`
- Use filesystem cache em produção
- Aproveite cache hints para debugging

### **DON'Ts ❌**
- Não crie partições demais (fragmentação)
- Não use TTL muito baixo (diminui eficiência)
- Não ignore os patterns de invalidação
- Não misture dados particionados e não-particionados

## 🔮 **Futuras Melhorias**

1. **Cache Warming** - Pré-popular partições importantes
2. **Cache Analytics** - Métricas detalhadas por partição
3. **Smart TTL** - TTL dinâmico baseado em padrões de acesso
4. **Cross-Partition Cache** - Cache otimizado para queries multi-partição
5. **Cache Compression** - Compressão específica para dados particionados

---

Esta estratégia transforma o S3DB MCP Server em uma **solução de alta performance** para dados particionados, combinando a **flexibilidade das partições** com a **velocidade do cache inteligente**! 🚀