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

  const appTitle = config.title || 'S3DB Identity';
  const logo = config.logo || null;
  const primaryColor = config.primaryColor || '#007bff';

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${appTitle}</title>
  <style>${getCSS()}</style>
  ${config.customCSS ? html`<style>${config.customCSS}</style>` : ''}
  ${primaryColor !== '#007bff' ? html`<style>:root { --color-primary: ${primaryColor}; }</style>` : ''}
</head>
<body>
  <header class="header">
    <div class="container">
      <div class="header-content">
        <a href="/" class="logo">
          ${logo ? html`<img src="${logo}" alt="${appTitle}" height="32" />` : appTitle}
        </a>
        <nav>
          <ul class="nav">
            ${user ? html`
              <li><a href="/profile">Profile</a></li>
              ${user.isAdmin ? html`<li><a href="/admin">Admin</a></li>` : ''}
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
      <p>Powered by <a href="https://github.com/forattini-dev/s3db.js" target="_blank">S3DB Identity Provider</a></p>
    </div>
  </footer>
</body>
</html>`;
}

export default BaseLayout;
