# S3DB.js Examples

Este diretório contém exemplos de uso da biblioteca S3DB.js. Todos os exemplos foram reorganizados para usar um sistema padronizado de configuração de banco de dados e seguem uma nomenclatura didática para facilitar o aprendizado.

## Organização dos Exemplos

Os exemplos estão organizados por ordem de complexidade e casos de uso:

- **e01-e05**: Operações básicas (CRUD, streams, exportação)
- **e06**: Autenticação e segurança
- **e07-e08**: Criação e configuração de recursos
- **e09-e11**: Partições e escalabilidade
- **e12**: Validação de dados
- **e13-e14**: Hooks e versionamento
- **e15**: Navegação e paginação
- **e16**: Casos de uso completos
- **e17**: Tratamento de erros
- **e18**: Plugins e extensibilidade
- **e19**: Migração e manutenção

## Arquivos de Configuração

### `database.js`
Arquivo principal que configura a conexão com o banco de dados de forma padronizada para todos os exemplos.

**Funcionalidades:**
- Configuração automática do dotenv
- Criação de prefixos únicos para cada execução
- Configuração padronizada do S3db
- Funções de setup e teardown

**Uso:**
```javascript
import { setupDatabase, teardownDatabase } from './database.js';

async function main() {
  const db = await setupDatabase();
  
  // Seu código aqui...
  
  await teardownDatabase();
}
```

### `concerns.js`
Arquivo de compatibilidade para exemplos que ainda usam o sistema antigo de configuração.

**Exporta:**
- `ENV`: Configurações de ambiente
- `S3db`: Classe principal do S3db
- `CostsPlugin`: Plugin de custos

## Primeiros Passos

Se você está começando com S3DB.js, recomendamos seguir esta ordem:

1. **Comece com o básico**: [`e01-bulk-insert.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e01-bulk-insert.js) - Aprenda a inserir dados
2. **Leia os dados**: [`e02-read-stream.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e02-read-stream.js) - Veja como ler dados em stream
3. **Crie recursos**: [`e07-create-resource.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e07-create-resource.js) - Entenda como criar coleções
4. **CRUD completo**: [`e16-full-crud.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e16-full-crud.js) - Veja todas as operações juntas

## Como Usar os Exemplos

### 1. Configuração do Ambiente
Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Para MinIO (desenvolvimento local)
BUCKET_NAME=s3db-test
MINIO_USER=your-minio-user
MINIO_PASSWORD=your-minio-password
MINIO_ENDPOINT=http://minio:9000

# Para AWS S3 (produção)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_ENDPOINT=https://s3.amazonaws.com
```

### 2. Executando um Exemplo
```bash
# Navegue para a pasta examples
cd examples

# Execute um exemplo básico
node e01-bulk-insert.js

# Ou um exemplo mais avançado
node e07-create-resource.js
```

### 3. Estrutura Padrão dos Exemplos
Todos os exemplos seguem esta estrutura:

```javascript
import { setupDatabase, teardownDatabase } from './database.js';
import { ENV, S3db, CostsPlugin } from './concerns.js';

async function main() {
  const db = await setupDatabase();
  
  // Adicionar plugins se necessário
  db.use(CostsPlugin);
  
  // Seu código de exemplo aqui...
  
  await teardownDatabase();
}

main().catch(console.error);
```

## Exemplos Disponíveis

### Básicos
- [`e01-bulk-insert.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e01-bulk-insert.js) - Inserção em lote de dados
- [`e02-read-stream.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e02-read-stream.js) - Leitura de dados em stream
- [`e03-export-to-csv.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e03-export-to-csv.js) - Exportação para CSV
- [`e04-export-to-zip.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e04-export-to-zip.js) - Exportação para ZIP
- [`e05-write-stream.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e05-write-stream.js) - Escrita em stream

### Autenticação e Segurança
- [`e06-jwt-tokens.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e06-jwt-tokens.js) - Trabalhando com JWT

### Recursos e Schema
- [`e07-create-resource.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e07-create-resource.js) - Criação e configuração de recursos
- [`e08-resource-behaviors.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e08-resource-behaviors.js) - Comportamentos de recursos
- [`e12-schema-validation.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e12-schema-validation.js) - Validação de schema

### Partições e Escalabilidade
- [`e09-partitioning.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e09-partitioning.js) - Configuração de partições
- [`e10-partition-validation.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e10-partition-validation.js) - Validação e exclusão de partições
- [`e11-utm-partitioning.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e11-utm-partitioning.js) - Partições para tracking UTM

### Hooks e Versionamento
- [`e13-versioning-hooks.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e13-versioning-hooks.js) - Hooks de versionamento avançado
- [`e14-timestamp-hooks.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e14-timestamp-hooks.js) - Hooks de timestamps

### Navegação e Paginação
- [`e15-pagination.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e15-pagination.js) - Paginação de dados

### Casos de Uso Completos
- [`e16-full-crud.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e16-full-crud.js) - Operações CRUD completas com timestamps

### Tratamento de Erros e Debug
- [`e17-error-handling.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e17-error-handling.js) - Tratamento de erros de descriptografia

### Plugins e Extensibilidade
- [`e18-plugin-costs.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e18-plugin-costs.js) - Plugin de monitoramento de custos

### Migração e Manutenção
- [`e19-migration-v3-to-v4.js`](https://github.com/forattini-dev/s3db.js/blob/main/examples/e19-migration-v3-to-v4.js) - Migração da versão 3 para 4

## Benefícios da Reorganização

1. **Consistência**: Todos os exemplos usam a mesma configuração
2. **Isolamento**: Cada execução usa um prefixo único
3. **Facilidade**: Não precisa configurar credenciais em cada exemplo
4. **Manutenibilidade**: Mudanças na configuração são centralizadas
5. **Limpeza**: Conexões são fechadas automaticamente

## Migração de Exemplos Antigos

Se você tem exemplos antigos que ainda usam configuração manual, pode migrá-los facilmente:

**Antes:**
```javascript
const db = new S3db({
  bucket: 'my-bucket',
  accessKeyId: 'my-key',
  secretAccessKey: 'my-secret',
  endpoint: 'http://localhost:9000'
});
await db.connect();
```

**Depois:**
```javascript
import { setupDatabase, teardownDatabase } from './database.js';

const db = await setupDatabase();
// ... seu código ...
await teardownDatabase();
``` 