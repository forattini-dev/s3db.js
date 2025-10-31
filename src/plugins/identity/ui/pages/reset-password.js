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

  const inputClasses = [
    'block w-full rounded-2xl border bg-white/[0.08] px-4 py-3 text-base text-white',
    'shadow-[0_1px_0_rgba(255,255,255,0.06)] transition placeholder:text-slate-300/70 focus:outline-none focus:ring-2',
    error ? 'border-red-400/70 focus:border-red-400 focus:ring-red-400/40' : 'border-white/10 focus:border-white/40 focus:ring-white/30'
  ].join(' ');

  const content = html`
    <section class="mx-auto w-full max-w-lg text-slate-100">
      <div class="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-10 shadow-2xl shadow-slate-900/60 backdrop-blur">
        <div class="pointer-events-none absolute -right-20 -top-28 h-60 w-60 rounded-full bg-primary/25 blur-3xl"></div>
        <div class="pointer-events-none absolute -bottom-24 -left-28 h-56 w-56 rounded-full bg-secondary/20 blur-[120px]"></div>

        <div class="relative z-10 space-y-6">
          <header class="space-y-2 text-center">
            <h2 class="text-2xl font-semibold tracking-tight text-white">
              Set New Password
            </h2>
            <p class="text-sm text-slate-300">
              Choose a strong password to secure your account.
            </p>
          </header>

          <form method="POST" action="/reset-password" class="space-y-6">
            <input type="hidden" name="token" value="${token}" />

            <div class="space-y-2">
              <label for="password" class="text-sm font-semibold text-slate-200">
                New Password
              </label>
              <input
                type="password"
                class="${inputClasses}"
                id="password"
                name="password"
                required
                autofocus
                autocomplete="new-password"
                minlength="${minLength}"
                maxlength="${maxLength}"
              />
              <div class="rounded-2xl border border-white/5 bg-white/[0.06] px-4 py-3 text-xs leading-5 text-slate-200">
                <span class="font-semibold text-white/80">Must include:</span>
                <ul class="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                  ${requirements.map(req => html`<li>${req}</li>`)}
                </ul>
              </div>
            </div>

            <div class="space-y-2">
              <label for="confirm_password" class="text-sm font-semibold text-slate-200">
                Confirm New Password
              </label>
              <input
                type="password"
                class="${inputClasses}"
                id="confirm_password"
                name="confirm_password"
                required
                autocomplete="new-password"
              />
              ${error ? html`<p class="text-xs text-red-200">${error}</p>` : ''}
            </div>

            <button
              type="submit"
              class="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-primary via-primary to-secondary px-4 py-3 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30"
              style="box-shadow: 0 18px 45px var(--color-primary-glow);"
            >
              Reset Password
            </button>
          </form>

          <p class="text-center text-sm text-slate-300">
            Remember your password?
            <a href="/login" class="font-semibold text-primary transition hover:text-white">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </section>
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
