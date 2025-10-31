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

  const checkboxClasses = [
    'h-5 w-5 rounded border-white/30 bg-slate-900/70 text-primary',
    'focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 focus:outline-none'
  ].join(' ');

  const primaryButtonClasses = [
    'inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r',
    'from-primary via-primary to-secondary px-5 py-3 text-sm font-semibold text-white',
    'transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/30'
  ].join(' ');

  const secondaryButtonClasses = [
    'inline-flex w-full items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06]',
    'px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-white/[0.12]',
    'focus:outline-none focus:ring-2 focus:ring-white/20'
  ].join(' ');

  const content = html`
    <section class="mx-auto w-full max-w-5xl space-y-8 text-slate-100">
      <header class="space-y-4 text-center">
        ${config.logoUrl ? html`
          <div class="flex justify-center">
            <img src="${config.logoUrl}" alt="${config.title || 'Identity Logo'}" class="h-14 w-auto" />
          </div>
        ` : ''}
        <div>
          <h1 class="text-3xl font-semibold text-white md:text-4xl">Authorize Application</h1>
          <p class="mt-2 text-sm text-slate-300 md:text-base">
            <span class="font-semibold text-white">${client.name || 'Application'}</span>
            is requesting access to your account.
          </p>
        </div>
      </header>

      ${error ? html`
        <div class="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100 shadow-md shadow-red-900/30">
          ${error}
        </div>
      ` : ''}

      <div class="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-6">
          <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
            <h2 class="text-lg font-semibold text-white">Application Information</h2>
            <dl class="mt-4 space-y-4 text-sm text-slate-200">
              <div class="flex flex-col gap-1">
                <dt class="text-xs uppercase tracking-wide text-slate-400">Application Name</dt>
                <dd class="text-base font-semibold text-white">${client.name || 'Unknown Application'}</dd>
              </div>

              ${client.description ? html`
                <div class="flex flex-col gap-1">
                  <dt class="text-xs uppercase tracking-wide text-slate-400">Description</dt>
                  <dd>${client.description}</dd>
                </div>
              ` : ''}

              <div class="flex flex-col gap-1">
                <dt class="text-xs uppercase tracking-wide text-slate-400">Client ID</dt>
                <dd>
                  <code class="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs text-slate-200">
                    ${client.clientId}
                  </code>
                </dd>
              </div>

              <div class="flex flex-col gap-1">
                <dt class="text-xs uppercase tracking-wide text-slate-400">Will Redirect To</dt>
                <dd>
                  <code class="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs text-slate-200">
                    ${redirectUri}
                  </code>
                </dd>
              </div>
            </dl>
          </div>

          <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
            <h2 class="text-lg font-semibold text-white">Requested Permissions</h2>
            <div class="mt-4 space-y-4">
              ${scopeDetails.length === 0 ? html`
                <p class="text-sm italic text-slate-300">
                  This application is not requesting any specific permissions.
                </p>
              ` : scopeDetails.map(s => html`
                <div class="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <div class="text-3xl leading-none">${s.icon}</div>
                  <div class="space-y-1">
                    <div class="text-sm font-semibold text-white">${s.name}</div>
                    <p class="text-xs text-slate-300">${s.description}</p>
                  </div>
                </div>
              `)}
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
            <div class="flex gap-4">
              <div class="text-2xl">ℹ️</div>
              <div class="space-y-3 text-sm text-slate-200">
                <p class="text-base font-semibold text-white">
                  Signed in as ${user.name}
                </p>
                <p>
                  By clicking <strong>Allow</strong>, you authorize
                  <strong>${client.name || 'this application'}</strong> to access your information as described above.
                </p>
                <p>
                  You can revoke this access at any time from your
                  <a href="/profile" class="font-semibold text-primary transition hover:text-white">profile settings</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <form method="POST" action="/oauth/consent" class="space-y-6 rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/30 backdrop-blur">
        <input type="hidden" name="response_type" value="${responseType}" />
        <input type="hidden" name="client_id" value="${client.clientId}" />
        <input type="hidden" name="redirect_uri" value="${redirectUri}" />
        <input type="hidden" name="scope" value="${scopes.join(' ')}" />
        ${state ? html`<input type="hidden" name="state" value="${state}" />` : ''}
        ${codeChallenge ? html`<input type="hidden" name="code_challenge" value="${codeChallenge}" />` : ''}
        ${codeChallengeMethod ? html`<input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}" />` : ''}

        <label class="flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            class="${checkboxClasses} mt-0.5"
            id="trust_application"
            name="trust_application"
            value="1"
          />
          <span>
            Trust this application (don't ask again)<br>
            <span class="text-xs text-slate-400">
              You won't be asked for permission next time this application requests access with the same permissions.
            </span>
          </span>
        </label>

        <div class="grid gap-3 sm:grid-cols-2">
          <button
            type="submit"
            name="decision"
            value="deny"
            class="${secondaryButtonClasses}"
          >
            Deny
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            class="${primaryButtonClasses}"
            style="box-shadow: 0 18px 45px var(--color-primary-glow);"
          >
            Allow
          </button>
        </div>
      </form>

      <p class="text-center text-sm text-slate-300">
        Not ${user.name}? <a href="/logout" class="font-semibold text-primary transition hover:text-white">Sign out</a>
      </p>
    </section>
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
