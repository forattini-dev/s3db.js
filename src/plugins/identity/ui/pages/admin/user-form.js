/**
 * Admin User Edit Form Page
 */

import { html } from 'hono/html';
import { BaseLayout } from '../../layouts/base.js';

/**
 * Render user edit form page
 * @param {Object} props - Page properties
 * @param {Object} props.editUser - User being edited
 * @param {Object} props.user - Current user
 * @param {string} [props.error] - Error message
 * @param {Object} [props.config] - UI configuration
 * @returns {string} HTML string
 */
export function AdminUserFormPage(props = {}) {
  const { editUser = {}, user = {}, error = null, config = {} } = props;

  const isCurrentUser = editUser.id === user.id;

  const content = html`
    <div class="container-sm">
      <div style="margin-bottom: 2rem;">
        <a href="/admin/users" class="btn-link" style="font-size: 0.875rem;">← Back to Users</a>
        <h1 class="mt-3">Edit User: ${editUser.name}</h1>
      </div>

      <div class="card">
        <form method="POST" action="/admin/users/${editUser.id}/update">
          <div class="p-3">
            <!-- Name -->
            <div class="form-group">
              <label for="name" class="form-label form-label-required">Full Name</label>
              <input
                type="text"
                class="form-control ${error ? 'is-invalid' : ''}"
                id="name"
                name="name"
                value="${editUser.name}"
                required
                autofocus
                placeholder="John Doe"
              />
              <small class="form-text">User's display name</small>
              ${error ? html`<div class="invalid-feedback">${error}</div>` : ''}
            </div>

            <!-- Email -->
            <div class="form-group">
              <label for="email" class="form-label form-label-required">Email Address</label>
              <input
                type="email"
                class="form-control"
                id="email"
                name="email"
                value="${editUser.email}"
                required
                placeholder="user@example.com"
              />
              <small class="form-text">Email address for login and notifications</small>
            </div>

            <!-- Status -->
            <div class="form-group">
              <label class="form-label form-label-required">Account Status</label>
              <div style="display: grid; gap: 0.75rem;">
                <div class="form-check">
                  <input
                    type="radio"
                    class="form-check-input"
                    id="status_active"
                    name="status"
                    value="active"
                    ${editUser.status === 'active' ? 'checked' : ''}
                    ${isCurrentUser ? 'disabled' : ''}
                  />
                  <label class="form-check-label" for="status_active">
                    <strong>Active</strong> - User can log in and access services
                  </label>
                </div>
                <div class="form-check">
                  <input
                    type="radio"
                    class="form-check-input"
                    id="status_suspended"
                    name="status"
                    value="suspended"
                    ${editUser.status === 'suspended' ? 'checked' : ''}
                    ${isCurrentUser ? 'disabled' : ''}
                  />
                  <label class="form-check-label" for="status_suspended">
                    <strong>Suspended</strong> - User cannot log in
                  </label>
                </div>
                <div class="form-check">
                  <input
                    type="radio"
                    class="form-check-input"
                    id="status_pending"
                    name="status"
                    value="pending_verification"
                    ${editUser.status === 'pending_verification' ? 'checked' : ''}
                    ${isCurrentUser ? 'disabled' : ''}
                  />
                  <label class="form-check-label" for="status_pending">
                    <strong>Pending Verification</strong> - Awaiting email verification
                  </label>
                </div>
              </div>
              ${isCurrentUser ? html`
                <small class="form-text" style="color: var(--color-warning);">You cannot change your own status</small>
              ` : ''}
            </div>

            <!-- Role -->
            <div class="form-group">
              <label class="form-label form-label-required">Role</label>
              <div style="display: grid; gap: 0.75rem;">
                <div class="form-check">
                  <input
                    type="radio"
                    class="form-check-input"
                    id="role_user"
                    name="role"
                    value="user"
                    ${editUser.role !== 'admin' ? 'checked' : ''}
                    ${isCurrentUser ? 'disabled' : ''}
                  />
                  <label class="form-check-label" for="role_user">
                    <strong>User</strong> - Standard user access
                  </label>
                </div>
                <div class="form-check">
                  <input
                    type="radio"
                    class="form-check-input"
                    id="role_admin"
                    name="role"
                    value="admin"
                    ${editUser.role === 'admin' ? 'checked' : ''}
                    ${isCurrentUser ? 'disabled' : ''}
                  />
                  <label class="form-check-label" for="role_admin">
                    <strong>Admin</strong> - Full administrative access
                  </label>
                </div>
              </div>
              ${isCurrentUser ? html`
                <small class="form-text" style="color: var(--color-warning);">You cannot change your own role</small>
              ` : ''}
            </div>

            <!-- Email Verification -->
            <div class="form-group">
              <div class="form-check">
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="emailVerified"
                  name="emailVerified"
                  value="1"
                  ${editUser.emailVerified ? 'checked' : ''}
                />
                <label class="form-check-label" for="emailVerified">
                  <strong>Email Verified</strong> - User has confirmed their email address
                </label>
              </div>
            </div>

            <!-- Submit Buttons -->
            <div class="form-group mb-0" style="display: flex; gap: 1rem;">
              <button type="submit" class="btn btn-primary">
                Update User
              </button>
              <a href="/admin/users" class="btn btn-secondary">
                Cancel
              </a>
            </div>
          </div>
        </form>
      </div>

      <!-- User Information -->
      <div class="card mt-4">
        <div class="card-header">
          User Information
        </div>
        <div class="p-3">
          <div style="display: grid; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
              <span style="font-weight: 500;">User ID:</span>
              <code style="background: var(--color-light); padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.875rem;">
                ${editUser.id}
              </code>
            </div>
            ${editUser.createdAt ? html`
              <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
                <span style="font-weight: 500;">Joined:</span>
                <span>${new Date(editUser.createdAt).toLocaleString()}</span>
              </div>
            ` : ''}
            ${editUser.updatedAt ? html`
              <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
                <span style="font-weight: 500;">Last Updated:</span>
                <span>${new Date(editUser.updatedAt).toLocaleString()}</span>
              </div>
            ` : ''}
            ${editUser.lastLoginAt ? html`
              <div style="display: flex; justify-content: space-between; padding: 0.5rem 0;">
                <span style="font-weight: 500;">Last Login:</span>
                <span>${new Date(editUser.lastLoginAt).toLocaleString()}</span>
              </div>
            ` : html`
              <div style="display: flex; justify-content: space-between; padding: 0.5rem 0;">
                <span style="font-weight: 500;">Last Login:</span>
                <span style="color: var(--color-text-muted);">Never</span>
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      ${!isCurrentUser ? html`
        <div class="card mt-4" style="border-color: var(--color-danger);">
          <div class="card-header" style="background-color: var(--color-danger); color: white;">
            Danger Zone
          </div>
          <div class="p-3">
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <!-- Send Password Reset -->
              <div>
                <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">Send Password Reset Email</h3>
                <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.75rem;">
                  Send a password reset link to ${editUser.email}
                </p>
                <form method="POST" action="/admin/users/${editUser.id}/reset-password" style="margin: 0;">
                  <button
                    type="submit"
                    class="btn btn-secondary"
                    onclick="return confirm('Send password reset email to ${editUser.email}?')"
                  >
                    🔑 Send Password Reset
                  </button>
                </form>
              </div>

              <!-- Delete User -->
              <div style="padding-top: 1rem; border-top: 1px solid var(--color-border);">
                <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">Delete User Account</h3>
                <p style="color: var(--color-text-muted); font-size: 0.875rem; margin-bottom: 0.75rem;">
                  Permanently delete this user account. This action cannot be undone.
                </p>
                <form method="POST" action="/admin/users/${editUser.id}/delete" style="margin: 0;">
                  <button
                    type="submit"
                    class="btn btn-danger"
                    onclick="return confirm('Are you sure you want to delete ${editUser.name}? This action cannot be undone.')"
                  >
                    🗑️ Delete User
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  return BaseLayout({
    title: `Edit User: ${editUser.name} - Admin`,
    content,
    config,
    user,
    error: null // Error shown in form
  });
}

export default AdminUserFormPage;
