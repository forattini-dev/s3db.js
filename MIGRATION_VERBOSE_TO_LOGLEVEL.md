# 🔄 Migration Guide: `verbose` → `logLevel`

**Status**: IN PROGRESS
**Criado em**: 2025-11-16
**Estratégia**: Migração Agressiva (remoção total de `verbose`)

## 📋 Resumo Executivo

Este documento descreve a migração completa do sistema binário `verbose: true/false` para o sistema granular `logLevel` baseado em Pino.

### Mapeamento

| Antigo | Novo |
|--------|------|
| `verbose: true` | `logLevel: 'debug'` |
| `verbose: false` | `logLevel: 'info'` |
| `this.verbose` | `this.logger.level` |
| `if (verbose)` | `this.logger.debug()` |
| `options.verbose` | `options.logLevel` |

---

## ✅ Arquivos Já Migrados

### 1. `src/plugins/concerns/plugin-options.js` ✅
**Status**: COMPLETO (já estava correto)

### 2. `src/concerns/logger.js` ✅
**Status**: COMPLETO (já estava correto)

---

## 🔧 Arquivos Que Precisam de Migração

### 1. `src/database.class.js`

**Mudanças necessárias:**

#### Linha 28 (comentário)
```javascript
// ANTES:
//     verbose: false,              // Database option (root)

// DEPOIS:
//     logLevel: 'info',            // Database option (root)
```

#### Linha 36-39 (super constructor)
```javascript
// ANTES:
super({
  verbose: options.verbose || false,
  autoCleanup: options.autoCleanup !== false
});

// DEPOIS:
super({
  logLevel: options.logLevel || options.loggerOptions?.level || 'info',
  autoCleanup: options.autoCleanup !== false
});
```

#### Linha 96 (remover this.verbose)
```javascript
// ANTES:
this.verbose = options.verbose ?? false;

// DEPOIS:
// Removed: this.verbose (migrated to logger.level)
```

#### Linha 155-156 (ProcessManager)
```javascript
// ANTES:
this.processManager = options.processManager ?? new ProcessManager({
  verbose: this.verbose,
  exitOnSignal
});

// DEPOIS:
this.processManager = options.processManager ?? new ProcessManager({
  logLevel: this.logger.level,
  exitOnSignal
});
```

#### Linha 160-163 (CronManager)
```javascript
// ANTES:
this.cronManager = options.cronManager ?? new CronManager({
  verbose: this.verbose,
  exitOnSignal
});

// DEPOIS:
this.cronManager = options.cronManager ?? new CronManager({
  logLevel: this.logger.level,
  exitOnSignal
});
```

#### Linha 242 (MemoryClient)
```javascript
// ANTES:
verbose: this.verbose,

// DEPOIS:
logLevel: this.logger.level,
```

#### Linha 251 (FileSystemClient)
```javascript
// ANTES:
verbose: this.verbose,

// DEPOIS:
logLevel: this.logger.level,
```

#### Linha 258 (S3Client - primeiro)
```javascript
// ANTES:
verbose: this.verbose,

// DEPOIS:
logLevel: this.logger.level,
```

#### Linha 271 (S3Client - fallback)
```javascript
// ANTES:
verbose: this.verbose,

// DEPOIS:
logLevel: this.logger.level,
```

#### Linha 283 (S3Client - defaults)
```javascript
// ANTES:
verbose: this.verbose,

// DEPOIS:
logLevel: this.logger.level,
```

#### Linha 1010 (GlobalCoordinatorService)
```javascript
// ANTES:
diagnosticsEnabled: this.verbose

// DEPOIS:
diagnosticsEnabled: this.logger.level === 'debug' || this.logger.level === 'trace'
```

#### Linha 1949 (config getter)
```javascript
// ANTES:
get config() {
  return {
    version: this.version,
    s3dbVersion: this.s3dbVersion,
    bucket: this.bucket,
    keyPrefix: this.keyPrefix,
    taskExecutor: this.taskExecutor,
    verbose: this.verbose
  };
}

// DEPOIS:
get config() {
  return {
    version: this.version,
    s3dbVersion: this.s3dbVersion,
    bucket: this.bucket,
    keyPrefix: this.keyPrefix,
    taskExecutor: this.taskExecutor,
    logLevel: this.logger.level
  };
}
```

---

### 2. `src/concerns/safe-event-emitter.js`

**Mudanças necessárias:**

#### Linha 12 (comentário exemplo)
```javascript
// ANTES:
 *     super({ verbose: true });

// DEPOIS:
 *     super({ logLevel: 'debug' });
```

#### Linha 28-32 (constructor options)
```javascript
// ANTES:
this.options = {
  verbose: options.verbose || false,
  autoCleanup: options.autoCleanup !== false,
  maxListeners: options.maxListeners || 0
};

// DEPOIS:
this.options = {
  logLevel: options.logLevel || 'info',
  autoCleanup: options.autoCleanup !== false,
  maxListeners: options.maxListeners || 0
};
```

#### Linha 34-40 (logger initialization)
```javascript
// ANTES:
if (options.logger) {
  this.logger = options.logger;
} else {
  const logLevel = this.options.verbose ? 'debug' : 'info';
  this.logger = createLogger({ name: 'SafeEventEmitter', level: logLevel });
}

// DEPOIS:
if (options.logger) {
  this.logger = options.logger;
} else {
  this.logger = createLogger({ name: 'SafeEventEmitter', level: this.options.logLevel });
}
```

---

### 3. `src/concerns/process-manager.js`

Buscar e substituir:
- `verbose:` → `logLevel:`
- `this.verbose` → `this.logger.level`
- `options.verbose` → `options.logLevel`

---

### 4. `src/concerns/cron-manager.js`

Buscar e substituir:
- `verbose:` → `logLevel:`
- `this.verbose` → `this.logger.level`
- `options.verbose` → `options.logLevel`

---

### 5. `src/concerns/async-event-emitter.js`

Linha 8:
```javascript
// ANTES:
this.verbose = Boolean(options.verbose);

// DEPOIS:
this.logLevel = options.logLevel || 'info';
```

---

### 6. Clients

#### `src/clients/s3-client.class.js`

Linha 30 e 39:
```javascript
// ANTES:
verbose = false,
...
this.verbose = verbose;

// DEPOIS:
logLevel = 'info',
...
this.logLevel = logLevel;
```

#### `src/clients/memory-client.class.js`

Linha 32:
```javascript
// ANTES:
this.verbose = Boolean(config.verbose);

// DEPOIS:
this.logLevel = config.logLevel || 'info';
```

#### `src/clients/filesystem-client.class.js`

Linha 33:
```javascript
// ANTES:
this.verbose = Boolean(config.verbose);

// DEPOIS:
this.logLevel = config.logLevel || 'info';
```

#### `src/clients/memory-storage.class.js`

Linha 31:
```javascript
// ANTES:
this.verbose = Boolean(config.verbose);

// DEPOIS:
this.logLevel = config.logLevel || 'info';
```

#### `src/clients/filesystem-storage.class.js`

Linha 38:
```javascript
// ANTES:
this.verbose = Boolean(config.verbose);

// DEPOIS:
this.logLevel = config.logLevel || 'info';
```

---

### 7. `src/resource.class.js`

Linha 151:
```javascript
// ANTES:
this.verbose = Boolean(config.verbose ?? (config.client && config.client.verbose) ?? (config.database && config.database.verbose));

// DEPOIS:
this.logLevel = config.logLevel || config.client?.logLevel || config.database?.logger.level || 'info';
```

---

### 8. `src/testing/seeder.class.js`

Linha 32:
```javascript
// ANTES:
this.verbose = Boolean(options.verbose);

// DEPOIS:
this.logLevel = options.logLevel || 'info';
```

---

### 9. Plugins (em massa)

Todos os plugins em `src/plugins/` precisam de:

1. Remover `this.verbose` (já vem de `Plugin.class.js` via `normalizePluginOptions`)
2. Substituir `verbose: this.verbose` por `logLevel: this.logLevel`
3. Substituir `config.verbose` por `config.logLevel`
4. Substituir `options.verbose` por `options.logLevel`
5. Substituir `if (verbose)` por chamadas apropriadas ao logger

**Lista de plugins a atualizar:**

- ✅ `src/plugins/plugin.class.js` (já está correto, usa logger)
- ❌ `src/plugins/s3-queue.plugin.js`
- ❌ `src/plugins/cache.plugin.js`
- ❌ `src/plugins/metrics.plugin.js`
- ❌ `src/plugins/vector.plugin.js`
- ❌ `src/plugins/ml.plugin.js`
- ❌ `src/plugins/scheduler.plugin.js`
- ❌ `src/plugins/ttl.plugin.js`
- ❌ `src/plugins/audit.plugin.js`
- ❌ `src/plugins/backup.plugin.js`
- ❌ `src/plugins/replicator.plugin.js`
- ❌ `src/plugins/cloud-inventory.plugin.js`
- ❌ `src/plugins/fulltext.plugin.js`
- ❌ `src/plugins/geo.plugin.js`
- ❌ `src/plugins/costs.plugin.js`
- ❌ `src/plugins/puppeteer.plugin.js`
- ❌ `src/plugins/cookie-farm.plugin.js`
- ❌ `src/plugins/cookie-farm-suite.plugin.js`
- ❌ `src/plugins/spider.plugin.js`
- ❌ `src/plugins/kubernetes-inventory.plugin.js`
- ❌ `src/plugins/queue-consumer.plugin.js`
- ❌ `src/plugins/state-machine.plugin.js`
- ❌ `src/plugins/api/index.js`
- ❌ `src/plugins/api/server.js`
- ❌ Muitos outros em `src/plugins/`...

---

## 🧪 Testes

Todos os testes em `tests/` que usam `verbose: true` ou `verbose: false` precisam ser atualizados para:

```javascript
// ANTES:
const db = new Database({ verbose: true });

// DEPOIS:
const db = new Database({ logLevel: 'debug' });

// OU para silenciar logs nos testes:
const db = new Database({ logLevel: 'silent' });
```

---

## 📚 Documentação

### Arquivos de documentação a atualizar:

- `README.md`
- `docs/examples/e*.js` (todos os exemplos)
- `docs/plugins/*.md`
- `docs/client.md`
- `docs/testing.md`

### Buscar e substituir em documentação:

```bash
find docs -name "*.md" -exec sed -i 's/verbose: true/logLevel: '\''debug'\''/g' {} \;
find docs -name "*.md" -exec sed -i 's/verbose: false/logLevel: '\''info'\''/g' {} \;
```

---

## 🔍 Comando de Verificação

Para verificar se ainda restam referências a `verbose`:

```bash
# Buscar verbose em src (excluindo comentários)
grep -rn "verbose" src --include="*.js" | grep -v "// " | grep -v "/\*"

# Buscar verbose em tests
grep -rn "verbose" tests --include="*.js" | wc -l

# Buscar verbose em docs
grep -rn "verbose" docs --include="*.md" | wc -l
```

---

## 📝 Checklist de Progresso

- [x] logger.js implementado
- [x] normalizePluginOptions atualizado
- [ ] Database.class.js
- [ ] SafeEventEmitter
- [ ] ProcessManager
- [ ] CronManager
- [ ] AsyncEventEmitter
- [ ] Clients (S3, Memory, Filesystem, Storage)
- [ ] Resource.class.js
- [ ] Seeder.class.js
- [ ] Todos os plugins
- [ ] Todos os testes
- [ ] Toda a documentação

---

## 🚀 Scripts de Automação

### Script Bash para substituir em massa:

```bash
#!/bin/bash

# Substituir verbose: true → logLevel: 'debug'
find src -name "*.js" -exec sed -i "s/verbose: true/logLevel: 'debug'/g" {} \;

# Substituir verbose: false → logLevel: 'info'
find src -name "*.js" -exec sed -i "s/verbose: false/logLevel: 'info'/g" {} \;

# Substituir options.verbose → options.logLevel
find src -name "*.js" -exec sed -i 's/options\.verbose/options.logLevel/g' {} \;

# Substituir config.verbose → config.logLevel
find src -name "*.js" -exec sed -i 's/config\.verbose/config.logLevel/g' {} \;

# Substituir this.verbose → this.logLevel
find src -name "*.js" -exec sed -i 's/this\.verbose/this.logLevel/g' {} \;
```

---

## ⚠️ Avisos Importantes

1. **Linter**: Desative linters durante a migração ou configure para ignorar estas mudanças
2. **Testes**: Execute `pnpm test` após cada grupo de mudanças
3. **Build**: Execute `pnpm run build` para verificar se nada quebrou
4. **Commits**: Faça commits incrementais (por categoria de arquivo)

---

**Última atualização**: 2025-11-16 11:35 BRT
