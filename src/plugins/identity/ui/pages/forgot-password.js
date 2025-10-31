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

  const inputClasses = [
    'block w-full rounded-2xl border bg-white/[0.08] px-4 py-3 text-base text-white',
    'shadow-[0_1px_0_rgba(255,255,255,0.06)] transition placeholder:text-slate-300/70 focus:outline-none focus:ring-2',
    error ? 'border-red-400/70 focus:border-red-400 focus:ring-red-400/40' : 'border-white/10 focus:border-white/40 focus:ring-white/30'
  ].join(' ');

  const content = html`
    <section class="mx-auto w-full max-w-lg text-slate-100">
      <div class="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-10 shadow-2xl shadow-slate-900/60 backdrop-blur">
        <div class="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/25 blur-3xl"></div>
        <div class="pointer-events-none absolute -bottom-20 -left-28 h-52 w-52 rounded-full bg-secondary/20 blur-[120px]"></div>

        <div class="relative z-10 space-y-6">
          <header class="space-y-2 text-center">
            <h2 class="text-2xl font-semibold tracking-tight text-white">
              Reset Password
            </h2>
            <p class="text-sm text-slate-300">
              Enter your email and we'll send instructions to reset your password.
            </p>
          </header>

          ${success ? html`
            <div class="space-y-6">
              <div class="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-4 text-sm leading-6 text-emerald-100 shadow-lg shadow-emerald-900/30">
                ${success}
              </div>
              <div class="text-center text-sm text-slate-300">
                <a href="/login" class="font-semibold text-primary transition hover:text-white">
                  Back to Sign In
                </a>
              </div>
            </div>
          ` : html`
            <form method="POST" action="/forgot-password" class="space-y-6">
              <div class="space-y-2">
                <label for="email" class="text-sm font-semibold text-slate-200">
                  Email address
                </label>
                <input
                  type="email"
                  class="${inputClasses}"
                  id="email"
                  name="email"
                  value="${email}"
                  required
                  autofocus
                  autocomplete="email"
                />
                ${error ? html`
                  <p class="text-xs text-red-200">${error}</p>
                ` : ''}
              </div>

              <button
                type="submit"
                class="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-primary via-primary to-secondary px-4 py-3 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30"
                style="box-shadow: 0 18px 45px var(--color-primary-glow);"
              >
                Send Reset Link
              </button>
            </form>

            <p class="text-center text-sm text-slate-300">
              Remember your password?
              <a href="/login" class="font-semibold text-primary transition hover:text-white">
                Sign in
              </a>
            </p>
          `}
        </div>
      </div>
    </section>
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
