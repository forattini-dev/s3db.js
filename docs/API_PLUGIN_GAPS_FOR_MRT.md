# 🔍 API Plugin - Gap Analysis for MRT-Shortner Migration

**Date**: 2025-10-31
**s3db.js Version**: 13.6.1
**Analysis**: Pre-migration assessment of API Plugin readiness

---

## 📊 Executive Summary

**Overall Readiness**: 🟡 **85-90% Ready** (needs 3-4 small improvements)

### ✅ What's Already Perfect
- ✅ Enhanced Context API (just implemented!)
- ✅ OIDC authentication with auto-provisioning
- ✅ Guards for row-level security
- ✅ Event system for notifications
- ✅ Template rendering (EJS/Pug)
- ✅ Dual auth (OIDC + Basic)
- ✅ Session tracking
- ✅ Request ID tracking
- ✅ Health checks

### ⚠️ Gaps Identified (4 items)
1. **Guard Context Enhancement** - Guards need access to RouteContext
2. **People API Integration Pattern** - External API enrichment in OIDC flow
3. **Deterministic ID Generation** - Helper for click deduplication
4. **OpenGraph Helper** - Meta tag generation utility

---

## 🎯 Detailed Gap Analysis

### Gap 1: Guards Need Enhanced Context 🔴 **HIGH PRIORITY**

#### Current State
Guards receive basic `(user, context)` where context has `{ operation, resourceName, data }`.

```javascript
// Current guard signature
users.guard = {
  list: (user, context) => {
    // ❌ No access to RouteContext helpers!
    // ❌ Cannot use ctx.param(), ctx.resources, etc.

    if (user.scopes?.includes('preset:admin')) {
      return true;
    }

    // ❌ Cannot filter by partition easily
    // Need to return filter object somehow
  }
};
```

#### What MRT-Shortner Needs

```javascript
// ✅ Need access to full RouteContext
users.guard = {
  list: (ctx) => {
    const { user, resources, param, query } = ctx;

    // ✅ Admin sees everything
    if (user.scopes?.includes('preset:admin')) {
      return true;
    }

    // ✅ User sees only their URLs (O(1) via partition)
    ctx.setPartition('byUserId', { userId: user.id });
    return true;
  },

  create: (ctx) => {
    // ✅ Auto-inject userId and costCenterId
    ctx.body.userId = ctx.user.id;
    ctx.body.costCenterId = ctx.user.costCenterId;
    return true;
  },

  update: async (ctx, record) => {
    // ✅ Check ownership
    if (ctx.user.scopes?.includes('preset:admin')) {
      return true;
    }

    if (record.userId !== ctx.user.id) {
      throw new Error('Forbidden: You can only edit your own URLs');
    }

    return true;
  }
};
```

#### Proposed Solution

**1. Update guard signature to receive RouteContext**:

```javascript
// src/plugins/api/utils/guards.js

export function checkGuard(ctx, guard, record = null) {
  // Guard receives full RouteContext, not just user

  if (typeof guard === 'function') {
    try {
      // Pass ctx and optional record (for update/delete)
      return guard(ctx, record);
    } catch (err) {
      console.error('[Guards] Error executing guard function:', err);
      return false;
    }
  }

  // ... rest of guard logic
}
```

**2. Add partition helpers to RouteContext**:

```javascript
// src/plugins/api/concerns/route-context.js

export class RouteContext {
  // ... existing code

  /**
   * Set partition for current query (used by guards for tenant isolation)
   * @param {string} partitionName - Partition name (e.g., 'byUserId')
   * @param {Object} partitionFields - Partition field values
   */
  setPartition(partitionName, partitionFields) {
    if (!this._partitionFilters) {
      this._partitionFilters = [];
    }

    this._partitionFilters.push({ partitionName, partitionFields });
  }

  /**
   * Get partition filters set by guards
   * @returns {Array} Partition filters
   */
  getPartitionFilters() {
    return this._partitionFilters || [];
  }

  /**
   * Clear partition filters
   */
  clearPartitionFilters() {
    this._partitionFilters = [];
  }
}
```

**3. Apply partition filters in auto-generated CRUD routes**:

```javascript
// src/plugins/api/utils/resource-routes.js

// In list operation
'GET /v1/:resource': async (c, ctx) => {
  const { resources } = ctx;
  const resource = resources[resourceName];

  // Apply partition filters from guard
  const partitionFilters = ctx.getPartitionFilters();

  if (partitionFilters.length > 0) {
    // Use partition query for O(1) performance
    const { partitionName, partitionFields } = partitionFilters[0];
    const results = await resource.listPartition(partitionName, partitionFields, {
      limit: ctx.query('limit') || 100,
      cursor: ctx.query('cursor')
    });

    return ctx.success(results);
  }

  // Fallback to regular list
  const results = await resource.list({ limit: 100 });
  return ctx.success(results);
};
```

**Impact**: 🔴 **Critical** - Without this, row-level security (tenant isolation) won't work efficiently

**Effort**: 🟡 **Medium** (~150 LOC, 2-3 hours)

---

### Gap 2: People API Integration Pattern 🟡 **MEDIUM PRIORITY**

#### Current State
OIDC `onUserAuthenticated` hook exists, but MRT needs external API enrichment pattern.

#### What MRT-Shortner Needs

MRT fetches user data from Stone's People API during OIDC auto-provisioning:

```javascript
// Current Express implementation
async function createUserFromOidc(App, oidcUser) {
  // 1. Try to fetch from People API
  const employee = await getEmployeeComplete(oidcUser.email);

  if (employee) {
    const { costCenterId, costCenterName, name } = extractUserDataFromEmployee(employee);
    // Use enriched data
  }

  // 2. Fallback to OIDC claims
  const userData = {
    id: oidcUser.email,
    email: oidcUser.email,
    name: name || oidcUser.name,
    costCenterId: costCenterId || oidcUser.costCenter || null,
    // ...
  };

  return await users.insert(userData);
}
```

#### Proposed Solution

**Document the pattern in example**:

```javascript
// docs/examples/e89-oidc-external-api-enrichment.js

import { ApiPlugin } from 's3db.js';
import { fetchEmployeeData } from './integrations/people-api.js';

const apiPlugin = new ApiPlugin({
  auth: {
    drivers: [{
      driver: 'oidc',
      config: {
        // ... oidc config

        // ✅ Hook for external API enrichment
        onUserAuthenticated: async ({ user, created, claims }) => {
          if (!created) return; // Only enrich new users

          const db = c.get('database');
          const users = db.resources.users;

          try {
            // 1. Fetch from external API
            const employee = await fetchEmployeeData(user.email);

            if (employee) {
              // 2. Update user with enriched data
              await users.patch(user.id, {
                costCenterId: employee.costCenterId,
                costCenterName: employee.costCenterName,
                name: employee.name,
                'metadata.peopleData': employee.rawData
              });

              console.log('✅ User enriched from People API:', user.email);
            }
          } catch (error) {
            // 3. Log but don't fail (graceful degradation)
            console.warn('⚠️  Failed to enrich user from People API:', error.message);
          }
        }
      }
    }]
  }
});
```

**Impact**: 🟡 **Medium** - Pattern already works, just needs documentation

**Effort**: 🟢 **Low** (~1 example file, 1 hour)

---

### Gap 3: Deterministic ID Generation 🟢 **LOW PRIORITY**

#### Current State
API Plugin has `idGenerator()` from `src/concerns/id.js` (nanoid-based).

#### What MRT-Shortner Needs

Click deduplication uses deterministic IDs based on `sessionId + urlId + 5s window`:

```javascript
// Current Express implementation
function generateClickId(sessionId, urlId, timestamp) {
  const window5s = Math.floor(timestamp / 5000) * 5000;
  return `${sessionId}_${urlId}_${window5s}`;
}

// Usage in redirect route
const clickId = generateClickId(sessionId, url.id, Date.now());
const existing = await clicks.get(clickId).catch(() => null);

if (!existing) {
  await clicks.insert({ id: clickId, ... });
}
```

#### Proposed Solution

**Add helper to RouteContext**:

```javascript
// src/plugins/api/concerns/route-context.js

export class RouteContext {
  // ... existing code

  /**
   * Generate deterministic ID for deduplication
   * @param {Array<string>} parts - ID parts (e.g., sessionId, urlId)
   * @param {number} windowMs - Time window in milliseconds (e.g., 5000 for 5s)
   * @returns {string} Deterministic ID
   */
  deterministicId(parts, windowMs = 5000) {
    const timestamp = Date.now();
    const window = Math.floor(timestamp / windowMs) * windowMs;
    return [...parts, window].join('_');
  }
}
```

**Usage**:

```javascript
'GET /:id': async (c, ctx) => {
  const { resources, sessionId } = ctx;
  const id = ctx.param('id');

  // ✅ Generate deterministic click ID
  const clickId = ctx.deterministicId([sessionId, id], 5000);

  const existing = await resources.clicks.get(clickId).catch(() => null);

  if (!existing) {
    await resources.clicks.insert({ id: clickId, ... });
  }
};
```

**Impact**: 🟢 **Low** - Nice-to-have, can be implemented in custom routes

**Effort**: 🟢 **Very Low** (~20 LOC, 30 minutes)

---

### Gap 4: OpenGraph Helper 🟢 **LOW PRIORITY**

#### Current State
No built-in OpenGraph helper.

#### What MRT-Shortner Needs

```javascript
// Current Express implementation
function generateOpenGraphTags(url) {
  return `
    <meta property="og:title" content="${url.openGraph?.title || url.target}">
    <meta property="og:description" content="${url.openGraph?.description || ''}">
    <meta property="og:image" content="${url.openGraph?.image || ''}">
    <meta property="og:url" content="https://l.stne.io/${url.id}">
  `;
}
```

#### Proposed Solution

**Option 1: Add to RouteContext** (easiest):

```javascript
// src/plugins/api/concerns/route-context.js

export class RouteContext {
  // ... existing code

  /**
   * Generate OpenGraph meta tags
   * @param {Object} og - OpenGraph data { title, description, image, url }
   * @returns {string} HTML meta tags
   */
  openGraphTags(og = {}) {
    const tags = [];

    if (og.title) tags.push(`<meta property="og:title" content="${og.title}">`);
    if (og.description) tags.push(`<meta property="og:description" content="${og.description}">`);
    if (og.image) tags.push(`<meta property="og:image" content="${og.image}">`);
    if (og.url) tags.push(`<meta property="og:url" content="${og.url}">`);
    if (og.type) tags.push(`<meta property="og:type" content="${og.type}">`);
    if (og.siteName) tags.push(`<meta property="og:site_name" content="${og.siteName}">`);

    return tags.join('\n    ');
  }
}
```

**Option 2: Separate utility class** (more flexible):

```javascript
// src/plugins/api/concerns/opengraph.js

export class OpenGraphHelper {
  constructor(defaults = {}) {
    this.defaults = {
      siteName: defaults.siteName || '',
      locale: defaults.locale || 'en_US',
      type: defaults.type || 'website',
      defaultImage: defaults.defaultImage || ''
    };
  }

  generateTags(og = {}) {
    const merged = { ...this.defaults, ...og };
    const tags = [];

    if (merged.title) tags.push(`<meta property="og:title" content="${merged.title}">`);
    if (merged.description) tags.push(`<meta property="og:description" content="${merged.description}">`);
    if (merged.image) tags.push(`<meta property="og:image" content="${merged.image}">`);
    if (merged.url) tags.push(`<meta property="og:url" content="${merged.url}">`);
    if (merged.type) tags.push(`<meta property="og:type" content="${merged.type}">`);
    if (merged.siteName) tags.push(`<meta property="og:site_name" content="${merged.siteName}">`);
    if (merged.locale) tags.push(`<meta property="og:locale" content="${merged.locale}">`);

    return tags.join('\n    ');
  }
}
```

**Usage**:

```javascript
// In custom route
import { OpenGraphHelper } from 's3db.js';

const ogHelper = new OpenGraphHelper({
  siteName: 'Stone Links',
  locale: 'pt_BR',
  defaultImage: 'https://cdn.stone.co/default-og.png'
});

'GET /:id': async (c, ctx) => {
  const ogTags = ogHelper.generateTags({
    title: url.openGraph?.title || url.target,
    description: url.openGraph?.description,
    image: url.openGraph?.image || `/static/u/${url.id}/logo.png`,
    url: `https://l.stne.io/${url.id}`
  });

  return ctx.html(`
    <!DOCTYPE html>
    <html>
    <head>
      ${ogTags}
      <meta http-equiv="refresh" content="0;url=${url.target}">
    </head>
    </html>
  `);
};
```

**Impact**: 🟢 **Low** - Can be implemented as simple utility in mrt-shortner

**Effort**: 🟢 **Very Low** (~50 LOC, 1 hour)

---

## 📋 Prioritized Implementation Plan

### Phase 1: Critical (Before Migration) 🔴

**1. Gap 1: Guard Context Enhancement**
- **Why critical**: Row-level security (tenant isolation) depends on this
- **Deliverables**:
  - [ ] Update `checkGuard()` to receive RouteContext instead of just user
  - [ ] Add `setPartition()` / `getPartitionFilters()` to RouteContext
  - [ ] Update auto-generated CRUD routes to apply partition filters
  - [ ] Update guards documentation
  - [ ] Create example `e90-guards-with-partitions.js`
- **Effort**: ~150 LOC, 2-3 hours
- **Test with**: MRT's URLs filtered by userId

---

### Phase 2: Nice-to-Have (Can be done during migration) 🟡

**2. Gap 2: People API Integration Pattern**
- **Deliverables**:
  - [ ] Create example `e89-oidc-external-api-enrichment.js`
  - [ ] Document pattern in `docs/API_PLUGIN.md`
- **Effort**: ~1 example file, 1 hour

**3. Gap 3: Deterministic ID Helper**
- **Deliverables**:
  - [ ] Add `ctx.deterministicId()` to RouteContext
  - [ ] Add tests
- **Effort**: ~20 LOC, 30 minutes

**4. Gap 4: OpenGraph Helper**
- **Deliverables**:
  - [ ] Create `src/plugins/api/concerns/opengraph.js`
  - [ ] Export from API Plugin
  - [ ] Add example usage
- **Effort**: ~50 LOC, 1 hour

---

## 🎯 Go/No-Go Decision

### ✅ Ready to Start Migration After Phase 1?

**YES!** After implementing Gap 1 (Guard Context Enhancement):

| Feature | Status | Blocker? |
|---------|--------|----------|
| Enhanced Context API | ✅ Done | No |
| OIDC + Basic Auth | ✅ Done | No |
| Guards + Row-Level Security | 🟡 **Needs Phase 1** | **YES** |
| Event System | ✅ Done | No |
| Template Rendering | ✅ Done | No |
| Session Tracking | ✅ Done | No |
| People API Enrichment | 🟡 Pattern exists | No (can workaround) |
| Deterministic IDs | 🟡 Can implement in routes | No (can workaround) |
| OpenGraph | 🟡 Can implement in routes | No (can workaround) |

**Recommendation**:
1. **Implement Phase 1 (Guard Context)** - 2-3 hours
2. **Start migration with Sprint 0** (infra setup)
3. **Implement Phase 2 gaps during Sprint 1-2** (as needed)

---

## 📊 Effort Summary

| Phase | Items | Total Effort | Status |
|-------|-------|--------------|--------|
| **Phase 1 (Critical)** | 1 item | **2-3 hours** | 🔴 **Must do before migration** |
| **Phase 2 (Nice-to-have)** | 3 items | **2.5 hours** | 🟡 **Can do during migration** |
| **Total** | 4 items | **~5 hours** | 🟢 **Very manageable!** |

---

## 🚀 Next Steps

1. **[ ] Review this analysis with team** - Confirm priorities
2. **[ ] Implement Phase 1 (Guard Context)** - 2-3 hours
3. **[ ] Test guards with mrt-shortner use case** - Create POC
4. **[ ] Decide on Phase 2 items** - Can be done in parallel with Sprint 1
5. **[ ] Update MIGRATION_ROADMAP_V2.md** - Reflect new Enhanced Context syntax

---

## 💡 Conclusion

**API Plugin is 85-90% ready for mrt-shortner migration!**

**Critical blocker**: Only Guard Context Enhancement (Gap 1) is **must-have** before starting.

**Other gaps**: Can be implemented as simple utilities in mrt-shortner codebase during migration (Gaps 2-4).

**Total effort to be 100% ready**: ~5 hours (2-3 critical, 2-3 nice-to-have)

**Recommendation**: ✅ **Proceed with Phase 1, then start migration**
