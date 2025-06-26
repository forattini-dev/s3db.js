# Resource Instance Verification & Fixes

## 🔍 **PROBLEMA IDENTIFICADO**

O usuário estava correto ao se preocupar! Havia **problemas reais** na gestão de instâncias de Resource:

### ❌ **ANTES - Problemas Encontrados**

1. **Múltiplas Instâncias em `createResource()`**
   ```javascript
   // ❌ SEMPRE criava nova instância, quebrando referências
   const resource = new Resource({...});
   this.resources[name] = resource; // Substitui a anterior
   ```

2. **Schema Não Atualizado**
   ```javascript
   // ❌ Apenas mudava atributos, mas schema permanecia antigo
   existingResource.attributes = attributes;
   ```

3. **Versão Não Incrementada**
   - Hash não mudava porque `export()` retornava schema antigo
   - Mudanças não eram detectadas corretamente

## ✅ **SOLUÇÃO IMPLEMENTADA**

### 1. **Instância Única Garantida**

```javascript
async createResource({ name, attributes, options = {} }) {
  // ✅ Verifica se resource já existe
  if (this.resources[name]) {
    // ✅ ATUALIZA a instância existente ao invés de criar nova
    const existingResource = this.resources[name];
    
    // Update options
    Object.assign(existingResource.options, options);
    
    // ✅ Reconstrói schema com novos atributos
    existingResource.updateAttributes(attributes);
    
    await this.uploadMetadataFile();
    return existingResource; // ✅ MESMA instância
  }
  
  // Cria nova apenas se não existir
  // ...
}
```

### 2. **Método `updateAttributes()` no Resource**

```javascript
updateAttributes(newAttributes) {
  // Store old attributes
  const oldAttributes = this.attributes;
  this.attributes = newAttributes;

  // ✅ Reconstrói COMPLETAMENTE o schema
  this.schema = new Schema({
    name: this.name,
    attributes: newAttributes,
    passphrase: this.passphrase,
    options: this.options,
  });

  // Re-setup partition hooks
  this.setupPartitionHooks();
  
  return { oldAttributes, newAttributes };
}
```

### 3. **Versionamento Corrigido**

- `export()` agora retorna schema atualizado
- Hash detecta mudanças corretamente
- Versão incrementa automaticamente: `v0` → `v1` → `v2`...

## 🧪 **VERIFICAÇÃO ATRAVÉS DE TESTES**

### Teste: Instância Única Mantida
```javascript
const users1 = await db.createResource({ name: 'users', attributes: {...} });
const users2 = await db.createResource({ name: 'users', attributes: {...} }); // Mudança no schema

// ✅ MESMA instância
expect(users1).toBe(users2);
expect(users1).toBe(db.resource('users'));
```

### Teste: Versão Atualizada na Mesma Instância
```javascript
const users = await db.createResource({ name: 'users', attributes: { name: 'string' } });
console.log(users.options.version); // v0

await db.createResource({ name: 'users', attributes: { name: 'string', email: 'string' } });
console.log(users.options.version); // v1 ✅ Mesma instância, versão atualizada
```

## 📋 **RESULTADOS DOS TESTES**

```
✅ Initial: users1 === usersRef1
✅ After update: users1 === users2 === usersRef2
✅ All instances are the same: true
✅ All references preserved after update
✅ Version updated on same instance: v0 → v1
✅ Update event emitted correctly
```

## 🎯 **GARANTIAS AGORA IMPLEMENTADAS**

1. **✅ UMA única instância por nome de resource**
2. **✅ `db.resource(':name')` sempre retorna a mesma instância**
3. **✅ Mudanças de schema atualizam a instância existente**
4. **✅ Versionamento funciona corretamente com hash SHA256**
5. **✅ Todas as referências permanecem válidas após atualizações**
6. **✅ Schema é reconstruído completamente quando necessário**
7. **✅ Hooks são reconfigurados automaticamente**

## 🔄 **Fluxo Correto Agora**

1. **Primeira vez**: `createResource()` → Cria nova instância
2. **Segunda vez**: `createResource()` → **ATUALIZA** instância existente
3. **Schema muda**: Hash detecta → Incrementa versão → Emite evento
4. **`db.resource()`**: Sempre retorna a **mesma instância atualizada**

## ⚠️ **IMPORTANTE PARA DESENVOLVEDORES**

- **Nunca mais múltiplas instâncias**: Seguro usar `db.resource(':name')` 
- **Referências persistem**: Variáveis guardadas continuam válidas
- **Versionamento automático**: Sistema detecta mudanças automaticamente
- **Backward compatibility**: Objetos antigos usam schema correto da versão

Esta implementação garante que a arquitetura do s3db.js seja **robusta e previsível** para uso em produção! 🚀