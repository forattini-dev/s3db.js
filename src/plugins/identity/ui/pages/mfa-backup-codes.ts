/**
 * MFA Backup Codes Page
 * Shows newly regenerated backup codes
 */

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { BaseLayout, type ThemeConfig } from '../layouts/base.js';

export interface MFABackupCodesPageProps {
  backupCodes?: string[];
  config?: ThemeConfig;
}

export function MFABackupCodesPage(props: MFABackupCodesPageProps = {}): HtmlEscapedString {
  const { backupCodes = [], config = {} } = props;

  const content = html`
    <div class="mx-auto w-full max-w-2xl px-4 py-12">
      <div class="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl md:p-12">
        <!-- Header -->
        <div class="mb-8 text-center">
          <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-3xl shadow-lg shadow-emerald-500/30">
            ✅
          </div>
          <h1 class="mb-2 text-3xl font-bold text-white">
            New Backup Codes Generated
          </h1>
          <p class="text-slate-400">
            Your old backup codes have been invalidated
          </p>
        </div>

        <!-- Warning Section -->
        <div class="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-xl">
              ⚠️
            </div>
            <div>
              <h2 class="mb-1 text-lg font-semibold text-amber-200">
                Important: Save These Codes
              </h2>
              <p class="text-sm text-amber-300/80">
                These codes replace your previous backup codes. Save them in a secure location now - you won't be able to see them again.
              </p>
            </div>
          </div>
        </div>

        <!-- Backup Codes Grid -->
        <div class="mb-8 rounded-2xl border border-slate-700/30 bg-slate-800/30 p-6">
          <h2 class="mb-4 text-center text-lg font-semibold text-white">
            Your New Backup Codes
          </h2>

          <div class="mb-6 grid grid-cols-2 gap-3">
            ${backupCodes.map(code => html`
              <div class="rounded-lg bg-slate-900/50 px-4 py-3 text-center">
                <code class="font-mono text-base text-slate-200">${code}</code>
              </div>
            `)}
          </div>

          <div class="space-y-3">
            <button
              type="button"
              onclick="downloadBackupCodes()"
              class="w-full rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/40"
            >
              💾 Download Backup Codes
            </button>

            <button
              type="button"
              onclick="copyAllCodes()"
              class="w-full rounded-xl border border-slate-700/50 bg-slate-800/30 px-6 py-3.5 font-medium text-slate-300 transition-all hover:border-slate-600/50 hover:bg-slate-800/50"
              id="copy-button"
            >
              📋 Copy to Clipboard
            </button>
          </div>
        </div>

        <!-- Instructions -->
        <div class="mb-8 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6">
          <h3 class="mb-3 text-lg font-semibold text-blue-200">
            How to Use Backup Codes
          </h3>
          <ul class="space-y-2 text-sm text-blue-300/80">
            <li class="flex items-start gap-2">
              <span class="mt-0.5 flex-shrink-0">•</span>
              <span>Each code can only be used once for login</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-0.5 flex-shrink-0">•</span>
              <span>Use them if you lose access to your authenticator app</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-0.5 flex-shrink-0">•</span>
              <span>Store them in a secure password manager like 1Password</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-0.5 flex-shrink-0">•</span>
              <span>You can regenerate codes anytime from your profile</span>
            </li>
          </ul>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <a
            href="/profile"
            class="flex-1 rounded-xl border border-slate-700/50 bg-slate-800/30 px-6 py-3.5 text-center font-medium text-slate-300 transition-all hover:border-slate-600/50 hover:bg-slate-800/50"
          >
            ← Back to Profile
          </a>
        </div>

        <!-- Footer Warning -->
        <div class="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p class="text-center text-sm text-red-300">
            ⚠️ Your previous backup codes are no longer valid
          </p>
        </div>
      </div>
    </div>

    <script>
      const codes = ${JSON.stringify(backupCodes)};
      const title = '${config.title || 'S3DB Identity'}';

      function downloadBackupCodes() {
        const text = 'MFA Backup Codes - ' + title + '\\n\\n' +
                     'Generated: ' + new Date().toISOString() + '\\n\\n' +
                     codes.join('\\n') + '\\n\\n' +
                     '⚠️  IMPORTANT:\\n' +
                     '- Keep these codes in a safe place\\n' +
                     '- Each code can only be used once\\n' +
                     '- Previous backup codes are now invalid\\n' +
                     '- You can regenerate codes anytime from your profile\\n';

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mfa-backup-codes-' + new Date().toISOString().split('T')[0] + '.txt';
        a.click();
        URL.revokeObjectURL(url);
      }

      function copyAllCodes() {
        const text = codes.join('\\n');
        navigator.clipboard.writeText(text).then(() => {
          const button = document.getElementById('copy-button');
          const originalText = button.innerHTML;
          button.innerHTML = '✓ Copied to Clipboard!';
          button.classList.add('bg-emerald-500/20', 'border-emerald-500/50', 'text-emerald-300');
          setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('bg-emerald-500/20', 'border-emerald-500/50', 'text-emerald-300');
          }, 2000);
        }).catch(err => {
          alert('Failed to copy codes. Please download them instead.');
        });
      }
    </script>
  `;

  return BaseLayout({
    title: 'New Backup Codes Generated',
    content: content as any,
    config,
    error: null,
    success: null
  });
}

export default MFABackupCodesPage;
