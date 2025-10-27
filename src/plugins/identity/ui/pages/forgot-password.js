/**
 * Forgot Password Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Render forgot password page
 * @param {Object} props - Page properties
 * @param {string} [props.error] - Error message
 * @param {string} [props.success] - Success message
 * @param {string} [props.email] - Pre-filled email
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function ForgotPasswordPage(props = {}) {
  const { error = null, success = null, email = '', config = {} } = props;

  const content = html`
    <div class="auth-container">
      <div class="auth-card">
        <div class="card">
          <div class="card-header">
            Reset Password
          </div>

          ${success ? html`
            <div class="alert alert-success" role="alert">
              ${success}
            </div>
            <div class="auth-links">
              <p class="mt-3">
                <a href="/login" class="btn-link">Back to Sign In</a>
              </p>
            </div>
          ` : html`
            <p class="text-muted mb-3">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form method="POST" action="/forgot-password">
              <div class="form-group">
                <label for="email" class="form-label form-label-required">Email address</label>
                <input
                  type="email"
                  class="form-control ${error ? 'is-invalid' : ''}"
                  id="email"
                  name="email"
                  value="${email}"
                  required
                  autofocus
                  autocomplete="email"
                />
                ${error ? html`<div class="invalid-feedback">${error}</div>` : ''}
              </div>

              <button type="submit" class="btn btn-primary btn-block">
                Send Reset Link
              </button>
            </form>

            <div class="auth-links">
              <p class="mt-3">
                Remember your password? <a href="/login" class="btn-link">Sign in</a>
              </p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  return BaseLayout({
    title: 'Reset Password',
    content,
    config,
    error: null, // Error shown in form
    success: null // Success shown in form
  });
}

export default ForgotPasswordPage;
