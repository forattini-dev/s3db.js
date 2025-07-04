# Tratamento de Erros de Descriptografia no s3db.js

## Problema

Quando você usa o s3db.js para listar recursos (especialmente com o método `page()`), pode encontrar erros de descriptografia como:

```
DOMException [OperationError]: The operation failed for an operation-specific reason
```

Isso acontece quando:
- A senha de criptografia mudou
- Os dados foram corrompidos
- Há incompatibilidade de versão
- Problemas de configuração de criptografia

## Solução

### 1. Melhorias no Código

O s3db.js já tem tratamento de erros de descriptografia, mas foi melhorado para ser mais robusto:

```javascript
// O método page() agora tem tratamento de erro mais robusto
const result = await users.page({ offset, size });

// Se houver erros de descriptografia, os itens terão a flag _decryptionFailed
const validItems = result.items.filter(item => !item._decryptionFailed);
const decryptionErrors = result.items.filter(item => item._decryptionFailed);
```

### 2. Seu Código Atual

```javascript
const { offset, size } = getPaginationParams(req.query)

const [success, error, result] = await tryFn(this.db.resource('users').page({offset, size}))

if (!success) {
  return next(createErrorWithDetails(500, 'could not list users', error))
}

delete result._debug
result.items = result.items.map(item => omitBy(item, (value, key) => key.startsWith('_')))

return res.json(result)
```

### 3. Código Melhorado

```javascript
const { offset, size } = getPaginationParams(req.query)

try {
  const result = await this.db.resource('users').page({offset, size})
  
  // Filtrar itens com erro de descriptografia
  const validItems = result.items.filter(item => !item._decryptionFailed)
  const decryptionErrors = result.items.filter(item => item._decryptionFailed)
  
  // Log de erros para monitoramento
  if (decryptionErrors.length > 0) {
    console.warn(`Found ${decryptionErrors.length} items with decryption errors:`, 
      decryptionErrors.map(item => ({ id: item.id, error: item._error }))
    )
  }
  
  // Preparar resposta
  const response = {
    items: validItems.map(item => {
      // Remove campos internos (que começam com _)
      const cleanItem = {}
      Object.keys(item).forEach(key => {
        if (!key.startsWith('_')) {
          cleanItem[key] = item[key]
        }
      })
      return cleanItem
    }),
    totalItems: result.totalItems,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    decryptionErrors: decryptionErrors.length // Para monitoramento
  }
  
  return res.json(response)
  
} catch (error) {
  console.error('Critical error in user listing:', error.message)
  
  // Resposta de fallback
  return res.json({
    items: [],
    totalItems: null,
    page: Math.floor(offset / size),
    pageSize: size,
    totalPages: null,
    error: 'Service temporarily unavailable'
  })
}
```

### 4. Alternativas para Performance

#### Usar skipCount para melhor performance:

```javascript
const result = await users.page({ 
  offset, 
  size, 
  skipCount: true // Não conta totalItems (mais rápido)
})
```

#### Usar list() como alternativa:

```javascript
const items = await users.list({ 
  limit: size, 
  offset: offset 
})

const response = {
  items: items.filter(item => !item._decryptionFailed),
  // Sem informações de paginação
}
```

### 5. Monitoramento

Adicione logs para monitorar erros de descriptografia:

```javascript
// No seu middleware ou controller
if (decryptionErrors.length > 0) {
  // Log para monitoramento
  console.warn(`Decryption errors in user listing:`, {
    count: decryptionErrors.length,
    errors: decryptionErrors.map(item => ({
      id: item.id,
      error: item._error
    }))
  })
  
  // Métricas para alertas
  // metrics.increment('decryption_errors', decryptionErrors.length)
}
```

### 6. Recuperação de Dados

Para itens com erro de descriptografia, você pode:

1. **Ignorar** (como mostrado acima)
2. **Tentar recuperar** com diferentes senhas
3. **Marcar para reindexação**
4. **Notificar administradores**

```javascript
// Exemplo de recuperação
const decryptionErrors = result.items.filter(item => item._decryptionFailed)

for (const item of decryptionErrors) {
  try {
    // Tentar com senha alternativa
    const recovered = await users.get(item.id, { passphrase: 'alternative-passphrase' })
    // Processar item recuperado
  } catch (recoveryError) {
    // Marcar para reindexação
    await markForReindex(item.id)
  }
}
```

### 7. Prevenção

Para evitar problemas futuros:

1. **Backup regular** da senha de criptografia
2. **Versionamento** de configurações de criptografia
3. **Testes** com dados reais
4. **Monitoramento** contínuo de erros

## Exemplos

Veja os exemplos completos em:
- `examples/16-decryption-error-handling.js` - Tratamento geral de erros
- `examples/17-secret-password-generation.js` - Caso específico de usuários

## Conclusão

Com essas melhorias, seu sistema será mais robusto e continuará funcionando mesmo quando houver problemas de descriptografia em alguns itens. Os usuários receberão uma resposta válida, e você terá visibilidade sobre os problemas para resolvê-los. 

# Resolvendo Problemas de Descriptografia na Listagem de Usuários

## Problema

Você está enfrentando um erro de descriptografia ao tentar listar usuários:

```
Failed to get resource filipe.forattini@stone.com.br: Failed to get resource with id 'filipe.forattini@stone.com.br': The operation failed for an operation-specific reason
```

O erro ocorre porque:
1. O método `page()` está funcionando corretamente
2. Mas quando tenta recuperar recursos individuais, há falha na descriptografia
3. O s3db.js tem tratamento para isso, mas parece que há um problema específico

## Solução

### 1. Melhorias no Código do s3db.js

As melhorias já foram implementadas nos métodos `page()` e `list()` para:
- Tratar erros de descriptografia de forma mais robusta
- Retornar resultados parciais mesmo quando há falhas
- Adicionar logs detalhados para debugging

### 2. Código da API Atualizado

Substitua seu código atual por esta versão mais robusta:

```javascript
const { offset, size } = getPaginationParams(req.query)

try {
  const [success, error, result] = await tryFn(this.db.resource('users').page({offset, size}))

  if (!success) {
    return next(createErrorWithDetails(500, 'could not list users', error))
  }

  // Check for decryption errors
  const decryptionErrors = result.items.filter(item => item._decryptionFailed)
  if (decryptionErrors.length > 0) {
    console.warn(`Found ${decryptionErrors.length} items with decryption errors:`, 
      decryptionErrors.map(item => ({ id: item.id, error: item._error }))
    )
  }

  // Filter out items with decryption errors
  const validItems = result.items.filter(item => !item._decryptionFailed)
  
  // Clean up response
  delete result._debug
  const cleanItems = validItems.map(item => 
    omitBy(item, (value, key) => key.startsWith('_'))
  )

  const response = {
    ...result,
    items: cleanItems,
    decryptionErrors: decryptionErrors.length
  }

  return res.json(response)

} catch (error) {
  console.error('Critical error in user listing:', error)
  return next(createErrorWithDetails(500, 'could not list users', error))
}
```

### 3. Alternativas para Performance

#### Opção A: Usar skipCount para melhor performance

```javascript
const result = await this.db.resource('users').page({
  offset, 
  size,
  skipCount: true // Skip total count for better performance
})
```

#### Opção B: Usar list() em vez de page()

```javascript
const items = await this.db.resource('users').list({ 
  limit: size, 
  offset 
})

const response = {
  items: items.map(item => omitBy(item, (value, key) => key.startsWith('_'))),
  totalItems: null, // Not available with list()
  page: Math.floor(offset / size),
  pageSize: size,
  totalPages: null
}
```

#### Opção C: Separar count e list

```javascript
// Get count separately
const totalItems = await this.db.resource('users').count()
const totalPages = Math.ceil(totalItems / size)

// Get items
const items = await this.db.resource('users').list({ 
  limit: size, 
  offset 
})

const response = {
  items: items.map(item => omitBy(item, (value, key) => key.startsWith('_'))),
  totalItems,
  page: Math.floor(offset / size),
  pageSize: size,
  totalPages
}
```

### 4. Testando com MinIO

Use o exemplo `18-user-listing-decryption-fix.js` para testar:

```bash
# Configure o passphrase correto no arquivo
node examples/18-user-listing-decryption-fix.js
```

### 5. Debugging

Para debugar problemas de descriptografia:

1. **Verificar passphrase**: Certifique-se de que a passphrase está correta
2. **Verificar versões**: Dados criptografados com versões diferentes podem causar problemas
3. **Verificar dados corrompidos**: Alguns objetos podem estar corrompidos no S3

### 6. Monitoramento

Adicione logs para monitorar problemas:

```javascript
// Log decryption errors
if (decryptionErrors.length > 0) {
  console.warn(`Decryption errors in user listing:`, {
    count: decryptionErrors.length,
    errors: decryptionErrors.map(item => ({
      id: item.id,
      error: item._error
    }))
  })
}
```

### 7. Recuperação de Dados

Para recuperar dados com problemas de descriptografia:

```javascript
// Try to get raw metadata without decryption
const rawData = await users.get('filipe.forattini@stone.com.br')
if (rawData._decryptionFailed) {
  console.log('Raw metadata available:', rawData)
  // You can still access some basic information
}
```

## Conclusão

Com essas melhorias, sua API deve:
- ✅ Não falhar quando há problemas de descriptografia
- ✅ Retornar dados válidos mesmo com alguns erros
- ✅ Fornecer informações sobre erros para debugging
- ✅ Ter melhor performance com `skipCount`

O problema específico com `filipe.forattini@stone.com.br` pode ser resolvido verificando se o objeto foi criptografado com a passphrase correta ou se há corrupção nos dados. 