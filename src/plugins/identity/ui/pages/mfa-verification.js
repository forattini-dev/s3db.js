/**
 * MFA Verification Page
 * Shows 6-digit TOTP input or backup code entry
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Render MFA verification page
 * @param {Object} props - Page properties
 * @param {string} [props.error] - Error message
 * @param {string} props.token - Temporary auth token
 * @param {string} [props.remember] - Remember me flag
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function MFAVerificationPage(props = {}) {
  const { error = null, token, remember = '', config = {} } = props;

  const content = html`
    <section class="identity-login">
      <!-- Left panel with branding -->
      <aside class="identity-login__panel">
        <div class="identity-login__panel-content">
          <div class="identity-login__brand">
            ${config.logoUrl ? html`
              <img src="${config.logoUrl}" alt="${config.title || 'Identity Logo'}" class="identity-login__brand-logo" />
            ` : ''}
            <span class="identity-login__badge">
              Identity
            </span>
          </div>

          <div class="identity-login__panel-main">
            <h1 class="identity-login__panel-title">🔐 Two-Factor Authentication</h1>
            <p class="identity-login__panel-text">
              An extra layer of security to keep your account safe.
            </p>
          </div>
        </div>

        <footer class="identity-login__panel-footer">
          ${config.footerText || `© ${new Date().getFullYear()} ${config.legalName || config.companyName || 'S3DB Corp'} • All rights reserved`}
        </footer>
      </aside>

      <!-- Right form area -->
      <div class="identity-login__form">
        <header class="identity-login__form-header">
          <h2>Verify Your Identity</h2>
          <p>Enter the 6-digit code from your authenticator app.</p>
        </header>

        ${error ? html`
          <div class="identity-login__alert identity-login__alert--error">
            ${error}
          </div>
        ` : ''}

        <!-- TOTP Token Form -->
        <form method="POST" action="/login" class="identity-login__form-body" id="mfa-form">
          <input type="hidden" name="token" value="${token}" />
          <input type="hidden" name="remember" value="${remember}" />

          <div class="identity-login__group">
            <label for="mfa_token">Verification Code</label>
            <input
              type="text"
              class="identity-login__input text-center text-2xl tracking-widest"
              id="mfa_token"
              name="mfa_token"
              pattern="[0-9]{6}"
              maxlength="6"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="000000"
              required
              autofocus
            />
            <p class="mt-2 text-sm text-slate-400">
              The code refreshes every 30 seconds
            </p>
          </div>

          <button type="submit" class="identity-login__submit">
            Verify
          </button>
        </form>

        <!-- Backup Code Link -->
        <div class="identity-login__divider"><span>or</span></div>

        <button
          type="button"
          onclick="showBackupCodeForm()"
          class="w-full rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3 text-sm font-medium text-slate-300 transition-all hover:border-slate-600/50 hover:bg-slate-800/50"
        >
          Lost your device? Use backup code
        </button>

        <!-- Backup Code Form (hidden by default) -->
        <form method="POST" action="/login" class="identity-login__form-body mt-6 hidden" id="backup-code-form">
          <input type="hidden" name="token" value="${token}" />
          <input type="hidden" name="remember" value="${remember}" />

          <div class="identity-login__group">
            <label for="backup_code">Backup Code</label>
            <input
              type="text"
              class="identity-login__input text-center uppercase tracking-wider"
              id="backup_code"
              name="backup_code"
              maxlength="16"
              autocomplete="off"
              placeholder="XXXXXXXX"
              style="text-transform: uppercase;"
            />
            <p class="mt-2 text-sm text-slate-400">
              Enter one of your 8-character backup codes
            </p>
          </div>

          <button type="submit" class="identity-login__submit">
            Verify with Backup Code
          </button>

          <button
            type="button"
            onclick="showMFAForm()"
            class="mt-3 w-full rounded-xl border border-slate-700/50 bg-transparent px-4 py-3 text-sm font-medium text-slate-300 transition-all hover:border-slate-600/50 hover:bg-slate-800/30"
          >
            ← Back to authenticator
          </button>
        </form>

        <!-- Back to Login Link -->
        <p class="identity-login__meta mt-6">
          <a href="/login">← Back to login</a>
        </p>
      </div>
    </section>

    <script>
      function showBackupCodeForm() {
        document.getElementById('mfa-form').classList.add('hidden');
        document.getElementById('backup-code-form').classList.remove('hidden');
        document.getElementById('backup_code').focus();
      }

      function showMFAForm() {
        document.getElementById('mfa-form').classList.remove('hidden');
        document.getElementById('backup-code-form').classList.add('hidden');
        document.getElementById('mfa_token').focus();
      }
    </script>
  `;

  return BaseLayout({
    title: 'Two-Factor Authentication',
    content,
    config,
    error: null, // Error shown in form
    success: null
  });
}

export default MFAVerificationPage;
