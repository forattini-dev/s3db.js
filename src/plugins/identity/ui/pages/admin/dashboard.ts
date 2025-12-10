/**
 * Admin Dashboard Page
 */

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { BaseLayout, type ThemeConfig, type BaseLayoutUser } from '../../layouts/base.js';

export interface RecentUser {
  email: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface DashboardStats {
  totalUsers?: number;
  activeUsers?: number;
  pendingUsers?: number;
  totalClients?: number;
  activeClients?: number;
  activeSessions?: number;
  uniqueUsers?: number;
  totalAuthCodes?: number;
  unusedAuthCodes?: number;
  serverUptime?: string;
  recentUsers?: RecentUser[];
}

export interface StatCard {
  title: string;
  value: string;
  description: string;
  gradient: string;
}

export interface QuickLink {
  href: string;
  label: string;
}

export interface AdminDashboardPageProps {
  stats?: DashboardStats;
  user?: BaseLayoutUser;
  config?: ThemeConfig;
}

export function AdminDashboardPage(props: AdminDashboardPageProps = {}): HtmlEscapedString {
  const { stats = {}, user = {}, config = {} } = props;

  const formatNumber = (value: number | undefined): string => Number(value || 0).toLocaleString();

  const statCards: StatCard[] = [
    {
      title: 'Total Users',
      value: formatNumber(stats.totalUsers),
      description: `${formatNumber(stats.activeUsers)} active · ${formatNumber(stats.pendingUsers)} pending`,
      gradient: 'from-sky-500/90 via-blue-500/80 to-indigo-500/80'
    },
    {
      title: 'OAuth2 Clients',
      value: formatNumber(stats.totalClients),
      description: `${formatNumber(stats.activeClients)} active`,
      gradient: 'from-fuchsia-500/90 via-rose-500/80 to-orange-500/80'
    },
    {
      title: 'Active Sessions',
      value: formatNumber(stats.activeSessions),
      description: `${formatNumber(stats.uniqueUsers)} unique users`,
      gradient: 'from-cyan-400/90 via-blue-400/80 to-sky-400/80'
    },
    {
      title: 'Auth Codes',
      value: formatNumber(stats.totalAuthCodes),
      description: `${formatNumber(stats.unusedAuthCodes)} unused`,
      gradient: 'from-emerald-400/90 via-teal-400/80 to-green-400/80'
    }
  ];

  const quickLinks: QuickLink[] = [
    { href: '/admin/clients', label: '📱 Manage Clients' },
    { href: '/admin/users', label: '👥 Manage Users' },
    { href: '/admin/sessions', label: '🔐 View Sessions' },
    { href: '/admin/auth-codes', label: '🎫 Auth Codes' }
  ];

  const recentUsers: RecentUser[] = Array.isArray(stats.recentUsers) ? stats.recentUsers : [];

  const content = html`
    <section class="mx-auto w-full max-w-6xl space-y-8 text-slate-100">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-3xl font-semibold text-white md:text-4xl">Admin Dashboard</h1>
          <p class="mt-1 text-sm text-slate-300">
            Overview of identity activity, clients, and health metrics.
          </p>
        </div>
        <div class="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs text-slate-300">
          <div class="text-sm font-semibold text-white">${user.email || 'admin@s3db.identity'}</div>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
              Administrator
            </span>
            ${stats.serverUptime ? html`
              <span class="text-xs text-slate-400">
                Uptime: ${stats.serverUptime}
              </span>
            ` : ''}
          </div>
        </div>
      </header>

      <div class="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        ${statCards.map(card => html`
          <div class="rounded-3xl border border-white/10 bg-gradient-to-br ${card.gradient} p-6 shadow-xl shadow-black/30 backdrop-blur">
            <div class="text-xs uppercase tracking-wide text-white/80">${card.title}</div>
            <div class="mt-3 text-3xl font-semibold text-white">${card.value}</div>
            <div class="mt-2 text-sm text-white/80">${card.description}</div>
          </div>
        `)}
      </div>

      <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
        <h2 class="text-lg font-semibold text-white">Quick Actions</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          ${quickLinks.map(link => html`
            <a
              href="${link.href}"
              class="flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/[0.12] focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              ${link.label}
            </a>
          `)}
        </div>
      </div>

      ${recentUsers.length > 0 ? html`
        <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
          <h2 class="text-lg font-semibold text-white">Recent Users</h2>
          <div class="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table class="min-w-full divide-y divide-white/10 text-left text-sm text-slate-200">
              <thead class="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th class="px-4 py-3 font-medium">Email</th>
                  <th class="px-4 py-3 font-medium">Name</th>
                  <th class="px-4 py-3 font-medium">Status</th>
                  <th class="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${recentUsers.map(recentUser => {
                  const statusClass = recentUser.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : recentUser.status === 'suspended'
                      ? 'bg-red-500/20 text-red-200'
                      : 'bg-amber-500/20 text-amber-200';

                  return html`
                    <tr class="hover:bg-white/[0.04]">
                      <td class="px-4 py-3">${recentUser.email}</td>
                      <td class="px-4 py-3">${recentUser.name}</td>
                      <td class="px-4 py-3">
                        <span class="rounded-full px-3 py-1 text-xs font-semibold ${statusClass}">
                          ${recentUser.status}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-slate-400">
                        ${new Date(recentUser.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
        <h2 class="text-lg font-semibold text-white">System Information</h2>
        <dl class="mt-4 divide-y divide-white/10 text-sm text-slate-200">
          <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <dt class="text-slate-400">Identity Provider</dt>
            <dd class="font-medium text-white">${config.title || 'S3DB Identity'}</dd>
          </div>
          <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <dt class="text-slate-400">Your Role</dt>
            <dd class="font-medium text-primary">Administrator</dd>
          </div>
          ${stats.serverUptime ? html`
            <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <dt class="text-slate-400">Server Uptime</dt>
              <dd>${stats.serverUptime}</dd>
            </div>
          ` : ''}
          <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <dt class="text-slate-400">Database Type</dt>
            <dd>S3DB (S3-based Document Database)</dd>
          </div>
        </dl>
      </div>
    </section>
  `;

  return BaseLayout({
    title: 'Admin Dashboard',
    content: content as any,
    config,
    user
  });
}

export default AdminDashboardPage;
