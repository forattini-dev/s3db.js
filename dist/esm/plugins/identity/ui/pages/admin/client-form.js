/**
 * Admin OAuth2 Client Form Page (Create/Edit)
 */
import { html } from 'hono/html';
import { BaseLayout } from '../../layouts/base.js';
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
    const inputClasses = [
        'block w-full rounded-2xl border border-white/10 bg-white/[0.08]',
        'px-4 py-2.5 text-sm text-white placeholder:text-slate-300/70',
        'shadow-[0_1px_0_rgba(255,255,255,0.05)] transition focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/30'
    ].join(' ');
    const checkboxClasses = [
        'h-4 w-4 rounded border-white/30 bg-slate-900/70 text-primary',
        'focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 focus:outline-none'
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
        'px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 focus:outline-none focus:ring-2 focus:ring-red-400/40'
    ].join(' ');
    const grantTypesList = availableGrantTypes.length > 0 ? availableGrantTypes : ['authorization_code', 'refresh_token', 'client_credentials'];
    const scopesList = availableScopes.length > 0 ? availableScopes : ['openid', 'profile', 'email', 'offline_access'];
    const content = html `
    <section class="mx-auto w-full max-w-4xl space-y-8 text-slate-100">
      <header>
        <a href="/admin/clients" class="text-sm font-semibold text-primary transition hover:text-white">
          ← Back to Clients
        </a>
        <h1 class="mt-3 text-3xl font-semibold text-white md:text-4xl">
          ${isEditMode ? 'Edit' : 'Create'} OAuth2 Client
        </h1>
        <p class="mt-2 text-sm text-slate-300">
          Configure redirect URIs, grant types, and scopes available for this client.
        </p>
      </header>

      <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-8 shadow-xl shadow-black/30 backdrop-blur">
        <form method="POST" action="${isEditMode ? `/admin/clients/${client.id}/update` : '/admin/clients/create'}" class="space-y-6">
          <div class="space-y-2">
            <label for="name" class="text-sm font-semibold text-slate-200">Client Name</label>
            <input
              type="text"
              class="${inputClasses} ${error ? 'border-red-400/60 focus:border-red-400 focus:ring-red-400/40' : ''}"
              id="name"
              name="name"
              value="${clientData.name}"
              required
              autofocus
              placeholder="My Application"
            />
            <p class="text-xs text-slate-400">A friendly name for this OAuth2 client</p>
            ${error ? html `<p class="text-xs text-red-200">${error}</p>` : ''}
          </div>

          <div class="space-y-3">
            <label class="text-sm font-semibold text-slate-200">Redirect URIs</label>
            <div id="redirect-uris-container" class="space-y-2">
              ${(Array.isArray(clientData.redirectUris) ? clientData.redirectUris : ['']).map((uri, index) => html `
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <input
                    type="url"
                    class="${inputClasses}"
                    name="redirectUris[]"
                    value="${uri}"
                    required
                    placeholder="https://example.com/callback"
                  />
                  ${index > 0 ? html `
                    <button type="button" class="${dangerButtonClass} shrink-0" onclick="this.parentElement.remove()">
                      ✕
                    </button>
                  ` : ''}
                </div>
              `)}
            </div>
            <button type="button" class="${secondaryButtonClass}" onclick="addRedirectUri()">
              + Add Another URI
            </button>
            <p class="text-xs text-slate-400">
              Where users will be redirected after authorization.
            </p>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-semibold text-slate-200">Grant Types</label>
            <div class="grid gap-2 sm:grid-cols-2">
              ${grantTypesList.map(type => {
        const isChecked = Array.isArray(clientData.grantTypes) && clientData.grantTypes.includes(type);
        return html `
                  <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      class="${checkboxClasses}"
                      id="grant_${type}"
                      name="grantTypes[]"
                      value="${type}"
                      ${isChecked ? 'checked' : ''}
                    />
                    <span><code>${type}</code></span>
                  </label>
                `;
    })}
            </div>
            <p class="text-xs text-slate-400">OAuth2 grant types this client can use.</p>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-semibold text-slate-200">Allowed Scopes</label>
            <div class="grid gap-2 sm:grid-cols-2">
              ${scopesList.map(scope => {
        const isChecked = Array.isArray(clientData.allowedScopes) && clientData.allowedScopes.includes(scope);
        return html `
                  <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      class="${checkboxClasses}"
                      id="scope_${scope}"
                      name="allowedScopes[]"
                      value="${scope}"
                      ${isChecked ? 'checked' : ''}
                    />
                    <span><code>${scope}</code></span>
                  </label>
                `;
    })}
            </div>
            <p class="text-xs text-slate-400">Scopes this client is allowed to request.</p>
          </div>

          <label class="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              class="${checkboxClasses} mt-1"
              id="active"
              name="active"
              value="1"
              ${clientData.active !== false ? 'checked' : ''}
            />
            <span>
              <strong class="text-white">Active</strong>
              <br>
              Client can authenticate and receive tokens.
            </span>
          </label>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-start">
            <button type="submit" class="${primaryButtonClass} sm:w-auto" style="box-shadow: 0 18px 45px var(--color-primary-glow);">
              ${isEditMode ? 'Update Client' : 'Create Client'}
            </button>
            <a href="/admin/clients" class="${secondaryButtonClass}">
              Cancel
            </a>
          </div>
        </form>
      </div>

      ${isEditMode ? html `
        <div class="rounded-3xl border border-white/15 bg-white/[0.06] px-6 py-4 text-sm text-slate-200 shadow-inner shadow-black/20">
          <strong class="text-white">Note:</strong>
          The client secret cannot be displayed again after creation. If you need a new secret, use the "Rotate Secret"
          action on the clients list page.
        </div>
      ` : ''}
    </section>

    <script>
      const redirectInputClasses = ${JSON.stringify(inputClasses)};
      const dangerButtonClasses = ${JSON.stringify(dangerButtonClass)};

      function addRedirectUri() {
        const container = document.getElementById('redirect-uris-container');
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3';

        const input = document.createElement('input');
        input.type = 'url';
        input.name = 'redirectUris[]';
        input.required = true;
        input.placeholder = 'https://example.com/callback';
        input.className = redirectInputClasses;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = dangerButtonClasses + ' shrink-0';
        button.textContent = '✕';
        button.addEventListener('click', () => wrapper.remove());

        wrapper.appendChild(input);
        wrapper.appendChild(button);
        container.appendChild(wrapper);
      }
    </script>
  `;
    return BaseLayout({
        title: `${isEditMode ? 'Edit' : 'Create'} OAuth2 Client - Admin`,
        content: content,
        config,
        user,
        error: null
    });
}
export default AdminClientFormPage;
//# sourceMappingURL=client-form.js.map