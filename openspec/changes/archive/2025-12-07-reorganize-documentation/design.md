# Design: Documentation Reorganization

## Context

O s3db.js é um projeto complexo com:
- **Core**: Database, Resource, Schema, Behaviors, Events
- **Clients**: S3Client, MemoryClient, FilesystemClient
- **Plugins**: 36+ plugins com diferentes níveis de complexidade
- **Examples**: 177 exemplos funcionais
- **Reference**: AWS costs, benchmarks, CLI, MCP

A documentação atual tem ~250KB+ de conteúdo em 96+ arquivos, mas a organização não reflete a arquitetura do sistema.

### Stakeholders

1. **Usuários iniciantes**: Precisam de quick start claro
2. **Usuários intermediários**: Precisam entender plugins
3. **Usuários avançados**: Precisam de internals e performance
4. **Contribuidores**: Precisam saber onde adicionar docs

### Constraints

- Docsify como engine de docs (mantido)
- Não quebrar URLs sem necessidade
- Manter exemplos funcionais
- Preservar histórico git quando possível

## Goals / Non-Goals

### Goals

1. **Separar Core de Plugins** - Usuário entende que são mundos diferentes
2. **Padronizar estrutura de plugins** - Todos seguem mesmo formato
3. **Preencher gaps críticos** - Spider, CLI, Security
4. **Expor internals** - CLAUDE.md → docs públicos
5. **Criar guias de seleção** - Usuário sabe qual plugin usar
6. **Melhorar navegação** - Sidebar intuitiva

### Non-Goals

1. **Reescrever todo o conteúdo** - Apenas reorganizar e expandir gaps
2. **Mudar engine de docs** - Docsify mantido
3. **Traduzir para outros idiomas** - Inglês only por agora
4. **Criar video tutorials** - Apenas texto/código

## Decisions

### Decision 1: Estrutura de Diretórios

**Escolha**: Criar hierarquia `core/`, `clients/`, `plugins/`, `guides/`, `reference/`

**Alternativas consideradas**:
1. ❌ Manter estrutura flat - Não resolve o problema de mistura
2. ❌ Separar por audiência (beginner/advanced) - Difícil manter sincronizado
3. ✅ Separar por tipo de componente - Reflete arquitetura do código

**Rationale**: A estrutura de diretórios deve espelhar a arquitetura do código. Isso facilita:
- Descoberta (usuário sabe onde procurar)
- Manutenção (contribuidor sabe onde adicionar)
- Navegação (sidebar organizada logicamente)

### Decision 2: Plugins como Diretórios

**Escolha**: TODOS os plugins usam estrutura de diretório, mesmo os simples

**Alternativas consideradas**:
1. ❌ Manter híbrido (alguns arquivo, alguns diretório) - Inconsistente
2. ❌ Todos como arquivo único - Não escala para plugins complexos
3. ✅ Todos como diretório - Consistente e extensível

**Rationale**: Mesmo plugins simples podem crescer. Estrutura de diretório permite:
- Adicionar FAQs separados
- Adicionar guias específicos
- Manter README.md como entry point

**Estrutura padrão**:
```
plugins/{name}/
├── README.md           # Entry point (obrigatório)
├── configuration.md    # Config detalhada (se complexo)
├── api-reference.md    # API completa (se extenso)
├── faq.md              # FAQs (se muitas perguntas)
└── examples/           # Exemplos específicos (se necessário)
```

### Decision 3: Core Internals

**Escolha**: Documentar internals em `core/internals/` para contribuidores

**Alternativas consideradas**:
1. ❌ Manter apenas em CLAUDE.md - Não acessível a usuários
2. ❌ Incluir em docs principais - Polui docs de usuário
3. ✅ Subdiretório separado - Acessível mas não no caminho principal

**Conteúdo**:
- `distributed-lock.md` - DistributedLock primitives
- `distributed-sequence.md` - DistributedSequence primitives
- `json-recovery.md` - Self-healing JSON (_attemptJsonRecovery)
- `global-coordinator.md` - GlobalCoordinatorService architecture

### Decision 4: Plugin Selection Matrix

**Escolha**: Criar tabela comparativa em `plugins/README.md`

**Formato**:
```markdown
| Plugin | Use Case | Complexity | Dependencies |
|--------|----------|------------|--------------|
| Cache | Read performance | Low | None |
| TTL | Auto-expiration | Low | None |
| API | REST endpoints | High | Hono |
| Spider | Web scraping | Very High | Puppeteer |
```

**Colunas**:
- Plugin name
- Primary use case (1 frase)
- Complexity (Low/Medium/High/Very High)
- External dependencies
- Related plugins
- Minimum version

### Decision 5: Redirects

**Escolha**: Criar arquivo de redirects para URLs antigas

**Implementação**: Docsify alias plugin ou _redirects file

**Mapeamento principal**:
```
/resources.md → /core/resource.md
/schema.md → /core/schema.md
/client.md → /clients/s3-client.md
/memory-client.md → /clients/memory-client.md
/events.md → /core/events.md
/behaviors.md → /core/behaviors.md
```

### Decision 6: Sidebar Structure

**Escolha**: Sidebar hierárquica com collapse por seção

```markdown
- [Home](/)
- **Core**
  - [Overview](core/README.md)
  - [Database](core/database.md)
  - [Resource](core/resource.md)
  - [Schema](core/schema.md)
  - [Behaviors](core/behaviors.md)
  - [Partitions](core/partitions.md)
  - [Events](core/events.md)
  - [Encryption](core/encryption.md)
  - [Streaming](core/streaming.md)
  - **Internals**
    - [Distributed Lock](core/internals/distributed-lock.md)
    - [Distributed Sequence](core/internals/distributed-sequence.md)
    - [JSON Recovery](core/internals/json-recovery.md)
    - [Global Coordinator](core/internals/global-coordinator.md)
- **Storage Clients**
  - [Overview](clients/README.md)
  - [S3 Client](clients/s3-client.md)
  - [Memory Client](clients/memory-client.md)
  - [Filesystem Client](clients/filesystem-client.md)
- **Plugins**
  - [Overview & Selection](plugins/README.md)
  - [API](plugins/api/)
  - [Cache](plugins/cache/)
  - ... (36+ plugins)
- **Guides**
  - [Getting Started](guides/getting-started.md)
  - [Multi-tenancy](guides/multi-tenancy.md)
  - [Security](guides/security-best-practices.md)
  - [Performance](guides/performance-tuning.md)
  - [Testing](guides/testing-strategies.md)
  - [Migration v15→v16](guides/migration-v15-to-v16.md)
- **Reference**
  - [CLI](reference/cli.md)
  - [MCP Server](reference/mcp.md)
  - [Connection Strings](reference/connection-strings.md)
  - [Errors](reference/errors.md)
- **Examples**
  - [Catalog](examples/catalog.md)
  - [Use Cases](examples/use-cases.md)
- **AWS**
  - [Pricing](aws/)
  - [Limits](aws/)
- **Benchmarks**
  - [Overview](benchmarks/)
```

## Risks / Trade-offs

### Risk 1: Links Externos Quebrados

**Risco**: Sites externos que linkaram para docs terão links quebrados

**Mitigação**:
- Implementar redirects para URLs principais
- Manter URLs antigas funcionando por 6 meses
- Adicionar nota no README sobre migração

**Trade-off**: Mais trabalho de manutenção de redirects

### Risk 2: Esforço de Migração Alto

**Risco**: Mover 96+ arquivos e atualizar links é trabalhoso

**Mitigação**:
- Fazer em fases (core primeiro, depois plugins)
- Automatizar atualização de links com scripts
- Testar navegação após cada fase

**Trade-off**: Implementação mais longa, mas mais segura

### Risk 3: Gaps de Conteúdo Revelados

**Risco**: Reorganização expõe ainda mais gaps

**Mitigação**:
- Criar placeholders para conteúdo futuro
- Priorizar gaps críticos (Spider, CLI)
- Documentar gaps conhecidos em tasks.md

**Trade-off**: Docs incompletos temporariamente visíveis

### Risk 4: Inconsistência Durante Migração

**Risco**: Durante a migração, docs estarão em estado inconsistente

**Mitigação**:
- Fazer em branch separada
- Merge apenas quando completo
- Não fazer releases durante migração

## Migration Plan

### Phase 1: Estrutura Base (Week 1)

1. Criar diretórios novos (`core/`, `clients/`, `guides/`, `reference/`)
2. Mover arquivos core com `git mv`
3. Atualizar links internos nos arquivos movidos
4. Testar navegação básica

### Phase 2: Padronização de Plugins (Week 2)

1. Converter plugins de arquivo único para diretório
2. Criar README.md para cada plugin
3. Atualizar sidebar com nova estrutura
4. Testar todos os links de plugins

### Phase 3: Conteúdo Novo (Week 3-4)

1. Expandir Spider Plugin docs (125 → 1500+ linhas)
2. Criar CLI Reference completo
3. Criar Plugin Selection Matrix
4. Criar Security Best Practices
5. Documentar Core Internals

### Phase 4: Polish (Week 5)

1. Implementar redirects
2. Atualizar README.md principal
3. Revisar todos os links
4. Testar navegação completa
5. Atualizar CLAUDE.md para referenciar novos docs

### Rollback Plan

Se problemas críticos forem encontrados:
1. Reverter branch de docs
2. Manter estrutura antiga
3. Aplicar apenas mudanças de conteúdo (Spider, CLI)

## Open Questions

1. **Docsify plugins**: Precisamos de plugins adicionais para collapse de sidebar?
2. **Search**: A reorganização afeta o search do Docsify?
3. **Versioning**: Devemos versionar docs por release do s3db?
4. **Localization**: Estrutura deve suportar i18n futuro?
5. **API Reference auto-generation**: Devemos gerar API docs do código?

## Appendix: File Movement Map

```
# Core
resources.md → core/resource.md
schema.md → core/schema.md
events.md → core/events.md
behaviors.md → core/behaviors.md
(NEW) → core/README.md
(NEW) → core/database.md
(NEW) → core/partitions.md
(NEW) → core/encryption.md
(NEW) → core/streaming.md
(NEW) → core/internals/distributed-lock.md
(NEW) → core/internals/distributed-sequence.md
(NEW) → core/internals/json-recovery.md
(NEW) → core/internals/global-coordinator.md

# Clients
client.md → clients/s3-client.md
memory-client.md → clients/memory-client.md
filesystem-client.md → clients/filesystem-client.md
(NEW) → clients/README.md

# Guides
guides/multi-tenancy.md → guides/multi-tenancy.md (mantido)
performance-tuning.md → guides/performance-tuning.md
testing.md → guides/testing-strategies.md
(NEW) → guides/getting-started.md
(NEW) → guides/security-best-practices.md
(NEW) → guides/migration-v15-to-v16.md

# Reference
cli.md → reference/cli.md
mcp.md → reference/mcp.md
(NEW) → reference/connection-strings.md
(NEW) → reference/errors.md

# Plugins (convert to directories)
plugins/cache.md → plugins/cache/README.md
plugins/ttl.md → plugins/ttl/README.md
plugins/audit.md → plugins/audit/README.md
... (21 plugins)
```
