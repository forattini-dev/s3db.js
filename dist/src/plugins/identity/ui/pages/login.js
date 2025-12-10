/**
 * Login Page
 */
import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';
export function LoginPage(props = {}) {
    const { error = null, success = null, email = '', config = {} } = props;
    const companyName = config.companyName || 'S3DB';
    const legalName = config.legalName || config.companyName || 'S3DB Corp';
    const heroTitle = config.heroTitle || companyName;
    const heroSubtitle = config.welcomeMessage || config.heroSubtitle || 'Welcome back!';
    const currentYear = new Date().getFullYear();
    const heroFooter = config.heroFooter || `© ${currentYear} ${legalName} • All rights reserved`;
    const content = html `
    <section class="identity-login">
      <aside class="identity-login__panel">
        <div class="identity-login__panel-content">
          <div class="identity-login__brand">
            ${config.logoUrl ? html `
              <img src="${config.logoUrl}" alt="${config.title || 'Identity Logo'}" class="identity-login__brand-logo" />
            ` : ''}
            <span class="identity-login__badge">
              Identity
            </span>
          </div>

          <div class="identity-login__panel-main">
            <h1 class="identity-login__panel-title">${heroTitle}</h1>
            <p class="identity-login__panel-text">
              ${heroSubtitle}
            </p>
          </div>
        </div>

        <footer class="identity-login__panel-footer">
          ${heroFooter}
        </footer>
      </aside>

      <div class="identity-login__form">
        <header class="identity-login__form-header">
          <h2>Sign in to your account</h2>
          <p>Enter your credentials to access your workspace.</p>
        </header>

        ${error ? html `
          <div class="identity-login__alert identity-login__alert--error">
            ${error}
          </div>
        ` : ''}

        <form method="POST" action="/login" class="identity-login__form-body">
          <div class="identity-login__group">
            <label for="email">Email Address</label>
            <input
              type="email"
              class="identity-login__input"
              id="email"
              name="email"
              value="${email}"
              required
              autofocus
              autocomplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div class="identity-login__group">
            <label for="password">Password</label>
            <input
              type="password"
              class="identity-login__input"
              id="password"
              name="password"
              required
              autocomplete="current-password"
              placeholder="Enter your password"
            />
          </div>

          <div class="identity-login__options">
            <label class="identity-login__checkbox">
              <input
                type="checkbox"
                id="remember"
                name="remember"
                value="1"
              />
              <span>Remember me</span>
            </label>
            <a href="/forgot-password" class="identity-login__forgot">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            class="identity-login__submit"
          >
            Sign In
          </button>
        </form>

        <div class="identity-login__divider"><span>or</span></div>

        ${config.registrationEnabled !== false ? html `
          <p class="identity-login__meta">
            Don't have an account?
            <a href="/register">Sign up</a>
          </p>
        ` : ''}

        ${config.supportEmail ? html `
          <p class="identity-login__support">
            Need help? <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>
          </p>
        ` : ''}
      </div>
    </section>
  `;
    return BaseLayout({
        title: 'Sign In',
        content: content,
        config,
        error: null,
        success: success
    });
}
export default LoginPage;
//# sourceMappingURL=login.js.map