# openapi-custom-route-tags Specification

## Purpose
TBD - created by archiving change add-inferred-tags-custom-routes. Update Purpose after archive.
## Requirements
### Requirement: Infer tags from custom route paths

The OpenAPI generator MUST automatically infer tags for custom routes based on the URL path structure.

**Tag Inference Algorithm:**
1. Start with the full route path
2. Remove the `basePrefix` (if configured)
3. Remove the `versionPrefix` (if configured)
4. Extract the first remaining path segment
5. Use the segment as-is (lowercase, no formatting) as the tag
6. If no segment can be extracted, use `'Custom Routes'` as fallback

#### Scenario: Plugin-level custom route with analytics prefix

**Given** an API plugin configured with:
- `basePath`: `/api`
- `versionPrefix`: `v1`
- Custom route: `'GET /analytics/reports'`

**When** the OpenAPI specification is generated

**Then** the custom route operation MUST have tag `['analytics']`
**And** a tag object MUST exist in `spec.tags` with `name: 'analytics'`

#### Scenario: Resource-level custom route

**Given** a resource `users` with custom route `'GET /profile'`
**And** the resource is mounted at `/api/v1/users`

**When** the OpenAPI specification is generated

**Then** the custom route at `/api/v1/users/profile` MUST have tags `['users', 'profile']`
**And** the `'users'` tag is the resource tag
**And** the `'profile'` tag is inferred from the custom route path

#### Scenario: Multiple custom routes with same inferred tag

**Given** plugin-level custom routes:
- `'GET /analytics/reports'`
- `'POST /analytics/export'`
- `'GET /analytics/dashboard'`

**When** the OpenAPI specification is generated

**Then** all three routes MUST have tag `['analytics']`
**And** only one tag object with `name: 'analytics'` MUST exist in `spec.tags`

#### Scenario: Custom route with no extractable segment (fallback)

**Given** an API plugin configured with:
- `basePath`: `/api`
- `versionPrefix`: `v1`
- Custom route: `'GET /:id'`

**When** the OpenAPI specification is generated

**Then** the custom route operation MUST have tag `['Custom Routes']`
**And** the generic `'Custom Routes'` tag object MUST exist in `spec.tags`

#### Scenario: Custom route at root level (no prefixes)

**Given** an API plugin with:
- No `basePath` configured
- No `versionPrefix` configured
- Custom route: `'GET /health/status'`

**When** the OpenAPI specification is generated

**Then** the custom route operation MUST have tag `['health']`

#### Scenario: Custom route with multi-segment path

**Given** a custom route: `'GET /admin/reports/monthly'`
**And** `basePath`: `/api`, `versionPrefix`: `v1`

**When** the OpenAPI specification is generated

**Then** the custom route MUST have tag `['admin']` (only first segment)
**And** NOT `['admin', 'reports']` or `['admin/reports/monthly']`

### Requirement: Maintain backward compatibility with generic tag

The OpenAPI generator MUST use the generic `'Custom Routes'` tag when automatic tag inference is not possible.

#### Scenario: Empty path after prefix removal

**Given** a custom route where path equals `basePrefix + versionPrefix` exactly
**When** the OpenAPI specification is generated
**Then** the route MUST have tag `['Custom Routes']`

#### Scenario: Path contains only parameters

**Given** a custom route: `'GET /:userId/:itemId'`
**When** tag inference is attempted
**Then** the tag MUST fallback to `'Custom Routes'`

### Requirement: Add inferred tags to spec.tags array

The OpenAPI generator MUST ensure all inferred tags appear in the `spec.tags` array with appropriate descriptions.

#### Scenario: Inferred tag appears in spec.tags

**Given** a custom route with inferred tag `'analytics'`
**When** the OpenAPI specification is generated
**Then** `spec.tags` MUST contain an object with:
```json
{
  "name": "analytics",
  "description": "Custom routes for analytics"
}
```

#### Scenario: Duplicate tags not added

**Given** multiple custom routes with inferred tag `'admin'`
**When** the OpenAPI specification is generated
**Then** `spec.tags` MUST contain exactly ONE entry for `'admin'`

### Requirement: Preserve resource tags for resource-scoped custom routes

When custom routes are defined at the resource level, the OpenAPI generator MUST include both the resource tag and the inferred tag.

#### Scenario: Resource custom route with different inferred tag

**Given** a resource `orders` with custom route `'GET /reports'`
**And** the resource is mounted at `/api/v1/orders`

**When** the OpenAPI specification is generated

**Then** the route at `/api/v1/orders/reports` MUST have tags `['orders', 'reports']`
**And** the `'orders'` tag groups it with other order operations
**And** the `'reports'` tag groups it with other report operations

#### Scenario: Resource custom route where inferred tag equals resource name

**Given** a resource `users` with custom route `'GET /list'`
**And** the inferred tag would be `'users'` (same as resource name)

**When** the OpenAPI specification is generated

**Then** the route MUST have tag `['users']` (no duplicate)
**And** NOT `['users', 'users']`

