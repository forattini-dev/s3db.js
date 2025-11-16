# identity-platform Specification

## Purpose
TBD - created by archiving change update-identity-api-integration. Update Purpose after archive.
## Requirements
### Requirement: Canonical resources for users, tenants, and OAuth clients
The Identity plugin MUST own the canonical storage for people, tenants, and OAuth clients (service accounts) and expose those resource names to other components.

#### Scenario: Default install provisions canonical resources
**Given** IdentityPlugin starts without custom resource overrides  
**When** initialization completes  
**Then** the database MUST contain resources for users, tenants, and OAuth clients with the base schemas described in `BASE_*_ATTRIBUTES`  
**And** these resources MUST be referenced from `database.pluginRegistry.identity.resources` so other plugins can reuse them.

#### Scenario: Custom resource names remain discoverable
**Given** IdentityPlugin is configured with `resources.users.name = 'people'`  
**When** the plugin starts  
**Then** it MUST merge the base schema into `people` without losing required attributes  
**And** the integration metadata MUST expose that `people` is the canonical user resource name.

#### Scenario: External consumers read resource names
**Given** another plugin queries `db.pluginRegistry.identity.resources.users.name`  
**When** IdentityPlugin is running  
**Then** the call MUST return the resolved resource name regardless of whether it was auto-created or mapped to a pre-existing resource.

### Requirement: Service account lifecycle management
IdentityPlugin MUST offer first-class CRUD + rotation for service accounts (client credentials) stored in the OAuth clients resource, with secrets hashed or encrypted at rest.

#### Scenario: Creating a service account hashes the secret
**Given** an admin creates a new service account via UI or API  
**When** the plugin persists the record  
**Then** it MUST generate a unique `clientId`, hash/encrypt the `clientSecret`, and only return the raw secret once to the caller  
**And** the stored record MUST include allowed scopes/audiences and `active` status.

#### Scenario: Rotating secrets produces audit trail
**Given** an existing service account  
**When** the admin rotates its secret  
**Then** IdentityPlugin MUST issue a new secret, mark the previous secret as revoked, append an audit entry (who/when), and return the new secret only once.

#### Scenario: Disabled service accounts cannot obtain tokens
**Given** a service account is marked `active: false`
**When** it attempts the `client_credentials` grant
**Then** the token endpoint MUST respond with `invalid_client` and the attempt MUST be logged for auditing.

#### Scenario: Service account tokens include distinguishable claims
**Given** a service account obtains a token via `client_credentials`
**When** the token is introspected or validated
**Then** it MUST include a claim or metadata field that identifies it as a service-account token (e.g., `token_type: "service"` or `sub` format convention like `sa:clientId`)
**And** it MUST include the service account's `clientId`, `name`, `scopes`, and `audiences` in a stable structure (e.g., nested `service_account` claim)
**And** introspection responses MUST expose these fields so downstream consumers (like API plugin) can hydrate context without additional lookups.

#### Scenario: Authorization-code tokens expose user identity fields
**Given** a human user completes the authorization-code flow
**When** IdentityPlugin issues the access token (and introspection payload)
**Then** it MUST include `sub`, `email`, `tenantId` (when available), granted scopes, and a marker indicating it is a user token (e.g., `token_type: "user"`)
**And** the token MUST NOT include the service-account claim block to avoid accidentally treating people as service accounts downstream.

### Requirement: Publish identity integration metadata
IdentityPlugin MUST expose a machine-readable descriptor for downstream consumers that includes issuer URLs, endpoints, supported scopes, and resource names.

#### Scenario: Metadata API exposes issuer and JWKS
**Given** IdentityPlugin is running at `https://auth.example.com`
**When** code calls `identityPlugin.getIntegrationMetadata()`
**Then** it MUST receive an object containing:
- Authentication endpoints: `issuer`, `discoveryUrl`, `jwksUrl`, `tokenUrl`, `userinfoUrl`, `authorizationUrl`
- OAuth capabilities: `supportedScopes`, `supportedGrantTypes`, `supportedResponseTypes`
- Resource mappings: `usersResource`, `tenantsResource`, `clientsResource`
- Integration features: `clientRegistrationUrl` (for auto-provisioning), `introspectionUrl` (for token validation).

#### Scenario: Metadata surfaces confidential-client provisioning hints
**Given** ApiPlugin plans to delegate auth to Identity
**When** it requests metadata
**Then** the metadata MUST include either (a) a confidential client descriptor reserved for the API (clientId, redirectUris, scopes) or (b) instructions pointing to the documented client-registration endpoint/CLI so the API can self-register before enabling identity mode.

#### Scenario: Metadata responses are cache-friendly and versioned
**Given** a consumer fetches integration metadata
**When** IdentityPlugin responds
**Then** the payload MUST include `version`, `issuedAt`, and `cacheTtl` (or `expiresAt`) so clients know when to refresh
**And** the response MUST include an ETag/Last-Modified header (for HTTP) to enable conditional requests.

#### Scenario: Metadata updates when issuer changes
**Given** an operator changes `issuer` in the Identity config  
**When** the plugin reloads configuration  
**Then** subsequent metadata calls MUST return the new issuer and derived URLs, and downstream consumers MUST receive updated cache timestamps.

#### Scenario: Metadata is available through plugin registry
**Given** the database has IdentityPlugin installed  
**When** another plugin reads `db.pluginRegistry.identity.integration` (or equivalent documented accessor)  
**Then** it MUST obtain the same metadata object without having to import Identity internals.

### Requirement: Publish integration metadata over HTTPS for remote consumers
Identity deployments MUST expose the same integration metadata via HTTPS so services that do not share the same database instance can still integrate.

#### Scenario: `.well-known` endpoint returns metadata without authentication
**Given** IdentityPlugin is reachable at `https://auth.example.com`
**When** a GET request hits `https://auth.example.com/.well-known/s3db-identity.json`
**Then** the server MUST respond with the integration metadata JSON described above
**And** it MUST set appropriate cache headers matching `cacheTtl`
**And** the endpoint MUST NOT require authentication (read-only public metadata).

#### Scenario: Metadata endpoint mirrors plugin-registry data
**Given** metadata is retrieved via HTTPS
**When** the same deployment is queried via `db.pluginRegistry.identity.integration`
**Then** both responses MUST be identical (including version + issuedAt) so operators can trust either channel.

### Requirement: Admin experience matches enterprise IdPs
IdentityPlugin MUST provide an admin UI + API surface for managing users, tenants, sessions, and OAuth clients with white-label customization comparable to Keycloak/Azure AD, while remaining lightweight and self-hosted.

#### Scenario: Admin UI enforces RBAC and white-label branding
**Given** an operator logs into `/admin` with the `admin` role
**When** they view the dashboard
**Then** they MUST be able to CRUD users, service accounts, sessions, and tenants from a single UI
**And** the UI MUST honor branding options from `config.ui` (logo, colors, copy) similar to the customizations documented in `docs/plugins/identity/README.md`.

#### Scenario: Admin actions emit audit events
**Given** an admin creates or rotates a service account via UI/API
**When** the action completes
**Then** IdentityPlugin MUST record an audit log entry (who, what, when, before/after) so operators can trace changes comparable to enterprise IdPs.

