# EventualConsistency Plugin - Bug Fix 1-Pager

**Data:** 2025-10-09
**Versão Corrigida:** s3db.js 10.0.9
**Severity:** 🔴 Critical (Data Loss)
**Status:** ✅ Fixed & Tested

---

## 🐛 O Problema

O `EventualConsistencyPlugin` estava **calculando consolidações corretamente mas NÃO persistindo valores** no registro principal quando ele não existia, causando perda silenciosa de dados.

### Sintomas Observados

```javascript
// 3 clicks sequenciais em sync mode
[EventualConsistency] urls.clicks - abc123: 0 → 1 (+1)  ← Click 1
[EventualConsistency] urls.clicks - abc123: 0 → 1 (+1)  ← Click 2 (deveria ler 1!)
[EventualConsistency] urls.clicks - abc123: 0 → 1 (+1)  ← Click 3 (deveria ler 2!)

// Leitura do banco
GET /v1/urls/abc123
{ "clicks": 0 }  // ❌ Deveria ser 3
```

**Impacto:** Métricas de clicks, views, shares e scans não eram salvas no mrt-shortner.

---

## 🔍 Causa Raiz

O método `consolidateRecord()` tentava fazer `update()` em registros que **não existiam**, causando **falha silenciosa**.

### Código Problemático

```javascript
// ANTES (src/plugins/eventual-consistency.plugin.js:890)
const [updateOk, updateErr] = await tryFn(() =>
  this.targetResource.update(originalId, {
    [this.config.field]: consolidatedValue
  })
);

if (updateOk) {
  // Marca transações como aplicadas
}
// ❌ SEM ELSE! Se update falhar, nenhum log, nenhum erro
```

### Cenários que Causavam o Bug

1. **Click antes de URL existir** (mais comum no mrt-shortner)
   ```javascript
   // Event handler dispara antes do URL.insert() completar
   await clicks.insert({ urlId: 'abc123' })
   await urls.add('abc123', 'clicks', 1)  // ← URL não existe ainda!
   ```

2. **Record deletado mas transações existem**
   ```javascript
   await urls.delete('abc123')
   await urls.add('abc123', 'clicks', 1)  // ← Record foi deletado
   ```

3. **Race condition em eventos assíncronos**

---

## ✅ Solução Implementada

### 1. Padrão UPSERT

Modificado `consolidateRecord()` para usar **upsert pattern** (try update → fallback to insert):

```javascript
// DEPOIS (src/plugins/eventual-consistency.plugin.js:890-928)
const [updateOk, updateErr] = await tryFn(async () => {
  // 1️⃣ Tenta UPDATE primeiro
  const [ok, err] = await tryFn(() =>
    this.targetResource.update(originalId, {
      [this.config.field]: consolidatedValue
    })
  );

  // 2️⃣ Se falhou porque record não existe → INSERT
  if (!ok && (err?.code === 'NoSuchKey' || err?.code === 'NotFound')) {
    console.log(`Record ${originalId} não existe, criando com ${field}=${value}`);

    return await this.targetResource.insert({
      id: originalId,
      [this.config.field]: consolidatedValue
    });
  }

  // 3️⃣ Se falhou por outro motivo → THROW ERROR
  if (!ok) throw err;

  return ok;
});

// 4️⃣ Se ainda falhou, LOGA ERRO (não mais silencioso!)
if (!updateOk) {
  console.error(`FAILED to update ${originalId}: ${updateErr?.message}`);
  throw updateErr;
}
```

### 2. Logs Detalhados

Agora **TODOS os erros** são logados:

```javascript
✅ [EventualConsistency] urls.clicks - abc123: 0 → 3 (+3)
✅ [EventualConsistency] urls.clicks - Record abc123 não existe, criando com clicks=3
✅ [EventualConsistency] urls.clicks - Cache invalidated for abc123
```

---

## 🧪 Como Testar

### Teste Automatizado

```bash
# Roda suite completa de testes do bug fix
pnpm test tests/plugins/eventual-consistency-persistence-fix.test.js
```

### Teste Manual (mrt-shortner)

```javascript
// 1. Criar URL
const url = await App.db.resources.urls.insert({
  id: 'test123',
  link: 'https://example.com',
  clicks: 0
});

// 2. Deletar URL (simula race condition)
await App.db.resources.urls.delete('test123');

// 3. Adicionar clicks (antes falhava silenciosamente)
await App.db.resources.urls.add('test123', 'clicks', 5);
await App.db.resources.urls.consolidate('test123', 'clicks');

// 4. Verificar persistência (ANTES retornava null)
const result = await App.db.resources.urls.get('test123');
console.log(result); // ✅ { id: 'test123', clicks: 5 }
```

### Verificar Dados Perdidos (Recovery)

Se você suspeita que dados foram perdidos antes do fix:

```javascript
// Recuperar transações não aplicadas
const pending = await App.db.resources.urls_transactions_clicks.query({
  applied: false
});

console.log(`⚠️  ${pending.length} transações não aplicadas encontradas`);

// Reconsolidar manualmente
const uniqueIds = [...new Set(pending.map(t => t.originalId))];
for (const id of uniqueIds) {
  await App.db.resources.urls.consolidate(id, 'clicks');
}

console.log(`✅ ${uniqueIds.length} registros reconsolidados`);
```

---

## 📦 Deploy

### mrt-shortner

```bash
# Atualizar s3db.js para versão com fix
cd ~/work/martech/mrt-shortner
pnpm add file:../s3db.js

# Remover workaround manual (se houver)
# Você pode simplificar os event handlers agora!

# Rebuild
pnpm run build

# Test
pnpm test

# Deploy
pnpm run deploy
```

### Código Simplificado

**ANTES (com workaround manual):**
```javascript
events: {
  insert: [
    async function(data) {
      await App.db.resources.urls.add(data.urlId, 'clicks', 1);

      // ❌ Workaround manual (race condition!)
      const url = await App.db.resources.urls.get(data.urlId);
      await App.db.resources.urls.update(data.urlId, {
        clicks: (url?.clicks || 0) + 1
      });
    }
  ]
}
```

**DEPOIS (com fix):**
```javascript
events: {
  insert: [
    async function(data) {
      // ✅ Simplesmente adiciona - plugin persiste automaticamente
      await this.database.resources.urls.add(data.urlId, 'clicks', 1);
    }
  ]
}
```

---

## 📊 Impacto & Benefícios

| Antes | Depois |
|-------|--------|
| ❌ Consolidações não persistiam se record não existisse | ✅ Upsert automático (cria record se necessário) |
| ❌ Falhas silenciosas (sem logs) | ✅ Todos os erros logados detalhadamente |
| ❌ Dados perdidos em edge cases | ✅ Dados sempre persistidos |
| ❌ Workarounds manuais com race conditions | ✅ Não necessita workarounds |
| ❌ Impossível debugar | ✅ Logs claros facilitam debug |

---

## 📝 Arquivos Modificados

- ✅ `src/plugins/eventual-consistency.plugin.js` - Upsert logic + error logging
- ✅ `tests/plugins/eventual-consistency-persistence-fix.test.js` - 6 testes cobrindo todos os cenários
- ✅ `docs/plugins/eventual-consistency-persistence-bug-fix.md` - Documentação técnica completa
- ✅ `dist/` - Build atualizado

**Commits:**
- `29dd5bd` - fix: EventualConsistency now persists consolidated values (critical bug fix)
- `d141b6e` - fix: correct event binding tests to use regular functions

---

## 🎯 Próximos Passos

### Imediato (hoje)
- [ ] Deploy fix no mrt-shortner staging
- [ ] Rodar recovery script para dados perdidos (se houver)
- [ ] Validar métricas em staging

### Curto prazo (esta semana)
- [ ] Deploy em produção
- [ ] Monitorar logs de consolidação
- [ ] Remover workarounds manuais do código

### Médio prazo (próximas 2 semanas)
- [ ] Adicionar alertas para falhas de consolidação
- [ ] Dashboard de métricas do EventualConsistency
- [ ] Documentar padrões de uso do plugin

---

## 🙋 Perguntas Frequentes

**P: Dados antigos foram perdidos?**
R: Não! As transações foram criadas e salvas. Use o recovery script acima para reconsolidar.

**P: Preciso mudar meu código?**
R: Não! É drop-in replacement. Você pode REMOVER workarounds se tiver.

**P: Como saber se fui afetado?**
R: Execute o script de verificação acima. Se houver muitas transações `applied: false`, você foi afetado.

**P: Isso afeta outros plugins?**
R: Não. É fix isolado no EventualConsistencyPlugin.

---

## 👥 Time

**Reportado por:** Distribution Engineering @ Stone Payments
**Reproduzido em:** mrt-shortner (URL shortener enterprise)
**Corrigido por:** Filipe Forattini + Claude Code
**Revisado por:** _[Adicionar revisor]_

---

## 📚 Referências

- [Documentação técnica completa](./plugins/eventual-consistency-persistence-bug-fix.md)
- [Suite de testes](../tests/plugins/eventual-consistency-persistence-fix.test.js)
- [Commit principal](https://github.com/yourorg/s3db.js/commit/29dd5bd)

---

**Versão:** 1.0
**Última atualização:** 2025-10-09
**Classificação:** 🔴 Critical Fix
