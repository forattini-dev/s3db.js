# Nova Estrutura de Testes - S3DB.js

## 📋 Visão Geral

Esta é a nova organização de testes do S3DB.js, criada para resolver problemas de verbosidade e confusão nos testes anteriores. A estrutura foi reorganizada seguindo uma lógica clara e narrativa para garantir melhor qualidade e manutenibilidade do código.

## 🏗️ Estrutura Organizacional

### Diretórios

- `./tests-old/` - Testes antigos (preservados para referência)
- `./tests/` - Nova estrutura de testes

### Convenções de Nomenclatura

#### Para Arquivos Não-Classe
```
arquivo.js → arquivo.test.js
```

**Exemplos:**
- `src/crypto.js` → `tests/crypto.test.js`
- `src/concerns/calculator.js` → `tests/calculator.test.js`
- `src/errors.js` → `tests/errors.test.js`
- `src/concerns/id.js` → `tests/id.test.js`

#### Para Arquivos de Classe
```
classe.class.js → classe-journey.test.js
```

**Exemplos:**
- `src/resource.class.js` → `tests/resource-journey.test.js`
- `src/client.class.js` → `tests/client-journey.test.js`
- `src/schema.class.js` → `tests/schema-journey.test.js`
- `src/database.class.js` → `tests/database-journey.test.js`

#### Para Classes Complexas (Múltiplos Arquivos)
```
classe.class.js → classe-*.test.js
```

**Exemplos:**
- `src/resource.class.js` → `tests/resource-journey.test.js`
- `src/resource.class.js` → `tests/resource-partitions.test.js`
- `src/resource.class.js` → `tests/resource-behaviors.test.js`

## 🎭 Filosofia dos Testes Narrativos

### Testes Journey
Os testes "journey" seguem uma narrativa realista, criando cenários que um usuário real enfrentaria:

```javascript
describe('Resource Journey Tests - Dog Breeds Management', () => {
  describe('Cenário 1: Adicionando 50 raças de cachorro particionadas por tamanho', () => {
    // Teste narrativo com dados reais
  });
  
  describe('Cenário 2: Testando paginação com limite de 10 em 10', () => {
    // Teste de paginação real
  });
});
```

### Características dos Testes Narrativos

1. **Dados Realistas**: Use dados que fazem sentido no mundo real
2. **Cenários Completos**: Teste fluxos completos, não apenas funções isoladas
3. **Contexto**: Explique o "porquê" do teste no nome do cenário
4. **Progressão**: Testes que seguem uma sequência lógica

## 📚 Exemplos Implementados

### 1. Resource Journey - Raças de Cachorro
```javascript
// tests/resource-journey.test.js
// Cenário: Gerenciamento de 50 raças de cachorro particionadas por tamanho
// Testa: inserção, paginação, partições, validações
```

### 2. Users Journey - API Keys por Empresa
```javascript
// tests/users-journey.test.js
// Cenário: Usuários com API keys encriptadas particionados por companyId
// Testa: campos secretos, partições múltiplas, paginação
```

### 3. Calculator - Cálculos de Bytes
```javascript
// tests/calculator.test.js
// Cenário: Cálculo de tamanhos UTF-8 para objetos multilíngues
// Testa: funções utilitárias com dados reais
```

### 4. Crypto - Criptografia
```javascript
// tests/crypto.test.js
// Cenário: Gerenciamento de senhas e API keys criptografadas
// Testa: encrypt/decrypt com cenários de rotação de chaves
```

## 🚀 Como Executar

```bash
# Executar todos os testes
npm test

# Executar testes específicos
npm test -- tests/resource-journey.test.js
npm test -- tests/crypto.test.js

# Executar testes com pattern
npm test -- --testNamePattern="Dog Breeds"
npm test -- --testNamePattern="API Keys"
```

## 📝 Guia para Criar Novos Testes

### Para Arquivos Não-Classe

1. **Identifique as funções principais**
2. **Crie cenários de uso real**
3. **Teste edge cases**
4. **Use dados variados (UTF-8, emojis, etc.)**

```javascript
describe('MeuArquivo Functions - Descrição Clara', () => {
  describe('minhaFuncao', () => {
    test('Deve fazer X com dados Y', () => {
      // Teste específico
    });
  });
  
  describe('Cenário Real: Descrição do caso de uso', () => {
    test('Deve resolver problema específico', () => {
      // Teste narrativo
    });
  });
});
```

### Para Classes (Journey Tests)

1. **Crie uma narrativa realista**
2. **Use dados que fazem sentido**
3. **Teste fluxos completos**
4. **Inclua cenários de erro**

```javascript
describe('MinhaClasse Journey Tests - Contexto do Negócio', () => {
  describe('Cenário 1: Descrição clara do que está sendo testado', () => {
    // Setup com dados realistas
    const dadosReais = [...];
    
    test('Deve executar operação principal com sucesso', () => {
      // Teste principal
    });
    
    test('Deve validar dados corretamente', () => {
      // Validações
    });
  });
  
  describe('Cenário 2: Corner cases e situações extremas', () => {
    // Testes de edge cases
  });
});
```

## 🎯 Benefícios da Nova Estrutura

### 1. Clareza
- Nomenclatura intuitiva
- Separação clara entre tipos de teste
- Contexto narrativo

### 2. Manutenibilidade
- Testes focados em cenários específicos
- Menor verbosidade
- Reutilização de dados

### 3. Qualidade
- Cobertura de casos reais
- Testes que refletem uso real
- Detecção de problemas de integração

### 4. Debugging
- Fácil identificação de problemas
- Contexto claro nos logs
- Dados rastreáveis

## 📋 Checklist para Novos Testes

- [ ] Seguir convenção de nomenclatura
- [ ] Criar cenários narrativos
- [ ] Usar dados realistas
- [ ] Testar casos extremos
- [ ] Documentar cenários complexos
- [ ] Verificar performance quando relevante
- [ ] Incluir validações de erro

## 🔮 Expandindo a Estrutura

### Quando Criar Múltiplos Arquivos

Para classes muito complexas, crie arquivos separados:

```
resource.class.js →
  ├── resource-journey.test.js      (teste principal)
  ├── resource-partitions.test.js   (foco em partições)
  ├── resource-behaviors.test.js    (comportamentos)
  ├── resource-performance.test.js  (testes de performance)
  └── resource-errors.test.js       (cenários de erro)
```

### Padrões Recomendados

```javascript
// Sempre use dados realistas
const empresas = [
  { id: 'tech-corp', nome: 'TechCorp Solutions' },
  { id: 'data-drive', nome: 'DataDrive Inc' }
];

// Prefira cenários narrativos
test('Deve paginar 1000 produtos por categoria alimentícia', () => {
  // Teste com contexto claro
});

// Em vez de testes genéricos
test('Deve paginar dados', () => {
  // Teste vago
});
```

## 📞 Suporte

Para dúvidas sobre a estrutura de testes:

1. Consulte os exemplos existentes
2. Siga as convenções estabelecidas
3. Priorize narrativas claras
4. Use dados realistas

---

**Versão:** 1.0.0  
**Criado:** Janeiro 2024  
**Última Atualização:** Janeiro 2024