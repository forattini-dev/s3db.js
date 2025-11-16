# API Plugin Refactoring Plan

## Objetivos

1. **Reorganizar auth config**: Mover `userField`, `passwordField`, `resource` para dentro de cada driver
2. **Remover `verbose`**: Substituir por `logLevel` (default: 'info')
3. **Centralizar config comum**: Manter no nível do plugin apenas configurações comuns a todos os drivers

## Estrutura Atual vs Nova

### ANTES (Estrutura Atual)
```javascript
const api = new ApiPlugin({
  verbose: true, // ❌ Será removido
  auth: {
    resource: 'users', // ❌ Mover para dentro do driver
    drivers: [
      {
        driver: 'jwt',
        config: {
          secret: 'my-secret',
          // userField e passwordField NÃO estão aqui
        }
      },
      {
        driver: 'basic',
        config: {
          usernameField: 'email', // ✅ JÁ tem
          passwordField: 'password' // ✅ JÁ tem
        }
      }
    ]
  }
});
```

### DEPOIS (Nova Estrutura)
```javascript
const api = new ApiPlugin({
  logLevel: 'info', // ✅ Novo - substitui verbose
  auth: {
    // Configs comuns para TODOS os drivers
    registration: { enabled: true },
    loginThrottle: { enabled: true },

    drivers: [
      {
        driver: 'jwt',
        config: {
          secret: 'my-secret',
          resource: 'users', // ✅ Específico deste driver
          userField: 'email', // ✅ Novo
          passwordField: 'password', // ✅ Novo
          expiresIn: '7d'
        }
      },
      {
        driver: 'basic',
        config: {
          resource: 'users', // ✅ Específico deste driver
          usernameField: 'email', // ✅ JÁ existe
          passwordField: 'password', // ✅ JÁ existe
          realm: 'API'
        }
      },
      {
        driver: 'apiKey',
        config: {
          resource: 'users', // ✅ Específico deste driver
          keyField: 'apiKey', // ✅ Qual campo tem a API key
          headerName: 'X-API-Key'
        }
      }
    ]
  }
});
```

## Mudanças Necessárias

### 1. Plugin Index (index.js)

- [ ] Adicionar `logLevel` como opção top-level (default: 'info')
- [ ] Remover `verbose` de todas as referências
- [ ] Permitir `resource` dentro de cada driver config
- [ ] Manter `auth.resource` como fallback para backward compatibility (deprecated)

### 2. Auth Drivers

Cada driver deve aceitar em seu config:

#### JWT Auth (jwt-auth.js)
```javascript
{
  secret: 'required',
  resource: 'users', // ✅ Nome do resource para este driver
  userField: 'email', // ✅ Qual campo usar para buscar usuário
  passwordField: 'password', // ✅ Qual campo tem a senha
  expiresIn: '7d',
  algorithm: 'HS256'
}
```

#### Basic Auth (basic-auth.js)
```javascript
{
  resource: 'users', // ✅ Nome do resource
  usernameField: 'email', // ✅ JÁ existe
  passwordField: 'password', // ✅ JÁ existe
  realm: 'API',
  passphrase: 'secret'
}
```

#### API Key Auth (api-key-auth.js)
```javascript
{
  resource: 'users', // ✅ Nome do resource
  keyField: 'apiKey', // ✅ Qual campo tem a chave
  headerName: 'X-API-Key',
  queryParam: 'api_key' // optional
}
```

#### OIDC Auth (oidc-auth.js)
```javascript
{
  resource: 'users', // ✅ Nome do resource
  userField: 'email', // ✅ Qual campo mapear do OIDC
  issuer: 'https://...',
  clientId: '...',
  clientSecret: '...'
}
```

### 3. Logger Migration (verbose → logLevel)

#### Atual
```javascript
if (this.config.verbose) {
  console.log('message'); // ou logger.info()
}
```

#### Novo
```javascript
// Logger já criado com logLevel
this.logger.info('message'); // Pino filtra automaticamente
```

#### Mapeamento

- `verbose: true` → `logLevel: 'debug'`
- `verbose: false` → `logLevel: 'info'`
- Default → `logLevel: 'info'`

### 4. Arquivos Afetados

#### API Plugin Core
- `src/plugins/api/index.js` - Normalização de config
- `src/plugins/api/server.js` - Criação do servidor

#### Auth Drivers
- `src/plugins/api/auth/jwt-auth.js`
- `src/plugins/api/auth/basic-auth.js`
- `src/plugins/api/auth/api-key-auth.js`
- `src/plugins/api/auth/oidc-auth.js`
- `src/plugins/api/auth/oauth2-auth.js`

#### Auth Strategies
- `src/plugins/api/auth/strategies/factory.class.js`
- `src/plugins/api/auth/strategies/global-strategy.class.js`
- `src/plugins/api/auth/strategies/path-based-strategy.class.js`
- `src/plugins/api/auth/strategies/path-rules-strategy.class.js`

#### Middlewares
- `src/plugins/api/middlewares/*.js` (todos)

#### Server Components
- `src/plugins/api/server/middleware-chain.class.js`
- `src/plugins/api/server/router.class.js`
- `src/plugins/api/server/health-manager.class.js`

#### Concerns
- `src/plugins/api/concerns/*.js` (todos que usam verbose)

## Backward Compatibility

### Deprecation Warnings

```javascript
// Se auth.resource existe (config antiga)
if (authOptions.resource && !drivers.some(d => d.config.resource)) {
  this.logger.warn(
    'DEPRECATED: auth.resource is deprecated. ' +
    'Use driver-specific resource instead: ' +
    'drivers: [{ driver: "jwt", config: { resource: "users" } }]. ' +
    'This will be removed in v17.0.'
  );
  // Aplicar resource a todos os drivers como fallback
}

// Se verbose existe
if (options.verbose !== undefined) {
  const suggestedLevel = options.verbose ? 'debug' : 'info';
  this.logger.warn(
    `DEPRECATED: verbose option is deprecated. ` +
    `Use logLevel: '${suggestedLevel}' instead. ` +
    `This will be removed in v17.0.`
  );
  options.logLevel = options.logLevel || suggestedLevel;
}
```

## Testing Strategy

1. **Unit tests**: Atualizar testes para usar nova estrutura
2. **Integration tests**: Validar backward compatibility
3. **Examples**: Atualizar exemplos na documentação

## Migration Guide

Para usuários migrarem:

### De
```javascript
new ApiPlugin({
  verbose: true,
  auth: {
    resource: 'users',
    drivers: [
      { driver: 'jwt', config: { secret: 'x' } }
    ]
  }
})
```

### Para
```javascript
new ApiPlugin({
  logLevel: 'debug', // verbose: true → logLevel: 'debug'
  auth: {
    drivers: [
      {
        driver: 'jwt',
        config: {
          secret: 'x',
          resource: 'users', // Movido para dentro
          userField: 'email',
          passwordField: 'password'
        }
      }
    ]
  }
})
```
