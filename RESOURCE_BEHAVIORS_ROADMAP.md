# Resource Behaviors Roadmap - S3DB.js

## 📋 Implementação Concluída

Esta documentação descreve a implementação da feature **Resource Behaviors** no S3DB.js, que permite diferentes estratégias para lidar com o limite de 2KB de metadados do Amazon S3.

---

## 🎯 Visão Geral

O S3DB.js utiliza metadados de objetos S3 como banco de dados. O Amazon S3 possui um limite de **2KB para metadados por objeto**. A feature de behaviors permite escolher diferentes estratégias para lidar com esse limite.

### ✅ Behaviors Implementados

1. **`user-management`** (padrão) - Responsabilidade do usuário
2. **`enforce-limits`** - Validação rígida com erro
3. **`data-truncate`** - Truncamento inteligente de dados
4. **`body-overflow`** - Uso do body do S3 para dados excedentes

---

## 🏗️ Arquitetura

### Strategy Pattern
A implementação utiliza o **Strategy Pattern** com behaviors isolados em módulos:

```
src/behaviors/
├── index.js           # Exporta todos os behaviors
├── user-management.js # Behavior padrão
├── enforce-limits.js  # Behavior de validação
├── data-truncate.js   # Behavior de truncamento
└── body-overflow.js   # Behavior de overflow
```

### Interface dos Behaviors
Cada behavior implementa:
```javascript
export async function handleInsert({ resource, data, mappedData }) {}
export async function handleUpdate({ resource, id, data, mappedData }) {}
export async function handleUpsert({ resource, id, data, mappedData }) {}
export async function handleGet({ resource, metadata, body }) {}
```

---

## 📖 Uso Básico

### Criando Resource com Behavior

```javascript
import S3db from 's3db.js';

const db = new S3db({
  connectionString: 'your-connection-string'
});

await db.connect();

// Criar resource com behavior específico
const resource = await db.createResource({
  name: 'users',
  behavior: 'body-overflow', // Especifica o behavior
  attributes: {
    name: 'string',
    email: 'email',
    bio: 'string|optional',
    description: 'string|optional',
    notes: 'string|optional'
  }
});
```

### Behavior Padrão
```javascript
// Se não especificado, usa 'user-management'
const resource = await db.createResource({
  name: 'users',
  attributes: { name: 'string' }
  // behavior: 'user-management' (implícito)
});
```

---

## 🔧 Behaviors Detalhados

### 1. `user-management` (Padrão)

**Responsabilidade**: O usuário gerencia os limites de metadados.

**Comportamento**:
- ✅ Permite operações mesmo excedendo 2KB
- ⚠️ Emite evento `exceedsLimit` como warning
- 📊 Usa `calculator.js` para medir tamanhos

**Exemplo**:
```javascript
const resource = await db.createResource({
  name: 'users',
  behavior: 'user-management',
  attributes: { name: 'string', bio: 'string' }
});

// Escutar warnings
resource.on('exceedsLimit', (context) => {
  console.warn('Metadata excedeu 2KB:', {
    operation: context.operation,
    totalSize: context.totalSize,
    limit: context.limit,
    excess: context.excess
  });
});

// Inserir dados grandes
await resource.insert({
  name: 'João',
  bio: 'A'.repeat(3000) // > 2KB
});
```

---

### 2. `enforce-limits`

**Responsabilidade**: Validação rígida dos limites de metadados.

**Comportamento**:
- ❌ Lança erro se dados excederem 2KB
- 🛡️ Impede operações com metadados grandes
- 📏 Validação antes de persistir

**Exemplo**:
```javascript
const resource = await db.createResource({
  name: 'users',
  behavior: 'enforce-limits',
  attributes: { name: 'string', bio: 'string' }
});

try {
  await resource.insert({
    name: 'João',
    bio: 'A'.repeat(3000) // > 2KB
  });
} catch (error) {
  console.error(error.message);
  // "S3 metadata size exceeds 2KB limit. Current size: 3024 bytes, limit: 2048 bytes"
}
```

---

### 3. `data-truncate`

**Responsabilidade**: Truncamento inteligente para caber em 2KB.

**Comportamento**:
- ✂️ Ordena atributos por tamanho (menores primeiro)
- 📦 Acumula até 2KB de dados
- ➕ Adiciona "..." em valores truncados
- 🗑️ Descarta atributos que não cabem

**Algoritmo**:
1. Calcular tamanho de cada atributo
2. Ordenar por tamanho crescente
3. Acumular até 2KB
4. Truncar último atributo se necessário
5. Descartar atributos restantes

**Exemplo**:
```javascript
const resource = await db.createResource({
  name: 'users',
  behavior: 'data-truncate',
  attributes: { 
    name: 'string', 
    email: 'email',
    bio: 'string',
    description: 'string'
  }
});

// Dados grandes
const result = await resource.insert({
  name: 'João',
  email: 'joao@example.com',
  bio: 'A'.repeat(1000),
  description: 'B'.repeat(2000)
});

// Resultado pode ser:
// {
//   name: 'João',
//   email: 'joao@example.com', 
//   bio: 'AAAA...',           // Truncado
//   // description: omitido (não coube)
// }
```

---

### 4. `body-overflow`

**Responsabilidade**: Usar body do S3 para dados excedentes.

**Comportamento**:
- 🔄 Adiciona flag `$overflow: true` nos metadados
- 📦 Prioriza metadados até 2KB
- 📄 Armazena excedente no body como JSON
- 🔗 Faz merge automático na leitura

**Fluxo**:
1. **Escrita**: Se > 2KB → separar em metadados + body
2. **Leitura**: Se `$overflow: true` → ler body + merge

**Exemplo**:
```javascript
const resource = await db.createResource({
  name: 'users',
  behavior: 'body-overflow',
  attributes: { 
    name: 'string', 
    email: 'email',
    bio: 'string',
    description: 'string'
  }
});

// Dados grandes
await resource.insert({
  name: 'João',
  email: 'joao@example.com',
  bio: 'A'.repeat(1000),      // Pode ir para metadados
  description: 'B'.repeat(2000) // Vai para body
});

// Na leitura, dados são reunificados automaticamente
const user = await resource.get('user-id');
console.log(user.bio);         // Disponível
console.log(user.description); // Disponível (veio do body)
```

**Estrutura Interna**:
```javascript
// Metadados S3
{
  "$overflow": "true",
  "name": "João",
  "email": "joao@example.com",
  "bio": "AAAA..."
}

// Body S3
{
  "description": "BBBB..."
}
```

---

## 💾 Persistência

### s3db.json
O behavior é persistido no arquivo `s3db.json`:

```json
{
  "version": "1",
  "s3dbVersion": "3.3.2",
  "resources": {
    "users": {
      "currentVersion": "v0",
      "partitions": {},
      "versions": {
        "v0": {
          "hash": "sha256:abc123...",
          "attributes": { "name": "string" },
          "options": {},
          "behavior": "body-overflow",
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      }
    }
  }
}
```

### Versionamento
- Mudanças no behavior criam nova versão do resource
- Versions anteriores mantêm behavior original
- Compatibilidade com recursos existentes

---

## 🔄 Migração

### Recursos Existentes
```javascript
// Recursos sem behavior definido usam 'user-management'
const existingResource = db.resource('old-resource');
console.log(existingResource.behavior); // 'user-management'

// Atualizar behavior
await db.createResource({
  name: 'old-resource',
  behavior: 'body-overflow',
  attributes: existingResource.attributes
});
```

### De v3 para v4
```javascript
// Script de migração (exemplo)
const resources = await db.listResources();

for (const { name } of resources) {
  const resource = db.resource(name);
  
  // Definir behavior baseado no uso
  const behavior = determineBehavior(resource);
  
  await db.createResource({
    name,
    behavior,
    attributes: resource.attributes,
    options: resource.options
  });
}
```

---

## 🧪 Testes

### Exemplo de Teste
```javascript
import { getBehavior } from './src/behaviors/index.js';

describe('Body Overflow Behavior', () => {
  test('should handle large data with overflow', async () => {
    const behavior = getBehavior('body-overflow');
    const largeData = { bio: 'A'.repeat(3000) };
    const mappedData = { bio: largeData.bio };
    
    const result = await behavior.handleInsert({
      resource: mockResource,
      data: largeData,
      mappedData
    });
    
    expect(result.mappedData.$overflow).toBe('true');
    expect(result.body).toContain(largeData.bio);
  });
});
```

### Executar Exemplo
```bash
# Executar demonstração
node examples/12-resource-behaviors.js

# Executar testes
npm test -- --testNamePattern="behavior"
```

---

## 📊 Monitoramento

### Métricas de Uso
```javascript
// Monitorar eventos de overflow
resource.on('exceedsLimit', (context) => {
  // Enviar métricas para CloudWatch, DataDog, etc.
  metrics.increment('s3db.metadata.exceeds_limit', {
    resource: resource.name,
    operation: context.operation,
    size: context.totalSize
  });
});

// Monitorar uso de body
resource.on('insert', (data) => {
  if (data.$overflow) {
    metrics.increment('s3db.body.overflow_used', {
      resource: resource.name
    });
  }
});
```

---

## 🎯 Casos de Uso

### 1. Sistema de Usuários (user-management)
```javascript
// Para sistemas onde desenvolvedores controlam tamanho dos dados
const users = await db.createResource({
  name: 'users',
  behavior: 'user-management',
  attributes: { name: 'string', email: 'email' }
});
```

### 2. API Validation (enforce-limits)
```javascript
// Para APIs que precisam validar rigorosamente
const apiLogs = await db.createResource({
  name: 'api_logs',
  behavior: 'enforce-limits',
  attributes: { endpoint: 'string', response: 'object' }
});
```

### 3. Content Management (data-truncate)
```javascript
// Para CMS onde truncamento é aceitável
const articles = await db.createResource({
  name: 'articles',
  behavior: 'data-truncate',
  attributes: { title: 'string', content: 'string', tags: 'array' }
});
```

### 4. Document Storage (body-overflow)
```javascript
// Para armazenamento de documentos completos
const documents = await db.createResource({
  name: 'documents',
  behavior: 'body-overflow',
  attributes: { 
    title: 'string',
    author: 'string', 
    content: 'string',
    metadata: 'object'
  }
});
```

---

## 🔮 Considerações Futuras

### Performance
- Body overflow adiciona latência na leitura
- Considerar cache para objetos com overflow
- Monitorar uso de banda por behavior

### Extensibilidade
- Interface permite novos behaviors facilmente
- Considerar behaviors customizados por projeto
- Integração com plugins do S3DB.js

### Compatibilidade
- Behaviors são compatíveis entre si na leitura
- Mudança de behavior não quebra dados existentes
- Versionamento garante integridade histórica

---

## ✅ Status: Implementado

- [x] Strategy Pattern implementado
- [x] 4 behaviors funcionais
- [x] Persistência no s3db.json
- [x] Integração com Resource/Database
- [x] Exemplo funcional
- [x] Documentação completa
- [x] Testes de comportamento
- [x] Suporte a versionamento

**Versão**: s3db.js v3.3.2+
**Data**: Janeiro 2024
**Status**: ✅ Pronto para produção