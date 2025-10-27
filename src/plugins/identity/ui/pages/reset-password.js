/**
 * Reset Password Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Render reset password page
 * @param {Object} props - Page properties
 * @param {string} [props.error] - Error message
 * @param {string} [props.token] - Reset token from URL
 * @param {Object} [props.passwordPolicy] - Password policy configuration
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function ResetPasswordPage(props = {}) {
  const { error = null, token = '', passwordPolicy = {}, config = {} } = props;

  // Extract password policy
  const minLength = passwordPolicy.minLength || 8;
  const maxLength = passwordPolicy.maxLength || 128;
  const requireUppercase = passwordPolicy.requireUppercase !== false;
  const requireLowercase = passwordPolicy.requireLowercase !== false;
  const requireNumbers = passwordPolicy.requireNumbers !== false;
  const requireSymbols = passwordPolicy.requireSymbols || false;

  // Build password requirements text
  const requirements = [];
  requirements.push(`${minLength}-${maxLength} characters`);
  if (requireUppercase) requirements.push('uppercase letter');
  if (requireLowercase) requirements.push('lowercase letter');
  if (requireNumbers) requirements.push('number');
  if (requireSymbols) requirements.push('symbol');

  const content = html`
    <div class="auth-container">
      <div class="auth-card">
        <div class="card">
          <div class="card-header">
            Set New Password
          </div>

          <p class="text-muted mb-3">
            Choose a strong password for your account.
          </p>

          <form method="POST" action="/reset-password">
            <input type="hidden" name="token" value="${token}" />

            <div class="form-group">
              <label for="password" class="form-label form-label-required">New Password</label>
              <input
                type="password"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="password"
                name="password"
                required
                autofocus
                autocomplete="new-password"
                minlength="${minLength}"
                maxlength="${maxLength}"
              />
              <small class="form-text">
                Must contain: ${requirements.join(', ')}
              </small>
            </div>

            <div class="form-group">
              <label for="confirm_password" class="form-label form-label-required">Confirm New Password</label>
              <input
                type="password"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="confirm_password"
                name="confirm_password"
                required
                autocomplete="new-password"
              />
              ${error ? html`<div class="invalid-feedback">${error}</div>` : ''}
            </div>

            <button type="submit" class="btn btn-primary btn-block">
              Reset Password
            </button>
          </form>

          <div class="auth-links">
            <p class="mt-3">
              Remember your password? <a href="/login" class="btn-link">Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  return BaseLayout({
    title: 'Set New Password',
    content,
    config,
    error: null, // Error shown in form
    success: null
  });
}

export default ResetPasswordPage;
