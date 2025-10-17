# 🚀 Claude CLI Setup Guide

Este guia mostra como configurar o S3DB MCP Server para usar com o Claude CLI.

## 📋 Pré-requisitos

```bash
# Verificar se Claude CLI está instalado
claude --version

# Verificar se o projeto está instalado
cd /home/ff/work/martech/s3db.js
pnpm install

# Instalar dependências do MCP (se ainda não estiver)
pnpm add zod@3 express
```

## 🔌 Métodos de Configuração

### Método 1: Stdio Transport (Recomendado para desenvolvimento)

O Claude CLI vai spawnar o servidor automaticamente quando necessário.

```bash
claude mcp add s3db \
  --transport stdio \
  -- node /home/ff/work/martech/s3db.js/mcp/entrypoint.js --transport=stdio
```

**Variáveis de ambiente** (opcional):
```bash
# Editar configuração para adicionar env vars
claude mcp edit s3db

# Adicionar na seção env:
{
  "s3db": {
    "transport": "stdio",
    "command": "node",
    "args": ["/home/ff/work/martech/s3db.js/mcp/entrypoint.js", "--transport=stdio"],
    "env": {
      "S3DB_CONNECTION_STRING": "s3://minioadmin:minioadmin123@localhost:9000/dev-bucket?forcePathStyle=true",
      "S3DB_CACHE_ENABLED": "true",
      "S3DB_CACHE_DRIVER": "memory",
      "S3DB_VERBOSE": "false"
    }
  }
}
```

### Método 2: HTTP Transport (Recomendado para produção)

Primeiro, inicie o servidor em background:

```bash
# Inicie o servidor HTTP
cd /home/ff/work/martech/s3db.js
node mcp/entrypoint.js --transport=sse &

# Ou com PM2 para auto-restart
pm2 start mcp/entrypoint.js --name s3db-mcp -- --transport=sse
pm2 save
```

Depois configure o Claude CLI:

```bash
claude mcp add s3db --transport http http://localhost:17500/sse
```

## 🧪 Testando a Configuração

### 1. Verificar servidores configurados

```bash
claude mcp list
```

Você deve ver:
```
s3db - stdio://node /home/ff/work/martech/s3db.js/mcp/entrypoint.js --transport=stdio
```

### 2. Testar conexão

```bash
# Iniciar sessão do Claude
claude

# No chat, testar as tools:
# "Can you connect to the S3DB database and list available resources?"
```

### 3. Comandos de teste no Claude Chat

```
1. Conectar ao banco:
   "Connect to the S3DB database using dbConnect"

2. Listar recursos:
   "List all resources in the database using dbListResources"

3. Criar um recurso de teste:
   "Create a resource called 'test_users' with fields: name (string, required), email (string, required), age (number)"

4. Inserir dados:
   "Insert a test user with name 'John Doe', email 'john@example.com', age 30"

5. Ver estatísticas:
   "Show me database statistics including cache and costs"
```

## 🔧 Configurações Avançadas

### Configurar para múltiplos ambientes

```bash
# Development (local MinIO)
claude mcp add s3db-dev \
  --transport stdio \
  -- node /home/ff/work/martech/s3db.js/mcp/entrypoint.js --transport=stdio

# Production (AWS S3)
claude mcp add s3db-prod \
  --transport http \
  http://production-server:17500/sse
```

### Editar configuração existente

```bash
# Ver configuração atual
claude mcp show s3db

# Editar configuração
claude mcp edit s3db

# Remover servidor
claude mcp remove s3db
```

## 📊 Tools Disponíveis (39 total)

### 🔌 Connection Management (3)
- `dbConnect` - Connect to S3DB database
- `dbDisconnect` - Disconnect from database
- `dbStatus` - Get connection status

### 📦 Resource Management (2)
- `dbCreateResource` - Create new resource/collection
- `dbListResources` - List all resources

### 🔍 Debugging Tools (5)
- `dbInspectResource` - Detailed resource inspection
- `dbGetMetadata` - Get raw metadata.json
- `resourceValidate` - Validate data against schema
- `dbHealthCheck` - Comprehensive health check
- `resourceGetRaw` - Get raw S3 object data

### 📊 Query & Filtering (2)
- `resourceQuery` - Complex queries with filters
- `resourceSearch` - Text search in fields

### 🔧 Partition Management (4)
- `resourceListPartitions` - List all partitions
- `resourceListPartitionValues` - List partition values
- `dbFindOrphanedPartitions` - Find orphaned partitions
- `dbRemoveOrphanedPartitions` - Remove orphaned partitions

### ✏️ CRUD Operations (14)
- `resourceInsert` - Insert single document
- `resourceInsertMany` - Insert multiple documents
- `resourceGet` - Get document by ID
- `resourceGetMany` - Get multiple documents
- `resourceUpdate` - Update document
- `resourceUpsert` - Insert or update
- `resourceDelete` - Delete document
- `resourceDeleteMany` - Delete multiple documents
- `resourceExists` - Check if document exists
- `resourceList` - List with pagination
- `resourceListIds` - List document IDs
- `resourceCount` - Count documents
- `resourceGetAll` - Get all documents
- `resourceDeleteAll` - Delete all documents

### 🚀 Bulk Operations (2)
- `resourceUpdateMany` - Update multiple documents
- `resourceBulkUpsert` - Bulk upsert operation

### 💾 Export/Import (3)
- `resourceExport` - Export to JSON/CSV/NDJSON
- `resourceImport` - Import from JSON/NDJSON
- `dbBackupMetadata` - Backup metadata.json

### 📈 Monitoring (4)
- `dbGetStats` - Database statistics
- `dbClearCache` - Clear cache
- `resourceGetStats` - Resource statistics
- `cacheGetStats` - Cache statistics

## 🐛 Troubleshooting

### Erro: "Command not found"

```bash
# Usar caminho absoluto completo
claude mcp add s3db \
  --transport stdio \
  -- /home/ff/.nvm/versions/node/v22.6.0/bin/node \
  /home/ff/work/martech/s3db.js/mcp/entrypoint.js --transport=stdio
```

### Erro: "Connection refused" (HTTP)

```bash
# Verificar se o servidor está rodando
curl http://localhost:17500/health

# Se não estiver, inicie:
cd /home/ff/work/martech/s3db.js
node mcp/entrypoint.js --transport=sse
```

### Erro: "Database not connected"

No chat do Claude, sempre conecte primeiro:
```
"Please connect to the database first using dbConnect with connection string: s3://minioadmin:minioadmin123@localhost:9000/dev-bucket"
```

### Ver logs do servidor

```bash
# Se usando PM2
pm2 logs s3db-mcp

# Se rodando diretamente
# Os logs aparecem no terminal onde iniciou o servidor
```

## 📚 Recursos Adicionais

- [MCP Documentation](https://modelcontextprotocol.io)
- [S3DB Documentation](../README.md)
- [Full MCP Documentation](../docs/mcp.md)
- [Claude CLI Documentation](https://docs.claude.com/en/docs/claude-code)

## 🎯 Exemplos de Uso

### Exemplo 1: CRUD Básico

```
User: Connect to local MinIO and create a users resource

Claude will:
1. Use dbConnect with MinIO connection string
2. Use dbCreateResource to create 'users' resource
3. Confirm creation with dbListResources

User: Insert 5 test users

Claude will:
1. Use resourceInsertMany with test data
2. Confirm with resourceCount
```

### Exemplo 2: Análise de Performance

```
User: Analyze database performance and suggest optimizations

Claude will:
1. Use dbGetStats to get overall statistics
2. Use cacheGetStats to check cache performance
3. Use dbHealthCheck to find issues
4. Provide optimization suggestions
```

### Exemplo 3: Partition Recovery

```
User: Check for orphaned partitions and fix them

Claude will:
1. Use dbFindOrphanedPartitions to detect issues
2. Use dbRemoveOrphanedPartitions with dryRun:true to preview
3. Execute removal with dryRun:false
4. Verify with dbHealthCheck
```

## ✅ Checklist de Configuração

- [ ] Claude CLI instalado e funcionando
- [ ] S3DB.js projeto instalado (pnpm install)
- [ ] Servidor MCP configurado (claude mcp add)
- [ ] Conexão testada (claude mcp list)
- [ ] Tools testadas no chat do Claude
- [ ] Environment variables configuradas (se necessário)
- [ ] Backup da configuração (claude mcp show s3db > backup.json)

Pronto! Agora você pode usar todas as 39 tools do S3DB diretamente no Claude CLI! 🎉
