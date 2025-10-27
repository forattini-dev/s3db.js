# Identity Plugin - Admin Panel

Complete guide to the administrative interface for managing users and OAuth2 clients.

## Table of Contents

- [Overview](#overview)
- [Accessing Admin Panel](#accessing-admin-panel)
- [User Management](#user-management)
- [OAuth2 Client Management](#oauth2-client-management)
- [Dashboard](#dashboard)

## Overview

The Identity Plugin includes a comprehensive admin panel for:

- User management (CRUD operations)
- OAuth2 client management
- Session monitoring
- System statistics

**Access:** `http://localhost:4000/admin`

## Accessing Admin Panel

### Prerequisites

User must have admin role. Two ways to set this:

**Option 1: `role` field**
```javascript
{ role: 'admin' }
```

**Option 2: `isAdmin` field**
```javascript
{ isAdmin: true }
```

### Creating First Admin User

```javascript
import bcrypt from 'bcrypt';

const usersResource = db.resources.users;

// Hash password
const passwordHash = await bcrypt.hash('SecurePass123!', 10);

// Create admin user
await usersResource.insert({
  email: 'admin@example.com',
  name: 'Admin User',
  passwordHash: passwordHash,
  status: 'active',
  emailVerified: true,
  role: 'admin'  // or isAdmin: true
});
```

### Login as Admin

1. Navigate to `http://localhost:4000/login`
2. Enter admin credentials
3. After login, "Admin" link appears in header
4. Click "Admin" or go to `/admin`

## User Management

**URL:** `http://localhost:4000/admin/users`

### List Users

View all users with:
- Email, name, status
- Email verification status
- Admin role indicator
- Creation date
- Quick actions (edit, delete)

**Features:**
- Search by email or name
- Filter by status (active, suspended, pending_verification)
- Pagination (25 users per page)
- Sort by creation date

### Create User

**URL:** `http://localhost:4000/admin/users/create`

**Form Fields:**
- Email (required, unique)
- Name (required)
- Password (required, follows password policy)
- Status (active, suspended, pending_verification)
- Email Verified (checkbox)
- Admin Role (checkbox)

**Programmatic Creation:**

```javascript
const usersResource = db.resources.users;

await usersResource.insert({
  email: 'user@company.com',
  name: 'New User',
  passwordHash: await bcrypt.hash('TempPass123!', 10),
  status: 'active',
  emailVerified: true,
  role: 'user'  // or 'admin'
});
```

### Edit User

**URL:** `http://localhost:4000/admin/users/{userId}/edit`

**Editable Fields:**
- Name
- Email
- Status
- Email verified flag
- Admin role

**Cannot Edit:**
- User ID
- Password (use "Send Password Reset" instead)
- Creation date

### User Actions

#### Send Password Reset

Sends password reset email to user:

```javascript
// Automatically creates reset token and sends email
// User receives link: http://localhost:4000/reset-password?token=...
```

#### Suspend User

Changes user status to `suspended`:
- User cannot login
- Active sessions remain valid until expiry
- Can be unsuspended later

#### Delete User

Permanently removes user:
- Deletes user record
- Does NOT delete sessions (will be cleaned up later)
- Does NOT delete OAuth2 tokens (consider revocation first)

**Warning:** This action is irreversible.

## OAuth2 Client Management

**URL:** `http://localhost:4000/admin/clients`

### List Clients

View all OAuth2 clients with:
- Client ID
- Client name
- Status (active/inactive)
- Creation date
- Quick actions (edit, delete)

### Create Client

**URL:** `http://localhost:4000/admin/clients/create`

**Form Fields:**
- Client Name (required)
- Client Description
- Redirect URIs (one per line)
- Allowed Scopes (checkboxes)
- Grant Types (checkboxes)

**Auto-Generated:**
- Client ID (random, unique)
- Client Secret (random, hashed)

**Programmatic Creation:**

```javascript
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const clientsResource = db.resources.plg_oauth_clients;

const clientId = crypto.randomBytes(16).toString('hex');
const clientSecret = crypto.randomBytes(32).toString('hex');
const clientSecretHash = await bcrypt.hash(clientSecret, 10);

await clientsResource.insert({
  clientId: clientId,
  clientSecret: clientSecretHash,
  name: 'My Application',
  description: 'Production OAuth2 client',
  redirectUris: ['https://app.company.com/callback'],
  allowedScopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token'],
  status: 'active'
});

console.log('Client ID:', clientId);
console.log('Client Secret:', clientSecret);  // Save this! Cannot retrieve later
```

**Important:** Save the client secret immediately. It's hashed and cannot be retrieved later.

### Edit Client

**URL:** `http://localhost:4000/admin/clients/{clientId}/edit`

**Editable Fields:**
- Client name
- Description
- Redirect URIs
- Allowed scopes
- Grant types
- Status (active/inactive)

**Cannot Edit:**
- Client ID
- Client Secret (use "Rotate Secret" instead)

### Rotate Client Secret

Generate new client secret:

```javascript
// Old secret becomes invalid immediately
// New secret is generated and displayed once
// Update your application with new secret
```

**Important:** Rotating secret invalidates the old one. Update your application before rotating.

### Delete Client

Permanently removes OAuth2 client:
- Deletes client record
- Does NOT revoke existing tokens (they remain valid until expiry)
- Does NOT delete authorization codes

**Warning:** This action is irreversible.

## Dashboard

**URL:** `http://localhost:4000/admin`

### Statistics

Overview cards showing:

**Users:**
- Total users count
- Active users count
- Pending verification count
- Suspended users count

**OAuth2:**
- Total clients count
- Active clients count

**Sessions:**
- Total active sessions
- Sessions in last 24h

### Quick Actions

Buttons for common tasks:
- Create New User
- Create OAuth2 Client
- View All Users
- View All Clients

### Recent Activity

Tables showing:
- Recently created users (last 10)
- Recently created clients (last 5)
- Active sessions (last 10)

## Security Considerations

### Admin Access Control

**Who should be admin:**
- System administrators
- IT staff
- Application owners

**Who should NOT be admin:**
- Regular users
- OAuth2 service accounts
- Temporary/test accounts

### Audit Logging

Consider implementing audit trail for admin actions:

```javascript
// Log admin actions to separate resource
const auditResource = db.resources.audit_log;

await auditResource.insert({
  adminUserId: session.userId,
  action: 'USER_DELETED',
  targetUserId: deletedUserId,
  ipAddress: request.ip,
  timestamp: new Date().toISOString()
});
```

### Rate Limiting

Implement rate limiting for admin endpoints at reverse proxy level:

```nginx
location /admin {
  limit_req zone=admin burst=10;
}
```

### Two-Factor Authentication

For enhanced security, consider adding 2FA for admin users (future feature).

## Troubleshooting

### "Admin" Link Not Appearing

**Cause:** User doesn't have admin role

**Solution:**
```javascript
await usersResource.update(userId, { role: 'admin' });
// or
await usersResource.update(userId, { isAdmin: true });
```

### Cannot Access `/admin`

**Cause:** Not logged in or insufficient permissions

**Solution:**
1. Login first at `/login`
2. Ensure user has admin role
3. Check session is valid

### User Creation Fails

**Cause:** Password doesn't meet policy

**Solution:** Check password policy and ensure password meets requirements:

```javascript
passwordPolicy: {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: false
}
```

## See Also

- [Configuration](./configuration.md) - Admin panel configuration
- [Security](./security.md) - Security best practices
- [Main Documentation](../identity-plugin.md) - Overview and quick start
