/**
 * Email Verification Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Render email verification page
 * @param {Object} props - Page properties
 * @param {string} [props.status] - Verification status (success, error, expired, pending)
 * @param {string} [props.email] - User email (for resend)
 * @param {string} [props.message] - Status message
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function VerifyEmailPage(props = {}) {
  const { status = 'pending', email = '', message = '', config = {} } = props;

  const statusConfig = {
    success: {
      icon: '✅',
      title: 'Email Verified!',
      color: 'var(--color-success)',
      defaultMessage: 'Your email address has been successfully verified.'
    },
    error: {
      icon: '❌',
      title: 'Verification Failed',
      color: 'var(--color-danger)',
      defaultMessage: 'The verification link is invalid or has already been used.'
    },
    expired: {
      icon: '⏰',
      title: 'Link Expired',
      color: 'var(--color-warning)',
      defaultMessage: 'This verification link has expired. Please request a new one.'
    },
    pending: {
      icon: '📧',
      title: 'Verify Your Email',
      color: 'var(--color-primary)',
      defaultMessage: 'Please check your email for a verification link.'
    }
  };

  const currentStatus = statusConfig[status] || statusConfig.pending;
  const displayMessage = message || currentStatus.defaultMessage;

  const content = html`
    <div class="container-sm">
      <div style="text-align: center; margin-bottom: 2rem;">
        ${config.logoUrl ? html`
          <img src="${config.logoUrl}" alt="Logo" style="max-width: 80px; margin-bottom: 1rem;" />
        ` : ''}
        <h1 style="font-size: 1.75rem; margin-bottom: 0.5rem;">${currentStatus.title}</h1>
      </div>

      <div class="card">
        <div class="p-3" style="text-align: center;">
          <div style="font-size: 4rem; margin-bottom: 1.5rem;">
            ${currentStatus.icon}
          </div>

          <div style="font-size: 1.125rem; color: var(--color-text); margin-bottom: 2rem;">
            ${displayMessage}
          </div>

          ${status === 'success' ? html`
            <div style="margin-bottom: 1.5rem;">
              <a href="/login" class="btn btn-primary">
                Sign In
              </a>
            </div>
            <div>
              <a href="/profile" style="color: var(--color-text-muted); font-size: 0.875rem;">
                Go to your profile
              </a>
            </div>
          ` : status === 'error' || status === 'expired' ? html`
            ${email ? html`
              <form method="POST" action="/verify-email/resend" style="margin-bottom: 1.5rem;">
                <input type="hidden" name="email" value="${email}" />
                <button type="submit" class="btn btn-primary">
                  Send New Verification Email
                </button>
              </form>
            ` : html`
              <div style="margin-bottom: 1.5rem;">
                <a href="/login" class="btn btn-primary">
                  Sign In to Resend
                </a>
              </div>
            `}
            <div>
              <a href="/login" style="color: var(--color-text-muted); font-size: 0.875rem;">
                Sign in
              </a>
            </div>
          ` : html`
            <!-- Pending status -->
            <div style="background-color: var(--color-light); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem;">
              <div style="font-weight: 600; margin-bottom: 0.5rem;">
                Didn't receive the email?
              </div>
              <ul style="text-align: left; color: var(--color-text-muted); font-size: 0.875rem; margin: 0; padding-left: 1.5rem;">
                <li>Check your spam or junk folder</li>
                <li>Make sure the email address is correct</li>
                <li>Wait a few minutes and check again</li>
              </ul>
            </div>

            ${email ? html`
              <form method="POST" action="/verify-email/resend" style="margin-bottom: 1.5rem;">
                <input type="hidden" name="email" value="${email}" />
                <button type="submit" class="btn btn-secondary">
                  Resend Verification Email
                </button>
              </form>
            ` : html`
              <div style="margin-bottom: 1.5rem;">
                <a href="/login" class="btn btn-secondary">
                  Sign In to Resend
                </a>
              </div>
            `}

            <div>
              <a href="/login" style="color: var(--color-text-muted); font-size: 0.875rem;">
                Back to sign in
              </a>
            </div>
          `}
        </div>
      </div>

      ${status === 'success' ? html`
        <div class="alert alert-success mt-4" style="text-align: center;">
          <strong>Your account is now fully activated!</strong><br>
          You can now access all features and services.
        </div>
      ` : ''}
    </div>
  `;

  return BaseLayout({
    title: currentStatus.title,
    content,
    config,
    user: null,
    error: null,
    success: null
  });
}

export default VerifyEmailPage;
