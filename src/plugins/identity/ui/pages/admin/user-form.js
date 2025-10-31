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

  const inputClasses = [
    'block w-full rounded-2xl border border-white/10 bg-white/[0.08]',
    'px-4 py-2.5 text-sm text-white placeholder:text-slate-300/70',
    'shadow-[0_1px_0_rgba(255,255,255,0.05)] transition focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/30'
  ].join(' ');

  const checkboxClasses = [
    'h-4 w-4 rounded border-white/30 bg-slate-900/70 text-primary',
    'focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 focus:outline-none'
  ].join(' ');

  const radioClasses = [
    'h-4 w-4 border-white/30 text-primary focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 focus:outline-none'
  ].join(' ');

  const primaryButtonClass = [
    'inline-flex items-center justify-center rounded-2xl bg-gradient-to-r',
    'from-primary via-primary to-secondary px-5 py-2.5 text-sm font-semibold text-white',
    'transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30'
  ].join(' ');

  const secondaryButtonClass = [
    'inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06]',
    'px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.12]',
    'focus:outline-none focus:ring-2 focus:ring-white/20'
  ].join(' ');

  const dangerButtonClass = [
    'inline-flex items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/10',
    'px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 focus:outline-none focus:ring-2 focus:ring-red-400/40'
  ].join(' ');

  const statusOptions = [
    {
      value: 'active',
      title: 'Active',
      description: 'User can log in and access services.'
    },
    {
      value: 'suspended',
      title: 'Suspended',
      description: 'User cannot log in.'
    },
    {
      value: 'pending_verification',
      title: 'Pending Verification',
      description: 'Awaiting email verification.'
    }
  ];

  const roleOptions = [
    {
      value: 'user',
      title: 'User',
      description: 'Standard access to identity provider services.'
    },
    {
      value: 'admin',
      title: 'Administrator',
      description: 'Full administrative access.'
    }
  ];

  const content = html`
    <section class="mx-auto w-full max-w-4xl space-y-8 text-slate-100">
      <header>
        <a href="/admin/users" class="text-sm font-semibold text-primary transition hover:text-white">
          ← Back to Users
        </a>
        <h1 class="mt-3 text-3xl font-semibold text-white md:text-4xl">
          Edit User: ${editUser.name}
        </h1>
        <p class="mt-2 text-sm text-slate-300">
          Update profile details, status, and permissions for this user.
        </p>
      </header>

      <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-8 shadow-xl shadow-black/30 backdrop-blur">
        <form method="POST" action="/admin/users/${editUser.id}/update" class="space-y-6">
          <div class="space-y-2">
            <label for="name" class="text-sm font-semibold text-slate-200">Full Name</label>
            <input
              type="text"
              class="${inputClasses} ${error ? 'border-red-400/60 focus:border-red-400 focus:ring-red-400/40' : ''}"
              id="name"
              name="name"
              value="${editUser.name}"
              required
              autofocus
              placeholder="John Doe"
            />
            <p class="text-xs text-slate-400">User's display name.</p>
            ${error ? html`<p class="text-xs text-red-200">${error}</p>` : ''}
          </div>

          <div class="space-y-2">
            <label for="email" class="text-sm font-semibold text-slate-200">Email Address</label>
            <input
              type="email"
              class="${inputClasses}"
              id="email"
              name="email"
              value="${editUser.email}"
              required
              placeholder="user@example.com"
            />
            <p class="text-xs text-slate-400">Email address used for login and notifications.</p>
          </div>

          <div class="space-y-3">
            <span class="text-sm font-semibold text-slate-200">Account Status</span>
            <div class="grid gap-3">
              ${statusOptions.map(option => html`
                <label class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                  <input
                    type="radio"
                    class="${radioClasses} mt-1"
                    id="status_${option.value}"
                    name="status"
                    value="${option.value}"
                    ${editUser.status === option.value ? 'checked' : ''}
                    ${isCurrentUser ? 'disabled' : ''}
                  />
                  <span>
                    <strong class="text-white">${option.title}</strong><br>
                    <span class="text-xs text-slate-400">${option.description}</span>
                  </span>
                </label>
              `)}
            </div>
            ${isCurrentUser ? html`
              <p class="text-xs text-amber-300">You cannot change your own status.</p>
            ` : ''}
          </div>

          <div class="space-y-3">
            <span class="text-sm font-semibold text-slate-200">Role</span>
            <div class="grid gap-3">
              ${roleOptions.map(option => html`
                <label class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                  <input
                    type="radio"
                    class="${radioClasses} mt-1"
                    id="role_${option.value}"
                    name="role"
                    value="${option.value}"
                    ${editUser.role === option.value ? 'checked' : ''}
                    ${isCurrentUser ? 'disabled' : ''}
                  />
                  <span>
                    <strong class="text-white">${option.title}</strong><br>
                    <span class="text-xs text-slate-400">${option.description}</span>
                  </span>
                </label>
              `)}
            </div>
            ${isCurrentUser ? html`
              <p class="text-xs text-amber-300">You cannot change your own role.</p>
            ` : ''}
          </div>

          <label class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              class="${checkboxClasses} mt-1"
              id="emailVerified"
              name="emailVerified"
              value="1"
              ${editUser.emailVerified ? 'checked' : ''}
            />
            <span>
              <strong class="text-white">Email Verified</strong><br>
              <span class="text-xs text-slate-400">User has confirmed their email address.</span>
            </span>
          </label>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start">
            <button type="submit" class="${primaryButtonClass} sm:w-auto" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
              Update User
            </button>
            <a href="/admin/users" class="${secondaryButtonClass}">
              Cancel
            </a>
          </div>
        </form>
      </div>

      <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
        <h2 class="text-lg font-semibold text-white">User Information</h2>
        <dl class="mt-4 divide-y divide-white/10 text-sm text-slate-200">
          <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <dt class="text-slate-400">User ID</dt>
            <dd>
              <code class="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-1 text-xs text-slate-200">
                ${editUser.id}
              </code>
            </dd>
          </div>
          ${editUser.createdAt ? html`
            <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <dt class="text-slate-400">Joined</dt>
              <dd>${new Date(editUser.createdAt).toLocaleString()}</dd>
            </div>
          ` : ''}
          ${editUser.updatedAt ? html`
            <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <dt class="text-slate-400">Last Updated</dt>
              <dd>${new Date(editUser.updatedAt).toLocaleString()}</dd>
            </div>
          ` : ''}
          <div class="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <dt class="text-slate-400">Last Login</dt>
            <dd>${editUser.lastLoginAt ? new Date(editUser.lastLoginAt).toLocaleString() : html`<span class="text-slate-400">Never</span>`}</dd>
          </div>
        </dl>
      </div>

      ${!isCurrentUser ? html`
        <div class="rounded-3xl border border-red-500/40 bg-red-500/5 shadow-xl shadow-black/30 backdrop-blur">
          <div class="rounded-t-3xl border-b border-red-500/40 bg-red-500/20 px-6 py-4 text-white">
            <h2 class="text-lg font-semibold">Danger Zone</h2>
          </div>
          <div class="space-y-6 px-6 py-6 text-sm text-slate-100">
            <div>
              <h3 class="text-base font-semibold text-white">Send Password Reset Email</h3>
              <p class="mt-2 text-xs text-red-100">
                Send a password reset link to ${editUser.email}.
              </p>
              <form method="POST" action="/admin/users/${editUser.id}/reset-password" onsubmit="return confirm('Send password reset email to ${editUser.email}?')">
                <button type="submit" class="${secondaryButtonClass} mt-3">
                  🔑 Send Password Reset
                </button>
              </form>
            </div>

            <div class="border-t border-red-500/30 pt-6">
              <h3 class="text-base font-semibold text-white">Delete User Account</h3>
              <p class="mt-2 text-xs text-red-100">
                Permanently delete this user account. This action cannot be undone.
              </p>
              <form method="POST" action="/admin/users/${editUser.id}/delete" onsubmit="return confirm('Are you sure you want to delete ${editUser.name}? This action cannot be undone.')">
                <button type="submit" class="${dangerButtonClass} mt-3">
                  🗑️ Delete User
                </button>
              </form>
            </div>
          </div>
        </div>
      ` : ''}
    </section>
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
