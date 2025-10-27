/**
 * User Profile Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../layouts/base.js';

/**
 * Render user profile page
 * @param {Object} props - Page properties
 * @param {Object} props.user - User data
 * @param {Array} [props.sessions] - Active sessions
 * @param {string} [props.error] - Error message
 * @param {string} [props.success] - Success message
 * @param {Object} [props.passwordPolicy] - Password policy configuration
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function ProfilePage(props = {}) {
  const { user = {}, sessions = [], error = null, success = null, passwordPolicy = {}, config = {} } = props;

  // Extract password policy
  const minLength = passwordPolicy.minLength || 8;
  const maxLength = passwordPolicy.maxLength || 128;
  const requireUppercase = passwordPolicy.requireUppercase !== false;
  const requireLowercase = passwordPolicy.requireLowercase !== false;
  const requireNumbers = passwordPolicy.requireNumbers !== false;
  const requireSymbols = passwordPolicy.requireSymbols || false;

  // Build password requirements text
  const requirements = [];
  requirements.push(`${minLength}-${maxLength} characters`);
  if (requireUppercase) requirements.push('uppercase letter');
  if (requireLowercase) requirements.push('lowercase letter');
  if (requireNumbers) requirements.push('number');
  if (requireSymbols) requirements.push('symbol');

  const content = html`
    <div class="container">
      <h1 class="mb-4">My Profile</h1>

      <!-- Profile Information Card -->
      <div class="card mb-4">
        <div class="card-header">
          Profile Information
        </div>
        <form method="POST" action="/profile/update">
          <div class="p-3">
            <div class="form-group">
              <label for="name" class="form-label form-label-required">Full Name</label>
              <input
                type="text"
                class="form-control"
                id="name"
                name="name"
                value="${user.name || ''}"
                required
                minlength="2"
                maxlength="100"
              />
            </div>

            <div class="form-group">
              <label for="email" class="form-label form-label-required">Email Address</label>
              <input
                type="email"
                class="form-control"
                id="email"
                name="email"
                value="${user.email || ''}"
                required
                autocomplete="email"
              />
              ${user.emailVerified
                ? html`<small class="form-text text-success">✓ Verified</small>`
                : html`<small class="form-text text-danger">⚠ Not verified - <a href="/verify-email/resend" class="btn-link">Resend verification email</a></small>`
              }
            </div>

            <div class="form-group mb-0">
              <button type="submit" class="btn btn-primary">
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>

      <!-- Change Password Card -->
      <div class="card mb-4">
        <div class="card-header">
          Change Password
        </div>
        <form method="POST" action="/profile/change-password">
          <div class="p-3">
            <div class="form-group">
              <label for="current_password" class="form-label form-label-required">Current Password</label>
              <input
                type="password"
                class="form-control"
                id="current_password"
                name="current_password"
                required
                autocomplete="current-password"
              />
            </div>

            <div class="form-group">
              <label for="new_password" class="form-label form-label-required">New Password</label>
              <input
                type="password"
                class="form-control"
                id="new_password"
                name="new_password"
                required
                autocomplete="new-password"
                minlength="${minLength}"
                maxlength="${maxLength}"
              />
              <small class="form-text">
                Must contain: ${requirements.join(', ')}
              </small>
            </div>

            <div class="form-group">
              <label for="confirm_new_password" class="form-label form-label-required">Confirm New Password</label>
              <input
                type="password"
                class="form-control"
                id="confirm_new_password"
                name="confirm_new_password"
                required
                autocomplete="new-password"
              />
            </div>

            <div class="form-group mb-0">
              <button type="submit" class="btn btn-primary">
                Change Password
              </button>
            </div>
          </div>
        </form>
      </div>

      <!-- Active Sessions Card -->
      <div class="card mb-4">
        <div class="card-header">
          Active Sessions
          <span class="badge" style="background-color: var(--color-primary); color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.875rem; margin-left: 0.5rem;">
            ${sessions.length}
          </span>
        </div>
        <div class="p-3">
          ${sessions.length === 0 ? html`
            <p class="text-muted">No active sessions</p>
          ` : html`
            <p class="text-muted mb-3">
              You are currently logged in on these devices. If you see a session you don't recognize, log it out immediately.
            </p>

            ${sessions.map((session, index) => {
              const isCurrentSession = session.isCurrent;
              const createdAt = new Date(session.createdAt);
              const expiresAt = new Date(session.expiresAt);

              return html`
                <div class="session-item" style="border: 1px solid var(--color-border); border-radius: var(--border-radius); padding: 1rem; margin-bottom: 1rem; ${isCurrentSession ? 'background-color: #f0f9ff;' : ''}">
                  <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                      <div style="font-weight: 500; margin-bottom: 0.5rem;">
                        ${session.userAgent || 'Unknown device'}
                        ${isCurrentSession ? html`<span class="badge" style="background-color: var(--color-success); color: white; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.75rem; margin-left: 0.5rem;">Current</span>` : ''}
                      </div>
                      <div style="font-size: 0.875rem; color: var(--color-text-muted);">
                        <div>IP: ${session.ipAddress || 'Unknown'}</div>
                        <div>Created: ${createdAt.toLocaleString()}</div>
                        <div>Expires: ${expiresAt.toLocaleString()}</div>
                      </div>
                    </div>
                    ${!isCurrentSession ? html`
                      <form method="POST" action="/profile/logout-session" style="margin: 0;">
                        <input type="hidden" name="session_id" value="${session.id}" />
                        <button type="submit" class="btn btn-danger" style="font-size: 0.875rem; padding: 0.5rem 1rem;">
                          Logout
                        </button>
                      </form>
                    ` : ''}
                  </div>
                </div>
              `;
            })}

            ${sessions.length > 1 ? html`
              <form method="POST" action="/profile/logout-all-sessions" style="margin-top: 1rem;">
                <button type="submit" class="btn btn-danger">
                  Logout All Other Sessions
                </button>
              </form>
            ` : ''}
          `}
        </div>
      </div>

      <!-- Account Information Card -->
      <div class="card mb-4">
        <div class="card-header">
          Account Information
        </div>
        <div class="p-3">
          <div class="info-row" style="display: flex; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
            <div style="font-weight: 500; width: 200px;">Account Status:</div>
            <div>
              ${user.status === 'active' ? html`<span style="color: var(--color-success);">✓ Active</span>` : ''}
              ${user.status === 'pending_verification' ? html`<span style="color: var(--color-warning);">⏳ Pending Verification</span>` : ''}
              ${user.status === 'suspended' ? html`<span style="color: var(--color-danger);">⚠ Suspended</span>` : ''}
            </div>
          </div>
          ${user.isAdmin ? html`
            <div class="info-row" style="display: flex; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
              <div style="font-weight: 500; width: 200px;">Role:</div>
              <div><span style="color: var(--color-primary);">👑 Administrator</span></div>
            </div>
          ` : ''}
          ${user.lastLoginAt ? html`
            <div class="info-row" style="display: flex; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
              <div style="font-weight: 500; width: 200px;">Last Login:</div>
              <div>${new Date(user.lastLoginAt).toLocaleString()}</div>
            </div>
          ` : ''}
          ${user.lastLoginIp ? html`
            <div class="info-row" style="display: flex; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
              <div style="font-weight: 500; width: 200px;">Last Login IP:</div>
              <div>${user.lastLoginIp}</div>
            </div>
          ` : ''}
          ${user.createdAt ? html`
            <div class="info-row" style="display: flex; padding: 0.5rem 0;">
              <div style="font-weight: 500; width: 200px;">Member Since:</div>
              <div>${new Date(user.createdAt).toLocaleDateString()}</div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  return BaseLayout({
    title: 'My Profile',
    content,
    config,
    user,
    error,
    success
  });
}

export default ProfilePage;
