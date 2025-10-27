/**
 * Example: Custom Login Page Override
 *
 * Demonstrates how to create a completely custom login page
 * while maintaining the Identity Provider functionality.
 *
 * Usage:
 *   node docs/examples/e86-custom-login-page.js
 */

import { Database } from '../../src/index.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';
import { html } from 'hono/html';

const db = new Database({
  connectionString: process.env.MRT_CONNECTION_STRING || 'http://minioadmin:minioadmin@localhost:9100/s3db-identity-demo'
});

// ============================================================================
// CUSTOM LOGIN PAGE
// ============================================================================

/**
 * Custom Login Page - Completely different design!
 * You have full control over the HTML/CSS
 */
function MyCustomLoginPage(props = {}) {
  const { error = null, success = null, email = '', config = {} } = props;

  // Your custom HTML - can be anything!
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - ${config.companyName || 'My App'}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .login-container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      width: 100%;
      max-width: 900px;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .login-left {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 3rem;
      color: white;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .login-left h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }

    .login-left p {
      font-size: 1.125rem;
      opacity: 0.9;
      line-height: 1.6;
    }

    .login-right {
      padding: 3rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .login-right h2 {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
      color: #333;
    }

    .login-right .subtitle {
      color: #666;
      margin-bottom: 2rem;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #333;
      font-weight: 600;
    }

    .form-group input {
      width: 100%;
      padding: 0.875rem;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 1rem;
      transition: all 0.3s ease;
    }

    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .form-options {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }

    .form-options label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #666;
    }

    .form-options a {
      color: #667eea;
      text-decoration: none;
    }

    .form-options a:hover {
      text-decoration: underline;
    }

    .btn-login {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }

    .btn-login:active {
      transform: translateY(0);
    }

    .divider {
      text-align: center;
      margin: 1.5rem 0;
      color: #999;
      position: relative;
    }

    .divider::before,
    .divider::after {
      content: '';
      position: absolute;
      top: 50%;
      width: 45%;
      height: 1px;
      background: #e0e0e0;
    }

    .divider::before {
      left: 0;
    }

    .divider::after {
      right: 0;
    }

    .register-link {
      text-align: center;
      margin-top: 1.5rem;
      color: #666;
    }

    .register-link a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
    }

    .register-link a:hover {
      text-decoration: underline;
    }

    .alert {
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }

    .alert-error {
      background: #fee;
      color: #c33;
      border: 1px solid #fcc;
    }

    .alert-success {
      background: #efe;
      color: #3c3;
      border: 1px solid #cfc;
    }

    @media (max-width: 768px) {
      .login-container {
        grid-template-columns: 1fr;
      }

      .login-left {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="login-container">
    <!-- Left side - Branding -->
    <div class="login-left">
      <h1>🚀 ${config.companyName || 'Welcome'}</h1>
      <p>${config.tagline || 'Secure authentication for modern applications'}</p>
    </div>

    <!-- Right side - Login Form -->
    <div class="login-right">
      <h2>Sign In</h2>
      <p class="subtitle">Enter your credentials to continue</p>

      ${error ? html`
        <div class="alert alert-error">
          ⚠️ ${error}
        </div>
      ` : ''}

      ${success ? html`
        <div class="alert alert-success">
          ✓ ${success}
        </div>
      ` : ''}

      <form method="POST" action="/login">
        <div class="form-group">
          <label for="email">Email Address</label>
          <input
            type="email"
            id="email"
            name="email"
            value="${email}"
            required
            autofocus
            placeholder="you@example.com"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            required
            placeholder="Enter your password"
          />
        </div>

        <div class="form-options">
          <label>
            <input type="checkbox" name="remember_me" value="1" />
            Remember me
          </label>
          <a href="/forgot-password">Forgot password?</a>
        </div>

        <button type="submit" class="btn-login">
          Sign In
        </button>
      </form>

      <div class="divider">or</div>

      <div class="register-link">
        Don't have an account? <a href="/register">Create one</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// SETUP WITH CUSTOM PAGE
// ============================================================================

async function main() {
  await db.initialize();

  const identityPlugin = new IdentityPlugin({
    issuer: 'http://localhost:4000',
    database: db,

    // UI Configuration with custom page
    ui: {
      // Branding (passed to custom page via config prop)
      companyName: 'S3dbCorp',
      tagline: 'Secure Cloud Identity Solutions',

      // 🎨 CUSTOM PAGES - Override any page you want!
      customPages: {
        login: MyCustomLoginPage,
        // You can override any page:
        // register: MyCustomRegisterPage,
        // profile: MyCustomProfilePage,
        // forgotPassword: MyCustomForgotPasswordPage,
        // resetPassword: MyCustomResetPasswordPage,
        // consent: MyCustomConsentPage,
        // verifyEmail: MyCustomVerifyEmailPage,
        // etc...
      }
    },

    server: {
      port: 4000,
      host: '0.0.0.0',
      verbose: true
    }
  });

  await identityPlugin.initialize();

  console.log('\n🎨 Custom Login Page Example');
  console.log('━'.repeat(60));
  console.log('');
  console.log('🌐  Login:  http://localhost:4000/login');
  console.log('');
  console.log('✨ The login page now uses your custom design!');
  console.log('');
  console.log('You have complete control over:');
  console.log('  • HTML structure');
  console.log('  • CSS styling');
  console.log('  • Layout design');
  console.log('  • Branding elements');
  console.log('');
  console.log('The form still works with the backend!');
  console.log('');
  console.log('━'.repeat(60));
  console.log('\nPress Ctrl+C to stop the server\n');
}

main().catch(console.error);
