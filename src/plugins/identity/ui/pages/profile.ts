/**
 * User Profile Page
 */

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { BaseLayout, type ThemeConfig, type BaseLayoutUser } from '../layouts/base.js';
import type { PasswordPolicy } from './register.js';

export interface ProfileUser extends BaseLayoutUser {
  status?: 'active' | 'pending_verification' | 'suspended' | string;
  emailVerified?: boolean;
  lastLoginAt?: string;
  lastLoginIp?: string;
  createdAt?: string;
}

export interface ProfileSession {
  id: string;
  isCurrent?: boolean;
  createdAt?: string;
  expiresAt?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface ProfilePageProps {
  user?: ProfileUser;
  sessions?: ProfileSession[];
  error?: string | null;
  success?: string | null;
  passwordPolicy?: PasswordPolicy;
  config?: ThemeConfig;
}

export function ProfilePage(props: ProfilePageProps = {}): HtmlEscapedString {
  const { user = {}, sessions = [], error = null, success = null, passwordPolicy = {}, config = {} } = props;

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
    'block w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm text-white',
    'shadow-[0_1px_0_rgba(255,255,255,0.05)] transition placeholder:text-slate-300/70 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/30'
  ].join(' ');

  const primaryButtonClass = [
    'inline-flex items-center justify-center rounded-2xl bg-gradient-to-r',
    'from-primary via-primary to-secondary px-5 py-2.5 text-sm font-semibold text-white',
    'transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30'
  ].join(' ');

  const dangerButtonClass = [
    'inline-flex items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/10',
    'px-4 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15 focus:outline-none focus:ring-2 focus:ring-red-400/40'
  ].join(' ');

  const dangerButtonLargeClass = [
    'inline-flex items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/10',
    'px-5 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 focus:outline-none focus:ring-2 focus:ring-red-400/40'
  ].join(' ');

  const panelClasses = 'rounded-3xl border border-white/10 bg-white/[0.05] p-8 shadow-xl shadow-black/30 backdrop-blur';

  interface AccountRow {
    label: string;
    value: any;
  }

  const accountRows: AccountRow[] = [];
  accountRows.push({
    label: 'Account Status',
    value: user.status === 'active'
      ? html`<span class="text-emerald-300">✓ Active</span>`
      : user.status === 'pending_verification'
        ? html`<span class="text-amber-300">⏳ Pending Verification</span>`
        : user.status === 'suspended'
          ? html`<span class="text-red-300">⚠ Suspended</span>`
          : html`<span class="text-slate-300">Unknown</span>`
  });

  if (user.isAdmin) {
    accountRows.push({
      label: 'Role',
      value: html`<span class="font-semibold text-primary">👑 Administrator</span>`
    });
  }

  if (user.lastLoginAt) {
    accountRows.push({
      label: 'Last Login',
      value: html`${new Date(user.lastLoginAt).toLocaleString()}`
    });
  }

  if (user.lastLoginIp) {
    accountRows.push({
      label: 'Last Login IP',
      value: html`${user.lastLoginIp}`
    });
  }

  if (user.createdAt) {
    accountRows.push({
      label: 'Member Since',
      value: html`${new Date(user.createdAt).toLocaleDateString()}`
    });
  }

  const sessionCards = sessions.map(session => {
    const isCurrentSession = session.isCurrent;
    const createdAt = session.createdAt ? new Date(session.createdAt) : null;
    const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;

    const sessionClasses = [
      'rounded-2xl border border-white/10 px-5 py-4 transition',
      isCurrentSession
        ? 'bg-primary/10 ring-1 ring-primary/40'
        : 'bg-white/[0.05] hover:bg-white/[0.08]'
    ].join(' ');

    return html`
      <div class="${sessionClasses}">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-3 text-sm font-semibold text-white">
              <span>${session.userAgent || 'Unknown device'}</span>
              ${isCurrentSession ? html`
                <span class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Current
                </span>
              ` : ''}
            </div>
            <dl class="grid gap-2 text-xs text-slate-300">
              <div class="flex gap-3">
                <dt class="w-24 text-slate-400">IP</dt>
                <dd class="flex-1">${session.ipAddress || 'Unknown'}</dd>
              </div>
              <div class="flex gap-3">
                <dt class="w-24 text-slate-400">Created</dt>
                <dd class="flex-1">${createdAt ? createdAt.toLocaleString() : 'Unknown'}</dd>
              </div>
              <div class="flex gap-3">
                <dt class="w-24 text-slate-400">Expires</dt>
                <dd class="flex-1">${expiresAt ? expiresAt.toLocaleString() : 'Unknown'}</dd>
              </div>
            </dl>
          </div>
          ${!isCurrentSession ? html`
            <form method="POST" action="/profile/logout-session" class="shrink-0 self-start">
              <input type="hidden" name="session_id" value="${session.id}" />
              <button type="submit" class="${dangerButtonClass}">
                Logout
              </button>
            </form>
          ` : html`
            <span class="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              Active Session
            </span>
          `}
        </div>
      </div>
    `;
  });

  const sessionsSection = sessions.length === 0
    ? html`<p class="text-sm text-slate-300">No active sessions</p>`
    : html`
      <div class="space-y-4">
        <p class="text-sm text-slate-300">
          You are currently logged in on these devices. If you see a session you don't recognize, log it out immediately.
        </p>
        ${sessionCards}
        ${sessions.length > 1 ? html`
          <form method="POST" action="/profile/logout-all-sessions" class="pt-2">
            <button type="submit" class="${dangerButtonLargeClass}">
              Logout All Other Sessions
            </button>
          </form>
        ` : ''}
      </div>
    `;

  const content = html`
    <section class="mx-auto w-full max-w-6xl space-y-8 text-slate-100">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-3xl font-semibold text-white md:text-4xl">My Profile</h1>
          <p class="mt-1 text-sm text-slate-300">
            Manage your personal information, security preferences, and connected sessions.
          </p>
        </div>
        <div class="flex items-center gap-3 self-start rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs text-slate-300">
          <span class="text-sm font-semibold text-white">${user.email || 'Unknown email'}</span>
          <span class="${user.emailVerified ? 'rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200' : 'rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200'}">
            ${user.emailVerified ? 'Verified' : 'Not verified'}
          </span>
        </div>
      </header>

      <div class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-8">
          <div class="${panelClasses}">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="text-xl font-semibold text-white">Profile Information</h2>
                <p class="text-sm text-slate-300">
                  Update your personal details and contact email.
                </p>
              </div>
            </div>
            <form method="POST" action="/profile/update" class="mt-6 space-y-6">
              <div class="space-y-2">
                <label for="name" class="text-sm font-semibold text-slate-200">
                  Full Name
                </label>
                <input
                  type="text"
                  class="${inputClasses}"
                  id="name"
                  name="name"
                  value="${user.name || ''}"
                  required
                  minlength="2"
                  maxlength="100"
                />
              </div>

              <div class="space-y-2">
                <label for="email" class="text-sm font-semibold text-slate-200">
                  Email Address
                </label>
                <input
                  type="email"
                  class="${inputClasses}"
                  id="email"
                  name="email"
                  value="${user.email || ''}"
                  required
                  autocomplete="email"
                />
                ${user.emailVerified
                  ? html`<p class="text-xs font-medium text-emerald-300">✓ Verified email address</p>`
                  : html`<p class="text-xs text-amber-200">
                      ⚠ Not verified —
                      <a href="/verify-email/resend" class="font-semibold text-primary transition hover:text-white">
                        Resend verification email
                      </a>
                    </p>`
                }
              </div>

              <button type="submit" class="${primaryButtonClass} w-full sm:w-auto" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
                Save Changes
              </button>
            </form>
          </div>

          <div class="${panelClasses}">
            <h2 class="text-xl font-semibold text-white">Change Password</h2>
            <p class="text-sm text-slate-300">
              Keep your account secure with a strong password.
            </p>

            <form method="POST" action="/profile/change-password" class="mt-6 space-y-6">
              <div class="space-y-2">
                <label for="current_password" class="text-sm font-semibold text-slate-200">
                  Current Password
                </label>
                <input
                  type="password"
                  class="${inputClasses}"
                  id="current_password"
                  name="current_password"
                  required
                  autocomplete="current-password"
                />
              </div>

              <div class="space-y-2">
                <label for="new_password" class="text-sm font-semibold text-slate-200">
                  New Password
                </label>
                <input
                  type="password"
                  class="${inputClasses}"
                  id="new_password"
                  name="new_password"
                  required
                  autocomplete="new-password"
                  minlength="${minLength}"
                  maxlength="${maxLength}"
                />
                <div class="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-xs text-slate-200">
                  <span class="font-semibold text-white/80">Must include:</span>
                  <ul class="mt-2 list-disc space-y-1 pl-5 text-slate-300">
                    ${requirements.map(req => html`<li>${req}</li>`)}
                  </ul>
                </div>
              </div>

              <div class="space-y-2">
                <label for="confirm_new_password" class="text-sm font-semibold text-slate-200">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  class="${inputClasses}"
                  id="confirm_new_password"
                  name="confirm_new_password"
                  required
                  autocomplete="new-password"
                />
              </div>

              <button type="submit" class="${primaryButtonClass} w-full sm:w-auto" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
                Change Password
              </button>
            </form>
          </div>
        </div>

        <div class="space-y-8">
          <div class="${panelClasses}">
            <h2 class="text-xl font-semibold text-white">Account Overview</h2>
            <p class="text-sm text-slate-300">
              Key information about your account and access.
            </p>
            <dl class="mt-6 space-y-4">
              ${accountRows.map(row => html`
                <div class="flex flex-col gap-2 border-b border-white/10 pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:gap-6">
                  <dt class="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-40">${row.label}</dt>
                  <dd class="text-sm text-slate-200 sm:flex-1">${row.value}</dd>
                </div>
              `)}
            </dl>
          </div>
        </div>
      </div>

      <div class="${panelClasses}">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-white">Active Sessions</h2>
            <p class="text-sm text-slate-300">
              Review and manage the devices currently connected to your account.
            </p>
          </div>
          <span class="rounded-full bg-primary/20 px-3 py-1 text-sm font-semibold text-primary">
            ${sessions.length} active
          </span>
        </div>
        <div class="mt-6 space-y-4">
          ${sessionsSection}
        </div>
      </div>
    </section>
  `;

  return BaseLayout({
    title: 'My Profile',
    content: content as any,
    config,
    user,
    error,
    success
  });
}

export default ProfilePage;
