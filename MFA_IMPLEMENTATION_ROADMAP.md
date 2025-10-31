# 🔐 MFA/TOTP Implementation Roadmap

## ✅ What Has Been Implemented

### **1. MFA Manager (Core Logic)** ✅
**File:** `src/plugins/identity/concerns/mfa-manager.js`

**Features:**
- ✅ TOTP generation (RFC 6238 compliant)
- ✅ TOTP verification with time window
- ✅ Backup codes generation
- ✅ Backup codes hashing (SHA-256)
- ✅ QR code generation for enrollment
- ✅ Compatible with: Google Authenticator, Authy, Microsoft Authenticator, 1Password

**API:**
```javascript
const mfaManager = new MFAManager({
  issuer: 'MyApp',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  window: 1
});

await mfaManager.initialize();

// Enrollment
const enrollment = mfaManager.generateEnrollment('user@example.com');
// {
//   secret: 'JBSWY3DPEHPK3PXP',
//   qrCodeUrl: 'otpauth://totp/MyApp:user@example.com?secret=...',
//   backupCodes: ['A1B2C3D4', ...]
// }

// Verification
const isValid = mfaManager.verifyTOTP(secret, '123456');

// Backup codes
const codes = mfaManager.generateBackupCodes(10);
const hashedCodes = await mfaManager.hashBackupCodes(codes);
const matchIndex = await mfaManager.verifyBackupCode('A1B2C3D4', hashedCodes);
```

### **2. MFA Configuration** ✅
**File:** `src/plugins/identity/index.js`

**Configuration Options:**
```javascript
const identityPlugin = new IdentityPlugin({
  mfa: {
    enabled: true,                  // Enable MFA
    required: false,                // Make MFA mandatory for all users
    issuer: 'MyApp',                // TOTP issuer name
    algorithm: 'SHA1',              // SHA1, SHA256, SHA512
    digits: 6,                      // 6 or 8 digits
    period: 30,                     // Time step (seconds)
    window: 1,                      // Allow ±1 time step
    backupCodesCount: 10,           // Number of backup codes
    backupCodeLength: 8             // Backup code length
  }
});
```

### **3. Audit Events** ✅
**File:** `src/plugins/identity/index.js`

**New Audit Events:**
- `mfa_enrolled` - User enrolled in MFA
- `mfa_disabled` - User disabled MFA
- `mfa_verified` - MFA token verified successfully
- `mfa_failed` - MFA verification failed

---

## 🚧 What Still Needs Implementation

### **Step 1: MFA Devices Resource** (2 hours)

**Create Resource:**
```javascript
// In _createOAuth2Resources()
this.mfaDevicesResource = await this.database.createResource({
  name: 'plg_mfa_devices',
  attributes: {
    userId: 'string|required',
    type: 'string|required',           // 'totp', 'sms', 'email'
    secret: 'secret|required',         // TOTP secret (encrypted by S3DB)
    verified: 'boolean|default:false',
    backupCodes: 'array|items:string', // Hashed backup codes
    enrolledAt: 'string',
    lastUsedAt: 'string|optional',
    metadata: {
      deviceName: 'string|optional',
      userAgent: 'string|optional'
    }
  },
  behavior: 'body-overflow',
  timestamps: true,
  partitions: {
    byUser: {
      fields: { userId: 'string' }
    }
  }
});
```

### **Step 2: MFA Enrollment Flow** (1 day)

**Endpoints to Add:**
1. `GET /profile/mfa/enroll` - Show enrollment page with QR code
2. `POST /profile/mfa/enroll` - Verify token and complete enrollment
3. `POST /profile/mfa/disable` - Disable MFA (requires password)
4. `GET /profile/mfa/backup-codes` - Regenerate backup codes

**UI Flow:**
```
User → Profile → Enable MFA
  ↓
Display QR Code + Manual Entry Key
  ↓
User scans with authenticator app
  ↓
Enter 6-digit token to verify
  ↓
Show 10 backup codes (download/print)
  ↓
MFA Enabled ✅
```

**Code Snippet:**
```javascript
// In routes.js
app.get('/profile/mfa/enroll', sessionAuth(sessionManager), async (c) => {
  const user = c.get('user');

  // Check if already enrolled
  const devices = await plugin.mfaDevicesResource.query({
    userId: user.id,
    verified: true
  });

  if (devices.length > 0) {
    return c.redirect('/profile?error=MFA already enabled');
  }

  // Generate enrollment
  const enrollment = plugin.mfaManager.generateEnrollment(user.email);
  const qrCodeDataUrl = await plugin.mfaManager.generateQRCodeDataURL(enrollment.qrCodeUrl);

  // Store pending enrollment in session
  c.set('mfaEnrollment', enrollment);

  // Render enrollment page
  return c.html(MFAEnrollmentPage({
    qrCodeDataUrl,
    secret: enrollment.secret,
    backupCodes: enrollment.backupCodes
  }));
});

app.post('/profile/mfa/enroll', sessionAuth(sessionManager), async (c) => {
  const user = c.get('user');
  const { token } = await c.req.parseBody();
  const enrollment = c.get('mfaEnrollment');

  // Verify token
  const isValid = plugin.mfaManager.verifyTOTP(enrollment.secret, token);

  if (!isValid) {
    return c.redirect('/profile/mfa/enroll?error=Invalid token');
  }

  // Hash backup codes
  const hashedCodes = await plugin.mfaManager.hashBackupCodes(enrollment.backupCodes);

  // Save MFA device
  await plugin.mfaDevicesResource.insert({
    userId: user.id,
    type: 'totp',
    secret: enrollment.secret,
    verified: true,
    backupCodes: hashedCodes,
    enrolledAt: new Date().toISOString()
  });

  // Audit log
  await logAudit('mfa_enrolled', { userId: user.id, type: 'totp' });

  return c.redirect('/profile?success=MFA enabled successfully');
});
```

### **Step 3: MFA Verification in Login** (4 hours)

**Modify Login Flow:**
```javascript
// In POST /login (after password verification)
if (config.mfa.enabled) {
  // Check if user has MFA enabled
  const mfaDevices = await plugin.mfaDevicesResource.query({
    userId: user.id,
    verified: true
  });

  if (mfaDevices.length > 0 || config.mfa.required) {
    // Require MFA token
    const { mfa_token, backup_code } = body;

    if (!mfa_token && !backup_code) {
      // Redirect to MFA verification page
      return c.redirect(`/login/mfa?email=${email}&session_token=${tempSessionToken}`);
    }

    let verified = false;

    if (mfa_token) {
      // Verify TOTP token
      verified = plugin.mfaManager.verifyTOTP(mfaDevices[0].secret, mfa_token);

      if (verified) {
        await plugin.mfaDevicesResource.update(mfaDevices[0].id, {
          lastUsedAt: new Date().toISOString()
        });
        await logAudit('mfa_verified', { userId: user.id, method: 'totp' });
      }
    } else if (backup_code) {
      // Verify backup code
      const matchIndex = await plugin.mfaManager.verifyBackupCode(
        backup_code,
        mfaDevices[0].backupCodes
      );

      if (matchIndex !== null) {
        // Remove used backup code
        const updatedCodes = [...mfaDevices[0].backupCodes];
        updatedCodes.splice(matchIndex, 1);

        await plugin.mfaDevicesResource.update(mfaDevices[0].id, {
          backupCodes: updatedCodes,
          lastUsedAt: new Date().toISOString()
        });

        verified = true;
        await logAudit('mfa_verified', { userId: user.id, method: 'backup_code' });
      }
    }

    if (!verified) {
      await logAudit('mfa_failed', { userId: user.id });
      return c.redirect('/login/mfa?error=Invalid MFA token');
    }
  }
}

// Continue with session creation...
```

### **Step 4: Admin UI for MFA Management** (4 hours)

**Add to Admin Users Page:**
```javascript
// Show MFA status badge
if (current.hasMFA) {
  actions.push(html`
    <span class="rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-200">
      🔐 MFA Enabled
    </span>
  `);
}

// Admin can disable MFA for user
actions.push(html`
  <form method="POST" action="/admin/users/${current.id}/disable-mfa"
        onsubmit="return confirm('Disable MFA for ${current.email}?')">
    <button type="submit" class="${dangerButtonClass}">
      Disable MFA
    </button>
  </form>
`);
```

**Endpoint:**
```javascript
app.post('/admin/users/:id/disable-mfa', adminOnly(sessionManager), async (c) => {
  const userId = c.req.param('id');

  // Delete all MFA devices for user
  const devices = await plugin.mfaDevicesResource.query({ userId });

  for (const device of devices) {
    await plugin.mfaDevicesResource.remove(device.id);
  }

  await logAudit('mfa_disabled', { userId, by: 'admin' });

  return c.redirect('/admin/users?success=MFA disabled');
});
```

### **Step 5: Recovery Flow with Backup Codes** (2 hours)

**Add UI:**
```html
<!-- In /login/mfa page -->
<p>Lost your authenticator device?</p>
<a href="#" onclick="showBackupCodeInput()">Use backup code</a>

<div id="backup-code-input" style="display:none">
  <input name="backup_code" placeholder="Enter 8-character backup code">
  <button>Verify</button>
</div>
```

---

## 📊 Implementation Estimate

| Task | Time | Priority |
|------|------|----------|
| MFA Devices Resource | 2 hours | 🔴 Critical |
| Enrollment Flow | 1 day | 🔴 Critical |
| Login Verification | 4 hours | 🔴 Critical |
| Admin UI | 4 hours | 🟡 Important |
| Recovery Flow | 2 hours | 🟡 Important |
| Tests | 1 day | 🟢 Nice-to-have |
| Documentation | 4 hours | 🟢 Nice-to-have |

**Total:** 3-4 days for complete MFA implementation

---

## 🎯 Testing Checklist

- [ ] Enroll user with Google Authenticator
- [ ] Login with TOTP token
- [ ] Login with backup code
- [ ] Regenerate backup codes
- [ ] Disable MFA
- [ ] Admin force-disable MFA
- [ ] Required MFA for all users
- [ ] Audit logs for all MFA events
- [ ] QR code displays correctly
- [ ] Backup codes downloadable

---

## 📚 Dependencies Required

```json
{
  "dependencies": {
    "otpauth": "^9.3.4",  // TOTP generation/verification
    "qrcode": "^1.5.4"    // QR code generation (optional)
  }
}
```

Install:
```bash
pnpm add otpauth qrcode
```

---

## ✅ Current Status

**Implemented:**
- ✅ MFA Manager core logic
- ✅ Configuration options
- ✅ Audit events

**Remaining:**
- ⏳ MFA Devices Resource (2 hours)
- ⏳ Enrollment Flow UI (1 day)
- ⏳ Login Verification (4 hours)
- ⏳ Admin UI (4 hours)
- ⏳ Recovery Flow (2 hours)

**Total Remaining:** ~3 days of work for production-ready MFA

---

## 🚀 Next Steps

1. Install dependencies: `pnpm add otpauth qrcode`
2. Create MFA Devices Resource
3. Implement enrollment flow
4. Update login flow with MFA check
5. Add admin UI
6. Write tests
7. Update documentation

---

**The foundation is ready! MFA can be fully implemented in 3-4 days of focused work.**
