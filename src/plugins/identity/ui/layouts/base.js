/**
 * Base HTML Layout for Identity Provider UI
 * Uses Hono's html helper for server-side rendering
 */

import { html } from 'hono/html';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read CSS file once at module load
const cssPath = join(__dirname, '../styles/main.css');
let cachedCSS = null;

function getCSS() {
  if (!cachedCSS) {
    cachedCSS = readFileSync(cssPath, 'utf-8');
  }
  return cachedCSS;
}

/**
 * Convert hex colors to rgba for translucent gradients
 * @param {string} hex - Hex color (#fff or #ffffff)
 * @param {number} alpha - Alpha channel value between 0 and 1
 * @returns {string} rgba(...) string
 */
function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  const normalized = hex.replace('#', '');
  if (![3, 6].includes(normalized.length)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  const full = normalized.length === 3
    ? normalized.split('').map(char => `${char}${char}`).join('')
    : normalized;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Base layout component
 * @param {Object} props - Layout properties
 * @param {string} props.title - Page title
 * @param {string} props.content - Page content (HTML string)
 * @param {Object} [props.user] - Authenticated user (if logged in)
 * @param {Object} [props.config] - UI configuration (title, logo, etc.)
 * @param {string} [props.error] - Error message to display
 * @param {string} [props.success] - Success message to display
 * @returns {string} HTML string
 */
export function BaseLayout(props) {
  const {
    title = 'Identity Provider',
    content = '',
    user = null,
    config = {},
    error = null,
    success = null
  } = props;

  // Theme configuration with defaults
  const theme = {
    title: config.title || 'S3DB Identity',
    logo: config.logo || null,
    logoUrl: config.logoUrl || null,
    favicon: config.favicon || null,
    registrationEnabled: config.registrationEnabled !== false,  // Show register link

    // Colors
    primaryColor: config.primaryColor || '#007bff',
    secondaryColor: config.secondaryColor || '#6c757d',
    successColor: config.successColor || '#28a745',
    dangerColor: config.dangerColor || '#dc3545',
    warningColor: config.warningColor || '#ffc107',
    infoColor: config.infoColor || '#17a2b8',

    // Text colors
    textColor: config.textColor || '#212529',
    textMuted: config.textMuted || '#6c757d',

    // Background colors
    backgroundColor: config.backgroundColor || '#ffffff',
    backgroundLight: config.backgroundLight || '#f8f9fa',
    borderColor: config.borderColor || '#dee2e6',

    // Typography
    fontFamily: config.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: config.fontSize || '16px',

    // Layout
    borderRadius: config.borderRadius || '0.375rem',
    boxShadow: config.boxShadow || '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)',

    // Company info
    companyName: config.companyName || 'S3DB',
    legalName: config.legalName || config.companyName || 'S3DB Corp',
    tagline: config.tagline || 'Secure Identity & Access Management',
    welcomeMessage: config.welcomeMessage || 'Welcome back!',
    footerText: config.footerText || null,
    supportEmail: config.supportEmail || null,
    privacyUrl: config.privacyUrl || '/privacy',
    termsUrl: config.termsUrl || '/terms',

    // Social links
    socialLinks: config.socialLinks || null,

    // Custom CSS
    customCSS: config.customCSS || null
  };

  const primaryGlow = hexToRgba(theme.primaryColor, 0.28);
  const secondaryGlow = hexToRgba(theme.secondaryColor, 0.22);
  const surfaceGlow = hexToRgba(theme.backgroundLight, 0.65);

  // Build dynamic CSS variables
  const themeCSS = `
    :root {
      --color-primary: ${theme.primaryColor};
      --color-secondary: ${theme.secondaryColor};
      --color-success: ${theme.successColor};
      --color-danger: ${theme.dangerColor};
      --color-warning: ${theme.warningColor};
      --color-info: ${theme.infoColor};

      --color-text: ${theme.textColor};
      --color-text-muted: ${theme.textMuted};

      --color-bg: ${theme.backgroundColor};
      --color-light: ${theme.backgroundLight};
      --color-border: ${theme.borderColor};
      --color-card-bg: ${theme.backgroundLight};
      --color-primary-glow: ${primaryGlow};
      --color-secondary-glow: ${secondaryGlow};
      --color-surface-glow: ${surfaceGlow};

      --font-family: ${theme.fontFamily};
      --font-size-base: ${theme.fontSize};

      --border-radius: ${theme.borderRadius};
      --box-shadow: ${theme.boxShadow};
    }
  `;

  const backgroundGradient = `
    radial-gradient(circle at 12% 18%, ${primaryGlow} 0%, transparent 52%),
    radial-gradient(circle at 88% 16%, ${secondaryGlow} 0%, transparent 55%),
    linear-gradient(160deg, ${theme.backgroundColor} 0%, ${theme.backgroundLight} 55%, ${theme.backgroundColor} 100%)
  `;

  const flashContainer = (error || success) ? html`
    <div class="mx-auto mb-8 w-full max-w-3xl space-y-3">
      ${error ? html`
        <div class="rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm leading-6 text-red-100 shadow-lg shadow-red-900/30 backdrop-blur">
          ${error}
        </div>
      ` : ''}
      ${success ? html`
        <div class="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-sm leading-6 text-emerald-100 shadow-lg shadow-emerald-900/25 backdrop-blur">
          ${success}
        </div>
      ` : ''}
    </div>
  ` : '';

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, shrink-to-fit=no">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="description" content="${theme.tagline}">
  <title>${title} - ${theme.title}</title>

  ${theme.favicon ? html`
    <link rel="shortcut icon" href="${theme.favicon}">
    <link rel="icon" href="${theme.favicon}">
  ` : ''}

  <script>
    window.tailwind = window.tailwind || {};
    window.tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: 'var(--color-primary)',
            secondary: 'var(--color-secondary)',
            surface: 'var(--color-card-bg)'
          },
          fontFamily: {
            display: ['var(--font-family)'],
            body: ['var(--font-family)']
          },
          boxShadow: {
            surface: 'var(--box-shadow)'
          }
        }
      }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

  <!-- Custom Styles -->
  <style>${themeCSS}</style>
  <style>${getCSS()}</style>
  ${theme.customCSS ? html`<style>${theme.customCSS}</style>` : ''}
</head>
<body class="min-h-screen bg-slate-950 antialiased text-white">
  <div
    class="relative flex min-h-screen flex-col overflow-hidden"
    style="
      background-image: ${backgroundGradient};
      background-attachment: fixed;
      background-size: cover;
      color: ${theme.textColor};
      font-family: ${theme.fontFamily};
      font-size: ${theme.fontSize};
    "
  >
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -left-20 top-[10%] h-64 w-64 rounded-full blur-[120px]" style="background: ${primaryGlow}; opacity: 0.85;"></div>
      <div class="absolute right-[-15%] top-[5%] h-72 w-72 rounded-full blur-[120px]" style="background: ${secondaryGlow}; opacity: 0.65;"></div>
      <div class="absolute left-1/2 top-[65%] h-96 w-[36rem] -translate-x-1/2 rounded-[200px] blur-[160px]" style="background: ${surfaceGlow}; opacity: 0.35;"></div>
    </div>

    <main class="relative z-10 flex flex-1 items-stretch justify-center">
      ${flashContainer}
      ${content}
    </main>
  </div>
</body>
</html>`;
}

export default BaseLayout;
