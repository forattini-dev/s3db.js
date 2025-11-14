# API Plugin - Request Logging Quick Start

Como ativar e customizar os logs de requisições HTTP no API Plugin.

---

## ✅ Ativação Básica (1 linha!)

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 'memory://mybucket/db'
});

await db.connect();

await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required|email'
  }
});

const apiPlugin = new ApiPlugin({
  port: 3000,

  // 👇 ATIVE O LOGGING AQUI
  logging: true,  // ✨ Só isso!

  resources: {
    users: { methods: ['GET', 'POST', 'PUT', 'DELETE'] }
  }
});

await db.usePlugin(apiPlugin);
```

### Output (Colorido no Terminal)

```bash
GET /users ⇒ 200 (13.497 ms, –)
POST /users ⇒ 201 (20.276 ms, –)
GET /users/abc123 ⇒ 200 (3.124 ms, –)
PUT /users/abc123 ⇒ 200 (38.027 ms, –)
DELETE /users/abc123 ⇒ 204 (8.776 ms, –)
GET /notfound ⇒ 404 (1.115 ms, –)
POST /users ⇒ 400 (20.792 ms, –)
```

**Cores por Status Code:**
- 🟢 **200-299** (Sucesso): Verde
- 🔵 **300-399** (Redirect): Cyan
- 🟡 **400-499** (Client Error): Amarelo
- 🔴 **500-599** (Server Error): Vermelho

---

## 🎛️ Sintaxe de Configuração

O campo `logging` aceita 3 formatos:

### 1. Boolean (Mais Simples)

```javascript
logging: true   // ✅ Liga com configurações padrão
logging: false  // ❌ Desliga completamente
```

### 2. Objeto Simples (Auto-enable)

Quando você passa um objeto, o logging é **automaticamente ativado** mesmo sem `enabled: true`:

```javascript
logging: {
  format: ':method :url :status'  // ✅ Enabled automaticamente!
}
```

### 3. Objeto Completo (Controle Total)

```javascript
logging: {
  enabled: true,     // Explicitamente ativado
  format: '...',     // Formato customizado
  colorize: false,   // Desativa cores
  verbose: true      // Logs extras (debug)
}
```

---

## 🎨 Customização do Formato

### Formato Padrão (Verbose)

```javascript
logging: true  // Usa formato padrão: ':verb :url => :status (:elapsed ms, :res[content-length])'
```

**Output:**
```
GET /users ⇒ 200 (13.497 ms, 256)
POST /users ⇒ 201 (20.276 ms, 512)
```

### Formato Compacto

```javascript
logging: {
  format: ':method :url :status'  // Auto-enabled!
}
```

**Output:**
```
GET /users 200
POST /users 201
DELETE /users/abc123 204
```

### Formato com Timestamp

```javascript
logging: {
  format: '[:time] :method :url :status (:elapsed ms)'
}
```

**Output:**
```
[12:34:56] GET /users 200 (13.497 ms)
[12:34:57] POST /users 201 (20.276 ms)
```

### Formato Apache-Style

```javascript
logging: {
  format: ':ip - :user [:time] ":method :url HTTP/1.1" :status :res[content-length]'
}
```

**Output:**
```
192.168.1.100 - john [12:34:56] "GET /users HTTP/1.1" 200 256
192.168.1.100 - anonymous [12:34:57] "POST /users HTTP/1.1" 201 512
```

### Formato JSON (Para Log Aggregation)

```javascript
logging: {
  format: '{"method":":method","url":":url","status"::status,"duration"::elapsed,"user":":user"}'
}
```

**Output:**
```json
{"method":"GET","url":"/users","status":200,"duration":13.497,"user":"anonymous"}
{"method":"POST","url":"/users","status":201,"duration":20.276,"user":"john"}
```

---

## 🏷️ Tokens Disponíveis

| Token | Descrição | Exemplo |
|-------|-----------|---------|
| `:verb` ou `:method` | HTTP method | `GET` |
| `:path` ou `:ruta` | Request path (sem query) | `/users` |
| `:url` | Full URL (com query) | `/users?page=2` |
| `:status` | Status code | `200` |
| `:elapsed` ou `:response-time` | Duração em ms | `13.497` |
| `:who` ou `:user` | Username (auth) | `john` ou `anonymous` |
| `:reqId` ou `:requestId` | Request ID único | `abc-123-def` |
| `:time` | Timestamp atual | `12:34:56` |
| `:res[header]` | Response header | `:res[content-length]` → `256` |
| `:req[header]` | Request header | `:req[user-agent]` → `curl/7.68.0` |

---

## 🎯 Casos de Uso Comuns

### Desenvolvimento: Máximo Detalhamento

```javascript
logging: true  // Usa formato verbose padrão com cores
```

Ou customize:

```javascript
logging: {
  format: ':method :url ⇒ :status (:elapsed ms, :res[content-length])'
  // colorize é true por padrão
}
```

**Vantagens:**
- ✅ Cores facilitam identificar erros
- ✅ Tempo de resposta visível
- ✅ Tamanho da resposta

### Produção: Formato Limpo

```javascript
const isProduction = process.env.NODE_ENV === 'production';

logging: {
  enabled: true,
  colorize: !isProduction,  // Sem cores em prod
  format: isProduction
    ? ':method :url :status (:elapsed ms)'  // Simples
    : ':method :url ⇒ :status (:elapsed ms, :res[content-length])'  // Detalhado
}
```

### CI/CD: Sem Cores

```javascript
logging: {
  colorize: false,  // Pipelines não suportam cores
  format: ':method :url :status (:elapsed ms)'
}
```

### Debug: Máximo Contexto

```javascript
logging: {
  format: '[:reqId] :user :method :url :status (:elapsed ms) UA=:req[user-agent]'
}
```

**Output:**
```
[abc-123] john GET /users 200 (13.497 ms) UA=Mozilla/5.0
[def-456] anonymous POST /users 201 (20.276 ms) UA=curl/7.68.0
```

---

## 🔕 Desabilitar Logging

### Desabilitar Completamente

```javascript
logging: false  // Mais simples!
```

Ou simplesmente omita a opção `logging` (desabilitado por padrão).

### Desabilitar Apenas Cores

```javascript
logging: {
  colorize: false  // Auto-enabled, mas sem cores
}
```

---

## 🚀 Exemplo Completo

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: process.env.DATABASE_URL || 'memory://mybucket/db'
});

await db.connect();

await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    price: 'number|required',
    stock: 'number|default:0'
  }
});

const isProduction = process.env.NODE_ENV === 'production';

const apiPlugin = new ApiPlugin({
  port: process.env.PORT || 3000,
  verbose: !isProduction,  // Verbose logs em dev

  // Request logging
  logging: {
    enabled: true,
    colorize: !isProduction,  // Cores apenas em dev
    format: isProduction
      ? ':method :url :status (:elapsed ms)'  // Produção: simples
      : ':method :url ⇒ :status (:elapsed ms, :res[content-length])'  // Dev: detalhado
  },

  // Request ID tracking (útil para correlação)
  requestId: {
    enabled: true,
    headerName: 'X-Request-ID'
  },

  resources: {
    products: {
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  }
});

await db.usePlugin(apiPlugin);

console.log('✅ API started with request logging enabled!');
```

### Output em Desenvolvimento

```bash
✅ API started with request logging enabled!

GET /products ⇒ 200 (13.497 ms, 256)
POST /products ⇒ 201 (20.276 ms, 512)
GET /products/abc123 ⇒ 200 (3.124 ms, 128)
PUT /products/abc123 ⇒ 200 (38.027 ms, 256)
DELETE /products/abc123 ⇒ 204 (8.776 ms, –)
```

### Output em Produção

```bash
✅ API started with request logging enabled!

GET /products 200 (13.497 ms)
POST /products 201 (20.276 ms)
GET /products/abc123 200 (3.124 ms)
PUT /products/abc123 200 (38.027 ms)
DELETE /products/abc123 204 (8.776 ms)
```

---

## 💡 Dicas

### 1. Combine com Eventos para Logs Estruturados

```javascript
new ApiPlugin({
  logging: { enabled: false },  // Desliga logs de texto
  events: { enabled: true },     // Liga eventos

  // ...
});

// Custom structured logging
apiPlugin.on('request:end', (data) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    method: data.method,
    path: data.path,
    status: data.status,
    duration: data.duration,
    requestId: data.requestId
  }));
});
```

### 2. Use Request ID para Debugging

```javascript
logging: {
  enabled: true,
  format: '[:reqId] :method :url :status'
}

requestId: {
  enabled: true
}
```

Cada request terá um ID único para rastrear através dos logs.

### 3. Monitore Performance

```javascript
logging: {
  enabled: true,
  format: ':method :url :status (:elapsed ms)'
}

// Filtre requests lentos
apiPlugin.on('request:end', (data) => {
  if (data.duration > 1000) {
    console.warn(`⚠️ Slow request: ${data.method} ${data.path} (${data.duration}ms)`);
  }
});
```

### 4. Silence Health Checks

Se não quiser logar health checks:

```javascript
// Use custom middleware para filtrar
middlewares: [
  async (c, next) => {
    if (c.req.path.startsWith('/health')) {
      c.set('skipLogging', true);
    }
    await next();
  }
]

logging: {
  enabled: true,
  filter: (c) => !c.get('skipLogging')  // Note: filter ainda não implementado
}
```

*(Feature `filter` planejada para próxima versão)*

---

## 📚 Mais Informações

- [API Plugin Logging Examples](./api-plugin-logging-examples.md) - Exemplos completos
- [API Plugin Configuration](./plugins/api.md) - Todas as opções
- [Events Reference](./api-plugin-events.md) - Event-based logging

---

**Última atualização**: 2025-11-10
