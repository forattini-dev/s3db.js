/**
 * Login Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Render login page
 * @param {Object} props - Page properties
 * @param {string} [props.error] - Error message
 * @param {string} [props.success] - Success message
 * @param {string} [props.email] - Pre-filled email (e.g., after registration)
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function LoginPage(props = {}) {
  const { error = null, success = null, email = '', config = {} } = props;

  const content = html`
    <div class="auth-container">
      <div class="auth-card">
        <div class="card">
          <div class="card-header">
            Sign In
          </div>

          <form method="POST" action="/login">
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
            </div>

            <div class="form-group">
              <label for="password" class="form-label form-label-required">Password</label>
              <input
                type="password"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="password"
                name="password"
                required
                autocomplete="current-password"
              />
              ${error ? html`<div class="invalid-feedback">${error}</div>` : ''}
            </div>

            <div class="form-group">
              <div class="form-check">
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="remember"
                  name="remember"
                  value="1"
                />
                <label class="form-check-label" for="remember">
                  Remember me
                </label>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block">
              Sign In
            </button>
          </form>

          <div class="auth-links">
            <p class="text-muted">
              <a href="/forgot-password" class="btn-link">Forgot your password?</a>
            </p>
            <p class="mt-3">
              Don't have an account? <a href="/register" class="btn-link">Sign up</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  return BaseLayout({
    title: 'Sign In',
    content,
    config,
    error: null, // Error shown in form
    success: success // Success shown at top
  });
}

export default LoginPage;
