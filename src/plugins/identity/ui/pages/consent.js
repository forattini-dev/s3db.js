/**
 * OAuth2 Consent Screen Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Scope descriptions for display
 */
const SCOPE_DESCRIPTIONS = {
  openid: {
    name: 'OpenID Connect',
    description: 'Sign in using your identity',
    icon: '🔐'
  },
  profile: {
    name: 'Profile Information',
    description: 'Access your basic profile information (name, picture)',
    icon: '👤'
  },
  email: {
    name: 'Email Address',
    description: 'Access your email address',
    icon: '📧'
  },
  offline_access: {
    name: 'Offline Access',
    description: 'Maintain access when you are not using the app',
    icon: '🔄'
  },
  phone: {
    name: 'Phone Number',
    description: 'Access your phone number',
    icon: '📱'
  },
  address: {
    name: 'Address',
    description: 'Access your address information',
    icon: '🏠'
  }
};

/**
 * Render OAuth2 consent page
 * @param {Object} props - Page properties
 * @param {Object} props.client - OAuth2 client requesting access
 * @param {Array} props.scopes - Requested scopes
 * @param {Object} props.user - Current user
 * @param {string} props.responseType - OAuth2 response_type
 * @param {string} props.redirectUri - Redirect URI
 * @param {string} [props.state] - OAuth2 state parameter
 * @param {string} [props.codeChallenge] - PKCE code challenge
 * @param {string} [props.codeChallengeMethod] - PKCE challenge method
 * @param {string} [props.error] - Error message
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function ConsentPage(props = {}) {
  const {
    client = {},
    scopes = [],
    user = {},
    responseType,
    redirectUri,
    state = '',
    codeChallenge = '',
    codeChallengeMethod = 'plain',
    error = null,
    config = {}
  } = props;

  // Filter out unknown scopes and add descriptions
  const scopeDetails = scopes
    .map(scope => ({
      scope,
      ...SCOPE_DESCRIPTIONS[scope],
      unknown: !SCOPE_DESCRIPTIONS[scope]
    }))
    .filter(s => !s.unknown);

  const content = html`
    <div class="container-sm">
      ${error ? html`
        <div class="alert alert-danger mb-4">
          ${error}
        </div>
      ` : ''}

      <div style="text-align: center; margin-bottom: 2rem;">
        ${config.logoUrl ? html`
          <img src="${config.logoUrl}" alt="Logo" style="max-width: 80px; margin-bottom: 1rem;" />
        ` : ''}
        <h1 style="font-size: 1.75rem; margin-bottom: 0.5rem;">Authorize Application</h1>
        <p style="color: var(--color-text-muted);">
          <strong>${client.name || 'Application'}</strong> is requesting access to your account
        </p>
      </div>

      <div class="card mb-3">
        <div class="card-header">
          Application Information
        </div>
        <div class="p-3">
          <div style="display: grid; gap: 1rem;">
            <div>
              <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                Application Name
              </div>
              <div style="font-size: 1.125rem; font-weight: 600;">
                ${client.name || 'Unknown Application'}
              </div>
            </div>

            ${client.description ? html`
              <div>
                <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                  Description
                </div>
                <div>${client.description}</div>
              </div>
            ` : ''}

            <div>
              <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                Client ID
              </div>
              <code style="background: var(--color-light); padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.875rem; word-break: break-all;">
                ${client.clientId}
              </code>
            </div>

            <div>
              <div style="font-weight: 500; color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.25rem;">
                Will Redirect To
              </div>
              <code style="background: var(--color-light); padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.875rem; word-break: break-all;">
                ${redirectUri}
              </code>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header">
          Requested Permissions
        </div>
        <div class="p-3">
          ${scopeDetails.length === 0 ? html`
            <p style="color: var(--color-text-muted); font-style: italic;">
              This application is not requesting any specific permissions.
            </p>
          ` : html`
            <div style="display: grid; gap: 1rem;">
              ${scopeDetails.map(s => html`
                <div style="display: flex; gap: 1rem; align-items: flex-start;">
                  <div style="font-size: 2rem; line-height: 1;">
                    ${s.icon}
                  </div>
                  <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">
                      ${s.name}
                    </div>
                    <div style="color: var(--color-text-muted); font-size: 0.875rem;">
                      ${s.description}
                    </div>
                  </div>
                </div>
              `)}
            </div>
          `}
        </div>
      </div>

      <div class="card mb-3" style="background-color: var(--color-light);">
        <div class="p-3">
          <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
            <div style="font-size: 1.5rem;">ℹ️</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 0.5rem;">
                Signed in as ${user.name}
              </div>
              <div style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.75rem;">
                By clicking "Allow", you authorize <strong>${client.name}</strong> to access your information as described above.
              </div>
              <div style="font-size: 0.875rem; color: var(--color-text-muted);">
                You can revoke this access at any time from your <a href="/profile" style="color: var(--color-primary);">profile settings</a>.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Authorization Form -->
      <form method="POST" action="/oauth/consent">
        <!-- OAuth2 Parameters -->
        <input type="hidden" name="response_type" value="${responseType}" />
        <input type="hidden" name="client_id" value="${client.clientId}" />
        <input type="hidden" name="redirect_uri" value="${redirectUri}" />
        <input type="hidden" name="scope" value="${scopes.join(' ')}" />
        ${state ? html`<input type="hidden" name="state" value="${state}" />` : ''}
        ${codeChallenge ? html`<input type="hidden" name="code_challenge" value="${codeChallenge}" />` : ''}
        ${codeChallengeMethod ? html`<input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}" />` : ''}

        <!-- Trust Option -->
        <div class="form-group">
          <div class="form-check">
            <input
              type="checkbox"
              class="form-check-input"
              id="trust_application"
              name="trust_application"
              value="1"
            />
            <label class="form-check-label" for="trust_application">
              Trust this application (don't ask again)
            </label>
          </div>
          <small class="form-text">
            You won't be asked for permission next time this application requests access with the same permissions.
          </small>
        </div>

        <!-- Action Buttons -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <button
            type="submit"
            name="decision"
            value="deny"
            class="btn btn-secondary"
            style="order: 1;"
          >
            Deny
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            class="btn btn-primary"
            style="order: 2;"
          >
            Allow
          </button>
        </div>
      </form>

      <div style="text-align: center; margin-top: 2rem;">
        <a href="/logout" style="color: var(--color-text-muted); font-size: 0.875rem;">
          Not ${user.name}? Sign out
        </a>
      </div>
    </div>
  `;

  return BaseLayout({
    title: `Authorize ${client.name || 'Application'}`,
    content,
    config,
    user,
    error: null // Error shown in page
  });
}

export default ConsentPage;
