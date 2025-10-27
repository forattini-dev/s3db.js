/**
 * Admin OAuth2 Clients Management Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../../layouts/base.js';

/**
 * Render OAuth2 clients list page
 * @param {Object} props - Page properties
 * @param {Array} props.clients - List of OAuth2 clients
 * @param {Object} props.user - Current user
 * @param {string} [props.error] - Error message
 * @param {string} [props.success] - Success message
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function AdminClientsPage(props = {}) {
  const { clients = [], user = {}, error = null, success = null, config = {} } = props;

  const content = html`
    <div class="container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>OAuth2 Clients</h1>
        <a href="/admin/clients/new" class="btn btn-primary">
          + New Client
        </a>
      </div>

      ${clients.length === 0 ? html`
        <div class="card">
          <div class="p-3 text-center">
            <p class="text-muted">No OAuth2 clients registered yet.</p>
            <a href="/admin/clients/new" class="btn btn-primary mt-3">
              Create Your First Client
            </a>
          </div>
        </div>
      ` : html`
        <div style="display: grid; gap: 1.5rem;">
          ${clients.map(client => {
            const grantTypes = Array.isArray(client.grantTypes) ? client.grantTypes : [];
            const allowedScopes = Array.isArray(client.allowedScopes) ? client.allowedScopes : [];
            const redirectUris = Array.isArray(client.redirectUris) ? client.redirectUris : [];

            return html`
              <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong>${client.name}</strong>
                    ${!client.active ? html`
                      <span class="badge" style="background-color: var(--color-danger); color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem; margin-left: 0.5rem;">
                        Inactive
                      </span>
                    ` : ''}
                  </div>
                  <div style="display: flex; gap: 0.5rem;">
                    <a href="/admin/clients/${client.id}/edit" class="btn btn-secondary" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                      Edit
                    </a>
                    <form method="POST" action="/admin/clients/${client.id}/delete" style="margin: 0; display: inline;">
                      <button
                        type="submit"
                        class="btn btn-danger"
                        style="font-size: 0.875rem; padding: 0.5rem 1rem;"
                        onclick="return confirm('Are you sure you want to delete this client? This action cannot be undone.')"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <div class="p-3">
                  <div style="display: grid; gap: 1rem;">
                    <!-- Client ID -->
                    <div>
                      <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                        Client ID
                      </div>
                      <code style="background: var(--color-light); padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.875rem; word-break: break-all;">
                        ${client.clientId}
                      </code>
                    </div>

                    <!-- Redirect URIs -->
                    ${redirectUris.length > 0 ? html`
                      <div>
                        <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                          Redirect URIs (${redirectUris.length})
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                          ${redirectUris.map(uri => html`
                            <code style="background: var(--color-light); padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.875rem;">
                              ${uri}
                            </code>
                          `)}
                        </div>
                      </div>
                    ` : ''}

                    <!-- Grant Types -->
                    ${grantTypes.length > 0 ? html`
                      <div>
                        <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                          Grant Types
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                          ${grantTypes.map(type => html`
                            <span class="badge" style="background-color: var(--color-primary); color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">
                              ${type}
                            </span>
                          `)}
                        </div>
                      </div>
                    ` : ''}

                    <!-- Allowed Scopes -->
                    ${allowedScopes.length > 0 ? html`
                      <div>
                        <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                          Allowed Scopes
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                          ${allowedScopes.map(scope => html`
                            <span class="badge" style="background-color: var(--color-success); color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">
                              ${scope}
                            </span>
                          `)}
                        </div>
                      </div>
                    ` : ''}

                    <!-- Created Date -->
                    ${client.createdAt ? html`
                      <div style="color: var(--color-text-muted); font-size: 0.875rem;">
                        Created: ${new Date(client.createdAt).toLocaleString()}
                      </div>
                    ` : ''}
                  </div>

                  <!-- Actions -->
                  <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); display: flex; gap: 1rem;">
                    <form method="POST" action="/admin/clients/${client.id}/rotate-secret" style="margin: 0;">
                      <button type="submit" class="btn btn-secondary" style="font-size: 0.875rem;">
                        🔄 Rotate Secret
                      </button>
                    </form>
                    <form method="POST" action="/admin/clients/${client.id}/toggle-active" style="margin: 0;">
                      <button type="submit" class="btn ${client.active ? 'btn-danger' : 'btn-success'}" style="font-size: 0.875rem;">
                        ${client.active ? '🔴 Deactivate' : '🟢 Activate'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      `}
    </div>
  `;

  return BaseLayout({
    title: 'OAuth2 Clients - Admin',
    content,
    config,
    user,
    error,
    success
  });
}

export default AdminClientsPage;
