/**
 * Registration Page
 */

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { BaseLayout, type ThemeConfig } from '../layouts/base.js';

export interface PasswordPolicy {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSymbols?: boolean;
}

export interface RegisterPageProps {
  error?: string | null;
  email?: string;
  name?: string;
  passwordPolicy?: PasswordPolicy;
  config?: ThemeConfig;
}

export function RegisterPage(props: RegisterPageProps = {}): HtmlEscapedString {
  const { error = null, email = '', name = '', passwordPolicy = {}, config = {} } = props;

  const companyName = config.companyName || 'S3DB';

  const minLength = passwordPolicy.minLength || 8;
  const maxLength = passwordPolicy.maxLength || 128;
  const requireUppercase = passwordPolicy.requireUppercase !== false;
  const requireLowercase = passwordPolicy.requireLowercase !== false;
  const requireNumbers = passwordPolicy.requireNumbers !== false;
  const requireSymbols = passwordPolicy.requireSymbols || false;

  const requirements: string[] = [];
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

  const checkboxClasses = [
    'h-5 w-5 rounded border-white/30 bg-slate-900/70 text-primary',
    'focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 focus:outline-none'
  ].join(' ');

  const content = html`
    <section class="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 text-slate-100 md:flex-row md:items-start md:justify-between">
      <div class="order-2 w-full max-w-xl md:order-1">
        <div class="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-10 shadow-2xl shadow-slate-900/60 backdrop-blur">
          <div class="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/25 blur-3xl"></div>
          <div class="pointer-events-none absolute -bottom-28 -left-24 h-56 w-56 rounded-full bg-secondary/20 blur-[120px]"></div>

          <div class="relative z-10 space-y-8">
            <header class="space-y-2 text-center">
              <h2 class="text-2xl font-semibold tracking-tight text-white">
                Create Account
              </h2>
              <p class="text-sm text-slate-300">
                Join ${companyName} Identity to access all secure services.
              </p>
            </header>

            ${error ? html`
              <div class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100 shadow-md shadow-red-900/30">
                ${error}
              </div>
            ` : ''}

            <form method="POST" action="/register" class="space-y-6">
              <div class="space-y-2">
                <label for="name" class="text-sm font-semibold text-slate-200">
                  Full Name
                </label>
                <input
                  type="text"
                  class="${inputClasses}"
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
                  autocomplete="email"
                />
                <p class="text-xs text-slate-400">
                  We'll send you a verification email to confirm your account.
                </p>
              </div>

              <div class="space-y-2">
                <label for="password" class="text-sm font-semibold text-slate-200">
                  Password
                </label>
                <input
                  type="password"
                  class="${inputClasses}"
                  id="password"
                  name="password"
                  required
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
                  Confirm Password
                </label>
                <input
                  type="password"
                  class="${inputClasses}"
                  id="confirm_password"
                  name="confirm_password"
                  required
                  autocomplete="new-password"
                />
              </div>

              <label class="flex items-start gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  class="${checkboxClasses} mt-0.5"
                  id="agree_terms"
                  name="agree_terms"
                  value="1"
                  required
                />
                <span>
                  I agree to the
                  <a href="/terms" class="font-semibold text-primary transition hover:text-white" target="_blank">Terms of Service</a>
                  and
                  <a href="/privacy" class="font-semibold text-primary transition hover:text-white" target="_blank">Privacy Policy</a>.
                </span>
              </label>

              <button
                type="submit"
                class="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-primary via-primary to-secondary px-4 py-3 text-base font-semibold text-white transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30"
                style="box-shadow: 0 18px 45px var(--color-primary-glow);"
              >
                Create Account
              </button>
            </form>

            <p class="text-center text-sm text-slate-300">
              Already have an account?
              <a href="/login" class="font-semibold text-primary transition hover:text-white">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>

      <div class="order-1 max-w-xl text-center md:order-2 md:text-left">
        ${config.logoUrl ? html`
          <div class="mb-6 flex justify-center md:justify-start">
            <img src="${config.logoUrl}" alt="${config.title || 'Identity Logo'}" class="h-12 w-auto" />
          </div>
        ` : ''}
        <h1 class="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Welcome to ${config.title || 'S3DB Identity'}
        </h1>
        <p class="mt-4 text-base text-slate-300 md:text-lg">
          ${config.tagline || 'Create a secure identity to access your workspace and applications.'}
        </p>
        <div class="mt-8 grid gap-4 text-left text-sm text-slate-300">
          <div class="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3">
            <span class="font-semibold text-white">Fast onboarding</span>
            <p class="mt-1 text-slate-300">
              Start collaborating in minutes with instant verification.
            </p>
          </div>
          <div class="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3">
            <span class="font-semibold text-white">Enterprise-grade security</span>
            <p class="mt-1 text-slate-300">
              Backed by multi-layer encryption and continuous monitoring.
            </p>
          </div>
          <div class="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3">
            <span class="font-semibold text-white">Live support</span>
            <p class="mt-1 text-slate-300">
              Our team is ready to help you with any registration issues.
            </p>
          </div>
        </div>
      </div>
    </section>
  `;

  return BaseLayout({
    title: 'Create Account',
    content: content as any,
    config,
    error: null
  });
}

export default RegisterPage;
