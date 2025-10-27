/**
 * Admin Users Management Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../../layouts/base.js';

/**
 * Render users list page
 * @param {Object} props - Page properties
 * @param {Array} props.users - List of users
 * @param {Object} props.user - Current user
 * @param {string} [props.error] - Error message
 * @param {string} [props.success] - Success message
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function AdminUsersPage(props = {}) {
  const { users = [], user = {}, error = null, success = null, config = {} } = props;

  const statusColors = {
    active: 'var(--color-success)',
    suspended: 'var(--color-danger)',
    pending_verification: 'var(--color-warning)'
  };

  const content = html`
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>User Management</h1>
        <a href="/admin" class="btn btn-secondary">
          ← Back to Dashboard
        </a>
      </div>

      ${users.length === 0 ? html`
        <div class="card">
          <div class="p-3 text-center">
            <p class="text-muted">No users found.</p>
          </div>
        </div>
      ` : html`
        <div class="card">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid var(--color-border); background-color: var(--color-light);">
                <th style="text-align: left; padding: 1rem; font-weight: 500;">Name</th>
                <th style="text-align: left; padding: 1rem; font-weight: 500;">Email</th>
                <th style="text-align: left; padding: 1rem; font-weight: 500;">Status</th>
                <th style="text-align: left; padding: 1rem; font-weight: 500;">Role</th>
                <th style="text-align: left; padding: 1rem; font-weight: 500;">Verified</th>
                <th style="text-align: left; padding: 1rem; font-weight: 500;">Joined</th>
                <th style="text-align: right; padding: 1rem; font-weight: 500;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const statusColor = statusColors[u.status] || 'var(--color-text-muted)';
                const isCurrentUser = u.id === user.id;

                return html`
                  <tr style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: 1rem;">
                      <strong>${u.name}</strong>
                      ${isCurrentUser ? html`
                        <span class="badge" style="background-color: var(--color-primary); color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem; margin-left: 0.5rem;">
                          You
                        </span>
                      ` : ''}
                    </td>
                    <td style="padding: 1rem;">
                      <code style="background: var(--color-light); padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.875rem;">
                        ${u.email}
                      </code>
                    </td>
                    <td style="padding: 1rem;">
                      <span class="badge" style="background-color: ${statusColor}; color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">
                        ${u.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style="padding: 1rem;">
                      ${u.role === 'admin' ? html`
                        <span class="badge" style="background-color: var(--color-danger); color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">
                          Admin
                        </span>
                      ` : html`
                        <span style="color: var(--color-text-muted); font-size: 0.875rem;">User</span>
                      `}
                    </td>
                    <td style="padding: 1rem;">
                      ${u.emailVerified ? html`
                        <span style="color: var(--color-success);">✓</span>
                      ` : html`
                        <span style="color: var(--color-text-muted);">✗</span>
                      `}
                    </td>
                    <td style="padding: 1rem; color: var(--color-text-muted); font-size: 0.875rem;">
                      ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown'}
                    </td>
                    <td style="padding: 1rem; text-align: right;">
                      <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <a href="/admin/users/${u.id}/edit" class="btn btn-secondary" style="font-size: 0.875rem; padding: 0.5rem 0.75rem;">
                          Edit
                        </a>
                        ${!isCurrentUser ? html`
                          <form method="POST" action="/admin/users/${u.id}/delete" style="margin: 0; display: inline;">
                            <button
                              type="submit"
                              class="btn btn-danger"
                              style="font-size: 0.875rem; padding: 0.5rem 0.75rem;"
                              onclick="return confirm('Are you sure you want to delete this user? This action cannot be undone.')"
                            >
                              Delete
                            </button>
                          </form>
                        ` : ''}
                      </div>
                    </td>
                  </tr>

                  <!-- Expandable Actions Row -->
                  <tr style="border-bottom: 1px solid var(--color-border); background-color: var(--color-light);">
                    <td colspan="7" style="padding: 0.75rem 1rem;">
                      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <!-- Status Management -->
                        ${!isCurrentUser ? html`
                          <form method="POST" action="/admin/users/${u.id}/change-status" style="margin: 0;">
                            <input type="hidden" name="status" value="${u.status === 'active' ? 'suspended' : 'active'}" />
                            <button type="submit" class="btn ${u.status === 'active' ? 'btn-danger' : 'btn-success'}" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                              ${u.status === 'active' ? '🔴 Suspend' : '🟢 Activate'}
                            </button>
                          </form>
                        ` : ''}

                        <!-- Mark as Verified -->
                        ${!u.emailVerified && !isCurrentUser ? html`
                          <form method="POST" action="/admin/users/${u.id}/verify-email" style="margin: 0;">
                            <button type="submit" class="btn btn-secondary" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                              ✓ Mark Email Verified
                            </button>
                          </form>
                        ` : ''}

                        <!-- Reset Password -->
                        ${!isCurrentUser ? html`
                          <form method="POST" action="/admin/users/${u.id}/reset-password" style="margin: 0;">
                            <button
                              type="submit"
                              class="btn btn-secondary"
                              style="font-size: 0.875rem; padding: 0.5rem 1rem;"
                              onclick="return confirm('Send password reset email to ${u.email}?')"
                            >
                              🔑 Send Password Reset
                            </button>
                          </form>
                        ` : ''}

                        <!-- Toggle Admin -->
                        ${!isCurrentUser ? html`
                          <form method="POST" action="/admin/users/${u.id}/toggle-admin" style="margin: 0;">
                            <button
                              type="submit"
                              class="btn ${u.role === 'admin' ? 'btn-danger' : 'btn-primary'}"
                              style="font-size: 0.875rem; padding: 0.5rem 1rem;"
                              onclick="return confirm('${u.role === 'admin' ? 'Remove admin privileges from' : 'Grant admin privileges to'} ${u.name}?')"
                            >
                              ${u.role === 'admin' ? '👤 Remove Admin' : '⚡ Make Admin'}
                            </button>
                          </form>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      `}

      <!-- Statistics Summary -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2rem;">
        <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
          <div class="p-3 text-center">
            <div style="font-size: 0.875rem; opacity: 0.9;">Total Users</div>
            <div style="font-size: 2rem; font-weight: bold; margin-top: 0.5rem;">${users.length}</div>
          </div>
        </div>

        <div class="card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white;">
          <div class="p-3 text-center">
            <div style="font-size: 0.875rem; opacity: 0.9;">Active</div>
            <div style="font-size: 2rem; font-weight: bold; margin-top: 0.5rem;">
              ${users.filter(u => u.status === 'active').length}
            </div>
          </div>
        </div>

        <div class="card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white;">
          <div class="p-3 text-center">
            <div style="font-size: 0.875rem; opacity: 0.9;">Pending</div>
            <div style="font-size: 2rem; font-weight: bold; margin-top: 0.5rem;">
              ${users.filter(u => u.status === 'pending_verification').length}
            </div>
          </div>
        </div>

        <div class="card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;">
          <div class="p-3 text-center">
            <div style="font-size: 0.875rem; opacity: 0.9;">Verified Emails</div>
            <div style="font-size: 2rem; font-weight: bold; margin-top: 0.5rem;">
              ${users.filter(u => u.emailVerified).length}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return BaseLayout({
    title: 'User Management - Admin',
    content,
    config,
    user,
    error,
    success
  });
}

export default AdminUsersPage;
