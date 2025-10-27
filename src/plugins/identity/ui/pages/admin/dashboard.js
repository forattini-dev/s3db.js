/**
 * Admin Dashboard Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../../layouts/base.js';

/**
 * Render admin dashboard page
 * @param {Object} props - Page properties
 * @param {Object} props.stats - Dashboard statistics
 * @param {Object} props.user - Current user
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function AdminDashboardPage(props = {}) {
  const { stats = {}, user = {}, config = {} } = props;

  const content = html`
    <div class="container">
      <h1 class="mb-4">Admin Dashboard</h1>

      <!-- Statistics Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <!-- Users Card -->
        <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
          <div class="p-3">
            <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Total Users</div>
            <div style="font-size: 2rem; font-weight: bold;">${stats.totalUsers || 0}</div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.5rem;">
              ${stats.activeUsers || 0} active · ${stats.pendingUsers || 0} pending
            </div>
          </div>
        </div>

        <!-- OAuth2 Clients Card -->
        <div class="card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;">
          <div class="p-3">
            <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">OAuth2 Clients</div>
            <div style="font-size: 2rem; font-weight: bold;">${stats.totalClients || 0}</div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.5rem;">
              ${stats.activeClients || 0} active
            </div>
          </div>
        </div>

        <!-- Sessions Card -->
        <div class="card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white;">
          <div class="p-3">
            <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Active Sessions</div>
            <div style="font-size: 2rem; font-weight: bold;">${stats.activeSessions || 0}</div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.5rem;">
              ${stats.uniqueUsers || 0} unique users
            </div>
          </div>
        </div>

        <!-- Auth Codes Card -->
        <div class="card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white;">
          <div class="p-3">
            <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Auth Codes</div>
            <div style="font-size: 2rem; font-weight: bold;">${stats.totalAuthCodes || 0}</div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.5rem;">
              ${stats.unusedAuthCodes || 0} unused
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card mb-4">
        <div class="card-header">
          Quick Actions
        </div>
        <div class="p-3">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <a href="/admin/clients" class="btn btn-primary" style="text-decoration: none; text-align: center;">
              📱 Manage Clients
            </a>
            <a href="/admin/users" class="btn btn-primary" style="text-decoration: none; text-align: center;">
              👥 Manage Users
            </a>
            <a href="/admin/sessions" class="btn btn-primary" style="text-decoration: none; text-align: center;">
              🔐 View Sessions
            </a>
            <a href="/admin/auth-codes" class="btn btn-primary" style="text-decoration: none; text-align: center;">
              🎫 Auth Codes
            </a>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      ${stats.recentUsers && stats.recentUsers.length > 0 ? html`
        <div class="card mb-4">
          <div class="card-header">
            Recent Users
          </div>
          <div class="p-3">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 2px solid var(--color-border);">
                  <th style="text-align: left; padding: 0.75rem; font-weight: 500;">Email</th>
                  <th style="text-align: left; padding: 0.75rem; font-weight: 500;">Name</th>
                  <th style="text-align: left; padding: 0.75rem; font-weight: 500;">Status</th>
                  <th style="text-align: left; padding: 0.75rem; font-weight: 500;">Created</th>
                </tr>
              </thead>
              <tbody>
                ${stats.recentUsers.map(user => html`
                  <tr style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: 0.75rem;">${user.email}</td>
                    <td style="padding: 0.75rem;">${user.name}</td>
                    <td style="padding: 0.75rem;">
                      <span class="badge" style="background-color: ${user.status === 'active' ? 'var(--color-success)' : user.status === 'suspended' ? 'var(--color-danger)' : 'var(--color-warning)'}; color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">
                        ${user.status}
                      </span>
                    </td>
                    <td style="padding: 0.75rem; color: var(--color-text-muted); font-size: 0.875rem;">
                      ${new Date(user.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- System Information -->
      <div class="card">
        <div class="card-header">
          System Information
        </div>
        <div class="p-3">
          <div style="display: grid; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
              <span style="font-weight: 500;">Identity Provider:</span>
              <span>${config.title || 'S3DB Identity'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
              <span style="font-weight: 500;">Your Role:</span>
              <span style="color: var(--color-primary);">Administrator</span>
            </div>
            ${stats.serverUptime ? html`
              <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
                <span style="font-weight: 500;">Server Uptime:</span>
                <span>${stats.serverUptime}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0;">
              <span style="font-weight: 500;">Database Type:</span>
              <span>S3DB (S3-based Document Database)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return BaseLayout({
    title: 'Admin Dashboard',
    content,
    config,
    user
  });
}

export default AdminDashboardPage;
