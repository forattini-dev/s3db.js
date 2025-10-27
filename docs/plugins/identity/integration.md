# 🔗 Integration Guide

> **Quick Jump:** [Resource Server](#resource-server-integration) | [Client Integration](#client-integration-examples) | [Azure AD](#azure-ad-integration) | [Keycloak](#keycloak-integration) | [Multi-Audience](#multi-audience-tokens)

> **Navigation:** [← Back to Identity Plugin](../identity.md) | [← API Reference](./api-reference.md) | [Troubleshooting →](./troubleshooting.md)

---

## Overview

Learn how to integrate the Identity Plugin with Resource Servers, client applications, and external identity providers (Azure AD, Keycloak).

---

## Resource Server Integration

Resource Servers validate JWT tokens issued by the Identity Plugin using the OIDC driver.

### Basic Setup

```javascript
import { ApiPlugin } from 's3db.js/plugins/api';
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

// Create OIDC client
const oidcClient = new OIDCClient({
  issuer: 'http://localhost:4000',          // Identity Plugin URL
  audience: 'http://localhost:3001',        // This API's identifier
  discoveryUri: 'http://localhost:4000/.well-known/openid-configuration'
});

await oidcClient.initialize();

// Add to API Plugin
await db.usePlugin(new ApiPlugin({
  port: 3001,
  auth: {
    drivers: [
      {
        name: 'oidc',
        driver: oidcClient.middleware.bind(oidcClient)
      }
    ]
  },
  resources: {
    orders: { auth: true }  // Protect with OIDC
  }
}));
```

### Accessing User Info in Handlers

```javascript
api.addRoute({
  path: '/orders',
  method: 'GET',
  handler: async (req, res) => {
    // req.user contains validated token payload
    const userId = req.user.sub;
    const scopes = req.user.scope.split(' ');
    const email = req.user.email;

    // Fetch user-specific orders
    const orders = await ordersResource.query({ userId });

    return res.json({ orders });
  },
  auth: 'oidc'
});
```

---

## Client Integration Examples

### Web Application (Authorization Code Flow)

```javascript
import express from 'express';
import session from 'express-session';

const app = express();

app.use(session({
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: false
}));

// Step 1: Login redirect
app.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('base64url');
  req.session.oauthState = state;

  const authUrl = new URL('http://localhost:4000/oauth/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', 'webapp-123');
  authUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);

  res.redirect(authUrl.toString());
});

// Step 2: Handle callback
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state (CSRF protection)
  if (state !== req.session.oauthState) {
    return res.status(400).send('Invalid state');
  }

  // Exchange code for tokens
  const response = await fetch('http://localhost:4000/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from('webapp-123:secret').toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://localhost:3000/callback'
    })
  });

  const tokens = await response.json();

  // Store tokens in session
  req.session.accessToken = tokens.access_token;
  req.session.refreshToken = tokens.refresh_token;
  req.session.idToken = tokens.id_token;

  res.redirect('/dashboard');
});

// Protected route
app.get('/dashboard', async (req, res) => {
  if (!req.session.accessToken) {
    return res.redirect('/login');
  }

  // Use access token to call APIs
  const ordersResponse = await fetch('http://localhost:3001/orders', {
    headers: {
      'Authorization': `Bearer ${req.session.accessToken}`
    }
  });

  const orders = await ordersResponse.json();
  res.render('dashboard', { orders });
});
```

### Mobile App (PKCE Flow)

```javascript
import crypto from 'crypto';

// Step 1: Generate PKCE challenge
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Step 2: Authorization request
const authUrl = new URL('http://localhost:4000/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'mobile-app');
authUrl.searchParams.set('redirect_uri', 'myapp://callback');
authUrl.searchParams.set('scope', 'openid profile offline_access');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('state', generateRandomState());

// Open browser with authUrl

// Step 3: Handle redirect (mobile deep link)
app.handleDeepLink('myapp://callback', async (params) => {
  const { code } = params;

  // Token exchange with PKCE verifier
  const response = await fetch('http://localhost:4000/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'myapp://callback',
      client_id: 'mobile-app',
      code_verifier: codeVerifier  // ← PKCE verification
    })
  });

  const tokens = await response.json();
  
  // Store tokens securely
  await SecureStore.setItemAsync('accessToken', tokens.access_token);
  await SecureStore.setItemAsync('refreshToken', tokens.refresh_token);
});
```

---

## Azure AD Integration

Resource Server validating tokens from Azure AD:

```javascript
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

const tenantId = 'your-tenant-id';
const clientId = 'your-api-client-id';

const azureOIDC = new OIDCClient({
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  audience: `api://${clientId}`,
  discoveryUri: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`
});

await azureOIDC.initialize();

await db.usePlugin(new ApiPlugin({
  port: 3001,
  auth: {
    drivers: [
      {
        name: 'azure',
        driver: azureOIDC.middleware.bind(azureOIDC)
      }
    ]
  },
  resources: {
    orders: { auth: true }
  }
}));
```

---

## Keycloak Integration

Resource Server validating tokens from Keycloak:

```javascript
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

const keycloakOIDC = new OIDCClient({
  issuer: 'http://localhost:8080/realms/production',
  audience: 'orders-api',
  discoveryUri: 'http://localhost:8080/realms/production/.well-known/openid-configuration'
});

await keycloakOIDC.initialize();

await db.usePlugin(new ApiPlugin({
  port: 3001,
  auth: {
    drivers: [
      {
        name: 'keycloak',
        driver: keycloakOIDC.middleware.bind(keycloakOIDC)
      }
    ]
  }
}));
```

---

## Multi-Audience Tokens

Issue tokens valid for multiple Resource Servers:

### SSO Server Configuration

```javascript
const identityPlugin = new IdentityPlugin({
  issuer: 'http://localhost:4000',
  features: {
    multiAudience: true  // Enable multi-audience support
  }
});

// Token will include:
// {
//   "aud": ["api://orders", "api://products", "api://payments"],
//   ...
// }
```

### Resource Servers

Each Resource Server validates its own audience:

```javascript
// Orders API
const ordersOIDC = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'api://orders'  // Accepts if aud array includes this
});

// Products API
const productsOIDC = new OIDCClient({
  issuer: 'http://localhost:4000',
  audience: 'api://products'  // Accepts if aud array includes this
});
```

**Benefits:**
- ✅ Single token for multiple APIs
- ✅ Reduced token requests
- ✅ Better user experience
- ✅ Microservices-friendly

---

## 🎯 Summary

**Integration patterns:**
- ✅ Resource Servers use `OIDCClient` to validate tokens
- ✅ Web apps use authorization_code flow
- ✅ Mobile apps use authorization_code + PKCE flow
- ✅ Azure AD/Keycloak integration via OIDC discovery
- ✅ Multi-audience tokens support microservices

**Next Steps:**
1. Solve common issues: [Troubleshooting →](./troubleshooting.md)
2. Review configuration: [Configuration Reference →](./configuration.md)
3. Understand architecture: [Architecture & Token Flow →](./architecture.md)

---

## 🔗 See Also

**Related Documentation:**
- [Configuration Reference](./configuration.md) - All configuration options
- [Architecture & Token Flow](./architecture.md) - System design and flows
- [API Reference](./api-reference.md) - All endpoints
- [Troubleshooting](./troubleshooting.md) - Common errors and solutions
- [Identity Plugin Main](../identity.md) - Overview and quickstart

**Examples:**
- [e81-oauth2-resource-server.js](../../examples/e81-oauth2-resource-server.js) - Resource Server
- [e82-oidc-web-app.js](../../examples/e82-oidc-web-app.js) - Web app integration
- [e62-azure-ad-integration.js](../../examples/e62-azure-ad-integration.js) - Azure AD
- [e63-keycloak-integration.js](../../examples/e63-keycloak-integration.js) - Keycloak

---

> **Navigation:** [↑ Top](#) | [← API Reference](./api-reference.md) | [Troubleshooting →](./troubleshooting.md) | [← Back to Identity Plugin](../identity.md)
