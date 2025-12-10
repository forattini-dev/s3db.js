/**
 * Admin Users Management Page
 */

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { BaseLayout, type ThemeConfig, type BaseLayoutUser } from '../../layouts/base.js';

export type UserStatus = 'active' | 'suspended' | 'pending_verification';

const STATUS_STYLES: Record<UserStatus, string> = {
  active: 'bg-emerald-500/20 text-emerald-200',
  suspended: 'bg-red-500/20 text-red-200',
  pending_verification: 'bg-amber-500/20 text-amber-200'
};

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  status: UserStatus | string;
  role?: string;
  emailVerified?: boolean;
  createdAt?: string;
  lockedUntil?: string;
  failedLoginAttempts?: number;
}

export interface SummaryCard {
  label: string;
  value: number;
  gradient: string;
}

export interface AdminUsersPageProps {
  users?: AdminUser[];
  user?: BaseLayoutUser;
  error?: string | null;
  success?: string | null;
  config?: ThemeConfig;
}

export function AdminUsersPage(props: AdminUsersPageProps = {}): HtmlEscapedString {
  const { users = [], user = {}, error = null, success = null, config = {} } = props;

  const secondaryButtonClass = [
    'inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06]',
    'px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.12]',
    'focus:outline-none focus:ring-2 focus:ring-white/20'
  ].join(' ');

  const dangerButtonClass = [
    'inline-flex items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/10',
    'px-4 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15 focus:outline-none focus:ring-2 focus:ring-red-400/40'
  ].join(' ');

  const successButtonClass = [
    'inline-flex items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10',
    'px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/40'
  ].join(' ');

  const primaryButtonClass = [
    'inline-flex items-center justify-center rounded-2xl bg-gradient-to-r',
    'from-primary via-primary to-secondary px-4 py-2 text-xs font-semibold text-white',
    'transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30'
  ].join(' ');

  const headerSecondaryButtonClass = [
    'inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06]',
    'px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.12]',
    'focus:outline-none focus:ring-2 focus:ring-white/20'
  ].join(' ');

  const summaryCards: SummaryCard[] = [
    {
      label: 'Total Users',
      value: users.length,
      gradient: 'from-sky-500/90 via-blue-500/80 to-indigo-500/80'
    },
    {
      label: 'Active',
      value: users.filter(u => u.status === 'active').length,
      gradient: 'from-emerald-400/90 via-green-400/80 to-teal-400/80'
    },
    {
      label: 'Pending',
      value: users.filter(u => u.status === 'pending_verification').length,
      gradient: 'from-amber-400/90 via-orange-400/80 to-yellow-400/80'
    },
    {
      label: 'Verified Emails',
      value: users.filter(u => u.emailVerified).length,
      gradient: 'from-fuchsia-500/90 via-rose-500/80 to-purple-500/80'
    }
  ];

  const tableRows = users.map(current => {
    const statusClass = STATUS_STYLES[current.status as UserStatus] || 'bg-white/10 text-slate-200';
    const isCurrentUser = current.id === user.id;

    const actions: any[] = [];

    actions.push(html`
      <a href="/admin/users/${current.id}/edit" class="${secondaryButtonClass}">
        Edit
      </a>
    `);

    if (!isCurrentUser) {
      actions.push(html`
        <form method="POST" action="/admin/users/${current.id}/delete" onsubmit="return confirm('Delete user ${current.email}? This cannot be undone.')">
          <button type="submit" class="${dangerButtonClass}">
            Delete
          </button>
        </form>
      `);

      actions.push(html`
        <form method="POST" action="/admin/users/${current.id}/toggle-status">
          <button type="submit" class="${current.status === 'active' ? dangerButtonClass : successButtonClass}">
            ${current.status === 'active' ? '🔴 Suspend' : '🟢 Activate'}
          </button>
        </form>
      `);

      if (!current.emailVerified) {
        actions.push(html`
          <form method="POST" action="/admin/users/${current.id}/verify-email">
            <button type="submit" class="${secondaryButtonClass}">
              ✓ Mark Verified
            </button>
          </form>
        `);
      }

      if (current.lockedUntil || (current.failedLoginAttempts && current.failedLoginAttempts > 0)) {
        const isLocked = current.lockedUntil && new Date(current.lockedUntil) > new Date();
        const lockInfo = isLocked
          ? `Locked until ${new Date(current.lockedUntil!).toLocaleString()}`
          : `${current.failedLoginAttempts} failed attempts`;

        actions.push(html`
          <form method="POST" action="/admin/users/${current.id}/unlock-account" onsubmit="return confirm('Unlock account for ${current.email}?\\n\\n${lockInfo}')">
            <button type="submit" class="${successButtonClass}">
              🔓 Unlock Account
            </button>
          </form>
        `);
      }

      actions.push(html`
        <form method="POST" action="/admin/users/${current.id}/reset-password" onsubmit="return confirm('Send password reset email to ${current.email}?')">
          <button type="submit" class="${secondaryButtonClass}">
            🔑 Send Reset
          </button>
        </form>
      `);

      actions.push(html`
        <form method="POST" action="/admin/users/${current.id}/toggle-admin" onsubmit="return confirm('${current.role === 'admin' ? 'Remove admin privileges from' : 'Grant admin privileges to'} ${current.name}?')">
          <button type="submit" class="${current.role === 'admin' ? dangerButtonClass : primaryButtonClass}">
            ${current.role === 'admin' ? '👤 Remove Admin' : '⚡ Make Admin'}
          </button>
        </form>
      `);
    }

    return html`
      <tr class="border-b border-white/10 hover:bg-white/[0.04]">
        <td class="px-4 py-3 align-top">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-white">${current.name}</span>
            ${isCurrentUser ? html`
              <span class="rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary">
                You
              </span>
            ` : ''}
          </div>
        </td>
        <td class="px-4 py-3 align-top">
          <code class="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-1 text-xs text-slate-200">
            ${current.email}
          </code>
        </td>
        <td class="px-4 py-3 align-top">
          <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}">
            ${current.status.replace('_', ' ')}
          </span>
        </td>
        <td class="px-4 py-3 align-top">
          ${current.role === 'admin' ? html`
            <span class="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-200">
              Admin
            </span>
          ` : html`
            <span class="text-xs text-slate-300">User</span>
          `}
        </td>
        <td class="px-4 py-3 align-top">
          ${current.emailVerified ? html`
            <span class="text-emerald-300">✓</span>
          ` : html`
            <span class="text-slate-400">✗</span>
          `}
        </td>
        <td class="px-4 py-3 align-top text-xs text-slate-400">
          ${current.createdAt ? new Date(current.createdAt).toLocaleDateString() : 'Unknown'}
        </td>
        <td class="px-4 py-3 align-top">
          <div class="flex flex-wrap justify-end gap-2">
            ${actions}
          </div>
        </td>
      </tr>
    `;
  });

  const content = html`
    <section class="mx-auto w-full max-w-7xl space-y-8 text-slate-100">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="text-3xl font-semibold text-white md:text-4xl">User Management</h1>
          <p class="mt-1 text-sm text-slate-300">
            Audit user accounts, toggle access, and elevate permissions.
          </p>
        </div>
        <a href="/admin" class="${headerSecondaryButtonClass}">
          ← Back to Dashboard
        </a>
      </header>

      ${users.length === 0 ? html`
        <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-10 text-center shadow-xl shadow-black/30 backdrop-blur">
          <p class="text-sm text-slate-300">
            No users found.
          </p>
        </div>
      ` : html`
        <div class="rounded-3xl border border-white/10 bg-white/[0.05] shadow-xl shadow-black/30 backdrop-blur">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-white/10 text-left text-sm text-slate-200">
              <thead class="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th class="px-4 py-3 font-medium">Name</th>
                  <th class="px-4 py-3 font-medium">Email</th>
                  <th class="px-4 py-3 font-medium">Status</th>
                  <th class="px-4 py-3 font-medium">Role</th>
                  <th class="px-4 py-3 font-medium">Verified</th>
                  <th class="px-4 py-3 font-medium">Joined</th>
                  <th class="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/10">
                ${tableRows}
              </tbody>
            </table>
          </div>
        </div>
      `}

      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        ${summaryCards.map(card => html`
          <div class="rounded-3xl border border-white/10 bg-gradient-to-br ${card.gradient} p-6 text-center shadow-xl shadow-black/30 backdrop-blur">
            <div class="text-xs uppercase tracking-wide text-white/80">${card.label}</div>
            <div class="mt-3 text-3xl font-semibold text-white">${card.value}</div>
          </div>
        `)}
      </div>
    </section>
  `;

  return BaseLayout({
    title: 'User Management - Admin',
    content: content as any,
    config,
    user,
    error,
    success
  });
}

export default AdminUsersPage;
