# 🚀 NPX Setup - S3DB MCP Server

Use o S3DB MCP Server diretamente com `npx` - sem precisar clonar o repositório!

## ⚡ Quick Start (30 segundos)

### Para Claude CLI

```bash
# Adicionar o MCP server
claude mcp add s3db \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio
```

Pronto! Agora você pode usar todas as 39 tools do S3DB no Claude CLI.

### Para Claude Desktop

Edite `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou equivalente:

```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["-y", "s3db.js", "s3db-mcp", "--transport=sse"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://ACCESS_KEY:SECRET_KEY@bucket/databases/myapp",
        "S3DB_CACHE_ENABLED": "true",
        "S3DB_CACHE_DRIVER": "memory",
        "S3DB_COSTS_ENABLED": "true"
      }
    }
  }
}
```

## 🔧 Configurações Avançadas

### Com variáveis de ambiente

```bash
claude mcp add s3db \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio

# Depois edite para adicionar env vars
claude mcp edit s3db
```

Adicione:
```json
{
  "s3db": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "s3db.js", "s3db-mcp", "--transport=stdio"],
    "env": {
      "S3DB_CONNECTION_STRING": "s3://minioadmin:minioadmin123@localhost:9000/dev-bucket?forcePathStyle=true",
      "S3DB_CACHE_ENABLED": "true",
      "S3DB_CACHE_DRIVER": "memory",
      "S3DB_CACHE_MAX_SIZE": "1000",
      "S3DB_CACHE_TTL": "300000",
      "S3DB_VERBOSE": "false",
      "S3DB_COSTS_ENABLED": "true"
    }
  }
}
```

### Servidor HTTP (background)

```bash
# Iniciar servidor em background
npx s3db.js s3db-mcp --transport=sse &

# Ou com PM2
pm2 start "npx s3db.js s3db-mcp --transport=sse" --name s3db-mcp

# Configurar Claude CLI para usar HTTP
claude mcp add s3db --transport http http://localhost:17500/sse
```

### MCP Inspector (para testes)

```bash
# Inicie o inspector
npx @modelcontextprotocol/inspector

# Configure o comando:
npx -y s3db.js s3db-mcp --transport=stdio
```

## 🎯 Exemplos Práticos

### Exemplo 1: Development Local (MinIO)

```bash
# 1. Configurar MCP
claude mcp add s3db-dev \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio

# 2. Editar para adicionar MinIO
claude mcp edit s3db-dev

# 3. Adicionar:
{
  "env": {
    "S3DB_CONNECTION_STRING": "s3://minioadmin:minioadmin123@localhost:9000/dev-bucket?forcePathStyle=true"
  }
}

# 4. Testar
claude

# No chat:
"Connect to the database and create a test resource"
```

### Exemplo 2: Production (AWS S3)

```bash
# 1. Configurar MCP com credenciais AWS
claude mcp add s3db-prod \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio

# 2. Editar configuração
claude mcp edit s3db-prod

# 3. Adicionar credenciais seguras:
{
  "env": {
    "S3DB_CONNECTION_STRING": "s3://prod-data-bucket/databases/main",
    "AWS_ACCESS_KEY_ID": "AKIA...",
    "AWS_SECRET_ACCESS_KEY": "...",
    "AWS_REGION": "us-east-1",
    "S3DB_CACHE_DRIVER": "filesystem",
    "S3DB_CACHE_DIRECTORY": "/tmp/s3db-cache"
  }
}
```

### Exemplo 3: Múltiplos Ambientes

```bash
# Development
claude mcp add s3db-dev \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio

# Staging
claude mcp add s3db-staging \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio

# Production
claude mcp add s3db-prod \
  --transport stdio \
  -- npx -y s3db.js s3db-mcp --transport=stdio

# Ver todos
claude mcp list
```

## 🧪 Testando a Instalação

### 1. Verificar se o comando funciona

```bash
# Testar diretamente
npx -y s3db.js s3db-mcp --help

# Deve mostrar informações do servidor
```

### 2. Verificar configuração MCP

```bash
claude mcp list
```

Deve mostrar:
```
s3db - stdio://npx -y s3db.js s3db-mcp --transport=stdio
```

### 3. Testar no Claude

```bash
claude
```

No chat:
```
"Can you show me the S3DB MCP server status and list available tools?"
```

## 🔍 Comandos Úteis

```bash
# Ver servidores configurados
claude mcp list

# Ver detalhes de um servidor
claude mcp show s3db

# Remover servidor
claude mcp remove s3db

# Editar configuração
claude mcp edit s3db

# Testar servidor diretamente
npx -y s3db.js s3db-mcp --transport=stdio
```

## 📊 Variáveis de Ambiente Disponíveis

### Connection
```bash
S3DB_CONNECTION_STRING="s3://key:secret@bucket/path"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
```

### Cache
```bash
S3DB_CACHE_ENABLED="true"
S3DB_CACHE_DRIVER="memory"          # ou "filesystem"
S3DB_CACHE_MAX_SIZE="1000"          # apenas para memory
S3DB_CACHE_TTL="300000"             # 5 minutos em ms
S3DB_CACHE_DIRECTORY="./cache"      # apenas para filesystem
S3DB_CACHE_PREFIX="s3db"
```

### Server
```bash
MCP_TRANSPORT="sse"                 # ou "stdio"
MCP_SERVER_HOST="0.0.0.0"
MCP_SERVER_PORT="17500"
NODE_ENV="production"               # ou "development"
```

### S3DB Core
```bash
S3DB_VERBOSE="false"
S3DB_PARALLELISM="10"
S3DB_PASSPHRASE="secret"
S3DB_VERSIONING_ENABLED="false"
S3DB_COSTS_ENABLED="true"
```

## 🐛 Troubleshooting

### Erro: "command not found: npx"

```bash
# Instalar Node.js/npm primeiro
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
```

### Erro: "package not found: s3db.js"

```bash
# Verificar se o pacote existe
npm view s3db.js

# Usar versão específica
npx s3db.js@latest s3db-mcp --transport=stdio
```

### Erro: "Database not connected"

No chat do Claude, sempre conecte primeiro:
```
"Please connect to the database using dbConnect with connection string: s3://..."
```

### Servidor não responde

```bash
# Verificar se está rodando
ps aux | grep s3db-mcp

# Matar processos antigos
pkill -f s3db-mcp

# Reiniciar
npx -y s3db.js s3db-mcp --transport=sse
```

### Ver logs detalhados

```bash
# Ativar verbose mode
S3DB_VERBOSE=true npx -y s3db.js s3db-mcp --transport=stdio
```

## 🎉 Vantagens do npx

✅ **Sem instalação** - não precisa clonar o repo
✅ **Sempre atualizado** - usa a última versão publicada
✅ **Fácil de compartilhar** - um comando funciona para todos
✅ **Zero configuração** - funciona out-of-the-box
✅ **Multi-ambiente** - configure dev/staging/prod facilmente

## 📚 Recursos

- [MCP Documentation](https://modelcontextprotocol.io)
- [S3DB Documentation](../README.md)
- [Full MCP Guide](../docs/mcp.md)
- [Claude CLI](https://docs.claude.com/en/docs/claude-code)
- [NPM Package](https://www.npmjs.com/package/s3db.js)

## ⚡ One-Liner Setup

```bash
# Tudo em um comando:
claude mcp add s3db --transport stdio -- npx -y s3db.js s3db-mcp --transport=stdio && echo "✅ S3DB MCP Server configured! Type 'claude' to start."
```

Pronto! Agora você pode usar `npx s3db.js s3db-mcp` de qualquer lugar! 🚀
