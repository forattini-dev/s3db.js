# OpenSpec Proposal: Test Performance Optimization

## Executive Summary

Otimizar a suite de testes do s3db.js para executar em menos de 5 minutos dentro do container Docker, mantendo o limite de 2 CPUs e 6GB RAM.

**Problema atual:**
- Suite completa leva 15-30+ minutos
- Testes timeout frequentes ao rodar em paralelo
- Alguns testes esperam por timers reais (sleep)
- Falta de mocking consistente para operações I/O

**Meta:**
- Core tests: < 60 segundos
- Plugin tests: < 3 minutos
- Total: < 5 minutos

---

## Estratégias de Otimização

### 1. Fake Timers (vi.useFakeTimers)

Testes que usam `setTimeout`, `setInterval`, cron jobs, ou delays podem ser acelerados com fake timers.

**Candidatos principais:**
- `tests/plugins/scheduler/` - Usa cron e delays
- `tests/plugins/ttl/` - TTL cleanup com timers
- `tests/plugins/s3-queue/` - Message delays
- `tests/plugins/state-machine/` - Transition timeouts

**Implementação:**
```typescript
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Em vez de esperar 5s reais:
await vi.advanceTimersByTimeAsync(5000);
```

### 2. Mocking de I/O

Reduzir operações de I/O real usando MockClient ou spies.

**Áreas prioritárias:**
- FileSystemClient → MockClient (já disponível)
- HTTP requests → vi.mock ou msw
- S3 operations → MockClient com latência simulada

### 3. Paralelização Inteligente

Configurar vitest para:
- Isolar testes por arquivo (já feito)
- Reduzir maxThreads para 2 (container limit)
- Usar `--no-file-parallelism` para testes pesados

### 4. Test Fixtures Compartilhados

Evitar recriação de databases em cada teste:
- Usar `beforeAll` para setup de database
- Compartilhar fixtures entre testes do mesmo arquivo
- Limpar dados entre testes, não recriar tudo

### 5. Skip Condicional

Marcar testes que requerem infraestrutura externa:
```typescript
const skipIfNoRedis = process.env.REDIS_URL ? describe : describe.skip;
```

---

## Infraestrutura Docker

### docker-compose.yml (atualizado)

```yaml
services:
  redis:
    image: redis:7-alpine
    profiles: [test]

  minio:
    image: minio/minio:latest
    profiles: [test]

  test-runner:
    image: node:22-slim
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 6G
    environment:
      - REDIS_URL=redis://redis:6379
      - BUCKET_CONNECTION_STRING=http://minioadmin:minioadmin123@minio:9000/s3db
    depends_on:
      - redis
      - minio
```

---

## Priorização de Otimização

### Tier 1: Alto Impacto, Baixo Esforço
1. **Scheduler tests** - Fake timers (redução: ~80%)
2. **TTL tests** - Fake timers (redução: ~70%)
3. **State Machine tests** - Fake timers (redução: ~60%)

### Tier 2: Alto Impacto, Médio Esforço
4. **API tests** - MockClient + skip Redis (redução: ~50%)
5. **Plugin Storage tests** - MockClient otimizado (redução: ~40%)
6. **TfState tests** - Fixtures compartilhados (redução: ~50%)

### Tier 3: Médio Impacto, Alto Esforço
7. **Replicator tests** - Mock HTTP + SQS
8. **Integration tests** - Paralelização melhorada

---

## Métricas de Sucesso

| Métrica | Antes | Meta |
|---------|-------|------|
| Core tests | ~2 min | < 60s |
| Plugin fast | ~30s | < 15s |
| Scheduler | ~1 min | < 10s |
| API | ~4 min | < 1 min |
| Spider | ~10s | < 5s |
| **Total** | ~15-30 min | < 5 min |

---

## Próximos Passos

1. Criar `tests/utils/time-helpers.ts` com utilitários de fake timers
2. Refatorar testes do scheduler como piloto
3. Medir e comparar tempos antes/depois
4. Expandir para outros plugins
5. Atualizar CI para rodar no container

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Fake timers quebram testes | Testar incrementalmente, manter tests originais como fallback |
| MockClient não cobre edge cases | Manter alguns testes com S3 real via MinIO |
| Paralelização causa flaky tests | Isolar estado global, usar cleanup agressivo |

