/**
 * Identity Provider UI Routes
 * Handles login, registration, logout, and other UI endpoints
 */

import { LoginPage } from './pages/login.js';
import { RegisterPage } from './pages/register.js';
import { ForgotPasswordPage } from './pages/forgot-password.js';
import { ResetPasswordPage } from './pages/reset-password.js';
import { ProfilePage } from './pages/profile.js';
import { AdminDashboardPage } from './pages/admin/dashboard.js';
import { AdminClientsPage } from './pages/admin/clients.js';
import { AdminClientFormPage } from './pages/admin/client-form.js';
import { AdminUsersPage } from './pages/admin/users.js';
import { AdminUserFormPage } from './pages/admin/user-form.js';
import { ConsentPage } from './pages/consent.js';
import { VerifyEmailPage } from './pages/verify-email.js';
import { MFAVerificationPage } from './pages/mfa-verification.js';
import { MFAEnrollmentPage } from './pages/mfa-enrollment.js';
import { MFABackupCodesPage } from './pages/mfa-backup-codes.js';
import { OAuthErrorPage } from './pages/oauth-error.js';
import { verifyPassword, validatePassword } from '../concerns/password.js';
import { generatePasswordResetToken, calculateExpiration, isExpired } from '../concerns/token-generator.js';
import { generateAuthCode } from '../oidc-discovery.js';
import { tryFn } from '../../../concerns/try-fn.js';
import { sessionAuth, adminOnly } from './middleware.js';
import { idGenerator } from '../../../concerns/id.js';

/**
 * Get page component (custom or default)
 * @param {Object} customPages - Custom page overrides
 * @param {string} pageName - Page name (login, register, etc.)
 * @param {Function} defaultPage - Default page component
 * @returns {Function} Page component to use
 */
function getPageComponent(customPages, pageName, defaultPage) {
  return customPages[pageName] || defaultPage;
}

/**
 * Register all UI routes
 * @param {Object} app - Hono app instance
 * @param {Object} plugin - IdentityPlugin instance
 */
export function registerUIRoutes(app, plugin) {
  const { sessionManager, usersResource, config, failbanManager } = plugin;
  const customPages = config.ui.customPages || {};
  const failbanConfig = config.failban || {};
  const accountLockoutConfig = config.accountLockout || {};
  const userAttributes = plugin.config?.resources?.users?.mergedConfig?.attributes || {};
  const supportsStatusField = Object.prototype.hasOwnProperty.call(userAttributes, 'status');
  const keyManager = plugin.oauth2Server?.keyManager || null;

  const createMfaChallengeToken = (user, rememberFlag) => {
    if (!keyManager) {
      return null;
    }

    return keyManager.createToken({
      type: 'mfa_challenge',
      userId: user.id,
      email: user.email,
      remember: rememberFlag === '1'
    }, '5m');
  };

  const verifyMfaChallengeToken = async (token) => {
    if (!keyManager || !token) {
      return null;
    }

    try {
      const verified = await keyManager.verifyToken(token);
      if (!verified || verified.payload?.type !== 'mfa_challenge') {
        return null;
      }
      return verified.payload;
    } catch {
      return null;
    }
  };

  // Create UI config object with registration settings
  const uiConfig = {
    ...config.ui,
    registrationEnabled: config.registration.enabled
  };

  // Helper function to log audit events
  const logAudit = async (event, data) => {
    if (plugin._logAuditEvent) {
      await plugin._logAuditEvent(event, data);
    }
  };

  // ============================================================================
  // GET / - Root route - Redirect to /login or /profile based on session
  // ============================================================================
  app.get('/', async (c) => {
    const sessionId = sessionManager.getSessionIdFromRequest(c.req);
    if (sessionId) {
      const { valid } = await sessionManager.validateSession(sessionId);
      if (valid) {
        return c.redirect('/profile');
      }
    }
    return c.redirect('/login');
  });

  // ============================================================================
  // GET /login - Show login form
  // ============================================================================
  app.get('/login', async (c) => {
    // If already logged in, redirect to profile
    const sessionId = sessionManager.getSessionIdFromRequest(c.req);
    if (sessionId) {
      const { valid } = await sessionManager.validateSession(sessionId);
      if (valid) {
        return c.redirect('/profile');
      }
    }

    const error = c.req.query('error');
    const success = c.req.query('success');
    const email = c.req.query('email') || '';

    const PageComponent = getPageComponent(customPages, 'login', LoginPage);
    return c.html(PageComponent({
      error: error ? decodeURIComponent(error) : null,
      success: success ? decodeURIComponent(success) : null,
      email,
      config: uiConfig
    }));
  });

  // ============================================================================
  // POST /login - Handle login form submission
  // ============================================================================
  app.post('/login', async (c) => {
    try {
      const body = await c.req.parseBody();
      const {
        email,
        password,
        remember,
        mfa_token,
        backup_code,
        mfa_challenge
      } = body;

      const clientIp = c.get('clientIp') ||
                       c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
                       c.req.header('x-real-ip') ||
                       'unknown';
      const userAgent = c.req.header('user-agent') || 'unknown';

      const usingChallenge = Boolean(mfa_challenge);
      let normalizedEmail = email ? email.toLowerCase().trim() : '';
      let rememberChoice = remember === '1' ? '1' : '0';
      let challengePayload = null;

      if (usingChallenge) {
        challengePayload = await verifyMfaChallengeToken(mfa_challenge);
        if (!challengePayload) {
          return c.redirect(`/login?error=${encodeURIComponent('Your login session expired. Please sign in again.')}`);
        }
        normalizedEmail = (challengePayload.email || '').toLowerCase();
        rememberChoice = challengePayload.remember ? '1' : '0';
      }

      if (!normalizedEmail) {
        if (failbanManager && failbanConfig.endpoints.login) {
          await failbanManager.recordViolation(clientIp, 'invalid_login_request', {
            path: '/login',
            userAgent
          });
        }
        return c.redirect(`/login?error=${encodeURIComponent('Email and password are required')}`);
      }

      let user = null;

      if (usingChallenge) {
        const [okUser, errUser, challengeUser] = await tryFn(() =>
          usersResource.get(challengePayload.userId)
        );

        if (!okUser || !challengeUser || challengeUser.email.toLowerCase() !== normalizedEmail) {
          if (config.verbose) {
            console.error('[Identity Plugin] MFA challenge verification failed:', errUser?.message || 'challenge mismatch');
          }
          return c.redirect(`/login?error=${encodeURIComponent('Your login session expired. Please sign in again.')}`);
        }

        user = challengeUser;
      } else {
        const [okQuery, errQuery, users] = await tryFn(() =>
          usersResource.query({ email: normalizedEmail })
        );

        if (!okQuery || users.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));

          if (failbanManager && failbanConfig.endpoints.login) {
            await failbanManager.recordViolation(clientIp, 'failed_login', {
              path: '/login',
              userAgent,
              email
            });
          }

          await logAudit('login_failed', {
            email,
            reason: 'user_not_found',
            ipAddress: clientIp,
            userAgent
          });

          return c.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}&email=${encodeURIComponent(email || '')}`);
        }

        user = users[0];
      }

      // 🔒 ACCOUNT LOCKOUT CHECK
      if (accountLockoutConfig.enabled && user.lockedUntil) {
        const now = Date.now();
        const lockedUntilTime = new Date(user.lockedUntil).getTime();

        if (lockedUntilTime > now) {
          const remainingMinutes = Math.ceil((lockedUntilTime - now) / 60000);
          const message = `Your account has been locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} or contact support.`;
          return c.redirect(`/login?error=${encodeURIComponent(message)}&email=${encodeURIComponent(normalizedEmail)}`);
        }

        // Auto-unlock expired locks
        await usersResource.update(user.id, {
          lockedUntil: null,
          failedLoginAttempts: 0,
          lastFailedLogin: null
        });
      }

      // Verify password (initial step only)
      if (!usingChallenge) {
        if (!password) {
          if (failbanManager && failbanConfig.endpoints.login) {
            await failbanManager.recordViolation(clientIp, 'invalid_login_request', {
              path: '/login',
              userAgent,
              email
            });
          }
          return c.redirect(`/login?error=${encodeURIComponent('Email and password are required')}&email=${encodeURIComponent(email || '')}`);
        }

        const [okVerify, errVerify, isValid] = await tryFn(() =>
          verifyPassword(password, user.password)
        );

        if (!okVerify) {
          if (config.verbose) {
            console.error('[Identity Plugin] Password verification error:', errVerify?.message);
          }
        }

        if (!okVerify || !isValid) {
          if (accountLockoutConfig.enabled) {
            const failedAttempts = (user.failedLoginAttempts || 0) + 1;
            const nowIso = new Date().toISOString();

            if (failedAttempts >= accountLockoutConfig.maxAttempts) {
              const lockoutUntil = new Date(Date.now() + accountLockoutConfig.lockoutDuration).toISOString();

              await usersResource.update(user.id, {
                failedLoginAttempts: failedAttempts,
                lockedUntil: lockoutUntil,
                lastFailedLogin: nowIso
              });

              const lockoutMinutes = Math.ceil(accountLockoutConfig.lockoutDuration / 60000);
              const message = `Too many failed login attempts. Your account has been locked for ${lockoutMinutes} minutes. Please contact support if you need assistance.`;
              return c.redirect(`/login?error=${encodeURIComponent(message)}&email=${encodeURIComponent(normalizedEmail)}`);
            }

            await usersResource.update(user.id, {
              failedLoginAttempts: failedAttempts,
              lastFailedLogin: nowIso
            });
          }

          if (failbanManager && failbanConfig.endpoints.login) {
            await failbanManager.recordViolation(clientIp, 'failed_login', {
              path: '/login',
              userAgent,
              email: normalizedEmail,
              userId: user.id
            });
          }

          return c.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}&email=${encodeURIComponent(normalizedEmail)}`);
        }

        if (accountLockoutConfig.enabled && accountLockoutConfig.resetOnSuccess) {
          if (user.failedLoginAttempts > 0 || user.lockedUntil) {
            await usersResource.update(user.id, {
              failedLoginAttempts: 0,
              lockedUntil: null,
              lastFailedLogin: null
            });
          }
        }
      }

      // Account active status
      if (supportsStatusField && user.status && user.status !== 'active') {
        const message = user.status === 'suspended'
          ? 'Your account has been suspended. Please contact support.'
          : 'Your account is inactive. Please contact support.';
        return c.redirect(`/login?error=${encodeURIComponent(message)}&email=${encodeURIComponent(normalizedEmail)}`);
      }

      if (!supportsStatusField && user.active === false) {
        return c.redirect(`/login?error=${encodeURIComponent('Your account is inactive. Please contact support.')}&email=${encodeURIComponent(normalizedEmail)}`);
      }

      if (config.registration.requireEmailVerification && !user.emailVerified) {
        const message = 'Please verify your email address before signing in.';
        return c.redirect(`/login?error=${encodeURIComponent(message)}&email=${encodeURIComponent(normalizedEmail)}`);
      }

      // 🔐 MFA logic
      let hasMFA = false;
      let mfaDevices = [];
      if (config.mfa.enabled && plugin.mfaDevicesResource) {
        const [okMFA, errMFA, devices] = await tryFn(() =>
          plugin.mfaDevicesResource.query({ userId: user.id, verified: true })
        );
        if (!okMFA && config.verbose) {
          console.error('[Identity Plugin] Failed to load MFA devices:', errMFA);
        }
        if (okMFA && devices && devices.length > 0) {
          hasMFA = true;
          mfaDevices = devices;
        }
      }

      if (config.mfa.required && !hasMFA) {
        return c.redirect(`/login?error=${encodeURIComponent('Multi-factor authentication is required for your account. Please contact support to complete enrollment.')}&email=${encodeURIComponent(normalizedEmail)}`);
      }

      const needsMfa = hasMFA || config.mfa.required;

      if (!usingChallenge && needsMfa) {
        const challengeToken = createMfaChallengeToken(user, rememberChoice);
        if (!challengeToken) {
          return c.redirect(`/login?error=${encodeURIComponent('Unable to start MFA verification. Please contact support.')}`);
        }

        const params = new URLSearchParams({ challenge: challengeToken });
        if (rememberChoice === '1') {
          params.set('remember', '1');
        }
        return c.redirect(`/login/mfa?${params.toString()}`);
      }

      if (usingChallenge && needsMfa) {
        if (!mfa_token && !backup_code) {
          const retryChallenge = createMfaChallengeToken(user, rememberChoice) || mfa_challenge;
          const params = new URLSearchParams({ challenge: retryChallenge });
          params.set('error', 'Multi-factor authentication is required.');
          if (rememberChoice === '1') {
            params.set('remember', '1');
          }
          return c.redirect(`/login/mfa?${params.toString()}`);
        }

        let mfaVerified = false;

        if (mfa_token && hasMFA) {
          mfaVerified = plugin.mfaManager.verifyTOTP(mfaDevices[0].secret, mfa_token);
          if (mfaVerified) {
            await plugin.mfaDevicesResource.patch(mfaDevices[0].id, {
              lastUsedAt: new Date().toISOString()
            });
            await logAudit('mfa_verified', { userId: user.id, method: 'totp' });
          }
        }

        if (!mfaVerified && backup_code && hasMFA) {
          const matchIndex = await plugin.mfaManager.verifyBackupCode(
            backup_code,
            mfaDevices[0].backupCodes
          );

          if (matchIndex !== null && matchIndex >= 0) {
            const updatedCodes = [...mfaDevices[0].backupCodes];
            updatedCodes.splice(matchIndex, 1);

            await plugin.mfaDevicesResource.patch(mfaDevices[0].id, {
              backupCodes: updatedCodes,
              lastUsedAt: new Date().toISOString()
            });

            mfaVerified = true;
            await logAudit('mfa_verified', { userId: user.id, method: 'backup_code' });
          }
        }

        if (!mfaVerified) {
          await logAudit('mfa_failed', { userId: user.id, reason: 'invalid_token' });

          if (failbanManager && failbanConfig.endpoints.login) {
            await failbanManager.recordViolation(clientIp, 'failed_mfa', {
              path: '/login',
              userAgent,
              email: normalizedEmail,
              userId: user.id
            });
          }

          const retryChallenge = createMfaChallengeToken(user, rememberChoice) || mfa_challenge;
          const params = new URLSearchParams({
            challenge: retryChallenge,
            error: 'Invalid MFA code. Please try again.'
          });
          if (rememberChoice === '1') {
            params.set('remember', '1');
          }
          return c.redirect(`/login/mfa?${params.toString()}`);
        }
      }

      // Create session
      const sessionDuration = rememberChoice === '1' ? '30d' : config.session.sessionExpiry;
      const [okSession, errSession, session] = await tryFn(() =>
        sessionManager.createSession({
          userId: user.id,
          metadata: {
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin || false
          },
          ipAddress: clientIp,
          userAgent,
          duration: sessionDuration
        })
      );

      if (!okSession) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to create session:', errSession);
        }
        return c.redirect(`/login?error=${encodeURIComponent('Failed to create session. Please try again.')}&email=${encodeURIComponent(normalizedEmail)}`);
      }

      sessionManager.setSessionCookie(c, session.sessionId, session.expiresAt);

      await tryFn(() =>
        usersResource.patch(user.id, {
          lastLoginAt: new Date().toISOString(),
          lastLoginIp: clientIp
        })
      );

      const redirectTo = c.req.query('redirect') || '/profile';
      return c.redirect(redirectTo);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Login error:', error);
      }
      return c.redirect(`/login?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // GET /login/mfa - Show MFA verification page (two-factor authentication)
  // ============================================================================
  app.get('/login/mfa', async (c) => {
    if (!config.mfa.enabled) {
      return c.redirect(`/login?error=${encodeURIComponent('MFA is not enabled on this server')}`);
    }

    try {
      const challenge = c.req.query('challenge');
      const remember = c.req.query('remember');
      const error = c.req.query('error');

      if (!challenge) {
        return c.redirect(`/login?error=${encodeURIComponent('Invalid MFA session')}`);
      }

      const payload = await verifyMfaChallengeToken(challenge);
      if (!payload) {
        return c.redirect(`/login?error=${encodeURIComponent('MFA session expired. Please login again.')}`);
      }

      const [okUser, , challengeUser] = await tryFn(() =>
        usersResource.get(payload.userId)
      );

      if (!okUser || !challengeUser) {
        return c.redirect(`/login?error=${encodeURIComponent('Your account could not be found. Please login again.')}`);
      }

      const effectiveRemember = payload.remember || remember === '1';

      return c.html(MFAVerificationPage({
        error: error ? decodeURIComponent(error) : null,
        email: challengeUser.email,
        remember: effectiveRemember ? '1' : '0',
        challenge,
        config: uiConfig
      }));

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] MFA verification page error:', error);
      }
      return c.redirect(`/login?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // GET /register - Show registration form
  // ============================================================================
  app.get('/register', async (c) => {
    // Check if registration is enabled
    if (!config.registration.enabled) {
      const message = config.registration.customMessage ||
        'Registration is currently disabled. Please contact an administrator for access.';
      return c.redirect(`/login?error=${encodeURIComponent(message)}`);
    }

    // If already logged in, redirect to profile
    const sessionId = sessionManager.getSessionIdFromRequest(c.req);
    if (sessionId) {
      const { valid } = await sessionManager.validateSession(sessionId);
      if (valid) {
        return c.redirect('/profile');
      }
    }

    const error = c.req.query('error');
    const email = c.req.query('email') || '';
    const name = c.req.query('name') || '';

    const PageComponent = getPageComponent(customPages, 'register', RegisterPage);
    return c.html(PageComponent({
      error: error ? decodeURIComponent(error) : null,
      email,
      name,
      passwordPolicy: config.passwordPolicy,
      config: uiConfig
    }));
  });

  // ============================================================================
  // POST /register - Handle registration form submission
  // ============================================================================
  app.post('/register', async (c) => {
    // Check if registration is enabled
    if (!config.registration.enabled) {
      const message = config.registration.customMessage ||
        'Registration is currently disabled. Please contact an administrator for access.';
      return c.redirect(`/login?error=${encodeURIComponent(message)}`);
    }

    try {
      const body = await c.req.parseBody();
      const { name, email, password, confirm_password, agree_terms } = body;

      // Validate input
      if (!name || !email || !password || !confirm_password) {
        return c.redirect(`/register?error=${encodeURIComponent('All fields are required')}&email=${encodeURIComponent(email || '')}&name=${encodeURIComponent(name || '')}`);
      }

      if (!agree_terms || agree_terms !== '1') {
        return c.redirect(`/register?error=${encodeURIComponent('You must agree to the Terms of Service and Privacy Policy')}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
      }

      // Validate password match
      if (password !== confirm_password) {
        return c.redirect(`/register?error=${encodeURIComponent('Passwords do not match')}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
      }

      // Validate password strength
      const passwordValidation = validatePassword(password, config.passwordPolicy);
      if (!passwordValidation.valid) {
        const errorMsg = passwordValidation.errors.join(', ');
        return c.redirect(`/register?error=${encodeURIComponent(errorMsg)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
      }

      // Validate email domain (if restrictions are configured)
      const normalizedEmail = email.toLowerCase().trim();
      const emailDomain = normalizedEmail.split('@')[1];

      // Check if domain is blocked
      if (config.registration.blockedDomains && config.registration.blockedDomains.length > 0) {
        if (config.registration.blockedDomains.includes(emailDomain)) {
          return c.redirect(`/register?error=${encodeURIComponent('Registration with this email domain is not allowed')}&name=${encodeURIComponent(name)}`);
        }
      }

      // Check if domain is in allowed list (if configured)
      if (config.registration.allowedDomains && config.registration.allowedDomains.length > 0) {
        if (!config.registration.allowedDomains.includes(emailDomain)) {
          return c.redirect(`/register?error=${encodeURIComponent('Registration is restricted to specific email domains')}&name=${encodeURIComponent(name)}`);
        }
      }

      // Check if email already exists
      const [okCheck, errCheck, existingUsers] = await tryFn(() =>
        usersResource.query({ email: normalizedEmail })
      );

      if (okCheck && existingUsers && existingUsers.length > 0) {
        return c.redirect(`/register?error=${encodeURIComponent('An account with this email already exists')}&name=${encodeURIComponent(name)}`);
      }

      // Get request metadata
      const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
                        c.req.header('x-real-ip') ||
                        'unknown';

      const initialActive = !config.registration.requireEmailVerification;
      const userRecord = {
        email: normalizedEmail,
        name: name.trim(),
        password,  // Auto-encrypted with 'password' type
        isAdmin: false,
        emailVerified: config.registration.requireEmailVerification ? false : true,
        active: initialActive,
        registrationIp: ipAddress,
        lastLoginAt: null,
        lastLoginIp: null
      };

      if (supportsStatusField) {
        userRecord.status = initialActive ? 'active' : 'pending_verification';
      }

      // Create user (password will be auto-encrypted by S3DB)
      const [okUser, errUser, user] = await tryFn(() =>
        usersResource.insert(userRecord)
      );

      if (!okUser) {
        if (config.verbose) {
          console.error('[Identity Plugin] User creation failed:', errUser);
        }
        return c.redirect(`/register?error=${encodeURIComponent('Failed to create account. Please try again.')}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
      }

      let successMessage = 'Account created successfully! You can sign in now.';

      if (config.registration.requireEmailVerification) {
        const verificationToken = generatePasswordResetToken();
        const verificationExpiry = calculateExpiration('24h'); // 24 hours

        await usersResource.update(user.id, {
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry
        });

        if (plugin.emailService) {
          try {
            await plugin.emailService.sendEmailVerificationEmail({
              to: normalizedEmail,
              name: name.trim(),
              verificationToken
            });
          } catch (emailError) {
            if (config.verbose) {
              console.error('[Identity Plugin] Failed to send verification email:', emailError);
            }
          }
        }

        successMessage = 'Account created successfully! Please check your email to verify your account.';
      }

      return c.redirect(`/login?success=${encodeURIComponent(successMessage)}&email=${encodeURIComponent(normalizedEmail)}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Registration error:', error);
      }
      return c.redirect(`/register?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // POST /logout - Handle logout
  // ============================================================================
  app.post('/logout', async (c) => {
    try {
      const sessionId = sessionManager.getSessionIdFromRequest(c.req);

      if (sessionId) {
        // Destroy session
        await sessionManager.destroySession(sessionId);
      }

      // Clear session cookie
      sessionManager.clearSessionCookie(c);

      // Redirect to login
      return c.redirect('/login?success=You have been logged out successfully');

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Logout error:', error);
      }
      // Still clear cookie and redirect even if session destroy failed
      sessionManager.clearSessionCookie(c);
      return c.redirect('/login');
    }
  });

  // ============================================================================
  // GET /logout - Logout via GET (convenience)
  // ============================================================================
  app.get('/logout', async (c) => {
    // For convenience, allow GET logout
    const sessionId = sessionManager.getSessionIdFromRequest(c.req);

    if (sessionId) {
      await sessionManager.destroySession(sessionId);
    }

    sessionManager.clearSessionCookie(c);
    return c.redirect('/login?success=You have been logged out successfully');
  });

  // ============================================================================
  // GET /forgot-password - Show forgot password form
  // ============================================================================
  app.get('/forgot-password', async (c) => {
    const error = c.req.query('error');
    const success = c.req.query('success');
    const email = c.req.query('email') || '';

    const PageComponent = getPageComponent(customPages, 'forgotPassword', ForgotPasswordPage);
    return c.html(PageComponent({
      error: error ? decodeURIComponent(error) : null,
      success: success ? decodeURIComponent(success) : null,
      email,
      config: uiConfig
    }));
  });

  // ============================================================================
  // POST /forgot-password - Handle forgot password request
  // ============================================================================
  app.post('/forgot-password', async (c) => {
    try {
      const body = await c.req.parseBody();
      const { email } = body;

      if (!email) {
        return c.redirect(`/forgot-password?error=${encodeURIComponent('Email is required')}`);
      }

      // Find user by email
      const normalizedEmail = email.toLowerCase().trim();
      const [okQuery, errQuery, users] = await tryFn(() =>
        usersResource.query({ email: normalizedEmail })
      );

      // Always show success message (security - don't reveal if user exists)
      const successMessage = 'If an account exists with this email, you will receive password reset instructions.';

      if (!okQuery || users.length === 0) {
        // User doesn't exist, but show success anyway
        await new Promise(resolve => setTimeout(resolve, 500)); // Timing attack protection
        return c.redirect(`/forgot-password?success=${encodeURIComponent(successMessage)}`);
      }

      const user = users[0];

      // Generate reset token
      const resetToken = generatePasswordResetToken();
      const expiresAt = calculateExpiration('1h'); // 1 hour expiration

      // Store reset token
      const [okToken, errToken] = await tryFn(() =>
        plugin.passwordResetTokensResource.insert({
          userId: user.id,
          token: resetToken,
          expiresAt,
          used: false
        })
      );

      if (!okToken) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to create reset token:', errToken);
        }
        return c.redirect(`/forgot-password?error=${encodeURIComponent('Failed to process request. Please try again.')}&email=${encodeURIComponent(email)}`);
      }

      // Send password reset email
      if (plugin.emailService && plugin.emailService.config.enabled) {
        await plugin.emailService.sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetToken,
          expiresIn: 60 // minutes
        });
      } else if (config.verbose) {
        console.log('[Identity Plugin] Email service disabled. Reset token:', resetToken);
        console.log('[Identity Plugin] Reset URL:', `${config.ui.baseUrl || 'http://localhost:4000'}/reset-password?token=${resetToken}`);
      }

      return c.redirect(`/forgot-password?success=${encodeURIComponent(successMessage)}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Forgot password error:', error);
      }
      return c.redirect(`/forgot-password?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // GET /reset-password - Show reset password form
  // ============================================================================
  app.get('/reset-password', async (c) => {
    const token = c.req.query('token');
    const error = c.req.query('error');

    if (!token) {
      return c.redirect(`/forgot-password?error=${encodeURIComponent('Invalid or missing reset token')}`);
    }

    // Validate token exists and not expired
    const [okQuery, errQuery, tokens] = await tryFn(() =>
      plugin.passwordResetTokensResource.query({ token })
    );

    if (!okQuery || tokens.length === 0) {
      return c.redirect(`/forgot-password?error=${encodeURIComponent('Invalid reset token')}`);
    }

    const resetToken = tokens[0];

    // Check if token is expired
    if (isExpired(resetToken.expiresAt)) {
      return c.redirect(`/forgot-password?error=${encodeURIComponent('Reset link has expired. Please request a new one.')}`);
    }

    // Check if token was already used
    if (resetToken.used) {
      return c.redirect(`/forgot-password?error=${encodeURIComponent('Reset link has already been used. Please request a new one.')}`);
    }

    const PageComponent = getPageComponent(customPages, 'resetPassword', ResetPasswordPage);
    return c.html(PageComponent({
      error: error ? decodeURIComponent(error) : null,
      token,
      passwordPolicy: config.passwordPolicy,
      config: uiConfig
    }));
  });

  // ============================================================================
  // POST /reset-password - Handle password reset
  // ============================================================================
  app.post('/reset-password', async (c) => {
    try {
      const body = await c.req.parseBody();
      const { token, password, confirm_password } = body;

      if (!token || !password || !confirm_password) {
        return c.redirect(`/reset-password?token=${token}&error=${encodeURIComponent('All fields are required')}`);
      }

      // Validate password match
      if (password !== confirm_password) {
        return c.redirect(`/reset-password?token=${token}&error=${encodeURIComponent('Passwords do not match')}`);
      }

      // Validate password strength
      const passwordValidation = validatePassword(password, config.passwordPolicy);
      if (!passwordValidation.valid) {
        const errorMsg = passwordValidation.errors.join(', ');
        return c.redirect(`/reset-password?token=${token}&error=${encodeURIComponent(errorMsg)}`);
      }

      // Find reset token
      const [okQuery, errQuery, tokens] = await tryFn(() =>
        plugin.passwordResetTokensResource.query({ token })
      );

      if (!okQuery || tokens.length === 0) {
        return c.redirect(`/forgot-password?error=${encodeURIComponent('Invalid reset token')}`);
      }

      const resetToken = tokens[0];

      // Check if token is expired
      if (isExpired(resetToken.expiresAt)) {
        return c.redirect(`/forgot-password?error=${encodeURIComponent('Reset link has expired. Please request a new one.')}`);
      }

      // Check if token was already used
      if (resetToken.used) {
        return c.redirect(`/forgot-password?error=${encodeURIComponent('Reset link has already been used.')}`);
      }

      // Update user password (auto-encrypted by S3DB)
      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.patch(resetToken.userId, {
          password: password  // Auto-encrypted with 'secret' type
        })
      );

      if (!okUpdate) {
        if (config.verbose) {
          console.error('[Identity Plugin] Password update failed:', errUpdate);
        }
        return c.redirect(`/reset-password?token=${token}&error=${encodeURIComponent('Failed to reset password. Please try again.')}`);
      }

      // Mark token as used
      await tryFn(() =>
        plugin.passwordResetTokensResource.patch(resetToken.id, { used: true })
      );

      // Destroy all user sessions (force re-login)
      await sessionManager.destroyUserSessions(resetToken.userId);

      // Redirect to login with success message
      return c.redirect(`/login?success=${encodeURIComponent('Your password has been reset successfully. Please log in with your new password.')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Reset password error:', error);
      }
      return c.redirect(`/forgot-password?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // GET /profile - Show user profile (protected route)
  // ============================================================================
  app.get('/profile', sessionAuth(sessionManager, { required: true }), async (c) => {
    try {
      const user = c.get('user');
      const currentSessionId = sessionManager.getSessionIdFromRequest(c.req);

      // Get user full data from database
      const [okUser, errUser, userData] = await tryFn(() =>
        usersResource.get(user.userId || user.id)
      );

      if (!okUser) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to load user:', errUser);
        }
        return c.redirect(`/login?error=${encodeURIComponent('Failed to load profile. Please try again.')}`);
      }

      // Get all user sessions
      const [okSessions, errSessions, allSessions] = await tryFn(() =>
        sessionManager.getUserSessions(userData.id)
      );

      const sessions = okSessions ? allSessions.map(session => ({
        ...session,
        isCurrent: session.id === currentSessionId
      })) : [];

      const error = c.req.query('error');
      const success = c.req.query('success');

      const PageComponent = getPageComponent(customPages, 'profile', ProfilePage);
      return c.html(PageComponent({
        user: userData,
        sessions,
        error: error ? decodeURIComponent(error) : null,
        success: success ? decodeURIComponent(success) : null,
        passwordPolicy: config.passwordPolicy,
        config: uiConfig
      }));

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Profile page error:', error);
      }
      return c.redirect(`/login?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // POST /profile/update - Update user profile
  // ============================================================================
  app.post('/profile/update', sessionAuth(sessionManager, { required: true }), async (c) => {
    try {
      const body = await c.req.parseBody();
      const { name, email } = body;
      const user = c.get('user');

      if (!name || !email) {
        return c.redirect(`/profile?error=${encodeURIComponent('Name and email are required')}`);
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if email changed and if it's already taken
      const [okUser, errUser, userData] = await tryFn(() =>
        usersResource.get(user.userId || user.id)
      );

      if (!okUser) {
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to load profile')}`);
      }

      if (normalizedEmail !== userData.email) {
        // Email changed, check if new email is available
        const [okCheck, errCheck, existingUsers] = await tryFn(() =>
          usersResource.query({ email: normalizedEmail })
        );

        if (okCheck && existingUsers.length > 0) {
          return c.redirect(`/profile?error=${encodeURIComponent('Email address is already in use')}`);
        }

        // Update email and mark as unverified
        const [okUpdate, errUpdate] = await tryFn(() =>
          usersResource.patch(userData.id, {
            name: name.trim(),
            email: normalizedEmail,
            emailVerified: false
          })
        );

        if (!okUpdate) {
          if (config.verbose) {
            console.error('[Identity Plugin] Profile update failed:', errUpdate);
          }
          return c.redirect(`/profile?error=${encodeURIComponent('Failed to update profile. Please try again.')}`);
        }

        // TODO: Send verification email in FASE 8

        return c.redirect(`/profile?success=${encodeURIComponent('Profile updated successfully. Please verify your new email address.')}`);
      } else {
        // Only name changed
        const [okUpdate, errUpdate] = await tryFn(() =>
          usersResource.patch(userData.id, {
            name: name.trim()
          })
        );

        if (!okUpdate) {
          if (config.verbose) {
            console.error('[Identity Plugin] Profile update failed:', errUpdate);
          }
          return c.redirect(`/profile?error=${encodeURIComponent('Failed to update profile. Please try again.')}`);
        }

        return c.redirect(`/profile?success=${encodeURIComponent('Profile updated successfully')}`);
      }

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Profile update error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // POST /profile/change-password - Change user password
  // ============================================================================
  app.post('/profile/change-password', sessionAuth(sessionManager, { required: true }), async (c) => {
    try {
      const body = await c.req.parseBody();
      const { current_password, new_password, confirm_new_password } = body;
      const user = c.get('user');

      if (!current_password || !new_password || !confirm_new_password) {
        return c.redirect(`/profile?error=${encodeURIComponent('All password fields are required')}`);
      }

      // Validate new password match
      if (new_password !== confirm_new_password) {
        return c.redirect(`/profile?error=${encodeURIComponent('New passwords do not match')}`);
      }

      // Get user data
      const [okUser, errUser, userData] = await tryFn(() =>
        usersResource.get(user.userId || user.id)
      );

      if (!okUser) {
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to load profile')}`);
      }

      // Verify current password (auto-decrypted by S3DB)
      const [okVerify, errVerify, isValid] = await tryFn(() =>
        verifyPassword(current_password, userData.password)
      );

      if (!okVerify || !isValid) {
        return c.redirect(`/profile?error=${encodeURIComponent('Current password is incorrect')}`);
      }

      // Validate new password strength
      const passwordValidation = validatePassword(new_password, config.passwordPolicy);
      if (!passwordValidation.valid) {
        const errorMsg = passwordValidation.errors.join(', ');
        return c.redirect(`/profile?error=${encodeURIComponent(errorMsg)}`);
      }

      // Update password (auto-encrypted by S3DB)
      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.patch(userData.id, {
          password: new_password  // Auto-encrypted with 'secret' type
        })
      );

      if (!okUpdate) {
        if (config.verbose) {
          console.error('[Identity Plugin] Password update failed:', errUpdate);
        }
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to change password. Please try again.')}`);
      }

      // Keep current session, but destroy all others (security measure)
      const currentSessionId = sessionManager.getSessionIdFromRequest(c.req);
      const [okSessions, errSessions, allSessions] = await tryFn(() =>
        sessionManager.getUserSessions(userData.id)
      );

      if (okSessions) {
        for (const session of allSessions) {
          if (session.id !== currentSessionId) {
            await sessionManager.destroySession(session.id);
          }
        }
      }

      return c.redirect(`/profile?success=${encodeURIComponent('Password changed successfully. All other sessions have been logged out.')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Change password error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // POST /profile/logout-session - Logout a specific session
  // ============================================================================
  app.post('/profile/logout-session', sessionAuth(sessionManager, { required: true }), async (c) => {
    try {
      const body = await c.req.parseBody();
      const { session_id } = body;
      const user = c.get('user');
      const currentSessionId = sessionManager.getSessionIdFromRequest(c.req);

      if (!session_id) {
        return c.redirect(`/profile?error=${encodeURIComponent('Session ID is required')}`);
      }

      // Don't allow logging out current session
      if (session_id === currentSessionId) {
        return c.redirect(`/profile?error=${encodeURIComponent('Cannot logout current session. Use logout button instead.')}`);
      }

      // Verify session belongs to user
      const [okSession, errSession, session] = await tryFn(() =>
        sessionManager.getSession(session_id)
      );

      if (!okSession || !session) {
        return c.redirect(`/profile?error=${encodeURIComponent('Session not found')}`);
      }

      if (session.userId !== (user.userId || user.id)) {
        return c.redirect(`/profile?error=${encodeURIComponent('Access denied')}`);
      }

      // Destroy session
      await sessionManager.destroySession(session_id);

      return c.redirect(`/profile?success=${encodeURIComponent('Session logged out successfully')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Logout session error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // POST /profile/logout-all-sessions - Logout all other sessions
  // ============================================================================
  app.post('/profile/logout-all-sessions', sessionAuth(sessionManager, { required: true }), async (c) => {
    try {
      const user = c.get('user');
      const currentSessionId = sessionManager.getSessionIdFromRequest(c.req);

      // Get all user sessions
      const [okSessions, errSessions, allSessions] = await tryFn(() =>
        sessionManager.getUserSessions(user.userId || user.id)
      );

      if (!okSessions) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to get sessions:', errSessions);
        }
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to logout sessions. Please try again.')}`);
      }

      // Destroy all sessions except current
      let loggedOutCount = 0;
      for (const session of allSessions) {
        if (session.id !== currentSessionId) {
          await sessionManager.destroySession(session.id);
          loggedOutCount++;
        }
      }

      return c.redirect(`/profile?success=${encodeURIComponent(`${loggedOutCount} session(s) logged out successfully`)}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Logout all sessions error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // MFA ENROLLMENT ROUTES (Protected - User Only)
  // ============================================================================

  // GET /profile/mfa/enroll - Show MFA enrollment page with QR code
  app.get('/profile/mfa/enroll', sessionAuth(sessionManager, { required: true }), async (c) => {
    if (!config.mfa.enabled) {
      return c.redirect(`/profile?error=${encodeURIComponent('MFA is not enabled on this server')}`);
    }

    try {
      const user = c.get('user');

      // Get user data
      const [okUser, errUser, userData] = await tryFn(() =>
        usersResource.get(user.userId || user.id)
      );

      if (!okUser) {
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to load profile')}`);
      }

      // Check if user already has MFA enabled
      const [okDevices, errDevices, devices] = await tryFn(() =>
        plugin.mfaDevicesResource.query({ userId: userData.id, verified: true })
      );

      if (okDevices && devices.length > 0) {
        return c.redirect(`/profile?error=${encodeURIComponent('MFA is already enabled for your account')}`);
      }

      // Generate MFA enrollment data
      const enrollment = plugin.mfaManager.generateEnrollment(userData.email);

      // Generate QR code data URL
      const qrCodeDataUrl = await plugin.mfaManager.generateQRCodeDataURL(enrollment.qrCodeUrl);

      // Store enrollment data temporarily in session (NOT in database yet)
      // We'll store it after successful verification
      c.set('mfaEnrollment', enrollment);

      return c.html(MFAEnrollmentPage({
        qrCodeDataUrl,
        secret: enrollment.secret,
        backupCodes: enrollment.backupCodes,
        config: uiConfig
      }));

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] MFA enrollment page error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /profile/mfa/enroll - Verify token and complete MFA enrollment
  app.post('/profile/mfa/enroll', sessionAuth(sessionManager, { required: true }), async (c) => {
    if (!config.mfa.enabled) {
      return c.redirect(`/profile?error=${encodeURIComponent('MFA is not enabled on this server')}`);
    }

    try {
      const user = c.get('user');
      const body = await c.req.parseBody();
      const { token, enrollment_secret, enrollment_backup_codes } = body;

      if (!token || !enrollment_secret || !enrollment_backup_codes) {
        return c.redirect(`/profile/mfa/enroll?error=${encodeURIComponent('Invalid enrollment data')}`);
      }

      // Get user data
      const [okUser, errUser, userData] = await tryFn(() =>
        usersResource.get(user.userId || user.id)
      );

      if (!okUser) {
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to load profile')}`);
      }

      // Verify TOTP token
      const isValid = plugin.mfaManager.verifyTOTP(enrollment_secret, token);

      if (!isValid) {
        return c.redirect(`/profile/mfa/enroll?error=${encodeURIComponent('Invalid verification code. Please try again.')}`);
      }

      // Hash backup codes
      const backupCodes = JSON.parse(enrollment_backup_codes);
      const hashedCodes = await plugin.mfaManager.hashBackupCodes(backupCodes);

      // Save MFA device
      const [okDevice, errDevice] = await tryFn(() =>
        plugin.mfaDevicesResource.insert({
          userId: userData.id,
          type: 'totp',
          secret: enrollment_secret,
          verified: true,
          backupCodes: hashedCodes,
          enrolledAt: new Date().toISOString(),
          deviceName: 'Authenticator App'
        })
      );

      if (!okDevice) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to save MFA device:', errDevice);
        }
        return c.redirect(`/profile/mfa/enroll?error=${encodeURIComponent('Failed to enable MFA. Please try again.')}`);
      }

      // Audit log
      await logAudit('mfa_enrolled', { userId: userData.id, type: 'totp' });

      return c.redirect(`/profile?success=${encodeURIComponent('Two-factor authentication enabled successfully!')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] MFA enrollment error:', error);
      }
      return c.redirect(`/profile/mfa/enroll?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /profile/mfa/disable - Disable MFA for user
  app.post('/profile/mfa/disable', sessionAuth(sessionManager, { required: true }), async (c) => {
    if (!config.mfa.enabled) {
      return c.redirect(`/profile?error=${encodeURIComponent('MFA is not enabled on this server')}`);
    }

    try {
      const user = c.get('user');
      const body = await c.req.parseBody();
      const { password } = body;

      if (!password) {
        return c.redirect(`/profile?error=${encodeURIComponent('Password is required to disable MFA')}`);
      }

      // Get user data
      const [okUser, errUser, userData] = await tryFn(() =>
        usersResource.get(user.userId || user.id)
      );

      if (!okUser) {
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to load profile')}`);
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, userData.password);
      if (!isValidPassword) {
        return c.redirect(`/profile?error=${encodeURIComponent('Invalid password')}`);
      }

      // Delete all MFA devices for user
      const [okDevices, errDevices, devices] = await tryFn(() =>
        plugin.mfaDevicesResource.query({ userId: userData.id })
      );

      if (okDevices && devices.length > 0) {
        for (const device of devices) {
          await plugin.mfaDevicesResource.remove(device.id);
        }

        // Audit log
        await logAudit('mfa_disabled', { userId: userData.id, by: 'user' });

        return c.redirect(`/profile?success=${encodeURIComponent('Two-factor authentication disabled successfully')}`);
      } else {
        return c.redirect(`/profile?error=${encodeURIComponent('MFA is not enabled for your account')}`);
      }

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] MFA disable error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // GET /profile/mfa/backup-codes - Regenerate backup codes
  app.get('/profile/mfa/backup-codes', sessionAuth(sessionManager, { required: true }), async (c) => {
    if (!config.mfa.enabled) {
      return c.redirect(`/profile?error=${encodeURIComponent('MFA is not enabled on this server')}`);
    }

    try {
      const user = c.get('user');

      // Get user data
      const [okUser, errUser, userData] = await tryFn(() =>
        usersResource.get(user.userId || user.id)
      );

      if (!okUser) {
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to load profile')}`);
      }

      // Check if user has MFA enabled
      const [okDevices, errDevices, devices] = await tryFn(() =>
        plugin.mfaDevicesResource.query({ userId: userData.id, verified: true })
      );

      if (!okDevices || devices.length === 0) {
        return c.redirect(`/profile?error=${encodeURIComponent('MFA is not enabled for your account')}`);
      }

      // Generate new backup codes
      const backupCodes = plugin.mfaManager.generateBackupCodes(config.mfa.backupCodesCount);
      const hashedCodes = await plugin.mfaManager.hashBackupCodes(backupCodes);

      // Update MFA device with new backup codes
      const [okUpdate, errUpdate] = await tryFn(() =>
        plugin.mfaDevicesResource.patch(devices[0].id, {
          backupCodes: hashedCodes
        })
      );

      if (!okUpdate) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to regenerate backup codes:', errUpdate);
        }
        return c.redirect(`/profile?error=${encodeURIComponent('Failed to regenerate backup codes. Please try again.')}`);
      }

      return c.html(MFABackupCodesPage({
        backupCodes,
        config: uiConfig
      }));

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] MFA backup codes error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // ADMIN ROUTES (Protected - Admin Only)
  // ============================================================================

  // GET /admin - Admin dashboard
  app.get('/admin', adminOnly(sessionManager), async (c) => {
    try {
      const user = c.get('user');

      // Gather statistics
      const [okUsers, errUsers, allUsers] = await tryFn(() => usersResource.list({ limit: 1000 }));
      const [okClients, errClients, allClients] = await tryFn(() => plugin.oauth2ClientsResource.list({ limit: 100 }));
      const [okSessions, errSessions, allSessions] = await tryFn(() => plugin.sessionsResource.list({ limit: 1000 }));
      const [okCodes, errCodes, allCodes] = await tryFn(() => plugin.oauth2AuthCodesResource.list({ limit: 1000 }));

      const users = okUsers ? allUsers : [];
      const clients = okClients ? allClients : [];
      const sessions = okSessions ? allSessions : [];
      const codes = okCodes ? allCodes : [];

      const now = new Date();
      const stats = {
        totalUsers: users.length,
        activeUsers: users.filter(u => supportsStatusField ? u.status === 'active' : u.active !== false).length,
        pendingUsers: users.filter(u => supportsStatusField ? u.status === 'pending_verification' : (u.active === false && !u.emailVerified)).length,
        totalClients: clients.length,
        activeClients: clients.filter(c => c.active !== false).length,
        activeSessions: sessions.filter(s => new Date(s.expiresAt) > now).length,
        uniqueUsers: new Set(sessions.filter(s => new Date(s.expiresAt) > now).map(s => s.userId)).size,
        totalAuthCodes: codes.length,
        unusedAuthCodes: codes.filter(c => !c.used).length,
        recentUsers: users.slice(-5).reverse(),
        serverUptime: formatUptime(process.uptime())
      };

      return c.html(AdminDashboardPage({
        stats,
        user,
        config: uiConfig
      }));

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Admin dashboard error:', error);
      }
      return c.redirect(`/profile?error=${encodeURIComponent('Failed to load admin dashboard')}`);
    }
  });

  // GET /admin/clients - List OAuth2 clients
  app.get('/admin/clients', adminOnly(sessionManager), async (c) => {
    try {
      const user = c.get('user');
      const error = c.req.query('error');
      const success = c.req.query('success');

      const [okClients, errClients, clients] = await tryFn(() =>
        plugin.oauth2ClientsResource.list({ limit: 100 })
      );

      if (!okClients) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to load clients:', errClients);
        }
        return c.redirect(`/admin?error=${encodeURIComponent('Failed to load clients')}`);
      }

      return c.html(AdminClientsPage({
        clients,
        user,
        error: error ? decodeURIComponent(error) : null,
        success: success ? decodeURIComponent(success) : null,
        config: uiConfig
      }));

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Admin clients error:', error);
      }
      return c.redirect(`/admin?error=${encodeURIComponent('Failed to load clients')}`);
    }
  });

  // GET /admin/clients/new - New client form
  app.get('/admin/clients/new', adminOnly(sessionManager), async (c) => {
    const user = c.get('user');
    const error = c.req.query('error');

    return c.html(AdminClientFormPage({
      user,
      error: error ? decodeURIComponent(error) : null,
      availableScopes: config.supportedScopes || ['openid', 'profile', 'email', 'offline_access'],
      availableGrantTypes: config.supportedGrantTypes || ['authorization_code', 'refresh_token', 'client_credentials'],
      config: uiConfig
    }));
  });

  // POST /admin/clients/create - Create new client
  app.post('/admin/clients/create', adminOnly(sessionManager), async (c) => {
    try {
      const body = await c.req.parseBody();
      const { name, redirectUris, grantTypes, allowedScopes, active } = body;

      if (!name) {
        return c.redirect(`/admin/clients/new?error=${encodeURIComponent('Client name is required')}`);
      }

      // Parse arrays from form data
      const redirectUrisArray = Array.isArray(redirectUris) ? redirectUris : [redirectUris];
      const grantTypesArray = Array.isArray(grantTypes) ? grantTypes : (grantTypes ? [grantTypes] : []);
      const allowedScopesArray = Array.isArray(allowedScopes) ? allowedScopes : (allowedScopes ? [allowedScopes] : []);

      if (redirectUrisArray.length === 0 || redirectUrisArray[0] === '') {
        return c.redirect(`/admin/clients/new?error=${encodeURIComponent('At least one redirect URI is required')}`);
      }

      // Generate client ID and secret
      const clientId = idGenerator();
      const clientSecret = idGenerator() + idGenerator(); // 44 chars

      // Create client
      const [okClient, errClient, client] = await tryFn(() =>
        plugin.oauth2ClientsResource.insert({
          clientId,
          clientSecret,
          name: name.trim(),
          redirectUris: redirectUrisArray.filter(uri => uri && uri.trim() !== ''),
          grantTypes: grantTypesArray,
          allowedScopes: allowedScopesArray,
          active: active === '1'
        })
      );

      if (!okClient) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to create client:', errClient);
        }
        return c.redirect(`/admin/clients/new?error=${encodeURIComponent('Failed to create client. Please try again.')}`);
      }

      return c.redirect(`/admin/clients?success=${encodeURIComponent('Client created successfully. Client ID: ' + clientId + ' | Client Secret: ' + clientSecret + ' (Save this secret now - it cannot be displayed again!)')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Create client error:', error);
      }
      return c.redirect(`/admin/clients/new?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // GET /admin/clients/:id/edit - Edit client form
  app.get('/admin/clients/:id/edit', adminOnly(sessionManager), async (c) => {
    try {
      const user = c.get('user');
      const clientId = c.req.param('id');
      const error = c.req.query('error');

      const [okClient, errClient, client] = await tryFn(() =>
        plugin.oauth2ClientsResource.get(clientId)
      );

      if (!okClient) {
        return c.redirect(`/admin/clients?error=${encodeURIComponent('Client not found')}`);
      }

      return c.html(AdminClientFormPage({
        client,
        user,
        error: error ? decodeURIComponent(error) : null,
        availableScopes: config.supportedScopes || ['openid', 'profile', 'email', 'offline_access'],
        availableGrantTypes: config.supportedGrantTypes || ['authorization_code', 'refresh_token', 'client_credentials'],
        config: uiConfig
      }));

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Edit client error:', error);
      }
      return c.redirect(`/admin/clients?error=${encodeURIComponent('Failed to load client')}`);
    }
  });

  // POST /admin/clients/:id/update - Update client
  app.post('/admin/clients/:id/update', adminOnly(sessionManager), async (c) => {
    try {
      const clientId = c.req.param('id');
      const body = await c.req.parseBody();
      const { name, redirectUris, grantTypes, allowedScopes, active } = body;

      if (!name) {
        return c.redirect(`/admin/clients/${clientId}/edit?error=${encodeURIComponent('Client name is required')}`);
      }

      // Parse arrays from form data
      const redirectUrisArray = Array.isArray(redirectUris) ? redirectUris : [redirectUris];
      const grantTypesArray = Array.isArray(grantTypes) ? grantTypes : (grantTypes ? [grantTypes] : []);
      const allowedScopesArray = Array.isArray(allowedScopes) ? allowedScopes : (allowedScopes ? [allowedScopes] : []);

      if (redirectUrisArray.length === 0 || redirectUrisArray[0] === '') {
        return c.redirect(`/admin/clients/${clientId}/edit?error=${encodeURIComponent('At least one redirect URI is required')}`);
      }

      // Update client
      const [okUpdate, errUpdate] = await tryFn(() =>
        plugin.oauth2ClientsResource.patch(clientId, {
          name: name.trim(),
          redirectUris: redirectUrisArray.filter(uri => uri && uri.trim() !== ''),
          grantTypes: grantTypesArray,
          allowedScopes: allowedScopesArray,
          active: active === '1'
        })
      );

      if (!okUpdate) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to update client:', errUpdate);
        }
        return c.redirect(`/admin/clients/${clientId}/edit?error=${encodeURIComponent('Failed to update client. Please try again.')}`);
      }

      return c.redirect(`/admin/clients?success=${encodeURIComponent('Client updated successfully')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Update client error:', error);
      }
      return c.redirect(`/admin/clients?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/clients/:id/delete - Delete client
  app.post('/admin/clients/:id/delete', adminOnly(sessionManager), async (c) => {
    try {
      const clientId = c.req.param('id');

      const [okDelete, errDelete] = await tryFn(() =>
        plugin.oauth2ClientsResource.delete(clientId)
      );

      if (!okDelete) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to delete client:', errDelete);
        }
        return c.redirect(`/admin/clients?error=${encodeURIComponent('Failed to delete client')}`);
      }

      return c.redirect(`/admin/clients?success=${encodeURIComponent('Client deleted successfully')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Delete client error:', error);
      }
      return c.redirect(`/admin/clients?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/clients/:id/rotate-secret - Rotate client secret
  app.post('/admin/clients/:id/rotate-secret', adminOnly(sessionManager), async (c) => {
    try {
      const clientId = c.req.param('id');

      // Generate new secret
      const newSecret = idGenerator() + idGenerator();

      const [okUpdate, errUpdate] = await tryFn(() =>
        plugin.oauth2ClientsResource.patch(clientId, {
          clientSecret: newSecret
        })
      );

      if (!okUpdate) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to rotate secret:', errUpdate);
        }
        return c.redirect(`/admin/clients?error=${encodeURIComponent('Failed to rotate secret')}`);
      }

      return c.redirect(`/admin/clients?success=${encodeURIComponent('Secret rotated successfully. New secret: ' + newSecret + ' (Save this now - it cannot be displayed again!)')}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Rotate secret error:', error);
      }
      return c.redirect(`/admin/clients?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/clients/:id/toggle-active - Toggle client active status
  app.post('/admin/clients/:id/toggle-active', adminOnly(sessionManager), async (c) => {
    try {
      const clientId = c.req.param('id');

      const [okClient, errClient, client] = await tryFn(() =>
        plugin.oauth2ClientsResource.get(clientId)
      );

      if (!okClient) {
        return c.redirect(`/admin/clients?error=${encodeURIComponent('Client not found')}`);
      }

      const [okUpdate, errUpdate] = await tryFn(() =>
        plugin.oauth2ClientsResource.patch(clientId, {
          active: !client.active
        })
      );

      if (!okUpdate) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to toggle active:', errUpdate);
        }
        return c.redirect(`/admin/clients?error=${encodeURIComponent('Failed to update client')}`);
      }

      return c.redirect(`/admin/clients?success=${encodeURIComponent(`Client ${client.active ? 'deactivated' : 'activated'} successfully`)}`);

    } catch (error) {
      if (config.verbose) {
        console.error('[Identity Plugin] Toggle active error:', error);
      }
      return c.redirect(`/admin/clients?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // User Management Routes
  // ============================================================================

  // GET /admin/users - List all users
  app.get('/admin/users', adminOnly(sessionManager), async (c) => {
    const error = c.req.query('error');
    const success = c.req.query('success');

    try {
      const [okUsers, errUsers, allUsers] = await tryFn(() =>
        usersResource.list({ limit: 1000 })
      );

      if (!okUsers) {
        console.error('[Identity Plugin] List users error:', errUsers);
        return c.html(AdminUsersPage({
          users: [],
          user: c.get('user'),
          error: 'Failed to load users',
          success: success ? decodeURIComponent(success) : null,
          config: uiConfig
        }));
      }

      const users = allUsers || [];

      return c.html(AdminUsersPage({
        users,
        user: c.get('user'),
        error: error ? decodeURIComponent(error) : null,
        success: success ? decodeURIComponent(success) : null,
        config: uiConfig
      }));
    } catch (error) {
      console.error('[Identity Plugin] List users error:', error);
      return c.html(AdminUsersPage({
        users: [],
        user: c.get('user'),
        error: 'An error occurred. Please try again.',
        config: uiConfig
      }));
    }
  });

  // GET /admin/users/:id/edit - Edit user form
  app.get('/admin/users/:id/edit', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');
    const error = c.req.query('error');

    try {
      const [okUser, errUser, editUser] = await tryFn(() =>
        usersResource.get(userId)
      );

      if (!okUser || !editUser) {
        return c.redirect(`/admin/users?error=${encodeURIComponent('User not found')}`);
      }

      return c.html(AdminUserFormPage({
        editUser,
        user: c.get('user'),
        error: error ? decodeURIComponent(error) : null,
        config: uiConfig
      }));
    } catch (error) {
      console.error('[Identity Plugin] Get user error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/update - Update user
  app.post('/admin/users/:id/update', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');
    const body = await c.req.parseBody();
    const { name, email, status, role, emailVerified } = body;
    const currentUser = c.get('user');

    try {
      // Get the user
      const [okUser, errUser, editUser] = await tryFn(() =>
        usersResource.get(userId)
      );

      if (!okUser || !editUser) {
        return c.redirect(`/admin/users?error=${encodeURIComponent('User not found')}`);
      }

      // Prevent self-modification of critical fields
      const isSelfEdit = userId === currentUser.id;

      // Check if email changed and is unique
      if (email !== editUser.email) {
        const [okExists, errExists, existingUsers] = await tryFn(() =>
          usersResource.query({ email: email.toLowerCase().trim() })
        );

        if (okExists && existingUsers && existingUsers.length > 0) {
          return c.html(AdminUserFormPage({
            editUser: { ...editUser, name, email },
            user: currentUser,
            error: 'Email already in use',
            config: uiConfig
          }));
        }
      }

      // Build update object
      const updates = {
        name: name.trim(),
        email: email.toLowerCase().trim()
      };

      // Only allow status/role changes if not self-editing
      if (!isSelfEdit) {
        if (supportsStatusField && status) {
          updates.status = status;
        }
        if (role) {
          updates.role = role;
        }
      }

      // Handle email verification
      updates.emailVerified = emailVerified === '1';

      // If email changed, mark as unverified
      if (email !== editUser.email) {
        updates.emailVerified = false;
      }

      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.update(userId, updates)
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Update user error:', errUpdate);
        return c.html(AdminUserFormPage({
          editUser: { ...editUser, ...updates },
          user: currentUser,
          error: 'Failed to update user',
          config: uiConfig
        }));
      }

      return c.redirect(`/admin/users?success=${encodeURIComponent(`User ${name} updated successfully`)}`);
    } catch (error) {
      console.error('[Identity Plugin] Update user error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/delete - Delete user
  app.post('/admin/users/:id/delete', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');
    const currentUser = c.get('user');

    // Prevent self-deletion
    if (userId === currentUser.id) {
      return c.redirect(`/admin/users?error=${encodeURIComponent('You cannot delete your own account')}`);
    }

    try {
      const [okUser, errUser, user] = await tryFn(() =>
        usersResource.get(userId)
      );

      if (!okUser || !user) {
        return c.redirect(`/admin/users?error=${encodeURIComponent('User not found')}`);
      }

      const userName = user.name;

      const [okDelete, errDelete] = await tryFn(() =>
        usersResource.delete(userId)
      );

      if (!okDelete) {
        console.error('[Identity Plugin] Delete user error:', errDelete);
        return c.redirect(`/admin/users?error=${encodeURIComponent('Failed to delete user')}`);
      }

      return c.redirect(`/admin/users?success=${encodeURIComponent(`User ${userName} deleted successfully`)}`);
    } catch (error) {
      console.error('[Identity Plugin] Delete user error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/change-status - Change user status
  app.post('/admin/users/:id/change-status', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');
    const body = await c.req.parseBody();
    const { status } = body;
    const currentUser = c.get('user');

    if (!supportsStatusField) {
      return c.redirect(`/admin/users?error=${encodeURIComponent('Status management is not supported for this deployment')}`);
    }

    // Prevent self-status change
    if (userId === currentUser.id) {
      return c.redirect(`/admin/users?error=${encodeURIComponent('You cannot change your own status')}`);
    }

    try {
      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.patch(userId, { status })
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Change status error:', errUpdate);
        return c.redirect(`/admin/users?error=${encodeURIComponent('Failed to change user status')}`);
      }

      return c.redirect(`/admin/users?success=${encodeURIComponent(`User status changed to ${status}`)}`);
    } catch (error) {
      console.error('[Identity Plugin] Change status error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/verify-email - Mark email as verified
  app.post('/admin/users/:id/verify-email', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');

    try {
      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.patch(userId, { emailVerified: true })
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Verify email error:', errUpdate);
        return c.redirect(`/admin/users?error=${encodeURIComponent('Failed to verify email')}`);
      }

      return c.redirect(`/admin/users?success=${encodeURIComponent('Email marked as verified')}`);
    } catch (error) {
      console.error('[Identity Plugin] Verify email error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/reset-password - Send password reset email
  app.post('/admin/users/:id/reset-password', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');
    const currentUser = c.get('user');

    // Prevent resetting own password this way
    if (userId === currentUser.id) {
      return c.redirect(`/admin/users?error=${encodeURIComponent('Use the profile page to change your own password')}`);
    }

    try {
      const [okUser, errUser, user] = await tryFn(() =>
        usersResource.get(userId)
      );

      if (!okUser || !user) {
        return c.redirect(`/admin/users?error=${encodeURIComponent('User not found')}`);
      }

      // Generate reset token
      const resetToken = generatePasswordResetToken();
      const resetExpiry = calculateExpiration(1); // 1 hour

      // Update user with reset token
      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.patch(userId, {
          passwordResetToken: resetToken,
          passwordResetExpiry: resetExpiry
        })
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Password reset update error:', errUpdate);
        return c.redirect(`/admin/users?error=${encodeURIComponent('Failed to generate reset token')}`);
      }

      // Send email
      if (plugin.emailService) {
        const resetUrl = `${config.issuer}/reset-password?token=${resetToken}`;
        await plugin.emailService.sendPasswordResetEmail(user.email, {
          name: user.name,
          resetUrl
        });
      }

      return c.redirect(`/admin/users?success=${encodeURIComponent(`Password reset email sent to ${user.email}`)}`);
    } catch (error) {
      console.error('[Identity Plugin] Reset password error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/unlock-account - Unlock user account (clear lockout)
  app.post('/admin/users/:id/unlock-account', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');
    const currentUser = c.get('user');

    try {
      // Get user
      const [okGet, errGet, user] = await tryFn(() => usersResource.get(userId));

      if (!okGet || !user) {
        console.error('[Identity Plugin] User not found:', userId);
        return c.redirect(`/admin/users?error=${encodeURIComponent('User not found')}`);
      }

      // Check if user is actually locked
      if (!user.lockedUntil && !user.failedLoginAttempts) {
        return c.redirect(`/admin/users?error=${encodeURIComponent('User account is not locked')}`);
      }

      // Unlock the account
      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.update(userId, {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastFailedLogin: null
        })
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Failed to unlock account:', errUpdate);
        return c.redirect(`/admin/users?error=${encodeURIComponent('Failed to unlock account')}`);
      }

      if (config.verbose) {
        console.log(`[Account Lockout] Admin ${currentUser.email} manually unlocked user ${user.email}`);
      }

      return c.redirect(`/admin/users?success=${encodeURIComponent(`Account unlocked for ${user.email}`)}`);
    } catch (error) {
      console.error('[Identity Plugin] Unlock account error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/disable-mfa - Disable MFA for user (admin override)
  app.post('/admin/users/:id/disable-mfa', adminOnly(sessionManager), async (c) => {
    if (!config.mfa.enabled) {
      return c.redirect(`/admin/users?error=${encodeURIComponent('MFA is not enabled on this server')}`);
    }

    const userId = c.req.param('id');
    const currentUser = c.get('user');

    try {
      // Get user
      const [okGet, errGet, user] = await tryFn(() => usersResource.get(userId));

      if (!okGet || !user) {
        console.error('[Identity Plugin] User not found:', userId);
        return c.redirect(`/admin/users?error=${encodeURIComponent('User not found')}`);
      }

      // Get all MFA devices for user
      const [okDevices, errDevices, devices] = await tryFn(() =>
        plugin.mfaDevicesResource.query({ userId: user.id })
      );

      if (!okDevices || devices.length === 0) {
        return c.redirect(`/admin/users?error=${encodeURIComponent('MFA is not enabled for this user')}`);
      }

      // Delete all MFA devices
      for (const device of devices) {
        await plugin.mfaDevicesResource.remove(device.id);
      }

      // Audit log
      await logAudit('mfa_disabled', {
        userId: user.id,
        by: 'admin',
        adminEmail: currentUser.email
      });

      if (config.verbose) {
        console.log(`[MFA] Admin ${currentUser.email} disabled MFA for user ${user.email}`);
      }

      return c.redirect(`/admin/users?success=${encodeURIComponent(`MFA disabled for ${user.email}`)}`);
    } catch (error) {
      console.error('[Identity Plugin] Admin disable MFA error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // POST /admin/users/:id/toggle-admin - Toggle admin role
  app.post('/admin/users/:id/toggle-admin', adminOnly(sessionManager), async (c) => {
    const userId = c.req.param('id');
    const currentUser = c.get('user');

    // Prevent self-role change
    if (userId === currentUser.id) {
      return c.redirect(`/admin/users?error=${encodeURIComponent('You cannot change your own role')}`);
    }

    try {
      const [okUser, errUser, user] = await tryFn(() =>
        usersResource.get(userId)
      );

      if (!okUser || !user) {
        return c.redirect(`/admin/users?error=${encodeURIComponent('User not found')}`);
      }

      const newRole = user.role === 'admin' ? 'user' : 'admin';

      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.patch(userId, { role: newRole })
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Toggle admin error:', errUpdate);
        return c.redirect(`/admin/users?error=${encodeURIComponent('Failed to change user role')}`);
      }

      const action = newRole === 'admin' ? 'granted admin privileges to' : 'removed admin privileges from';
      return c.redirect(`/admin/users?success=${encodeURIComponent(`Successfully ${action} ${user.name}`)}`);
    } catch (error) {
      console.error('[Identity Plugin] Toggle admin error:', error);
      return c.redirect(`/admin/users?error=${encodeURIComponent('An error occurred. Please try again.')}`);
    }
  });

  // ============================================================================
  // OAuth2 Consent Screen Routes (overrides OAuth2Server routes)
  // ============================================================================

  // GET /oauth/authorize - Show consent screen (session-based)
  app.get('/oauth/authorize', sessionAuth(sessionManager, { required: false }), async (c) => {
    const query = c.req.query();
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method = 'plain'
    } = query;

    try {
      // Validate required parameters
      if (!response_type || !client_id || !redirect_uri) {
        return c.html(OAuthErrorPage({
          error: 'invalid_request',
          errorDescription: 'Missing required parameters: response_type, client_id, and redirect_uri are required',
          config: uiConfig
        }), 400);
      }

      // Check if user is logged in
      const user = c.get('user');
      if (!user) {
        // Redirect to login with return URL
        const returnUrl = `/oauth/authorize?${new URLSearchParams(query).toString()}`;
        return c.redirect(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      }

      // Get client information
      const [okClient, errClient, clients] = await tryFn(() =>
        plugin.oauth2ClientsResource.query({ clientId: client_id })
      );

      if (!okClient || !clients || clients.length === 0) {
        return c.html(OAuthErrorPage({
          error: 'invalid_client',
          errorDescription: 'Client not found',
          config: uiConfig
        }), 400);
      }

      const client = clients[0];

      // Check if client is active
      if (client.active === false) {
        return c.html(OAuthErrorPage({
          error: 'unauthorized_client',
          errorDescription: 'This client is not currently active',
          config: uiConfig
        }), 400);
      }

      // Validate redirect_uri
      if (!client.redirectUris || !client.redirectUris.includes(redirect_uri)) {
        return c.html(OAuthErrorPage({
          error: 'invalid_request',
          errorDescription: 'The redirect_uri does not match any registered URIs for this client',
          config: uiConfig
        }), 400);
      }

      // Parse and validate scopes
      const requestedScopes = scope ? scope.split(' ') : [];
      if (requestedScopes.length > 0) {
        const invalidScopes = requestedScopes.filter(s =>
          !client.allowedScopes || !client.allowedScopes.includes(s)
        );

        if (invalidScopes.length > 0) {
          return c.html(OAuthErrorPage({
            error: 'invalid_scope',
            errorDescription: `Invalid scopes: ${invalidScopes.join(', ')}`,
            config: uiConfig
          }), 400);
        }
      }

      // Check if user has previously authorized this client with these scopes
      // For now, always show consent screen. In FASE 8, we'll implement "trust" feature.

      // Show consent screen
      const PageComponent = getPageComponent(customPages, 'consent', ConsentPage);
      return c.html(PageComponent({
        client,
        scopes: requestedScopes,
        user,
        responseType: response_type,
        redirectUri: redirect_uri,
        state,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        config: uiConfig
      }));
    } catch (error) {
      console.error('[Identity Plugin] OAuth authorize error:', error);
      return c.html(OAuthErrorPage({
        error: 'server_error',
        errorDescription: 'An error occurred while processing your request',
        config: uiConfig
      }), 500);
    }
  });

  // POST /oauth/consent - Process user consent decision
  app.post('/oauth/consent', sessionAuth(sessionManager, { required: true }), async (c) => {
    const body = await c.req.parseBody();
    const {
      decision,
      trust_application,
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method = 'plain'
    } = body;

    const user = c.get('user');

    try {
      // If user denied, redirect back with error
      if (decision === 'deny') {
        const errorParams = new URLSearchParams({
          error: 'access_denied',
          error_description: 'User denied authorization'
        });
        if (state) {
          errorParams.set('state', state);
        }
        return c.redirect(`${redirect_uri}?${errorParams.toString()}`);
      }

      // User approved - generate authorization code
      const authCode = generateAuthCode();
      const requestedScopes = scope ? scope.split(' ') : [];

      // Calculate expiration (10 minutes from now)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Store authorization code
      const [okCode, errCode] = await tryFn(() =>
        plugin.oauth2AuthCodesResource.insert({
          code: authCode,
          clientId: client_id,
          userId: user.id,
          redirectUri: redirect_uri,
          scope: requestedScopes,
          codeChallenge: code_challenge || null,
          codeChallengeMethod: code_challenge_method || 'plain',
          expiresAt,
          used: false,
          trusted: trust_application === '1'
        })
      );

      if (!okCode) {
        console.error('[Identity Plugin] Failed to store auth code:', errCode);
        return c.html(OAuthErrorPage({
          error: 'server_error',
          errorDescription: 'Failed to generate authorization code',
          config: uiConfig
        }), 500);
      }

      // If trust_application is enabled, store consent for future use
      if (trust_application === '1') {
        // Store consent record (implement in FASE 8 with proper consent tracking)
        // For now, the "trusted" flag is stored with the auth code
      }

      // Redirect back to client with authorization code
      const successParams = new URLSearchParams({
        code: authCode
      });
      if (state) {
        successParams.set('state', state);
      }

      return c.redirect(`${redirect_uri}?${successParams.toString()}`);
    } catch (error) {
      console.error('[Identity Plugin] OAuth consent error:', error);
      return c.html(`
        <html>
          <body>
            <h1>Server Error</h1>
            <p>An error occurred while processing your consent</p>
          </body>
        </html>
      `, 500);
    }
  });

  // ============================================================================
  // Email Verification Routes
  // ============================================================================

  // GET /verify-email - Verify email with token
  app.get('/verify-email', async (c) => {
    const token = c.req.query('token');
    const PageComponent = getPageComponent(customPages, 'verifyEmail', VerifyEmailPage);

    // If no token, show pending verification page
    if (!token) {
      return c.html(PageComponent({
        status: 'pending',
        config: uiConfig
      }));
    }

    try {
      // Find user with this verification token
      const [okUsers, errUsers, users] = await tryFn(() =>
        usersResource.query({ emailVerificationToken: token })
      );

      if (!okUsers || !users || users.length === 0) {
        // Token not found or invalid
        return c.html(PageComponent({
          status: 'error',
          message: 'Invalid verification link. It may have already been used or expired.',
          config: uiConfig
        }));
      }

      const user = users[0];

      // Check if email is already verified
      if (user.emailVerified) {
        return c.html(PageComponent({
          status: 'success',
          message: 'Your email is already verified! You can sign in now.',
          config: uiConfig
        }));
      }

      // Check if token is expired
      if (user.emailVerificationExpiry) {
        if (isExpired(user.emailVerificationExpiry)) {
          return c.html(PageComponent({
            status: 'expired',
            email: user.email,
            message: 'This verification link has expired. Please request a new one.',
            config: uiConfig
          }));
        }
      }

      // Verify the email
      const verificationUpdate = {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        active: true
      };

      if (supportsStatusField) {
        verificationUpdate.status = 'active';
      }

      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.update(user.id, verificationUpdate)
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Email verification update error:', errUpdate);
        return c.html(PageComponent({
          status: 'error',
          message: 'Failed to verify email. Please try again later.',
          config: uiConfig
        }));
      }

      // Email verified successfully
      return c.html(PageComponent({
        status: 'success',
        config: uiConfig
      }));
    } catch (error) {
      console.error('[Identity Plugin] Email verification error:', error);
      return c.html(PageComponent({
        status: 'error',
        message: 'An error occurred while verifying your email.',
        config: uiConfig
      }));
    }
  });

  // POST /verify-email/resend - Resend verification email
  app.post('/verify-email/resend', async (c) => {
    const body = await c.req.parseBody();
    const { email } = body;
    const PageComponent = getPageComponent(customPages, 'verifyEmail', VerifyEmailPage);

    if (!email) {
      return c.html(PageComponent({
        status: 'error',
        message: 'Email address is required.',
        config: uiConfig
      }));
    }

    try {
      // Find user by email
      const [okUsers, errUsers, users] = await tryFn(() =>
        usersResource.query({ email: email.toLowerCase().trim() })
      );

      if (!okUsers || !users || users.length === 0) {
        // Don't reveal that the email doesn't exist for security
        return c.html(PageComponent({
          status: 'pending',
          message: 'If an account exists with this email, a verification link has been sent.',
          config: uiConfig
        }));
      }

      const user = users[0];

      // Check if already verified
      if (user.emailVerified) {
        return c.html(PageComponent({
          status: 'success',
          message: 'Your email is already verified! You can sign in now.',
          config: uiConfig
        }));
      }

      // Generate new verification token
      const verificationToken = generatePasswordResetToken(); // Reuse token generator
      const verificationExpiry = calculateExpiration('24h'); // 24 hours

      // Update user with new token
      const [okUpdate, errUpdate] = await tryFn(() =>
        usersResource.update(user.id, {
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry
        })
      );

      if (!okUpdate) {
        console.error('[Identity Plugin] Verification token update error:', errUpdate);
        return c.html(PageComponent({
          status: 'error',
          message: 'Failed to send verification email. Please try again later.',
          config: uiConfig
        }));
      }

      // Send verification email
      if (plugin.emailService) {
        await plugin.emailService.sendEmailVerificationEmail({
          to: user.email,
          name: user.name,
          verificationToken
        });
      }

      return c.html(PageComponent({
        status: 'pending',
        email: user.email,
        message: 'A new verification link has been sent to your email address.',
        config: uiConfig
      }));
    } catch (error) {
      console.error('[Identity Plugin] Resend verification error:', error);
      return c.html(PageComponent({
        status: 'error',
        message: 'An error occurred. Please try again later.',
        config: uiConfig
      }));
    }
  });
}

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

export default registerUIRoutes;
