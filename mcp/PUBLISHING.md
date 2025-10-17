# 📦 Publishing S3DB MCP Server to NPM

Este guia garante que o MCP server funcione perfeitamente com `npx` após publicação no NPM.

## ✅ Checklist Pré-Publicação

### 1. Build & Tests
```bash
# Build do projeto
pnpm run build

# Rodar testes rápidos
pnpm run test:quick

# Testar MCP server localmente
pnpm run test:mcp
```

### 2. Verificar Arquivos que Serão Publicados
```bash
# Simular publicação (dry-run)
npm pack --dry-run

# Ver exatamente o que será publicado
npm pack
tar -tzf s3db.js-*.tgz | less

# Limpar arquivo gerado
rm s3db.js-*.tgz
```

### 3. Verificar Binary Entry Point
```bash
# Conferir que o entrypoint está executável
ls -la mcp/entrypoint.js

# Deve mostrar: -rwxrwxr-x (permissões de execução)
# Se não tiver, executar: chmod +x mcp/entrypoint.js

# Testar shebang
head -1 mcp/entrypoint.js
# Deve mostrar: #!/usr/bin/env node
```

### 4. Testar Localmente com NPX
```bash
# Simular o que o usuário vai fazer
npx -y ./

# Ou instalar localmente e testar
npm link
npx s3db.js s3db-mcp --transport=stdio
npm unlink
```

## 📋 O Que Será Publicado

O NPM irá incluir apenas:

```
s3db.js/
├── dist/                      # Código compilado
│   ├── s3db.cjs.js           # CommonJS
│   ├── s3db.es.js            # ES Modules
│   └── s3db.d.ts             # TypeScript definitions
├── src/                       # Código fonte (para debugging)
├── bin/
│   └── cli.js                # CLI principal
├── mcp/                       # MCP Server (completo!)
│   ├── entrypoint.js         # 🎯 Entry point para npx
│   ├── tools/                # Todas as tools
│   ├── README.md             # Quick reference
│   ├── NPX_SETUP.md          # Guia de setup
│   └── CLAUDE_CLI_SETUP.md   # Guia Claude CLI
├── docs/
│   └── mcp.md                # Documentação completa
├── package.json
├── README.md
├── PLUGINS.md
├── SECURITY.md
└── UNLICENSE
```

**Tamanho estimado**: ~2-3 MB (sem tests, examples, binários)

## 🚀 Publicar no NPM

### Primeira Vez
```bash
# Login no NPM
npm login

# Publicar (com prepublishOnly automático)
npm publish

# Ou publicar como beta
npm publish --tag beta
```

### Atualizações
```bash
# Bump version (patch/minor/major)
npm version patch -m "fix: improve MCP server performance"
npm version minor -m "feat: add new MCP tools"
npm version major -m "BREAKING CHANGE: new MCP API"

# Publicar
npm publish
```

## 🧪 Validar Após Publicação

### 1. Testar NPX Imediatamente
```bash
# Aguardar 1-2 minutos para propagar no NPM CDN

# Testar comando direto
npx -y s3db.js@latest s3db-mcp --help

# Testar com Claude CLI
claude mcp add s3db-test \
  --transport stdio \
  -- npx -y s3db.js@latest s3db-mcp --transport=stdio

# Verificar se foi adicionado
claude mcp list

# Testar no chat
claude
# Digitar: "Show me S3DB MCP server status"

# Remover teste
claude mcp remove s3db-test
```

### 2. Verificar Página NPM
- Acesse: https://www.npmjs.com/package/s3db.js
- ✅ README renderizado corretamente
- ✅ Keywords incluem "mcp", "model-context-protocol"
- ✅ Binaries listados: `s3db-mcp`
- ✅ Files incluem `mcp/`

### 3. Verificar Tamanho do Pacote
```bash
# Ver tamanho do pacote publicado
npm view s3db.js dist.unpackedSize

# Deve ser < 5MB (ideal: 2-3MB)
```

## ❌ Troubleshooting

### Erro: "command not found: s3db-mcp"
**Causa**: Shebang faltando ou permissões incorretas
**Solução**:
```bash
# Adicionar shebang no início do arquivo
echo '#!/usr/bin/env node' | cat - mcp/entrypoint.js > temp && mv temp mcp/entrypoint.js

# Dar permissões de execução
chmod +x mcp/entrypoint.js

# Republicar
npm version patch -m "fix: add executable permissions to mcp entrypoint"
npm publish
```

### Erro: "Cannot find module '@modelcontextprotocol/sdk'"
**Causa**: Dependência não está em `dependencies`
**Solução**:
```bash
# Mover de devDependencies para dependencies
npm install --save @modelcontextprotocol/sdk

# Republicar
npm version patch -m "fix: move MCP SDK to dependencies"
npm publish
```

### Erro: "mcp/ directory not found"
**Causa**: `.npmignore` bloqueando `mcp/` ou faltando em `files`
**Solução**:
```bash
# Verificar package.json
cat package.json | jq '.files'
# Deve incluir "mcp/"

# Verificar .npmignore
cat .npmignore | grep "mcp/"
# Não deve ter "mcp/" listado

# Republicar
npm version patch -m "fix: include mcp directory in package"
npm publish
```

## 🎯 Comandos Úteis

```bash
# Ver informações do pacote publicado
npm view s3db.js

# Ver versões publicadas
npm view s3db.js versions

# Verificar quem tem acesso
npm access list packages

# Deprecate uma versão (se necessário)
npm deprecate s3db.js@11.2.5 "Use version 11.2.6 or higher"

# Unpublish (CUIDADO! Só nas primeiras 72h)
npm unpublish s3db.js@11.2.6
```

## 📊 Monitoramento Pós-Publicação

### Downloads
```bash
# Ver estatísticas de download
npm view s3db.js

# Ver downloads semanais
open "https://www.npmjs.com/package/s3db.js"
```

### Issues
- Monitor: https://github.com/forattini-dev/s3db.js/issues
- Filtrar por label: `mcp`, `npx`

## 🔄 Workflow Completo

```bash
# 1. Fazer mudanças no código
vim mcp/entrypoint.js

# 2. Testar localmente
pnpm run test:mcp

# 3. Commit
git add .
git commit -m "feat: improve MCP server"

# 4. Bump version (roda prepublishOnly automaticamente)
npm version patch -m "feat: improve MCP server"

# 5. Push (com tag)
git push && git push --tags

# 6. Publicar
npm publish

# 7. Validar
npx -y s3db.js@latest s3db-mcp --help

# 8. Celebrar! 🎉
```

## 🎉 Checklist Final

Antes de publicar, confirme:

- [ ] ✅ `pnpm run build` - Build funcionando
- [ ] ✅ `pnpm run test:quick` - Tests passando
- [ ] ✅ `pnpm run test:mcp` - MCP server iniciando
- [ ] ✅ `npm pack --dry-run` - Arquivos corretos
- [ ] ✅ `ls -la mcp/entrypoint.js` - Permissões de execução
- [ ] ✅ `head -1 mcp/entrypoint.js` - Shebang presente
- [ ] ✅ `cat package.json | jq '.files'` - Inclui `mcp/`
- [ ] ✅ `cat package.json | jq '.bin'` - Inclui `s3db-mcp`
- [ ] ✅ `cat package.json | jq '.dependencies'` - MCP SDK incluído
- [ ] ✅ Version bumped
- [ ] ✅ Git committed e pushed
- [ ] ✅ Ready to publish! 🚀

## 📚 Recursos

- [NPM Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [NPM Pack Documentation](https://docs.npmjs.com/cli/v9/commands/npm-pack)
- [Semantic Versioning](https://semver.org/)
- [MCP Documentation](https://modelcontextprotocol.io)
