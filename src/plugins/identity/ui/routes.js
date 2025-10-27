/**
 * Identity Provider UI Routes
 * Handles login, registration, logout, and other UI endpoints
 */

import { LoginPage } from './pages/login.js';
import { RegisterPage } from './pages/register.js';
import { hashPassword, verifyPassword, validatePassword } from '../concerns/password.js';
import { tryFn } from '../../../concerns/try-fn.js';

/**
 * Register all UI routes
 * @param {Object} app - Hono app instance
 * @param {Object} plugin - IdentityPlugin instance
 */
export function registerUIRoutes(app, plugin) {
  const { sessionManager, usersResource, config } = plugin;

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

    return c.html(LoginPage({
      error: error ? decodeURIComponent(error) : null,
      success: success ? decodeURIComponent(success) : null,
      email,
      config: config.ui
    }));
  });

  // ============================================================================
  // POST /login - Handle login form submission
  // ============================================================================
  app.post('/login', async (c) => {
    try {
      const body = await c.req.parseBody();
      const { email, password, remember } = body;

      // Validate input
      if (!email || !password) {
        return c.redirect(`/login?error=${encodeURIComponent('Email and password are required')}&email=${encodeURIComponent(email || '')}`);
      }

      // Find user by email
      const [okQuery, errQuery, users] = await tryFn(() =>
        usersResource.query({ email: email.toLowerCase().trim() })
      );

      if (!okQuery || users.length === 0) {
        // Don't reveal whether user exists (timing attack protection)
        await new Promise(resolve => setTimeout(resolve, 100));
        return c.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}&email=${encodeURIComponent(email)}`);
      }

      const user = users[0];

      // Verify password
      const [okVerify, errVerify, isValid] = await tryFn(() =>
        verifyPassword(password, user.passwordHash)
      );

      if (!okVerify || !isValid) {
        return c.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}&email=${encodeURIComponent(email)}`);
      }

      // Check if user is active
      if (user.status !== 'active') {
        const message = user.status === 'suspended'
          ? 'Your account has been suspended. Please contact support.'
          : 'Your account is inactive. Please verify your email or contact support.';
        return c.redirect(`/login?error=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}`);
      }

      // Get request metadata
      const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
                        c.req.header('x-real-ip') ||
                        'unknown';
      const userAgent = c.req.header('user-agent') || 'unknown';

      // Create session
      const sessionExpiry = remember === '1' ? '30d' : config.session.sessionExpiry;
      const [okSession, errSession, session] = await tryFn(() =>
        sessionManager.createSession({
          userId: user.id,
          metadata: {
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin || false
          },
          ipAddress,
          userAgent,
          expiresIn: sessionExpiry
        })
      );

      if (!okSession) {
        if (config.verbose) {
          console.error('[Identity Plugin] Failed to create session:', errSession);
        }
        return c.redirect(`/login?error=${encodeURIComponent('Failed to create session. Please try again.')}&email=${encodeURIComponent(email)}`);
      }

      // Set session cookie
      sessionManager.setSessionCookie(c, session.id, session.expiresAt);

      // Update last login timestamp
      await tryFn(() =>
        usersResource.patch(user.id, {
          lastLoginAt: new Date().toISOString(),
          lastLoginIp: ipAddress
        })
      );

      // Redirect to original destination or profile
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
  // GET /register - Show registration form
  // ============================================================================
  app.get('/register', async (c) => {
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

    return c.html(RegisterPage({
      error: error ? decodeURIComponent(error) : null,
      email,
      name,
      passwordPolicy: config.passwordPolicy,
      config: config.ui
    }));
  });

  // ============================================================================
  // POST /register - Handle registration form submission
  // ============================================================================
  app.post('/register', async (c) => {
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

      // Check if email already exists
      const normalizedEmail = email.toLowerCase().trim();
      const [okCheck, errCheck, existingUsers] = await tryFn(() =>
        usersResource.query({ email: normalizedEmail })
      );

      if (okCheck && existingUsers.length > 0) {
        return c.redirect(`/register?error=${encodeURIComponent('An account with this email already exists')}&name=${encodeURIComponent(name)}`);
      }

      // Hash password
      const [okHash, errHash, passwordHash] = await tryFn(() =>
        hashPassword(password, config.passwordPolicy.bcryptRounds)
      );

      if (!okHash) {
        if (config.verbose) {
          console.error('[Identity Plugin] Password hashing failed:', errHash);
        }
        return c.redirect(`/register?error=${encodeURIComponent('Failed to process password. Please try again.')}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
      }

      // Get request metadata
      const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
                        c.req.header('x-real-ip') ||
                        'unknown';

      // Create user
      const [okUser, errUser, user] = await tryFn(() =>
        usersResource.insert({
          email: normalizedEmail,
          name: name.trim(),
          passwordHash,
          status: 'pending_verification', // Requires email verification
          isAdmin: false,
          emailVerified: false,
          registrationIp: ipAddress,
          lastLoginAt: null,
          lastLoginIp: null
        })
      );

      if (!okUser) {
        if (config.verbose) {
          console.error('[Identity Plugin] User creation failed:', errUser);
        }
        return c.redirect(`/register?error=${encodeURIComponent('Failed to create account. Please try again.')}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
      }

      // TODO: Send verification email (FASE 8)

      // Redirect to login with success message
      return c.redirect(`/login?success=${encodeURIComponent('Account created successfully! Please check your email to verify your account.')}&email=${encodeURIComponent(normalizedEmail)}`);

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
}

export default registerUIRoutes;
