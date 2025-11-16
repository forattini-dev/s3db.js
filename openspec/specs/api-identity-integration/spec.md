# api-identity-integration Specification

## Purpose
TBD - created by archiving change update-identity-api-integration. Update Purpose after archive.
## Requirements
### Requirement: ApiPlugin integrates with identity providers through the standard OIDC driver
The API plugin MUST rely exclusively on its existing `auth.drivers` configuration to talk to IdentityPlugin or any other OIDC-compliant issuer. No dedicated `identityIntegration.*` toggle or plugin-registry handshake is allowed.

#### Scenario: Local auth remains the default when no OIDC driver is configured
**Given** ApiPlugin starts without any `auth.drivers[].driver === 'oidc'`  
**When** it initializes  
**Then** it MUST create/resolve its own authentication resource and expose `/auth/login` + `/auth/register` routes exactly as today.

#### Scenario: Standard OIDC configuration enables IdentityPlugin integration
**Given** IdentityPlugin (or another IdP) exposes an issuer at `https://auth.example.com`  
**When** ApiPlugin is configured with:
```js
auth: {
  drivers: [{
    driver: 'oidc',
    config: {
      issuer: 'https://auth.example.com',
      clientId: 'api-client',
      clientSecret: 's3cret',
      redirectUri: 'https://api.example.com/auth/callback'
    }
  }]
}
```  
**Then** it MUST bootstrap the OIDC middleware using those values alone, exactly the same way it would integrate with Keycloak, Azure AD, or Auth0.

#### Scenario: Installing IdentityPlugin does not change ApiPlugin unless an OIDC driver is declared
**Given** IdentityPlugin is installed in the same database  
**And** ApiPlugin is configured only with local drivers (`jwt`, `apiKey`, `basic`)  
**When** ApiPlugin starts  
**Then** it MUST still mount its local `/auth/*` routes and MUST NOT skip them merely because IdentityPlugin is present.

### Requirement: OIDC driver follows issuer discovery and remote compatibility standards
The built-in OIDC driver MUST behave like any other OIDC client so that IdentityPlugin feels identical to external providers.

#### Scenario: Discovery documents are consumed when available
**Given** the configured issuer hosts `/.well-known/openid-configuration`  
**When** ApiPlugin processes the first OIDC login  
**Then** it MUST fetch the discovery document to determine authorization, token, logout, and JWKS endpoints and reuse the resolved endpoints for that request.

#### Scenario: Driver falls back gracefully when discovery fails
**Given** the issuer does not expose discovery or the discovery call returns a failure  
**When** ApiPlugin needs OAuth2 endpoints  
**Then** it MUST derive the endpoints from the issuer URL (e.g., `${issuer}/oauth2/v2.0/token` for Azure AD), log a warning, and continue instead of aborting initialization.

#### Scenario: Remote IdPs are treated the same as in-process IdentityPlugin
**Given** the issuer points to an external tenant (Azure AD, Auth0, remote IdentityPlugin, etc.)  
**When** ApiPlugin exchanges authorization codes, refresh tokens, or client credentials  
**Then** it MUST use standard HTTPS requests to the configured endpoints without assuming the provider runs inside the same process or database.

### Requirement: Request context differentiates humans vs service accounts
Handlers MUST be able to inspect `ctx.identity` (and the `serviceAccount` / `userProfile` shortcuts) to enforce policies for humans vs automation.

#### Scenario: Authorization code tokens populate user context
**Given** a request carries an access token issued via the `authorization_code` flow  
**When** the token is validated by the OIDC driver  
**Then** `ctx.identity.isUser()` MUST return `true`, `ctx.identity.getUser()` MUST return `{ id: sub, email, tenantId, scopes }`, and `ctx.identity.isServiceAccount()` MUST return `false`.

#### Scenario: Client credential tokens populate service-account context
**Given** a request carries an access token issued via `client_credentials`  
**When** the token is validated  
**Then** `ctx.identity.isServiceAccount()` MUST return `true`, `ctx.identity.getServiceAccount()` MUST expose the `service_account` claim (clientId, name, scopes, audiences), and `ctx.identity.isUser()` MUST return `false`.

#### Scenario: Handlers can branch on ctx.identity without reading raw claims
**Given** a route accesses `const identity = c.get('identity')`  
**When** it invokes `identity.isServiceAccount()` or `identity.isUser()`  
**Then** those helpers MUST reflect the token’s `token_use` / `token_type` / `service_account` markers so the handler can decide whether to allow automation logic or require a human session.

### Requirement: OIDC sessions support refresh flows for interactive users
The OIDC middleware MUST keep user sessions alive using refresh tokens the same way commercial IdPs expect.

#### Scenario: Refresh tokens renew sessions automatically
**Given** ApiPlugin configured the OIDC driver with `autoRefreshTokens: true`  
**And** a user completed the authorization-code flow and received refresh tokens  
**When** the access token expires while the refresh token is still valid  
**Then** the middleware MUST silently request a new access token, update the session cookie, and let the request continue without forcing the user to log in again.

#### Scenario: Expired or revoked refresh tokens trigger re-authentication
**Given** a refresh attempt fails because the token is expired or revoked  
**When** the OIDC driver processes the failure  
**Then** it MUST clear the session and initiate a fresh login so the client re-authenticates with the issuer.

