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

  const primaryButtonClasses = [
    'inline-flex items-center justify-center rounded-2xl bg-gradient-to-r',
    'from-primary via-primary to-secondary px-6 py-3 text-sm font-semibold text-white',
    'transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30'
  ].join(' ');

  const secondaryButtonClasses = [
    'inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06]',
    'px-6 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-white/[0.12]',
    'focus:outline-none focus:ring-2 focus:ring-white/20'
  ].join(' ');

  const content = html`
    <section class="mx-auto w-full max-w-3xl text-slate-100">
      <div class="flex flex-col items-center gap-4 pb-8 text-center">
        ${config.logoUrl ? html`
          <img src="${config.logoUrl}" alt="${config.title || 'Identity Logo'}" class="h-14 w-auto" />
        ` : ''}
        <h1 class="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          ${currentStatus.title}
        </h1>
      </div>

      <div class="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 px-10 py-12 text-center shadow-2xl shadow-slate-900/60 backdrop-blur">
        <div class="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-primary/25 blur-3xl"></div>
        <div class="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-secondary/25 blur-[120px]"></div>

        <div class="relative z-10 space-y-8">
          <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-4xl">
            ${currentStatus.icon}
          </div>

          <p class="text-base text-slate-200 md:text-lg" style="color: ${currentStatus.color};">
            ${displayMessage}
          </p>

          ${status === 'success' ? html`
            <div class="space-y-4">
              <a href="/login" class="${primaryButtonClasses}" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
                Sign In
              </a>
              <div class="text-sm text-slate-300">
                <a href="/profile" class="font-semibold text-primary transition hover:text-white">
                  Go to your profile
                </a>
              </div>
            </div>
          ` : status === 'error' || status === 'expired' ? html`
            <div class="space-y-6">
              ${email ? html`
                <form method="POST" action="/verify-email/resend">
                  <input type="hidden" name="email" value="${email}" />
                  <button type="submit" class="${primaryButtonClasses}" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
                    Send New Verification Email
                  </button>
                </form>
              ` : html`
                <a href="/login" class="${primaryButtonClasses}" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
                  Sign In to Resend
                </a>
              `}
              <div class="text-sm text-slate-300">
                <a href="/login" class="font-semibold text-primary transition hover:text-white">
                  Sign in
                </a>
              </div>
            </div>
          ` : html`
            <div class="space-y-6">
              <div class="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-5 text-left text-sm text-slate-200">
                <p class="mb-2 font-semibold text-white/90">
                  Didn't receive the email?
                </p>
                <ul class="list-disc space-y-1 pl-5 text-slate-300">
                  <li>Check your spam or junk folder</li>
                  <li>Make sure the email address is correct</li>
                  <li>Wait a few minutes and check again</li>
                </ul>
              </div>

              ${email ? html`
                <form method="POST" action="/verify-email/resend">
                  <input type="hidden" name="email" value="${email}" />
                  <button type="submit" class="${secondaryButtonClasses}">
                    Resend Verification Email
                  </button>
                </form>
              ` : html`
                <a href="/login" class="${secondaryButtonClasses}">
                  Sign In to Resend
                </a>
              `}

              <div class="text-sm text-slate-300">
                <a href="/login" class="font-semibold text-primary transition hover:text-white">
                  Back to sign in
                </a>
              </div>
            </div>
          `}
        </div>
      </div>

      ${status === 'success' ? html`
        <div class="mt-6 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-6 py-5 text-center text-sm leading-6 text-emerald-100 shadow-lg shadow-emerald-900/30">
          <strong>Your account is now fully activated!</strong><br>
          You can now access all features and services.
        </div>
      ` : ''}
    </section>
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
