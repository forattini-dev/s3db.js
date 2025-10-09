# mrt-shortner - Como Usar s3db.js Local com Fix

**Data:** 09/10/2025
**Problema:** s3db.js 10.0.9 do npm NÃO tem o fix do EventualConsistency
**Solução:** Usar versão local do s3db.js com fix

---

## 🎯 O Problema

```
mrt-shortner está usando:
├─ s3db.js@10.0.9 do npm
└─ ❌ NÃO tem o fix de persistência do EventualConsistency

s3db.js local (~/work/martech/s3db.js):
├─ s3db.js@10.0.9 LOCAL
└─ ✅ TEM o fix de persistência (commits 29dd5bd + 13b1fd3)
```

## ✅ Solução: Usar Versão Local

### Opção 1: pnpm link (Recomendado para Dev)

```bash
# 1. No repositório s3db.js (fazer link global)
cd ~/work/martech/s3db.js
pnpm link --global

# 2. No repositório mrt-shortner (usar link global)
cd ~/work/martech/mrt-shortner
pnpm link --global s3db.js

# 3. Verificar versão instalada
pnpm list s3db.js

# Output esperado:
# s3db.js 10.0.9 -> ~/work/martech/s3db.js

# 4. Rebuild do mrt-shortner
pnpm run build

# 5. Restart containers
docker compose restart

# 6. Testar
node test-eventual-consistency.mjs
```

**Verificar se funcionou:**
```bash
# Dentro do container
docker exec mrt-shortner-svc-1 cat /home/app/node_modules/s3db.js/package.json | grep '"version"'

# Output: "version": "10.0.9",

# Verificar se é link
docker exec mrt-shortner-svc-1 ls -la /home/app/node_modules/s3db.js

# Se for link, verá: lrwxrwxrwx ... -> ~/work/martech/s3db.js
```

---

### Opção 2: file: Protocol (Alternativa)

```bash
cd ~/work/martech/mrt-shortner

# 1. Remover versão do npm
pnpm remove s3db.js

# 2. Instalar versão local usando file:
pnpm add file:../s3db.js

# 3. Verificar instalação
pnpm list s3db.js

# Output esperado:
# s3db.js 10.0.9 file:../s3db.js

# 4. Rebuild
pnpm run build

# 5. Rebuild containers (importante!)
docker compose build svc

# 6. Restart
docker compose up -d

# 7. Testar
node test-eventual-consistency.mjs
```

---

### Opção 3: Docker Volume Mount (Dev Only)

Adicione ao `docker-compose.yml`:

```yaml
services:
  svc:
    volumes:
      # ... outros volumes
      - ../s3db.js:/home/app/node_modules/s3db.js:ro  # Read-only mount
```

Depois:

```bash
docker compose down
docker compose up -d
```

**⚠️ CUIDADO:** Este método só funciona em dev, não vai para produção.

---

## 🧪 Como Testar se o Fix Está Funcionando

### Teste Automatizado

```bash
cd ~/work/martech/mrt-shortner
node test-eventual-consistency.mjs 2>&1
```

**Saída esperada (COM FIX):**
```
🧪 Testing EventualConsistency plugin in isolation

1  Creating new URL...
   ✅ URL created: test-xxxx

2  Adding clicks (BEFORE fix would fail here)...
   ✅ Added 3 clicks

3  Reading back from database...
   ✅ Clicks persisted: 3

✅ ALL TESTS PASSED - EventualConsistency is working!
```

**Saída esperada (SEM FIX):**
```
3  Reading back from database...
   ❌ Clicks NOT persisted: 0 (expected: 3)

❌ BUG STILL PRESENT - EventualConsistency not persisting values
```

### Teste Manual via API

```bash
# 1. Criar URL
curl -X POST http://localhost:8000/v1/urls \
  -H "Authorization: Basic ..." \
  -H "Content-Type: application/json" \
  -d '{
    "link": "https://example.com"
  }'

# Response: {"id": "abc123", "clicks": 0, ...}

# 2. Criar clicks
curl -X POST http://localhost:8000/v1/clicks \
  -H "Authorization: Basic ..." \
  -H "Content-Type: application/json" \
  -d '{"urlId": "abc123"}'

curl -X POST http://localhost:8000/v1/clicks \
  -H "Authorization: Basic ..." \
  -H "Content-Type: application/json" \
  -d '{"urlId": "abc123"}'

curl -X POST http://localhost:8000/v1/clicks \
  -H "Authorization: Basic ..." \
  -H "Content-Type: application/json" \
  -d '{"urlId": "abc123"}'

# 3. Aguardar 2 segundos (consolidação)
sleep 2

# 4. Verificar
curl http://localhost:8000/v1/urls/abc123 \
  -H "Authorization: Basic ..."

# Esperado COM FIX:
# {"id": "abc123", "clicks": 3, ...}

# Esperado SEM FIX:
# {"id": "abc123", "clicks": 0, ...}  ❌
```

---

## 📊 Verificar Logs de Consolidação

```bash
# Ver logs do container
docker compose logs svc -f | grep EventualConsistency

# Esperado COM FIX:
[EventualConsistency] urls.clicks - abc123: 0 → 3 (+3)
[EventualConsistency] urls.clicks - Record abc123 doesn't exist, creating with clicks=3
[EventualConsistency] urls.clicks - Cache invalidated for abc123

# Esperado SEM FIX:
[EventualConsistency] urls.clicks - abc123: 0 → 1 (+1)
[EventualConsistency] urls.clicks - abc123: 0 → 1 (+1)  ← Sempre 0!
[EventualConsistency] urls.clicks - abc123: 0 → 1 (+1)  ← Nunca incrementa!
```

---

## 🔄 Reverter para Versão NPM (se necessário)

### Se usou pnpm link:

```bash
cd ~/work/martech/mrt-shortner

# 1. Desfazer link
pnpm unlink s3db.js

# 2. Reinstalar do npm
pnpm add s3db.js@10.0.9

# 3. Rebuild
pnpm run build
docker compose restart
```

### Se usou file: protocol:

```bash
cd ~/work/martech/mrt-shortner

# 1. Remover file: reference
pnpm remove s3db.js

# 2. Reinstalar do npm
pnpm add s3db.js@10.0.9

# 3. Rebuild
pnpm run build
docker compose build svc
docker compose up -d
```

---

## 🚀 Deploy em Produção

**⚠️ IMPORTANTE:** Não faça deploy da versão local em produção!

**Aguarde:**
1. s3db.js 10.0.10 ser publicado no npm com fix
2. Ou
3. s3db.js 11.0.0 com breaking changes + fix

**Depois:**
```bash
cd ~/work/martech/mrt-shortner

# 1. Desfazer link (se estiver usando)
pnpm unlink s3db.js  # ou pnpm remove s3db.js

# 2. Instalar versão publicada
pnpm add s3db.js@10.0.10  # ou @11.0.0

# 3. Testar
pnpm test
node test-eventual-consistency.mjs

# 4. Deploy
pnpm run deploy:prod
```

---

## 🐛 Troubleshooting

### Problema: Link não funciona no Docker

**Sintoma:** `docker exec` mostra versão npm, não local

**Solução:**
```bash
# 1. Rebuild container (força reinstalação)
docker compose build --no-cache svc

# 2. Restart
docker compose up -d

# 3. Verificar dentro do container
docker exec mrt-shortner-svc-1 pnpm list s3db.js
```

### Problema: "Cannot find module 's3db.js'"

**Sintoma:** Erro ao importar s3db.js

**Solução:**
```bash
# 1. Verificar node_modules
ls -la node_modules/s3db.js

# 2. Se não existir, reinstalar
pnpm install

# 3. Se ainda falhar, limpar cache
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Problema: Fix não funciona mesmo com link

**Verificar:**
```bash
# 1. Versão do s3db.js local está correta?
cd ~/work/martech/s3db.js
git log -1 --oneline
# Deve mostrar: 13b1fd3 fix: correct EventualConsistency upsert...

# 2. Build foi executado?
cd ~/work/martech/s3db.js
pnpm run build

# 3. Link está correto?
cd ~/work/martech/mrt-shortner
ls -la node_modules/s3db.js
# Deve ser symlink para ~/work/martech/s3db.js
```

---

## 📝 Checklist de Instalação

```bash
# ✅ 1. Verificar que s3db.js local tem o fix
cd ~/work/martech/s3db.js
git log --oneline | head -5
# Deve ter commits: 13b1fd3, 29dd5bd

# ✅ 2. Build do s3db.js local
pnpm run build

# ✅ 3. Escolher método (pnpm link OU file:)
# RECOMENDADO: pnpm link
pnpm link --global

# ✅ 4. Usar no mrt-shortner
cd ~/work/martech/mrt-shortner
pnpm link --global s3db.js

# ✅ 5. Verificar instalação
pnpm list s3db.js
# Deve mostrar: s3db.js 10.0.9 -> ~/work/martech/s3db.js

# ✅ 6. Rebuild mrt-shortner
pnpm run build

# ✅ 7. Restart containers
docker compose restart

# ✅ 8. Testar fix
node test-eventual-consistency.mjs

# ✅ 9. Verificar logs
docker compose logs svc --tail 50 | grep EventualConsistency
```

---

## 🎯 Resultado Esperado

```
ANTES (s3db.js@10.0.9 do npm):
└─ ❌ Clicks sempre 0
└─ ❌ Views sempre 0
└─ ❌ Shares sempre 0
└─ ❌ Scans sempre 0

DEPOIS (s3db.js@10.0.9 local com fix):
└─ ✅ Clicks incrementam corretamente
└─ ✅ Views incrementam corretamente
└─ ✅ Shares incrementam corretamente
└─ ✅ Scans incrementam corretamente
```

---

## 📚 Referências

- [1-pager do Bug Fix](./1-pager-eventual-consistency-bug-fix.pt-BR.md)
- [Documentação Técnica](./plugins/eventual-consistency-persistence-bug-fix.md)
- [Testes de Simulação](../tests/plugins/eventual-consistency-real-world-simulation.test.js)

---

**Versão:** 1.0
**Data:** 09/10/2025
**Time:** Distribution Engineering @ Stone Payments
