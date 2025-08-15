# 🚀 Quick Release Guide

## 🎯 TL;DR - Release em 3 comandos

```bash
# 1. Check se está tudo OK
pnpm run release:check

# 2. Release automático (faz tudo)
pnpm run release v9.0.2

# 3. Monitore no GitHub
# https://github.com/forattini-dev/s3db.js/actions
```

## ⚡ O que o script automático faz:

1. **✅ Valida ambiente** (branch, git status, etc.)
2. **📝 Atualiza package.json** com nova versão
3. **🏗️ Build com versão embedada** no JavaScript
4. **🧪 Roda testes** com novo build
5. **📋 Gera CHANGELOG.md**
6. **📦 Commit tudo junto** (package.json + dist/ + CHANGELOG.md)
7. **🏷️ Cria tag** e push
8. **🚀 GitHub Actions** pega o resto (binários + release)

## 🔄 Sequência Manual (se preferir)

```bash
# 1. Pre-check
pnpm run release:check

# 2. Editar package.json manualmente
# "version": "9.0.2" (sem 'v')

# 3. Build com nova versão
pnpm run build

# 4. Testar
pnpm run test:quick && pnpm run test:ts

# 5. Commit tudo
git add package.json dist/
git commit -m "chore: release v9.0.2"

# 6. Tag e push
git tag v9.0.2
git push origin main --tags
```

## ⚠️ Pontos Críticos

### Versão Embedada
- **package.json**: `"9.0.2"` (sem prefixo)
- **Git tag**: `v9.0.2` (com prefixo)
- **Build embeds**: Versão do package.json vai para o JS

### O que é commitado
```
✅ package.json   # Nova versão
✅ dist/         # Build com versão embedada
✅ CHANGELOG.md  # Auto-gerado
❌ releases/     # Só local (.gitignore)
```

### Após o push da tag
O GitHub Actions automaticamente:
- 🧪 Roda CI completa
- 🔨 Build 8 binários (Linux/macOS/Windows + CLI/MCP)
- 🎉 Cria GitHub release com release notes
- 📦 Publica no npm (se configurado)

## 🎯 Tipos de Release

```bash
# Patch (bug fixes)
pnpm run release v9.0.3

# Minor (new features)
pnpm run release v9.1.0

# Major (breaking changes)  
pnpm run release v10.0.0
```

## 🚨 Se algo der errado

```bash
# Cancelar release local (antes do push)
git reset --hard HEAD~1
git tag -d v9.0.2

# Ver o que foi embedado
grep -o '"[0-9]\+\.[0-9]\+\.[0-9]\+"' dist/s3db.cjs.js

# Re-check
pnpm run release:check
```

## ✅ Sucesso

Após release bem-sucedida:
- ✅ GitHub release criada
- ✅ Binários disponíveis para download
- ✅ npm package publicado
- ✅ dist/ com versão correta commitada

**Pronto para usar!** 🎉