# S3DB.js Test Suite - Comprehensive Testing Structure

## Visão Geral

Esta suíte de testes reorganizada implementa uma abordagem **narrativa** para testing, onde cada teste conta uma história de uso real do S3DB.js, ao invés de simplesmente testar funções isoladas.

## Filosofia de Testing Narrativo

### Princípios

1. **Cenários Reais**: Cada teste simula um caso de uso real da biblioteca
2. **Contexto Claro**: Nomes de teste explicam "o que" e "por que", não apenas "como"
3. **Dados Realistas**: Uso de dados que representam casos reais de aplicação
4. **Progressão Lógica**: Testes seguem uma sequência lógica de operações

### Benefícios

- **Depuração Mais Fácil**: Quando um teste falha, você sabe exatamente que funcionalidade real está quebrada
- **Documentação Viva**: Os testes servem como documentação de como usar a biblioteca
- **Cobertura Intuitiva**: Foco em fluxos de trabalho reais ao invés de cobertura de linha isolada
- **Manutenção Simplificada**: Menos testes verbose, mais focados e significativos

## Estrutura dos Testes

### Testes de Classes (Journey Tests)

Seguem o padrão `ClassNome-journey.test.js` e testam fluxos completos de uso:

#### ✅ `resource-journey.test.js` (16KB, 362 linhas)
**Narrativa**: Sistema de gestão de raças de cachorro
- 50 raças distribuídas em 4 categorias (small, medium, large, giant)
- Particionamento por tamanho e origem
- Paginação com limite de 10 itens
- Operações CRUD complexas
- Validação de edge cases

#### ✅ `users-journey.test.js` (17KB, 417 linhas)
**Narrativa**: Sistema de gestão de chaves API por empresa
- 15 usuários distribuídos em 4 empresas
- Campo `apiKey: 'secret|required'` (geração automática e criptografia)
- Particionamento por companyId, role e status
- Verificação de segurança de chaves API
- Workflows de ativação/desativação

#### ✅ `database-journey.test.js` (19KB, 468 linhas)
**Narrativa**: Aplicação e-commerce multi-recurso
- Criação de recursos: usuários, produtos, pedidos
- Gestão de metadata e versionamento
- Detecção de mudanças em definições
- Relatórios e análises
- Edge cases e recuperação de erros

#### ✅ `schema-journey.test.js` (18KB, 445 linhas)
**Narrativa**: Sistema de mapeamento e validação de dados
- Formulários de cadastro de funcionários
- Catálogo de produtos e-commerce
- Transformações SchemaActions
- Perfis de usuário com dados sensíveis
- Import/Export de schemas
- Performance com objetos grandes

#### ✅ `validator-journey.test.js` (17KB, 413 linhas)
**Narrativa**: Sistema de validação de dados
- Formulários de segurança com campos secret
- Cadastro de funcionários com validações complexas
- Produtos e-commerce com regras de negócio
- Diferentes tipos de campos secret
- ValidatorManager Singleton Pattern
- Mensagens customizadas em português

#### ✅ `client-journey.test.js` (11KB, 382 linhas)
**Narrativa**: Configuração de conexões para diferentes ambientes
- Configurações LocalStack para desenvolvimento
- Ambientes staging/produção
- Validação de parâmetros de conexão
- Gerenciamento de credenciais

#### ✅ `connection-string-journey.test.js` (14KB, 325 linhas)
**Narrativa**: Configurações multi-provider S3
- AWS S3 Production com prefixos e regiões
- MinIO Development com buckets específicos
- Configurações por ambiente
- Microserviços com isolamento
- Validação de strings inválidas
- Alta disponibilidade com múltiplas regiões

#### ✅ `calculator.test.js` (9.3KB, 239 linhas)
**Narrativa**: Cálculos UTF-8 para sistemas multilíngues
- Textos em português, chinês, árabe
- Emojis e caracteres especiais
- Objetos complexos aninhados
- Performance com dados grandes

#### ✅ `crypto.test.js` (11KB, 293 linhas)
**Narrativa**: Segurança e criptografia
- Senhas e chaves API
- Rotação de master key
- Casos extremos de segurança
- Performance de criptografia

#### ✅ `errors.test.js` (12KB, 337 linhas)
**Narrativa**: Hierarquia de erros customizados
- Tipos de erro específicos
- Detalhes de validação
- Identificação de tipos de erro

#### ✅ `id.test.js` (9.9KB, 312 linhas)
**Narrativa**: Geração de IDs e senhas
- Testes de unicidade (10.000 IDs)
- Benchmarks de performance
- Validação de segurança

### Testes de Behaviors

#### ✅ `user-management.test.js` (12KB, 329 linhas)
**Narrativa**: Comportamento padrão de recursos
- Inserção dentro dos limites S3
- Dados que excedem 2KB de metadata
- Monitoramento de eventos de limite
- Dados UTF-8 complexos
- Casos reais de uso

### Estrutura de Arquivos Faltantes

Ainda precisam ser criados os seguintes testes:

#### Classes Journey (precisam de -journey.test.js):
- [ ] `cache-journey.test.js` - Sistema de cache em memória e S3
- [ ] `memory-cache-journey.test.js` - Cache em memória com TTL
- [ ] `s3-cache-journey.test.js` - Cache distribuído no S3
- [ ] `plugin-journey.test.js` - Sistema de plugins extensível
- [ ] `resource-ids-page-reader-journey.test.js` - Leitura paginada de IDs
- [ ] `resource-ids-reader-journey.test.js` - Stream de IDs de recursos
- [ ] `resource-reader-journey.test.js` - Leitura de recursos
- [ ] `resource-writer-journey.test.js` - Escrita de recursos

#### Arquivos Não-Classe (precisam de .test.js):
- [ ] `body-overflow.test.js` - Behavior para overflow de body
- [ ] `data-truncate.test.js` - Behavior para truncamento de dados
- [ ] `enforce-limits.test.js` - Behavior para enforcement de limites
- [ ] `behaviors-index.test.js` - Exports de behaviors
- [ ] `cache-index.test.js` - Exports de cache
- [ ] `concerns-index.test.js` - Exports de concerns
- [ ] `cache-plugin.test.js` - Plugin de cache
- [ ] `costs-plugin.test.js` - Plugin de custos
- [ ] `plugins-index.test.js` - Exports de plugins
- [ ] `plugin-obj.test.js` - Objeto base de plugins
- [ ] `stream-index.test.js` - Exports de stream
- [ ] `index.test.js` - Entry point principal

## Convenções de Nomenclatura

### Para Classes
```
NomeClasse.class.js → nome-classe-journey.test.js
```

### Para Arquivos Não-Classe
```
nome-arquivo.js → nome-arquivo.test.js
```

### Para Índices
```
index.js → nome-diretorio-index.test.js
```

## Estrutura de Cada Teste Journey

```javascript
describe('ComponentName Journey Tests - Brief Description', () => {
  describe('Cenário 1: Primary Use Case Description', () => {
    test('Deve [action] [context] [expected outcome]', async () => {
      // Arrange: Setup realistic data
      // Act: Perform real-world operation
      // Assert: Verify business logic works
    });
  });
  
  describe('Cenário 2: Secondary Use Case', () => {
    // Multiple related tests
  });
  
  describe('Cenário N: Edge Cases and Error Conditions', () => {
    // Error handling and boundary conditions
  });
});
```

## Dados de Teste Realistas

### Exemplos de Narrativas Usadas

1. **Raças de Cachorro**: 50 raças reais distribuídas por tamanho
2. **Funcionários**: Dados de RH com criptografia de senhas
3. **E-commerce**: Produtos, usuários, pedidos com workflows reais
4. **Chaves API**: Sistema de autenticação por empresa
5. **Microserviços**: Configurações multi-ambiente

### Caracteres Multilíngues

Os testes incluem sistematicamente:
- **Português**: Acentos, ç, ã, õ
- **Chinês**: 你好世界 (UTF-8 multi-byte)
- **Árabe**: مرحبا (right-to-left)
- **Emojis**: 🎉🚀💡🔥 (4-byte UTF-8)

## Configuração dos Testes

### Setup Compartilhado

```javascript
// jest.setup.js
// Configuração global para todos os testes
```

### LocalStack para Testes

Todos os testes usam LocalStack para simular AWS S3:

```javascript
const testConfig = {
  bucket: 'test-bucket',
  region: 'us-east-1',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  endpoint: 'http://localhost:4566',
  forcePathStyle: true,
};
```

## Execução dos Testes

```bash
# Executar todos os testes
npm test

# Executar testes específicos
npm test -- resource-journey
npm test -- --testNamePattern="Cenário 1"

# Executar com coverage
npm test -- --coverage

# Watch mode para desenvolvimento
npm test -- --watch
```

## Padrões de Teste Específicos

### Testes de Performance

```javascript
test('Deve manter performance com objetos grandes', async () => {
  const startTime = Date.now();
  
  // Operação a ser testada
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  expect(duration).toBeLessThan(1000); // Menos de 1 segundo
});
```

### Testes de Validação

```javascript
test('Deve rejeitar dados inválidos com detalhes específicos', async () => {
  const result = await validator(invalidData);
  
  expect(Array.isArray(result)).toBe(true);
  expect(result.length).toBeGreaterThan(0);
  
  const errorMessages = result.map(error => error.message).join(' ');
  expect(errorMessages).toContain('specific validation message');
});
```

### Testes de Criptografia

```javascript
test('Deve criptografar campos secret automaticamente', async () => {
  const result = await process(dataWithSecrets);
  
  expect(result.password).not.toBe(originalPassword);
  expect(result.password.length).toBeGreaterThan(50);
  
  // Verificar que descriptografia funciona
  const decrypted = await decrypt(result.password);
  expect(decrypted).toBe(originalPassword);
});
```

## Indicadores de Qualidade

### Métricas de Teste

- **Cobertura de Código**: >90% para funcionalidades críticas
- **Tempo de Execução**: <30 segundos para toda a suíte
- **Realismo dos Dados**: Baseado em casos de uso reais
- **Clareza Narrativa**: Cada teste conta uma história completa

### Red Flags

🚨 **Evitar**:
- Testes que testam apenas um getter/setter
- Mocks excessivos que não representam integração real
- Dados de teste genéricos (user1, test123)
- Testes que passam mas não verificam comportamento real

✅ **Preferir**:
- Testes que simulam workflows completos de usuário
- Dados realistas com caracteres UTF-8 complexos
- Validação de regras de negócio, não apenas sintaxe
- Cenários que um usuário real encontraria

## Conclusão

Esta reorganização transforma os testes de uma coleção de verificações técnicas isoladas em uma documentação viva de como o S3DB.js funciona em cenários reais. Cada teste conta uma história específica, facilitando a manutenção e proporcionando confiança na qualidade do código.

Os testes servem tanto para validação quanto para documentação, mostrando exatamente como usar cada componente da biblioteca em contextos práticos e realistas.