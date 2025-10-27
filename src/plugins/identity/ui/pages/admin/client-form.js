/**
 * Admin OAuth2 Client Form Page (Create/Edit)
 */

import { html } from 'hono/html';
import { BaseLayout } from '../../layouts/base.js';

/**
 * Render OAuth2 client form page
 * @param {Object} props - Page properties
 * @param {Object} [props.client] - Client data (for edit mode)
 * @param {Object} props.user - Current user
 * @param {string} [props.error] - Error message
 * @param {Object} [props.availableScopes] - Available OAuth2 scopes
 * @param {Object} [props.availableGrantTypes] - Available grant types
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function AdminClientFormPage(props = {}) {
  const { client = null, user = {}, error = null, availableScopes = [], availableGrantTypes = [], config = {} } = props;

  const isEditMode = !!client;
  const clientData = client || {
    name: '',
    redirectUris: [''],
    grantTypes: ['authorization_code', 'refresh_token'],
    allowedScopes: ['openid', 'profile', 'email'],
    active: true
  };

  const content = html`
    <div class="container-sm">
      <div style="margin-bottom: 2rem;">
        <a href="/admin/clients" class="btn-link" style="font-size: 0.875rem;">← Back to Clients</a>
        <h1 class="mt-3">${isEditMode ? 'Edit' : 'Create'} OAuth2 Client</h1>
      </div>

      <div class="card">
        <form method="POST" action="${isEditMode ? `/admin/clients/${client.id}/update` : '/admin/clients/create'}">
          <div class="p-3">
            <!-- Client Name -->
            <div class="form-group">
              <label for="name" class="form-label form-label-required">Client Name</label>
              <input
                type="text"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="name"
                name="name"
                value="${clientData.name}"
                required
                autofocus
                placeholder="My Application"
              />
              <small class="form-text">A friendly name for this OAuth2 client</small>
              ${error ? html`<div class="invalid-feedback">${error}</div>` : ''}
            </div>

            <!-- Redirect URIs -->
            <div class="form-group">
              <label class="form-label form-label-required">Redirect URIs</label>
              <div id="redirect-uris-container">
                ${(Array.isArray(clientData.redirectUris) ? clientData.redirectUris : ['']).map((uri, index) => html`
                  <div class="redirect-uri-row" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <input
                      type="url"
                      class="form-control"
                      name="redirectUris[]"
                      value="${uri}"
                      required
                      placeholder="https://example.com/callback"
                    />
                    ${index > 0 ? html`
                      <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()" style="padding: 0.75rem 1rem;">
                        ✕
                      </button>
                    ` : ''}
                  </div>
                `)}
              </div>
              <button type="button" class="btn btn-secondary mt-2" onclick="addRedirectUri()">
                + Add Another URI
              </button>
              <small class="form-text">Where users will be redirected after authorization</small>
            </div>

            <!-- Grant Types -->
            <div class="form-group">
              <label class="form-label form-label-required">Grant Types</label>
              ${(availableGrantTypes.length > 0 ? availableGrantTypes : ['authorization_code', 'refresh_token', 'client_credentials']).map(type => {
                const isChecked = Array.isArray(clientData.grantTypes) && clientData.grantTypes.includes(type);
                return html`
                  <div class="form-check">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      id="grant_${type}"
                      name="grantTypes[]"
                      value="${type}"
                      ${isChecked ? 'checked' : ''}
                    />
                    <label class="form-check-label" for="grant_${type}">
                      <code>${type}</code>
                    </label>
                  </div>
                `;
              })}
              <small class="form-text">OAuth2 grant types this client can use</small>
            </div>

            <!-- Allowed Scopes -->
            <div class="form-group">
              <label class="form-label form-label-required">Allowed Scopes</label>
              ${(availableScopes.length > 0 ? availableScopes : ['openid', 'profile', 'email', 'offline_access']).map(scope => {
                const isChecked = Array.isArray(clientData.allowedScopes) && clientData.allowedScopes.includes(scope);
                return html`
                  <div class="form-check">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      id="scope_${scope}"
                      name="allowedScopes[]"
                      value="${scope}"
                      ${isChecked ? 'checked' : ''}
                    />
                    <label class="form-check-label" for="scope_${scope}">
                      <code>${scope}</code>
                    </label>
                  </div>
                `;
              })}
              <small class="form-text">Scopes this client is allowed to request</small>
            </div>

            <!-- Active Status -->
            <div class="form-group">
              <div class="form-check">
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="active"
                  name="active"
                  value="1"
                  ${clientData.active !== false ? 'checked' : ''}
                />
                <label class="form-check-label" for="active">
                  <strong>Active</strong> - Client can authenticate and receive tokens
                </label>
              </div>
            </div>

            <!-- Submit Buttons -->
            <div class="form-group mb-0" style="display: flex; gap: 1rem;">
              <button type="submit" class="btn btn-primary">
                ${isEditMode ? 'Update Client' : 'Create Client'}
              </button>
              <a href="/admin/clients" class="btn btn-secondary">
                Cancel
              </a>
            </div>
          </div>
        </form>
      </div>

      ${isEditMode ? html`
        <div class="alert alert-info mt-4">
          <strong>Note:</strong> The client secret cannot be displayed again after creation. If you need a new secret, use the "Rotate Secret" button on the clients list page.
        </div>
      ` : ''}
    </div>

    <script>
      function addRedirectUri() {
        const container = document.getElementById('redirect-uris-container');
        const div = document.createElement('div');
        div.className = 'redirect-uri-row';
        div.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 0.5rem;';
        div.innerHTML = \`
          <input
            type="url"
            class="form-control"
            name="redirectUris[]"
            required
            placeholder="https://example.com/callback"
          />
          <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()" style="padding: 0.75rem 1rem;">
            ✕
          </button>
        \`;
        container.appendChild(div);
      }
    </script>
  `;

  return BaseLayout({
    title: `${isEditMode ? 'Edit' : 'Create'} OAuth2 Client - Admin`,
    content,
    config,
    user,
    error: null // Error shown in form
  });
}

export default AdminClientFormPage;
