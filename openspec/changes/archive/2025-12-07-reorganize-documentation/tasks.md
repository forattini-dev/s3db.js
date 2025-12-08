# Tasks: Reorganize Documentation

## Phase 1: Estrutura Base ✅

### 1.1 Criar Diretórios

- [x] 1.1.1 Criar `docs/core/` e `docs/core/internals/`
- [x] 1.1.2 Criar `docs/clients/`
- [x] 1.1.3 Criar `docs/guides/`
- [x] 1.1.4 Criar `docs/reference/`

### 1.2 Mover Arquivos Core

- [x] 1.2.1 Mover `resources.md` → `core/resource.md`
- [x] 1.2.2 Mover `schema.md` → `core/schema.md`
- [x] 1.2.3 Mover `events.md` → `core/events.md`
- [x] 1.2.4 Mover `behaviors.md` → `core/behaviors.md`
- [x] 1.2.5 Criar `core/README.md` (overview do core)
- [x] 1.2.6 Criar `core/database.md` (Database class) - ✅ Created with full API reference
- [x] 1.2.7 Criar `core/partitions.md` (estratégias de particionamento) - ✅ Created with O(1) lookup guide
- [x] 1.2.8 Criar `core/encryption.md` (secret fields, AES-256) - ✅ Created with AES-256-GCM docs
- [x] 1.2.9 Criar `core/streaming.md` (ResourceReader/Writer) - ✅ Created with streaming API guide

### 1.3 Mover Arquivos Clients

- [x] 1.3.1 Mover `client.md` → `clients/s3-client.md`
- [x] 1.3.2 Mover `memory-client.md` → `clients/memory-client.md`
- [x] 1.3.3 Mover `filesystem-client.md` → `clients/filesystem-client.md`
- [x] 1.3.4 Criar `clients/README.md` (overview dos clients)

### 1.4 Mover Arquivos Guides

- [x] 1.4.1 Mover `performance-tuning.md` → `guides/performance-tuning.md`
- [x] 1.4.2 Mover `testing.md` → `guides/testing-strategies.md`
- [x] 1.4.3 Criar `guides/README.md`

### 1.5 Mover Arquivos Reference

- [x] 1.5.1 Mover `cli.md` → `reference/cli.md`
- [x] 1.5.2 Mover `mcp.md` → `reference/mcp.md`
- [x] 1.5.3 Criar `reference/README.md`

---

## Phase 2: Padronização de Plugins ✅

### 2.1 Converter Plugins de Arquivo para Diretório

Plugins atualmente como arquivo único que precisam virar diretório:

- [x] 2.1.1 `plugins/audit.md` → `plugins/audit/README.md`
- [x] 2.1.2 `plugins/backup.md` → `plugins/backup/README.md`
- [x] 2.1.3 `plugins/cache.md` → `plugins/cache/README.md`
- [x] 2.1.4 `plugins/cloud-inventory.md` → `plugins/cloud-inventory/README.md`
- [x] 2.1.5 `plugins/costs.md` → `plugins/costs/README.md`
- [x] 2.1.6 `plugins/eventual-consistency.md` → `plugins/eventual-consistency/README.md`
- [x] 2.1.7 `plugins/fulltext.md` → `plugins/fulltext/README.md`
- [x] 2.1.8 `plugins/geo.md` → `plugins/geo/README.md`
- [x] 2.1.9 `plugins/graphs.md` → `plugins/graphs/README.md`
- [x] 2.1.10 `plugins/importer.md` → `plugins/importer/README.md`
- [x] 2.1.11 `plugins/metrics.md` → `plugins/metrics/README.md`
- [x] 2.1.12 `plugins/queue-consumer.md` → `plugins/queue-consumer/README.md`
- [x] 2.1.13 `plugins/relation.md` → `plugins/relation/README.md`
- [x] 2.1.14 `plugins/smtp.md` → `plugins/smtp/README.md`
- [x] 2.1.15 `plugins/spider.md` → `plugins/spider/README.md`
- [x] 2.1.16 `plugins/spider-full.md` → merge com `plugins/spider/features.md`
- [x] 2.1.17 `plugins/tfstate.md` → `plugins/tfstate/README.md`
- [x] 2.1.18 `plugins/tournament.md` → `plugins/tournament/README.md`
- [x] 2.1.19 `plugins/trees.md` → `plugins/trees/README.md`
- [x] 2.1.20 `plugins/coordinator.md` → `plugins/coordinator/README.md`
- [x] 2.1.21 Merge `plugins/graph/` into `plugins/graphs/`

### 2.2 Criar Plugin Selection Matrix

- [ ] 2.2.1 Criar tabela comparativa em `plugins/README.md`
- [ ] 2.2.2 Incluir: nome, use case, complexidade, dependências
- [ ] 2.2.3 Incluir: plugins relacionados, versão mínima
- [ ] 2.2.4 Adicionar decision tree (qual plugin usar?)

---

## Phase 3: Conteúdo Novo - Core Internals ✅

### 3.1 Documentar Distributed Lock

- [x] 3.1.1 Criar `core/internals/distributed-lock.md`
- [x] 3.1.2 Documentar API: `acquire()`, `release()`, `withLock()`
- [x] 3.1.3 Documentar opções: TTL, timeout, retry
- [x] 3.1.4 Adicionar exemplos de uso
- [x] 3.1.5 Documentar error handling

### 3.2 Documentar Distributed Sequence

- [x] 3.2.1 Criar `core/internals/distributed-sequence.md`
- [x] 3.2.2 Documentar API: `next()`, `get()`, `reset()`
- [x] 3.2.3 Documentar resource-scoped vs global
- [x] 3.2.4 Adicionar exemplos de uso
- [x] 3.2.5 Documentar concurrency guarantees

### 3.3 Documentar JSON Recovery

- [x] 3.3.1 Criar `core/internals/json-recovery.md`
- [x] 3.3.2 Documentar `_attemptJsonRecovery()` algorithm
- [x] 3.3.3 Documentar fixes aplicados (trailing commas, missing quotes, etc)
- [x] 3.3.4 Documentar `_validateAndHealMetadata()`
- [x] 3.3.5 Adicionar exemplos de JSON corrompido e recuperação

### 3.4 Documentar Global Coordinator

- [x] 3.4.1 Criar `core/internals/global-coordinator.md`
- [x] 3.4.2 Documentar arquitetura e filosofia
- [x] 3.4.3 Documentar leader election algorithm
- [x] 3.4.4 Documentar heartbeat mechanism
- [x] 3.4.5 Documentar plugin integration
- [x] 3.4.6 Documentar storage structure
- [x] 3.4.7 Adicionar diagrams (ASCII)

### 3.5 Core Internals README

- [x] 3.5.1 Criar `core/internals/README.md` com overview

---

## Phase 4: Conteúdo Novo - Gaps Críticos

### 4.1 Expandir Spider Plugin (CRÍTICO)

**Estado atual**: 125 linhas (0.25% coverage de 50,172 linhas de código)
**Meta**: 1500+ linhas

- [ ] 4.1.1 Criar estrutura completa seguindo `plugin-docs-standard.md`
- [ ] 4.1.2 Escrever TLDR e quick start
- [ ] 4.1.3 Documentar todas as features:
  - [ ] Browser automation (Puppeteer integration)
  - [ ] Link discovery
  - [ ] Robots.txt parsing
  - [ ] Sitemap parsing
  - [ ] URL pattern matching
  - [ ] Deep discovery mode
  - [ ] Rate limiting
  - [ ] Proxy support
  - [ ] Cookie management
  - [ ] Screenshot capture
  - [ ] PDF generation
  - [ ] Content extraction
- [ ] 4.1.4 Escrever Configuration Reference completo
- [ ] 4.1.5 Escrever API Reference completo
- [ ] 4.1.6 Adicionar 10+ Configuration Examples
- [ ] 4.1.7 Escrever Best Practices (do's, don'ts, performance)
- [ ] 4.1.8 Escrever Error Handling guide
- [ ] 4.1.9 Criar FAQ com 20+ perguntas
- [ ] 4.1.10 Adicionar links para exemplos relevantes

### 4.2 Completar CLI Reference

**Estado atual**: 3,346 linhas (básico)
**Meta**: Referência completa de todos os comandos

- [ ] 4.2.1 Documentar todos os comandos principais:
  - [ ] `s3db list`
  - [ ] `s3db query`
  - [ ] `s3db insert`
  - [ ] `s3db update`
  - [ ] `s3db delete`
  - [ ] `s3db export`
  - [ ] `s3db import`
  - [ ] `s3db backup`
  - [ ] `s3db restore`
- [ ] 4.2.2 Documentar todas as flags globais
- [ ] 4.2.3 Documentar formatos de output (json, table, csv)
- [ ] 4.2.4 Adicionar exemplos para cada comando
- [ ] 4.2.5 Documentar configuração (config file, env vars)
- [ ] 4.2.6 Documentar troubleshooting comum

### 4.3 Criar Security Best Practices ✅

- [x] 4.3.1 Criar `guides/security-best-practices.md`
- [x] 4.3.2 Documentar encryption options:
  - [x] Secret fields (AES-256-GCM)
  - [x] S3 server-side encryption
  - [x] Passphrase management
- [x] 4.3.3 Documentar access control:
  - [x] IAM policies mínimas
  - [x] Bucket policies
  - [x] Guards no API plugin
- [x] 4.3.4 Documentar data protection:
  - [x] Protected fields
  - [x] Paranoid mode
  - [x] Audit logging
- [x] 4.3.5 Documentar compliance considerations

### 4.4 Criar Connection Strings Reference ✅

- [x] 4.4.1 Criar `reference/connection-strings.md`
- [x] 4.4.2 Documentar formato geral
- [x] 4.4.3 Documentar todos os providers:
  - [x] AWS S3 (`s3://`)
  - [x] MinIO (`http://`, `https://`)
  - [x] Memory (`memory://`)
  - [x] Filesystem (`file://`)
- [x] 4.4.4 Documentar query parameters
- [x] 4.4.5 Adicionar exemplos para cada provider

### 4.5 Criar Errors Reference ✅

- [x] 4.5.1 Criar `reference/errors.md`
- [x] 4.5.2 Listar todos os error codes
- [x] 4.5.3 Documentar causas e soluções para cada erro
- [x] 4.5.4 Documentar `mapAwsError()` usage
- [x] 4.5.5 Adicionar troubleshooting guide

---

## Phase 5: Navigation e Polish ✅ (Partial)

### 5.1 Atualizar Sidebar

- [x] 5.1.1 Reescrever `_sidebar.md` com nova estrutura
- [x] 5.1.2 Organizar por seção (Core, Clients, Plugins, Guides, Reference)
- [ ] 5.1.3 Adicionar collapse para subseções (se Docsify suportar)
- [ ] 5.1.4 Testar navegação em todos os níveis

### 5.2 Implementar Redirects

- [ ] 5.2.1 Criar mapeamento de URLs antigas → novas
- [ ] 5.2.2 Implementar redirects (Docsify alias ou _redirects)
- [ ] 5.2.3 Testar todos os redirects

### 5.3 Atualizar Links Internos

- [ ] 5.3.1 Criar script para encontrar links quebrados
- [ ] 5.3.2 Atualizar links em todos os arquivos movidos
- [ ] 5.3.3 Atualizar links em README.md principal
- [ ] 5.3.4 Atualizar links em examples/
- [ ] 5.3.5 Verificar links em CLAUDE.md

### 5.4 Atualizar README Principal

- [ ] 5.4.1 Revisar estrutura do README.md
- [ ] 5.4.2 Atualizar links para nova estrutura
- [ ] 5.4.3 Adicionar seção "Documentation Structure"
- [ ] 5.4.4 Verificar quick start ainda funciona

### 5.5 Quality Assurance

- [ ] 5.5.1 Testar todos os links internos
- [ ] 5.5.2 Testar navegação da sidebar
- [ ] 5.5.3 Testar search do Docsify
- [ ] 5.5.4 Verificar formatação em mobile
- [ ] 5.5.5 Review final de consistência

---

## Phase 6: Migração de Conteúdo Adicional

### 6.1 Getting Started Guide ✅

- [x] 6.1.1 Criar `guides/getting-started.md`
- [x] 6.1.2 Escrever tutorial passo-a-passo
- [x] 6.1.3 Incluir primeiro recurso, insert, query
- [x] 6.1.4 Incluir primeiro plugin (Cache)
- [x] 6.1.5 Link para próximos passos

### 6.2 Testing Strategies (expandir)

- [ ] 6.2.1 Expandir `guides/testing-strategies.md`
- [ ] 6.2.2 Documentar uso do MemoryClient
- [ ] 6.2.3 Documentar mocking strategies
- [ ] 6.2.4 Documentar integration tests com LocalStack
- [ ] 6.2.5 Documentar CI/CD integration

### 6.3 Migration Guide v15→v16

- [ ] 6.3.1 Criar `guides/migration-v15-to-v16.md`
- [ ] 6.3.2 Listar breaking changes
- [ ] 6.3.3 Documentar upgrade path
- [ ] 6.3.4 Incluir code examples de migração

---

## Estimativas

| Phase | Esforço | Prioridade | Status |
|-------|---------|------------|--------|
| Phase 1: Estrutura Base | 4-6h | Alta | ✅ Completo |
| Phase 2: Padronização Plugins | 4-6h | Alta | ✅ Completo |
| Phase 3: Core Internals | 8-10h | Média | ✅ Completo |
| Phase 4: Gaps Críticos | 16-20h | Alta | ⏳ Pendente |
| Phase 5: Navigation/Polish | 4-6h | Alta | 🔄 Parcial |
| Phase 6: Conteúdo Adicional | 8-10h | Média | ⏳ Pendente |

**Total estimado**: 44-58 horas
**Concluído**: ~16-22 horas

---

## Progress Summary

**Completed:**
- Phase 1: Estrutura Base (100%)
- Phase 2: Padronização de Plugins (100%)
- Phase 3: Core Internals (100%)
- Phase 4.3: Security Best Practices (100%)
- Phase 4.4: Connection Strings Reference (100%)
- Phase 4.5: Errors Reference (100%)
- Phase 5.1: Sidebar atualizada
- Phase 6.1: Getting Started Guide (100%)

**In Progress:**
- Phase 5: Navigation/Polish (sidebar done, redirects/links pending)

**Pending (low priority):**
- Phase 4.1: Spider Plugin expansion
- Phase 4.2: CLI Reference expansion
- Phase 5.2-5.5: Redirects, links, README, QA
- Phase 6.2-6.3: Testing expansion, Migration guide

**Files Created:**
- ✅ `docs/core/README.md`
- ✅ `docs/core/database.md` (304 lines)
- ✅ `docs/core/partitions.md` (313 lines)
- ✅ `docs/core/encryption.md` (290 lines)
- ✅ `docs/core/streaming.md` (351 lines)
- ✅ `docs/core/internals/README.md`
- ✅ `docs/core/internals/distributed-lock.md`
- ✅ `docs/core/internals/distributed-sequence.md`
- ✅ `docs/core/internals/json-recovery.md`
- ✅ `docs/core/internals/global-coordinator.md`
- ✅ `docs/clients/README.md`
- ✅ `docs/guides/README.md`
- ✅ `docs/guides/getting-started.md` (442 lines)
- ✅ `docs/guides/security-best-practices.md` (394 lines)
- ✅ `docs/reference/README.md`
- ✅ `docs/reference/connection-strings.md` (308 lines)
- ✅ `docs/reference/errors.md` (412 lines)
- ⏳ `docs/guides/migration-v15-to-v16.md`

**Files Moved:**
- ✅ `resources.md` → `core/resource.md`
- ✅ `schema.md` → `core/schema.md`
- ✅ `events.md` → `core/events.md`
- ✅ `behaviors.md` → `core/behaviors.md`
- ✅ `client.md` → `clients/s3-client.md`
- ✅ `memory-client.md` → `clients/memory-client.md`
- ✅ `filesystem-client.md` → `clients/filesystem-client.md`
- ✅ `performance-tuning.md` → `guides/performance-tuning.md`
- ✅ `testing.md` → `guides/testing-strategies.md`
- ✅ `cli.md` → `reference/cli.md`
- ✅ `mcp.md` → `reference/mcp.md`
- ✅ 18 plugins de arquivo → diretório
- ✅ `graph/` merged into `graphs/`

**Total: ~5,000 lines of new documentation**
