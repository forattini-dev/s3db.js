# 📖 Resource Policies

> **What this guide covers:** How to model visibility, projections, and mutability directly in `resource.api`

**Audience:** Teams turning resources into the main API surface
**Time to read:** 12 min
**Difficulty:** Intermediate

---

## Why This Exists

When the API grows, the hardest part is not exposing CRUD. It is keeping policy close to the resource:

- Who can list it
- Who can read full detail
- Which fields are always hidden
- Which fields are visible only to some actors
- Which fields each actor can edit on `create`, `update`, and `patch`

`ApiPlugin` now lets you express that in `resource.api` instead of scattering logic across `admin.ts`, custom handlers, and ad hoc middleware.

If you want the exhaustive key-by-key contract for `resource.api`, including custom route definitions like `'GET /summary'`, use the **[Resource API Reference](/plugins/api/reference/resource-api.md)** alongside this guide.

---

## Mental Model

Think about resource policy in four layers:

1. `guard`
   Controls whether the operation is allowed at all.

2. `views`
   Shapes the response for a given audience.

3. `protected`
   Removes fields that must never leak for some audiences, even if a view selected them.

4. `write`
   Controls which fields are mutable for each operation and actor.

If you keep those four concerns separate, resource config stays understandable.

---

## Evaluation Order

### Read operations

For `GET /resource` and `GET /resource/:id`:

1. Guard is evaluated.
2. A view is selected:
   - explicit via `?view=name`, or
   - automatic via matching `auto: true` views
3. `fields` projection is applied.
4. `omit` removes fields.
5. Global `protected` and view-level `protected` run last.

Important: `protected` wins over `fields`. If a field is projected and protected, it is still removed.

### Write operations

For `POST`, `PUT`, and `PATCH`:

1. Guard is evaluated.
2. The plugin picks the matching write policy for that operation.
3. `readonly` and `deny` reject forbidden paths.
4. If `writable` is defined, everything outside it is rejected.
5. If any path is rejected, the route returns `400 FIELD_WRITE_NOT_ALLOWED`.

---

## Start Simple

Use this when you only need:

- a public shape
- an admin shape
- a basic write policy

```javascript
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|optional',
    name: 'string|required',
    email: 'string|required|email',
    role: 'string|optional',
    tokenHash: 'string|optional'
  },
  behavior: 'body-overflow',
  timestamps: true,
  api: {
    views: {
      public: {
        auto: true,
        priority: 1,
        fields: ['id', 'name']
      },
      admin: {
        auto: true,
        whenRole: ['admin'],
        priority: 100,
        fields: ['id', 'name', 'email', 'role', 'tokenHash']
      }
    },
    write: {
      patch: [
        {
          whenRole: ['admin'],
          priority: 100,
          writable: ['name', 'email', 'role']
        },
        {
          whenRole: ['user'],
          priority: 10,
          writable: ['name', 'email'],
          readonly: ['role']
        }
      ]
    }
  }
});
```

Behavior:

- regular users automatically get the `public` view
- admins automatically get the `admin` view
- users can patch `name` and `email`
- admins can also patch `role`

---

## Pattern 1: Public View + Internal View + Hard Secrets

Use `views` for audience-specific projections and `protected` for fields that should still be hidden from some audiences.

```javascript
api: {
  protected: [
    'internalNotes',
    { path: 'tokenHash', unlessRole: ['admin'] }
  ],
  views: {
    public: {
      auto: true,
      priority: 1,
      fields: ['id', 'name']
    },
    support: {
      auto: true,
      whenRole: ['support'],
      priority: 50,
      fields: ['id', 'name', 'email', 'status']
    },
    admin: {
      auto: true,
      whenRole: ['admin'],
      priority: 100,
      fields: ['id', 'name', 'email', 'status', 'tokenHash', 'internalNotes']
    }
  }
}
```

Recommendation:

- put stable audience shapes in `views`
- put true secrets in `protected`
- do not try to encode everything in `fields`

---

## Pattern 2: Owner Can Edit Profile, Admin Can Edit State

This is the common “owner edits profile fields, admin edits control fields” case from real apps.

```javascript
api: {
  write: {
    patch: [
      {
        whenRole: ['admin'],
        priority: 100,
        writable: ['phone', 'role', 'isActive', 'planId']
      },
      {
        whenRole: ['user'],
        priority: 10,
        writable: ['phone'],
        readonly: ['role', 'isActive', 'planId']
      }
    ]
  }
}
```

Use `patch` for partial user updates and keep `update` stricter if you support full replacement via `PUT`.

---

## Pattern 3: Explicit Admin View for Native CRUD

Sometimes the default automatic view is right for app traffic, but admin screens need to request more detail on demand.

```javascript
api: {
  views: {
    default: {
      auto: true,
      priority: 1,
      fields: ['id', 'name', 'email']
    },
    admin: {
      whenRole: ['admin'],
      fields: ['id', 'name', 'email', 'role', 'tokenHash', 'metadata']
    }
  }
}
```

Usage:

- normal call: `/users/user-1`
- explicit admin call: `/users/user-1?view=admin`

If the actor is not allowed to use that view, the route returns `403 VIEW_FORBIDDEN`.

---

## Pattern 4: Separate Listing Shape from Detail Shape

A common mistake is returning the same payload for list and detail.

If detail is significantly richer, prefer:

- compact default view for list traffic
- explicit detail view for screens that need more data
- custom route only when the response is a composed aggregate across resources

```javascript
api: {
  views: {
    summary: {
      auto: true,
      priority: 1,
      fields: ['id', 'name', 'status']
    },
    detail: {
      whenRole: ['admin', 'support'],
      fields: ['id', 'name', 'status', 'email', 'profile', 'settings']
    }
  }
}
```

If your admin detail endpoint stitches in multiple resources and external integrations, keep that as a custom route. Do not force every aggregate into native CRUD.

---

## Pattern 5: Combine Partitions with Response Policy

`guard` answers “which rows can you reach?”
`views` and `protected` answer “what shape do you get back?”

Those are different concerns and should usually stay separate.

```javascript
api: {
  guard: {
    list: (ctx) => {
      ctx.setPartition('byTenant', { tenantId: ctx.user.tenantId });
      return true;
    }
  },
  views: {
    tenant: {
      auto: true,
      priority: 1,
      fields: ['id', 'name', 'status', 'tenantId']
    },
    admin: {
      auto: true,
      whenRole: ['admin'],
      priority: 100,
      fields: ['id', 'name', 'status', 'tenantId', 'billing', 'flags']
    }
  }
}
```

The partition keeps the query efficient and scoped. The view keeps the payload right for the actor.

---

## Reference

## `api.protected`

Hide fields from responses after projection.

### Simple form

```javascript
protected: ['password', 'apiKey', 'metadata.internal']
```

### Conditional form

```javascript
protected: [
  'internalNotes',
  { path: 'tokenHash', unlessRole: ['admin'] },
  { path: 'ssoToken', unlessScope: ['tokens:read'] }
]
```

### Supported keys

| Key | Type | Meaning |
|-----|------|---------|
| `path` / `field` | string | Field path, supports dot notation |
| `whenRole` | string or string[] | Hide only for these roles |
| `unlessRole` | string or string[] | Hide for everyone except these roles |
| `whenScope` | string or string[] | Hide only for these scopes |
| `unlessScope` | string or string[] | Hide for everyone except these scopes |

---

## `api.views`

Define response projections by audience.

```javascript
views: {
  public: {
    auto: true,
    priority: 1,
    fields: ['id', 'name']
  },
  admin: {
    auto: true,
    whenRole: ['admin'],
    priority: 100,
    fields: ['id', 'name', 'email', 'role'],
    protected: [{ path: 'tokenHash', unlessRole: ['admin'] }]
  }
}
```

### Supported keys

| Key | Type | Meaning |
|-----|------|---------|
| `fields` | string[] | Inclusive projection |
| `omit` | string[] | Remove projected fields |
| `protected` | string[] or rule[] | Final field filtering for this view |
| `guard` | guard config | Extra authorization check |
| `whenRole` / `unlessRole` | string or string[] | Role matching |
| `whenScope` / `unlessScope` | string or string[] | Scope matching |
| `auto` | boolean | Allow automatic selection when no `?view=` is sent |
| `default` | boolean | Alias for auto/default fallback behavior |
| `priority` | number | Higher wins when multiple auto views match |

### Selection rules

1. If `?view=name` is present, that exact view is requested.
2. If not, the plugin looks for matching `auto: true` / `default: true` views.
3. The highest `priority` wins.
4. If nothing matches, no view is applied and the raw record continues to `protected`.

---

## `api.write`

Control mutable fields per operation.

### Static policy

```javascript
write: {
  patch: {
    readonly: ['role', 'apiKey']
  }
}
```

### Actor-aware policy

```javascript
write: {
  patch: [
    {
      whenRole: ['admin'],
      priority: 100,
      writable: ['phone', 'role', 'isActive']
    },
    {
      whenRole: ['user'],
      priority: 10,
      writable: ['phone'],
      readonly: ['role', 'isActive']
    }
  ]
}
```

### Supported operation keys

- `create`
- `update`
- `patch`

### Supported rule keys

| Key | Type | Meaning |
|-----|------|---------|
| `readonly` / `readOnly` | string[] | Reject writes to these paths |
| `deny` | string[] | Alias for readonly |
| `writable` / `allow` | string[] | Allow only these paths |
| `guard` | guard config | Extra actor check before rule matches |
| `whenRole` / `unlessRole` | string or string[] | Role matching |
| `whenScope` / `unlessScope` | string or string[] | Scope matching |
| `priority` | number | Higher wins when multiple rules match |

### Matching rules

1. The plugin looks only at the current operation.
2. If the operation has a single object, that object is used.
3. If the operation has an array of rules, the highest-priority matching rule wins.
4. If `writable` exists, fields outside it are rejected.
5. `readonly` and `deny` always reject matching fields.

---

## `api.bulk.create`

Use `api.bulk.create` when the endpoint is still about one resource, but the client needs to create many records in one request.

```javascript
api: {
  bulk: {
    create: {
      path: '/bulk',
      maxItems: 100,
      mode: 'partial'
    }
  },
  write: {
    create: {
      writable: ['email', 'name'],
      readonly: ['role']
    }
  }
}
```

This exposes `POST /users/bulk`.

Each item still goes through:

- `guard.create`
- `write.create`
- normal resource validation and persistence
- response shaping via `views` and `protected`

### Supported keys

| Key | Type | Meaning |
|-----|------|---------|
| `path` | string | Route path under the resource, default `/bulk` |
| `maxItems` | number | Maximum number of items accepted in one request, default `100` |
| `mode` | `'partial' \| 'all-or-nothing'` | Process every item or stop after the first failure |

### Request body

The route accepts either:

- a top-level JSON array
- an object with `items: []`

### Modes

- `partial`
  The plugin processes every item and returns created items plus indexed failures. Mixed outcomes return `207`.

- `all-or-nothing`
  The plugin stops after the first failure and returns what was created before the stop, plus the indexed error. This is fail-fast behavior, not rollback.

### Response shape

```json
{
  "success": true,
  "data": {
    "items": [{ "id": "user-1", "email": "a@example.com" }],
    "errors": [
      {
        "index": 1,
        "code": "FIELD_WRITE_NOT_ALLOWED",
        "message": "One or more fields are not writable for this operation",
        "status": 400
      }
    ],
    "summary": {
      "total": 2,
      "processed": 2,
      "created": 1,
      "failed": 1,
      "stopped": false,
      "mode": "partial"
    }
  }
}
```

Use native bulk create when the resource should still own the policy. If the route aggregates multiple resources or external systems, keep it as a custom route.

---

## Recommended Structure

When a resource gets complex, this shape stays maintainable:

```javascript
api: {
  guard: { ... },
  protected: [ ... ],
  views: { ... },
  write: { ... },
  bulk: { ... }
}
```

Recommendation:

- `guard` for row access
- `views` for audience payloads
- `protected` for secrets and invariants
- `write` for mutability
- `bulk` for resource-native batch operations
- resource-level custom routes for operations adjacent to CRUD but still owned by the resource

Avoid putting projection logic into guards or write logic into views.

---

## Error Reference

| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_VIEW` | 400 | Requested view name does not exist |
| `VIEW_FORBIDDEN` | 403 | Actor is not allowed to use that view |
| `FIELD_WRITE_NOT_ALLOWED` | 400 | Submitted payload contains forbidden paths |
| `INVALID_BULK_PAYLOAD` | 400 | The batch body is not a valid array or `{ items: [] }` payload |
| `BULK_LIMIT_EXCEEDED` | 400 | The batch exceeds the configured `maxItems` limit |

---

## Troubleshooting

### A field is in my view but not in the response

Check `protected`. It runs after projection and can remove the field.

### My auto view is not being selected

Check:

- `auto: true` or `default: true`
- actor match (`whenRole`, `whenScope`, `guard`)
- `priority` if multiple views match

### My user can still update a field I wanted to block

Check the operation key:

- `create`
- `update`
- `patch`

Also verify that the payload path matches the configured field path, including dot notation.

### I need a response composed from multiple resources

Use a custom route. `views` are for shaping a single resource payload, not for building orchestration endpoints.

---

## See Also

- [Guards](./guards.md)
- [Authentication](./authentication.md)
- [Configuration Reference](../reference/configuration.md)
- [Resource API Reference](../reference/resource-api.md)
- [FAQ](../faq.md)
