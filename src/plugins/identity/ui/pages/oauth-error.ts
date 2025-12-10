/**
 * OAuth Error Page
 * Shows OAuth2/OIDC error messages with proper formatting
 */

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { BaseLayout, type ThemeConfig } from '../layouts/base.js';

export interface ErrorInfo {
  icon: string;
  title: string;
  color: string;
}

export type OAuthErrorCode =
  | 'invalid_request'
  | 'unauthorized_client'
  | 'access_denied'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'invalid_client'
  | 'invalid_grant';

export interface OAuthErrorPageProps {
  error?: OAuthErrorCode | string;
  errorDescription?: string;
  errorUri?: string | null;
  config?: ThemeConfig;
}

const ERROR_INFO: Record<OAuthErrorCode, ErrorInfo> = {
  invalid_request: {
    icon: '⚠️',
    title: 'Invalid Request',
    color: 'amber'
  },
  unauthorized_client: {
    icon: '🚫',
    title: 'Unauthorized Client',
    color: 'red'
  },
  access_denied: {
    icon: '🔒',
    title: 'Access Denied',
    color: 'red'
  },
  unsupported_response_type: {
    icon: '❌',
    title: 'Unsupported Response Type',
    color: 'orange'
  },
  invalid_scope: {
    icon: '⛔',
    title: 'Invalid Scope',
    color: 'red'
  },
  server_error: {
    icon: '💥',
    title: 'Server Error',
    color: 'red'
  },
  temporarily_unavailable: {
    icon: '⏸️',
    title: 'Temporarily Unavailable',
    color: 'yellow'
  },
  invalid_client: {
    icon: '🔑',
    title: 'Invalid Client',
    color: 'red'
  },
  invalid_grant: {
    icon: '⚠️',
    title: 'Invalid Grant',
    color: 'amber'
  }
};

export function OAuthErrorPage(props: OAuthErrorPageProps = {}): HtmlEscapedString {
  const {
    error = 'server_error',
    errorDescription = 'An error occurred during OAuth authorization.',
    errorUri = null,
    config = {}
  } = props;

  const info = ERROR_INFO[error as OAuthErrorCode] || ERROR_INFO.server_error;

  const content = html`
    <div class="mx-auto w-full max-w-2xl px-4 py-12">
      <div class="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl md:p-12">
        <!-- Error Icon & Title -->
        <div class="mb-8 text-center">
          <div class="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/20 text-4xl shadow-lg shadow-red-500/30">
            ${info.icon}
          </div>
          <h1 class="mb-2 text-3xl font-bold text-white">
            ${info.title}
          </h1>
          <p class="text-lg text-slate-400">
            OAuth Authorization Error
          </p>
        </div>

        <!-- Error Details -->
        <div class="mb-8 space-y-4">
          <!-- Error Code -->
          <div class="rounded-2xl border border-slate-700/30 bg-slate-800/30 p-6">
            <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Error Code
            </h2>
            <code class="block rounded-lg bg-slate-900/50 px-4 py-3 font-mono text-red-400">
              ${error}
            </code>
          </div>

          <!-- Error Description -->
          ${errorDescription ? html`
            <div class="rounded-2xl border border-slate-700/30 bg-slate-800/30 p-6">
              <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Description
              </h2>
              <p class="text-slate-200">
                ${errorDescription}
              </p>
            </div>
          ` : ''}

          <!-- Common Causes -->
          <div class="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6">
            <h2 class="mb-3 text-lg font-semibold text-blue-200">
              Common Causes
            </h2>
            <ul class="space-y-2 text-sm text-blue-300/80">
              ${error === 'invalid_request' ? html`
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Missing required parameters (client_id, redirect_uri, etc.)</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Malformed request parameters</span>
                </li>
              ` : ''}
              ${error === 'unauthorized_client' || error === 'invalid_client' ? html`
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Client ID not found or inactive</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Invalid client credentials</span>
                </li>
              ` : ''}
              ${error === 'invalid_scope' ? html`
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Requested scopes not allowed for this client</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Unknown or unsupported scope requested</span>
                </li>
              ` : ''}
              ${error === 'access_denied' ? html`
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>User denied authorization request</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Insufficient permissions for requested scopes</span>
                </li>
              ` : ''}
              ${error === 'server_error' ? html`
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Internal server error occurred</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="mt-0.5 flex-shrink-0">•</span>
                  <span>Temporary service disruption</span>
                </li>
              ` : ''}
            </ul>
          </div>
        </div>

        <!-- Actions -->
        <div class="space-y-3">
          ${errorUri ? html`
            <a
              href="${errorUri}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/40"
            >
              📖 View Documentation
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ` : ''}

          <a
            href="/login"
            class="flex w-full items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/30 px-6 py-3.5 font-medium text-slate-300 transition-all hover:border-slate-600/50 hover:bg-slate-800/50"
          >
            ← Back to Login
          </a>
        </div>

        <!-- Help Section -->
        ${config.supportEmail ? html`
          <div class="mt-8 rounded-xl border border-slate-700/30 bg-slate-800/20 px-6 py-4 text-center">
            <p class="text-sm text-slate-400">
              Need help?
              <a href="mailto:${config.supportEmail}" class="font-medium text-blue-400 hover:text-blue-300">
                Contact Support
              </a>
            </p>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  return BaseLayout({
    title: `OAuth Error: ${info.title}`,
    content: content as any,
    config,
    error: null,
    success: null
  });
}

export default OAuthErrorPage;
