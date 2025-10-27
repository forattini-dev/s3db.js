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
    tagline: config.tagline || 'Secure Identity & Access Management',
    footerText: config.footerText || null,
    supportEmail: config.supportEmail || null,
    privacyUrl: config.privacyUrl || '/privacy',
    termsUrl: config.termsUrl || '/terms',

    // Social links
    socialLinks: config.socialLinks || null,

    // Custom CSS
    customCSS: config.customCSS || null
  };

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

      --font-family: ${theme.fontFamily};
      --font-size-base: ${theme.fontSize};

      --border-radius: ${theme.borderRadius};
      --box-shadow: ${theme.boxShadow};
    }
  `;

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${theme.tagline}">
  <title>${title} - ${theme.title}</title>

  ${theme.favicon ? html`<link rel="icon" type="image/x-icon" href="${theme.favicon}">` : ''}

  <style>${getCSS()}</style>
  <style>${themeCSS}</style>
  ${theme.customCSS ? html`<style>${theme.customCSS}</style>` : ''}
</head>
<body>
  <header class="header">
    <div class="container">
      <div class="header-content">
        <a href="/" class="logo" style="display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: inherit;">
          ${theme.logoUrl ? html`<img src="${theme.logoUrl}" alt="${theme.title}" height="32" style="display: block;" />` : ''}
          <div style="display: flex; flex-direction: column;">
            <strong style="font-size: 1.125rem;">${theme.companyName}</strong>
            <small style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: -0.125rem;">${theme.tagline}</small>
          </div>
        </a>
        <nav>
          <ul class="nav">
            ${user ? html`
              <li><a href="/profile">Profile</a></li>
              ${user.isAdmin || user.role === 'admin' ? html`<li><a href="/admin">Admin</a></li>` : ''}
              <li>
                <form method="POST" action="/logout" style="display: inline;">
                  <button type="submit" class="btn-link" style="cursor: pointer;">Logout</button>
                </form>
              </li>
            ` : html`
              <li><a href="/login">Login</a></li>
              <li><a href="/register">Register</a></li>
            `}
          </ul>
        </nav>
      </div>
    </div>
  </header>

  <main>
    ${error ? html`
      <div class="container">
        <div class="alert alert-danger" role="alert">
          ${error}
        </div>
      </div>
    ` : ''}

    ${success ? html`
      <div class="container">
        <div class="alert alert-success" role="alert">
          ${success}
        </div>
      </div>
    ` : ''}

    ${content}
  </main>

  <footer class="footer">
    <div class="container">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; margin-bottom: 2rem;">
        <!-- Company Info -->
        <div>
          <h3 style="font-size: 1rem; margin-bottom: 0.75rem; color: var(--color-text);">${theme.companyName}</h3>
          <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">
            ${theme.tagline}
          </p>
          ${theme.supportEmail ? html`
            <p style="font-size: 0.875rem; margin: 0;">
              <a href="mailto:${theme.supportEmail}" style="color: var(--color-primary);">
                ${theme.supportEmail}
              </a>
            </p>
          ` : ''}
        </div>

        <!-- Quick Links -->
        <div>
          <h3 style="font-size: 1rem; margin-bottom: 0.75rem; color: var(--color-text);">Quick Links</h3>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.875rem;">
            ${user ? html`
              <li style="margin-bottom: 0.5rem;"><a href="/profile" style="color: var(--color-text-muted);">Profile</a></li>
              ${user.isAdmin || user.role === 'admin' ? html`
                <li style="margin-bottom: 0.5rem;"><a href="/admin" style="color: var(--color-text-muted);">Admin Dashboard</a></li>
              ` : ''}
            ` : html`
              <li style="margin-bottom: 0.5rem;"><a href="/login" style="color: var(--color-text-muted);">Sign In</a></li>
              <li style="margin-bottom: 0.5rem;"><a href="/register" style="color: var(--color-text-muted);">Create Account</a></li>
            `}
            <li style="margin-bottom: 0.5rem;"><a href="${theme.privacyUrl}" style="color: var(--color-text-muted);">Privacy Policy</a></li>
            <li style="margin-bottom: 0.5rem;"><a href="${theme.termsUrl}" style="color: var(--color-text-muted);">Terms of Service</a></li>
          </ul>
        </div>

        <!-- Social Links -->
        ${theme.socialLinks ? html`
          <div>
            <h3 style="font-size: 1rem; margin-bottom: 0.75rem; color: var(--color-text);">Connect</h3>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
              ${theme.socialLinks.github ? html`
                <a href="${theme.socialLinks.github}" target="_blank" rel="noopener" style="color: var(--color-text-muted); font-size: 1.5rem;" title="GitHub">
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
              ` : ''}
              ${theme.socialLinks.twitter ? html`
                <a href="${theme.socialLinks.twitter}" target="_blank" rel="noopener" style="color: var(--color-text-muted); font-size: 1.5rem;" title="Twitter">
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                </a>
              ` : ''}
              ${theme.socialLinks.linkedin ? html`
                <a href="${theme.socialLinks.linkedin}" target="_blank" rel="noopener" style="color: var(--color-text-muted); font-size: 1.5rem;" title="LinkedIn">
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>

      <div style="border-top: 1px solid var(--color-border); padding-top: 1.5rem; text-align: center;">
        ${theme.footerText ? html`
          <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">
            ${theme.footerText}
          </p>
        ` : ''}
        <p style="font-size: 0.875rem; color: var(--color-text-muted); margin: 0;">
          © ${new Date().getFullYear()} ${theme.companyName}. All rights reserved.
          <span style="margin: 0 0.5rem;">•</span>
          Powered by <a href="https://github.com/forattini-dev/s3db.js" target="_blank" style="color: var(--color-primary);">S3DB Identity</a>
        </p>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

export default BaseLayout;
