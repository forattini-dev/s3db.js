/**
 * MFA Enrollment Page
 * Shows QR code, manual entry key, and backup codes for MFA setup
 */

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { BaseLayout, type ThemeConfig } from '../layouts/base.js';

export interface MFAEnrollmentPageProps {
  qrCodeDataUrl?: string;
  secret?: string;
  backupCodes?: string[];
  config?: ThemeConfig;
}

export function MFAEnrollmentPage(props: MFAEnrollmentPageProps = {}): HtmlEscapedString {
  const { qrCodeDataUrl = '', secret = '', backupCodes = [], config = {} } = props;

  const content = html`
    <div class="mx-auto w-full max-w-2xl px-4 py-12">
      <div class="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl md:p-12">
        <!-- Header -->
        <div class="mb-8 text-center">
          <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-3xl shadow-lg shadow-blue-500/30">
            🔐
          </div>
          <h1 class="mb-2 text-3xl font-bold text-white">
            Enable Two-Factor Authentication
          </h1>
          <p class="text-slate-400">
            Scan the QR code below with your authenticator app
          </p>
        </div>

        <!-- QR Code Section -->
        <div class="mb-8 rounded-2xl border border-slate-700/30 bg-slate-800/30 p-6">
          <h2 class="mb-4 text-center text-lg font-semibold text-white">
            Step 1: Scan QR Code
          </h2>

          <div class="mb-4 flex justify-center">
            <div class="rounded-2xl border-4 border-white bg-white p-4">
              <img src="${qrCodeDataUrl}" alt="QR Code" class="h-64 w-64" />
            </div>
          </div>

          <p class="text-center text-sm text-slate-400">
            Use Google Authenticator, Authy, Microsoft Authenticator,<br/>
            1Password, or any TOTP-compatible app
          </p>
        </div>

        <!-- Manual Entry Section -->
        <div class="mb-8 rounded-2xl border border-slate-700/30 bg-slate-800/30 p-6">
          <h2 class="mb-3 text-center text-lg font-semibold text-white">
            Can't scan? Enter manually
          </h2>

          <div class="rounded-xl bg-slate-900/50 px-4 py-3">
            <code class="block text-center font-mono text-lg tracking-wider text-blue-400">
              ${secret}
            </code>
          </div>

          <p class="mt-3 text-center text-sm text-slate-400">
            Copy this key into your authenticator app
          </p>
        </div>

        <!-- Backup Codes Section -->
        <div class="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
          <div class="mb-4 flex items-start gap-3">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-xl">
              ⚠️
            </div>
            <div>
              <h2 class="mb-1 text-lg font-semibold text-amber-200">
                Save These Backup Codes
              </h2>
              <p class="text-sm text-amber-300/80">
                You can use these codes to access your account if you lose your authenticator device. Each code can only be used once.
              </p>
            </div>
          </div>

          <div class="mb-4 grid grid-cols-2 gap-3">
            ${backupCodes.map(code => html`
              <div class="rounded-lg bg-slate-900/50 px-4 py-2 text-center">
                <code class="font-mono text-sm text-slate-200">${code}</code>
              </div>
            `)}
          </div>

          <button
            type="button"
            onclick="downloadBackupCodes()"
            class="w-full rounded-xl border border-amber-500/50 bg-amber-500/20 px-4 py-3 font-medium text-amber-200 transition-all hover:border-amber-500/70 hover:bg-amber-500/30"
          >
            💾 Download Backup Codes
          </button>
        </div>

        <!-- Verification Form -->
        <form method="POST" action="/profile/mfa/enroll" class="space-y-4">
          <input type="hidden" name="enrollment_secret" value="${secret}" />
          <input type="hidden" name="enrollment_backup_codes" value="${JSON.stringify(backupCodes)}" />

          <div>
            <label for="token" class="mb-2 block text-center text-lg font-semibold text-white">
              Step 2: Verify Setup
            </label>
            <p class="mb-3 text-center text-sm text-slate-400">
              Enter the 6-digit code from your authenticator app
            </p>
            <input
              type="text"
              id="token"
              name="token"
              pattern="[0-9]{6}"
              maxlength="6"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="000000"
              required
              autofocus
              class="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-6 py-4 text-center text-2xl tracking-widest text-white placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:bg-slate-800/70 focus:ring-4 focus:ring-blue-500/20"
            />
          </div>

          <div class="flex gap-3">
            <button
              type="submit"
              class="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/40"
            >
              ✓ Verify and Enable MFA
            </button>
            <a
              href="/profile"
              class="flex items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/30 px-6 py-3.5 font-medium text-slate-300 transition-all hover:border-slate-600/50 hover:bg-slate-800/50"
            >
              Cancel
            </a>
          </div>
        </form>

        <!-- Help Text -->
        <p class="mt-6 text-center text-sm text-slate-500">
          Need help? Check our <a href="#" class="text-blue-400 hover:text-blue-300">MFA setup guide</a>
        </p>
      </div>
    </div>

    <script>
      function downloadBackupCodes() {
        const codes = ${JSON.stringify(backupCodes)};
        const title = '${config.title || 'S3DB Identity'}';
        const text = 'MFA Backup Codes - ' + title + '\\n\\n' +
                     'Generated: ' + new Date().toISOString() + '\\n\\n' +
                     codes.join('\\n') + '\\n\\n' +
                     '⚠️  IMPORTANT:\\n' +
                     '- Keep these codes in a safe place\\n' +
                     '- Each code can only be used once\\n' +
                     '- You can regenerate codes anytime from your profile\\n';

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mfa-backup-codes-' + new Date().toISOString().split('T')[0] + '.txt';
        a.click();
        URL.revokeObjectURL(url);
      }
    </script>
  `;

  return BaseLayout({
    title: 'Enable Two-Factor Authentication',
    content: content as any,
    config,
    error: null,
    success: null
  });
}

export default MFAEnrollmentPage;
