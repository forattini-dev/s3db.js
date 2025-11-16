# Auth Drivers - Resource Management Strategy

## 🎯 Problema

Cada driver de autenticação precisa de um resource com campos específicos. Como gerenciar isso?

**Opções:**
1. ✅ **Auto-create**: Driver cria resource automaticamente com campos mínimos
2. ✅ **Use existing**: Driver usa resource existente (validando campos necessários)
3. ✅ **Hybrid**: Configurável via `createResource` flag

## 📋 Design Proposto

### Configuração por Driver

```javascript
{
  driver: 'jwt',
  config: {
    // 🆕 Resource management
    resource: 'users',           // Nome do resource (default: 'plg_api_{driver}_users')
    createResource: true,        // Se true, cria automaticamente (default: true)

    // 🆕 Field mapping (usado para validação E criação)
    userField: 'email',          // Campo de identificação do usuário
    passwordField: 'password',   // Campo de senha (se aplicável)

    // Configs específicas do driver
    secret: 'my-secret',
    expiresIn: '7d'
  }
}
```

### Comportamento

#### Modo 1: Auto-create (createResource: true) - PADRÃO

```javascript
// Usuário não especifica resource, driver cria automaticamente
{
  driver: 'jwt',
  config: {
    // Sem resource especificado → cria 'plg_api_jwt_users'
    secret: 'secret'
  }
}
```

**O que acontece:**
1. Driver verifica se resource existe
2. Se NÃO existe → **cria automaticamente** com schema mínimo
3. Se existe → **valida** se tem os campos necessários

**Schema criado automaticamente (JWT):**
```javascript
{
  name: 'plg_api_jwt_users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',      // userField padrão
    password: 'secret|required|minlength:8', // passwordField padrão
    role: 'string|default:user',
    scopes: 'array|items:string|optional',
    active: 'boolean|default:true',
    createdAt: 'string|optional',
    lastLoginAt: 'string|optional'
  },
  behavior: 'body-overflow',
  timestamps: true,
  createdBy: 'ApiPlugin:jwt'
}
```

#### Modo 2: Use Existing (createResource: false)

```javascript
{
  driver: 'jwt',
  config: {
    resource: 'my_custom_users',
    createResource: false,  // NÃO cria, só usa
    userField: 'username',  // Campo customizado
    passwordField: 'pass',   // Campo customizado
    secret: 'secret'
  }
}
```

**O que acontece:**
1. Driver procura resource `my_custom_users`
2. Se NÃO existe → **ERRO** (não cria)
3. Se existe → **valida** campos necessários
4. Se falta campo → **ERRO com sugestão**

**Validação de campos:**
```javascript
const requiredFields = {
  [config.userField || 'email']: true,
  [config.passwordField || 'password']: true
};

const missingFields = Object.keys(requiredFields).filter(
  field => !resource.schema.attributes[field]
);

if (missingFields.length > 0) {
  throw new Error(
    `JWT driver: Resource '${config.resource}' is missing required fields: ` +
    `${missingFields.join(', ')}\n\n` +
    `Add these fields to your resource schema or set createResource: true ` +
    `to auto-create a compatible resource.`
  );
}
```

#### Modo 3: Shared Resource (múltiplos drivers)

```javascript
auth: {
  // Resource compartilhado entre drivers
  drivers: [
    {
      driver: 'jwt',
      config: {
        resource: 'users',        // Usa mesmo resource
        createResource: false,    // Não cria (já existe)
        userField: 'email',
        passwordField: 'password',
        secret: 'jwt-secret'
      }
    },
    {
      driver: 'basic',
      config: {
        resource: 'users',        // Usa mesmo resource
        createResource: false,    // Não cria (já existe)
        usernameField: 'email',
        passwordField: 'password',
        realm: 'API'
      }
    },
    {
      driver: 'apiKey',
      config: {
        resource: 'users',        // Usa mesmo resource
        createResource: false,    // Não cria (já existe)
        keyField: 'apiKey'        // Precisa ter campo apiKey!
      }
    }
  ]
}
```

**Criação manual do resource compartilhado:**
```javascript
await database.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',       // JWT + Basic
    password: 'secret|required',          // JWT + Basic
    apiKey: 'string|optional',            // API Key
    role: 'string|default:user',
    scopes: 'array|items:string|optional',
    active: 'boolean|default:true'
  }
});
```

---

## 🔧 Implementação

### 1. Schema Mínimo por Driver

Cada driver define seu schema mínimo:

#### JWT Driver
```javascript
const JWT_MINIMAL_SCHEMA = {
  id: 'string|required',
  [config.userField || 'email']: 'string|required|email',
  [config.passwordField || 'password']: 'secret|required|minlength:8',
  role: 'string|default:user',
  active: 'boolean|default:true'
};
```

#### Basic Auth Driver
```javascript
const BASIC_MINIMAL_SCHEMA = {
  id: 'string|required',
  [config.usernameField || 'email']: 'string|required',
  [config.passwordField || 'password']: 'secret|required|minlength:8',
  active: 'boolean|default:true'
};
```

#### API Key Driver
```javascript
const APIKEY_MINIMAL_SCHEMA = {
  id: 'string|required',
  [config.keyField || 'apiKey']: 'string|required',
  active: 'boolean|default:true'
};
```

#### OAuth2 Driver (Resource Server)
```javascript
const OAUTH2_MINIMAL_SCHEMA = {
  id: 'string|required',  // Mapeia de 'sub' claim
  email: 'string|optional|email',
  username: 'string|optional',
  role: 'string|default:user',
  scopes: 'array|items:string|optional',
  active: 'boolean|default:true'
};
```

#### OIDC Driver
```javascript
const OIDC_MINIMAL_SCHEMA = {
  id: 'string|required',  // Mapeia de config.userMapping.id → 'sub'
  email: 'string|required|email',
  username: 'string|optional',
  role: 'string|default:user',
  scopes: 'array|items:string|optional',
  active: 'boolean|default:true',
  provider: 'string|optional',  // 'azure', 'google', etc.
  providerId: 'string|optional', // ID no provedor externo
  lastLoginAt: 'string|optional'
};
```

### 2. Resource Helper Class

```javascript
/**
 * Helper for managing auth driver resources
 */
class AuthResourceManager {
  constructor(database, driverName, config) {
    this.database = database;
    this.driverName = driverName;
    this.config = config;
    this.logger = createLogger({ name: `AuthResource:${driverName}` });
  }

  /**
   * Get or create resource for this driver
   * @returns {Resource} Resource instance
   */
  async getOrCreateResource() {
    const resourceName = this.config.resource || this.getDefaultResourceName();
    const createResource = this.config.createResource !== false; // Default: true

    // Check if resource exists
    const existingResource = this.database.resources[resourceName];

    if (existingResource) {
      this.logger.debug(`Using existing resource: ${resourceName}`);

      // Validate required fields
      this.validateResourceFields(existingResource);

      return existingResource;
    }

    // Resource doesn't exist
    if (!createResource) {
      throw new Error(
        `${this.driverName} driver: Resource '${resourceName}' not found.\n\n` +
        `Options:\n` +
        `1. Create the resource manually with required fields\n` +
        `2. Set createResource: true to auto-create\n` +
        `3. Use a different resource name\n\n` +
        `Required fields: ${this.getRequiredFieldNames().join(', ')}`
      );
    }

    // Auto-create resource
    this.logger.info(`Auto-creating resource: ${resourceName}`);
    return await this.createDefaultResource(resourceName);
  }

  /**
   * Get default resource name for this driver
   */
  getDefaultResourceName() {
    return `plg_api_${this.driverName}_users`;
  }

  /**
   * Get required field names for validation
   */
  getRequiredFieldNames() {
    const schema = this.getMinimalSchema();
    return Object.keys(schema);
  }

  /**
   * Validate existing resource has required fields
   * @throws {Error} If required fields are missing
   */
  validateResourceFields(resource) {
    const requiredFields = this.getRequiredFieldNames();
    const existingFields = Object.keys(resource.schema.attributes);

    const missingFields = requiredFields.filter(
      field => !existingFields.includes(field)
    );

    if (missingFields.length > 0) {
      throw new Error(
        `${this.driverName} driver: Resource '${resource.name}' is missing required fields:\n` +
        `${missingFields.map(f => `  - ${f}`).join('\n')}\n\n` +
        `Options:\n` +
        `1. Add missing fields to your resource schema\n` +
        `2. Set createResource: true to auto-create a new resource\n` +
        `3. Use field mapping to match existing fields (e.g., userField: 'username')`
      );
    }

    this.logger.debug(`Resource validation passed: ${resource.name}`);
  }

  /**
   * Create resource with minimal schema for this driver
   */
  async createDefaultResource(resourceName) {
    const schema = this.getMinimalSchema();

    const resource = await this.database.createResource({
      name: resourceName,
      attributes: schema,
      behavior: 'body-overflow',
      timestamps: true,
      createdBy: `ApiPlugin:${this.driverName}`
    });

    this.logger.info(`Created resource '${resourceName}' with fields: ${Object.keys(schema).join(', ')}`);

    return resource;
  }

  /**
   * Get minimal schema for this driver (override in subclasses)
   */
  getMinimalSchema() {
    throw new Error('getMinimalSchema() must be implemented by driver');
  }
}

/**
 * JWT Resource Manager
 */
class JWTResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const userField = this.config.userField || 'email';
    const passwordField = this.config.passwordField || 'password';

    return {
      id: 'string|required',
      [userField]: userField === 'email'
        ? 'string|required|email'
        : 'string|required|minlength:3',
      [passwordField]: 'secret|required|minlength:8',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',
      active: 'boolean|default:true',
      lastLoginAt: 'string|optional',
      createdAt: 'string|optional'
    };
  }
}

/**
 * API Key Resource Manager
 */
class APIKeyResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const keyField = this.config.keyField || 'apiKey';

    return {
      id: 'string|required',
      [keyField]: 'string|required|minlength:16',
      active: 'boolean|default:true',
      name: 'string|optional',        // Client/app name
      scopes: 'array|items:string|optional',
      createdAt: 'string|optional',
      lastUsedAt: 'string|optional'
    };
  }
}

/**
 * Basic Auth Resource Manager
 */
class BasicAuthResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const usernameField = this.config.usernameField || 'email';
    const passwordField = this.config.passwordField || 'password';

    return {
      id: 'string|required',
      [usernameField]: usernameField === 'email'
        ? 'string|required|email'
        : 'string|required|minlength:3',
      [passwordField]: 'secret|required|minlength:8',
      active: 'boolean|default:true',
      role: 'string|default:user'
    };
  }
}

/**
 * OAuth2 Resource Manager
 */
class OAuth2ResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const mapping = this.config.userMapping || {
      id: 'sub',
      email: 'email',
      username: 'preferred_username'
    };

    return {
      id: 'string|required',
      email: 'string|optional|email',
      username: 'string|optional',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',
      active: 'boolean|default:true',
      providerId: 'string|optional', // Original 'sub' from token
      createdAt: 'string|optional'
    };
  }
}

/**
 * OIDC Resource Manager
 */
class OIDCResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const mapping = this.config.userMapping || {
      id: 'sub',
      email: 'email',
      username: 'preferred_username',
      role: 'role'
    };

    return {
      id: 'string|required',
      email: 'string|required|email',
      username: 'string|optional',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',
      active: 'boolean|default:true',
      provider: 'string|optional',     // 'azure', 'google', 'keycloak'
      providerId: 'string|optional',   // Original 'sub' from IdP
      lastLoginAt: 'string|optional',
      createdAt: 'string|optional',
      metadata: 'json|optional'        // Extra claims/data
    };
  }
}
```

### 3. Usage in Drivers

```javascript
// In jwt-auth.js
export async function createJWTHandler(config, database) {
  // Get or create resource
  const manager = new JWTResourceManager(database, 'jwt', config);
  const authResource = await manager.getOrCreateResource();

  // Rest of JWT logic uses authResource
  return async (c, next) => {
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    // ... verify token
    const user = await authResource.query({
      [config.userField || 'email']: decoded.username
    });
    // ...
  };
}
```

---

## 📚 Examples

### Example 1: Auto-create (Simplest)

```javascript
const api = new ApiPlugin({
  auth: {
    drivers: [{
      driver: 'jwt',
      config: {
        secret: 'my-secret'
        // That's it! Creates 'plg_api_jwt_users' automatically
      }
    }]
  }
});
```

### Example 2: Custom Resource Name (Auto-create)

```javascript
const api = new ApiPlugin({
  auth: {
    drivers: [{
      driver: 'jwt',
      config: {
        resource: 'my_users',  // Custom name
        secret: 'my-secret'
        // Creates 'my_users' with minimal schema
      }
    }]
  }
});
```

### Example 3: Use Existing Resource

```javascript
// First, create resource manually
await database.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'secret|required',
    active: 'boolean|default:true',
    // ... your custom fields
    department: 'string|optional',
    employeeId: 'string|optional'
  }
});

// Then configure driver to use it
const api = new ApiPlugin({
  auth: {
    drivers: [{
      driver: 'jwt',
      config: {
        resource: 'users',
        createResource: false,  // Don't create, use existing
        userField: 'email',
        passwordField: 'password',
        secret: 'my-secret'
      }
    }]
  }
});
```

### Example 4: Shared Resource (Multiple Drivers)

```javascript
// Create shared resource first
await database.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required|email',
    password: 'secret|required',
    apiKey: 'string|optional',    // For API Key driver
    active: 'boolean|default:true',
    role: 'string|default:user',
    scopes: 'array|items:string|optional'
  }
});

// Configure multiple drivers to share it
const api = new ApiPlugin({
  auth: {
    drivers: [
      {
        driver: 'jwt',
        config: {
          resource: 'users',
          createResource: false,
          secret: 'jwt-secret'
        }
      },
      {
        driver: 'basic',
        config: {
          resource: 'users',
          createResource: false
        }
      },
      {
        driver: 'apiKey',
        config: {
          resource: 'users',
          createResource: false,
          keyField: 'apiKey'
        }
      }
    ]
  }
});
```

### Example 5: Different Resources per Driver

```javascript
const api = new ApiPlugin({
  auth: {
    drivers: [
      {
        driver: 'jwt',
        config: {
          resource: 'admin_users',  // Admins only
          createResource: true,
          secret: 'admin-secret'
        }
      },
      {
        driver: 'apiKey',
        config: {
          resource: 'api_clients',  // External apps
          createResource: true,
          keyField: 'apiKey'
        }
      }
    ]
  }
});

// Creates TWO resources:
// - admin_users (id, email, password, role, active)
// - api_clients (id, apiKey, name, scopes, active)
```

---

## ⚠️ Edge Cases

### Case 1: Resource Exists but Missing Fields

```javascript
// Existing resource
await database.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    username: 'string|required'
    // Missing 'password' field!
  }
});

// Driver config
{
  driver: 'jwt',
  config: {
    resource: 'users',
    createResource: false,
    userField: 'username',
    passwordField: 'password'  // Field doesn't exist!
  }
}

// Result: ERROR with clear message
// "JWT driver: Resource 'users' is missing required fields: password"
```

### Case 2: Field Type Mismatch

```javascript
// Resource has 'password' as plain string (not secret!)
await database.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required',
    password: 'string|required'  // Should be 'secret'!
  }
});

// Driver validates field TYPE
// Warning: "Field 'password' should be type 'secret' for security"
```

### Case 3: Multiple Drivers, Different Field Names

```javascript
{
  drivers: [
    {
      driver: 'jwt',
      config: {
        resource: 'users',
        userField: 'email',
        passwordField: 'password'
      }
    },
    {
      driver: 'basic',
      config: {
        resource: 'users',
        usernameField: 'username',  // Different field!
        passwordField: 'password'
      }
    }
  ]
}

// Resource needs BOTH fields:
{
  email: 'string|required|email',
  username: 'string|required',
  password: 'secret|required'
}
```

---

## 🎯 Summary

| Scenario | createResource | resource | Result |
|----------|---------------|----------|--------|
| **Auto (default)** | `true` (default) | Not specified | Creates `plg_api_{driver}_users` |
| **Custom name (auto)** | `true` | `'my_users'` | Creates `my_users` with minimal schema |
| **Use existing** | `false` | `'users'` | Uses existing, validates fields |
| **Shared resource** | `false` | `'users'` (same for all) | Multiple drivers share one resource |

**Recommendation:**
- **Development**: Use auto-create (simplest)
- **Production**: Create resources manually for control and custom fields
