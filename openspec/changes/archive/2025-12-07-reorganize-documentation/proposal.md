# Change: Reorganize Documentation Structure

## Why

A análise da documentação atual revelou problemas estruturais críticos:

1. **Mistura Core vs Plugins**: Documentação do core (Database, Resource, Schema) está no mesmo nível dos plugins, quando são mundos completamente diferentes. Core é a API fundamental sempre usada; plugins são extensões opcionais.

2. **Inconsistência na estrutura de plugins**: 21 plugins usam arquivo único, 16 usam diretórios. Não há padrão claro.

3. **Gaps críticos de conteúdo**: Spider Plugin tem 50,172 linhas de código mas apenas 125 linhas de docs (0.25% coverage). CLI tem documentação mínima.

4. **Conteúdo interno não exposto**: CLAUDE.md documenta features avançadas (Global Coordinator, DistributedLock, Self-Healing JSON) que não estão na documentação pública.

5. **Falta de guias de seleção**: Usuários não sabem qual plugin usar para cada caso de uso.

## What Changes

### Estrutura de Diretórios

**ANTES:**
```
docs/
├── README.md
├── resources.md          # Core misturado
├── schema.md             # Core misturado
├── client.md             # Client misturado
├── plugins/              # Plugins
│   ├── cache.md          # Arquivo único
│   ├── api/              # Diretório
│   └── ...
├── examples/
└── aws/
```

**DEPOIS:**
```
docs/
├── README.md                    # Visão geral e quick start
│
├── core/                        # ⭐ NOVO - Core separado
│   ├── README.md               # Intro ao core
│   ├── database.md             # Database class
│   ├── resource.md             # Resource class (CRUD)
│   ├── schema.md               # Schema & validation
│   ├── behaviors.md            # 5 behaviors (2KB limit)
│   ├── partitions.md           # Partitioning strategies
│   ├── events.md               # Event system & hooks
│   ├── encryption.md           # Secret fields, AES-256
│   ├── streaming.md            # ResourceReader/Writer
│   └── internals/              # Para contribuidores avançados
│       ├── distributed-lock.md
│       ├── distributed-sequence.md
│       ├── json-recovery.md
│       └── global-coordinator.md
│
├── clients/                     # ⭐ NOVO - Storage backends separados
│   ├── README.md               # Overview dos clients
│   ├── s3-client.md            # AWS S3, MinIO
│   ├── memory-client.md        # Testing
│   └── filesystem-client.md    # Local dev
│
├── plugins/                     # Plugins padronizados
│   ├── README.md               # Plugin overview + selection matrix
│   ├── api/                    # TODOS como diretório
│   ├── cache/
│   ├── ttl/
│   ├── spider/                 # ⚠️ Expandir significativamente
│   └── ...
│
├── guides/                      # ⭐ NOVO - Guias práticos
│   ├── getting-started.md      # Tutorial inicial
│   ├── multi-tenancy.md        # (mover de guides/)
│   ├── migration-v15-to-v16.md # Guias de migração
│   ├── security-best-practices.md
│   ├── performance-tuning.md   # (mover do root)
│   └── testing-strategies.md   # (expandir testing.md)
│
├── reference/                   # ⭐ NOVO - API Reference
│   ├── cli.md                  # CLI completo
│   ├── mcp.md                  # MCP Server
│   ├── connection-strings.md   # Formato de conexão
│   └── errors.md               # Error codes & handling
│
├── examples/                    # Mantido (177 exemplos)
├── aws/                         # Mantido (custos/limits)
├── benchmarks/                  # Mantido
└── templates/                   # Mantido (standards)
```

### Conteúdo Novo

1. **Plugin Selection Matrix** - Tabela comparativa de todos os 36+ plugins
2. **Spider Plugin docs expandidos** - De 125 para 1500+ linhas
3. **CLI Reference completo** - Todos os comandos e flags
4. **Security Best Practices** - Guia dedicado
5. **Migration Guides** - v15→v16 e futuros
6. **Core Internals** - Documentar features do CLAUDE.md

### Padronização de Plugins

- **TODOS os plugins usarão estrutura de diretório**
- Formato padrão: `plugins/{name}/README.md` + arquivos auxiliares
- Mínimo 12 seções conforme `plugin-docs-standard.md`

## Impact

### Affected Areas

- **Navigation**: Sidebar precisa ser completamente reescrita
- **Links**: Todos os links internos precisam ser atualizados
- **SEO**: URLs mudam (redirects necessários se hospedado)
- **Examples**: Links para docs precisam ser atualizados

### Breaking Changes

- **URLs mudam**: `/resources.md` → `/core/resource.md`
- **Sidebar muda**: Estrutura de navegação completamente nova
- **Links externos quebram**: Se alguém linkou diretamente para docs

### Migration Path

1. Criar nova estrutura em paralelo
2. Mover arquivos com git mv (preservar histórico)
3. Atualizar todos os links internos
4. Atualizar sidebar
5. Criar redirects (se aplicável)
6. Remover arquivos antigos

### Benefits

- **Clareza**: Core vs Plugins claramente separados
- **Descoberta**: Usuários encontram o que precisam mais rápido
- **Manutenção**: Estrutura consistente facilita atualizações
- **Contribuição**: Contribuidores sabem onde adicionar docs
- **Completude**: Gaps identificados serão preenchidos

## Success Metrics

- [ ] 100% dos plugins em estrutura de diretório
- [ ] Spider Plugin com 1500+ linhas de docs
- [ ] CLI com referência completa de todos os comandos
- [ ] Plugin Selection Matrix criada
- [ ] Core Internals documentados
- [ ] Todos os links internos funcionando
- [ ] Sidebar navegável e intuitiva
