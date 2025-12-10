/**
 * Admin OAuth2 Clients Management Page
 */
import { html } from 'hono/html';
import { BaseLayout } from '../../layouts/base.js';
export function AdminClientsPage(props = {}) {
    const { clients = [], user = {}, error = null, success = null, config = {} } = props;
    const primaryButtonClass = [
        'inline-flex items-center justify-center rounded-2xl bg-gradient-to-r',
        'from-primary via-primary to-secondary px-4 py-2.5 text-sm font-semibold text-white',
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
    const successButtonClass = [
        'inline-flex items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10',
        'px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/40'
    ].join(' ');
    const codeChipClass = 'rounded-xl border border-white/10 bg-white/[0.08] px-3 py-1 text-xs text-slate-200';
    const badgeClass = 'rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary';
    const content = html `
    <section class="mx-auto w-full max-w-6xl space-y-8 text-slate-100">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-3xl font-semibold text-white md:text-4xl">OAuth2 Clients</h1>
          <p class="mt-1 text-sm text-slate-300">
            Manage client credentials, redirect URIs, and allowed scopes.
          </p>
        </div>
        <a href="/admin/clients/new" class="${primaryButtonClass}">
          + New Client
        </a>
      </header>

      ${clients.length === 0 ? html `
        <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-10 text-center shadow-xl shadow-black/30 backdrop-blur">
          <p class="text-sm text-slate-300">
            No OAuth2 clients registered yet. Create your first client to start integrating applications.
          </p>
          <a href="/admin/clients/new" class="${primaryButtonClass} mt-6 inline-flex" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
            Create Your First Client
          </a>
        </div>
      ` : html `
        <div class="grid gap-6">
          ${clients.map(client => {
        const grantTypes = Array.isArray(client.grantTypes) ? client.grantTypes : [];
        const allowedScopes = Array.isArray(client.allowedScopes) ? client.allowedScopes : [];
        const redirectUris = Array.isArray(client.redirectUris) ? client.redirectUris : [];
        return html `
              <article class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
                <div class="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div class="flex flex-wrap items-center gap-3">
                    <h2 class="text-lg font-semibold text-white">${client.name}</h2>
                    ${client.active ? '' : html `
                      <span class="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-200">
                        Inactive
                      </span>
                    `}
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <a href="/admin/clients/${client.id}/edit" class="${secondaryButtonClass}">
                      Edit
                    </a>
                    <form method="POST" action="/admin/clients/${client.id}/delete" class="inline-flex" onsubmit="return confirm('Are you sure you want to delete this client? This action cannot be undone.')">
                      <button type="submit" class="${dangerButtonClass}">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                <div class="mt-4 space-y-6 text-sm text-slate-200">
                  <div>
                    <div class="text-xs uppercase tracking-wide text-slate-400">Client ID</div>
                    <code class="${codeChipClass} mt-2 block">${client.clientId}</code>
                  </div>

                  ${redirectUris.length > 0 ? html `
                    <div>
                      <div class="text-xs uppercase tracking-wide text-slate-400">
                        Redirect URIs (${redirectUris.length})
                      </div>
                      <div class="mt-2 flex flex-wrap gap-2">
                        ${redirectUris.map(uri => html `<code class="${codeChipClass}">${uri}</code>`)}
                      </div>
                    </div>
                  ` : ''}

                  ${grantTypes.length > 0 ? html `
                    <div>
                      <div class="text-xs uppercase tracking-wide text-slate-400">Grant Types</div>
                      <div class="mt-2 flex flex-wrap gap-2">
                        ${grantTypes.map(type => html `
                          <span class="${badgeClass}">
                            ${type}
                          </span>
                        `)}
                      </div>
                    </div>
                  ` : ''}

                  ${allowedScopes.length > 0 ? html `
                    <div>
                      <div class="text-xs uppercase tracking-wide text-slate-400">Allowed Scopes</div>
                      <div class="mt-2 flex flex-wrap gap-2">
                        ${allowedScopes.map(scope => html `
                          <span class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                            ${scope}
                          </span>
                        `)}
                      </div>
                    </div>
                  ` : ''}

                  ${client.createdAt ? html `
                    <div class="text-xs text-slate-400">
                      Created ${new Date(client.createdAt).toLocaleString()}
                    </div>
                  ` : ''}
                </div>

                <div class="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-4">
                  <form method="POST" action="/admin/clients/${client.id}/rotate-secret" class="inline-flex">
                    <button type="submit" class="${secondaryButtonClass}">
                      🔄 Rotate Secret
                    </button>
                  </form>
                  <form method="POST" action="/admin/clients/${client.id}/toggle-active" class="inline-flex">
                    <button type="submit" class="${client.active ? dangerButtonClass : successButtonClass}">
                      ${client.active ? '🔴 Deactivate' : '🟢 Activate'}
                    </button>
                  </form>
                </div>
              </article>
            `;
    })}
        </div>
      `}
    </section>
  `;
    return BaseLayout({
        title: 'OAuth2 Clients - Admin',
        content: content,
        config,
        user,
        error,
        success
    });
}
export default AdminClientsPage;
//# sourceMappingURL=clients.js.map