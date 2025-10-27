/**
 * Registration Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Render registration page
 * @param {Object} props - Page properties
 * @param {string} [props.error] - Error message
 * @param {string} [props.email] - Pre-filled email
 * @param {string} [props.name] - Pre-filled name
 * @param {Object} [props.passwordPolicy] - Password policy configuration
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function RegisterPage(props = {}) {
  const { error = null, email = '', name = '', passwordPolicy = {}, config = {} } = props;

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
            Create Account
          </div>

          <form method="POST" action="/register">
            <div class="form-group">
              <label for="name" class="form-label form-label-required">Full Name</label>
              <input
                type="text"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="name"
                name="name"
                value="${name}"
                required
                autofocus
                autocomplete="name"
                minlength="2"
                maxlength="100"
              />
            </div>

            <div class="form-group">
              <label for="email" class="form-label form-label-required">Email address</label>
              <input
                type="email"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="email"
                name="email"
                value="${email}"
                required
                autocomplete="email"
              />
              <small class="form-text">We'll send you a verification email</small>
            </div>

            <div class="form-group">
              <label for="password" class="form-label form-label-required">Password</label>
              <input
                type="password"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="password"
                name="password"
                required
                autocomplete="new-password"
                minlength="${minLength}"
                maxlength="${maxLength}"
              />
              <small class="form-text">
                Must contain: ${requirements.join(', ')}
              </small>
            </div>

            <div class="form-group">
              <label for="confirm_password" class="form-label form-label-required">Confirm Password</label>
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

            <div class="form-group">
              <div class="form-check">
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="agree_terms"
                  name="agree_terms"
                  value="1"
                  required
                />
                <label class="form-check-label" for="agree_terms">
                  I agree to the <a href="/terms" class="btn-link" target="_blank">Terms of Service</a> and <a href="/privacy" class="btn-link" target="_blank">Privacy Policy</a>
                </label>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block">
              Create Account
            </button>
          </form>

          <div class="auth-links">
            <p class="mt-3">
              Already have an account? <a href="/login" class="btn-link">Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  return BaseLayout({
    title: 'Create Account',
    content,
    config,
    error: null // Error shown in form
  });
}

export default RegisterPage;
