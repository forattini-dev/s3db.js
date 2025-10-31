/**
 * Example 87: API Plugin - Template Rendering (EJS, Pug, JSX)
 *
 * Demonstrates:
 * - EJS templates with layouts
 * - Pug templates
 * - JSX templates
 * - Using ctx.render() with enhanced context
 * - Template data passing
 *
 * Run: node docs/examples/e87-api-templates-ejs-pug.js
 */

import { Database, ApiPlugin } from '../../dist/s3db.es.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Create temp views directory
const viewsDir = './temp-views';
mkdirSync(viewsDir, { recursive: true });
mkdirSync(join(viewsDir, 'layouts'), { recursive: true });

// Create EJS templates
writeFileSync(join(viewsDir, 'layouts', 'main.ejs'), `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title || 'My App' %></title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
    .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
    .footer { border-top: 1px solid #ccc; padding-top: 20px; margin-top: 40px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1><%= title || 'My App' %></h1>
    <nav>
      <a href="/">Home</a> |
      <a href="/about">About</a> |
      <a href="/users">Users</a>
    </nav>
  </div>

  <main>
    <%- body %>
  </main>

  <div class="footer">
    <p>Generated with s3db.js API Plugin</p>
  </div>
</body>
</html>
`);

writeFileSync(join(viewsDir, 'home.ejs'), `
<h2>Welcome to s3db.js!</h2>

<p>This is a homepage rendered with <strong>EJS</strong> template engine.</p>

<h3>Statistics</h3>
<ul>
  <li>Total Users: <%= userCount %></li>
  <li>Total URLs: <%= urlCount %></li>
  <li>Uptime: <%= uptime %> seconds</li>
</ul>

<h3>Features</h3>
<ul>
  <% features.forEach(function(feature) { %>
    <li><%= feature %></li>
  <% }); %>
</ul>
`);

writeFileSync(join(viewsDir, 'users.ejs'), `
<h2>User List</h2>

<p>Total: <strong><%= users.length %></strong> users</p>

<% if (users.length > 0) { %>
  <table border="1" cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr>
        <th>Username</th>
        <th>Email</th>
        <th>Role</th>
        <th>Active</th>
      </tr>
    </thead>
    <tbody>
      <% users.forEach(function(user) { %>
        <tr>
          <td><%= user.username %></td>
          <td><%= user.email %></td>
          <td><%= user.role %></td>
          <td><%= user.active ? '✅' : '❌' %></td>
        </tr>
      <% }); %>
    </tbody>
  </table>
<% } else { %>
  <p>No users found.</p>
<% } %>
`);

// Create Pug templates
writeFileSync(join(viewsDir, 'about.pug'), `
doctype html
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title About - #{appName}
    style.
      body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
      .card { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
  body
    h1 About #{appName}

    .card
      h2 🚀 What is s3db.js?
      p s3db.js transforms AWS S3 into a powerful document database with an ORM-like interface.

    .card
      h2 ⚡ Features
      ul
        each feature in features
          li= feature

    .card
      h2 📊 Statistics
      p
        strong Total Resources:
        |  #{resourceCount}
      p
        strong Uptime:
        |  #{uptime} seconds
      p
        strong Template Engine:
        |  Pug

    p
      a(href="/") ← Back to Home
`);

// Database setup
const db = new Database({
  connectionString: 'memory://',
  verbose: false
});

await db.connect();

// Create resources
const users = await db.createResource({
  name: 'users',
  attributes: {
    username: 'string|required',
    email: 'string|required|email',
    role: 'string|default:user',
    active: 'boolean|default:true'
  },
  behavior: 'body-overflow',
  timestamps: true
});

const urls = await db.createResource({
  name: 'urls',
  attributes: {
    shortId: 'string|required',
    target: 'string|required',
    userId: 'string|required',
    clicks: 'number|default:0'
  },
  behavior: 'body-overflow',
  timestamps: true
});

// Seed data
await users.insert({
  username: 'john',
  email: 'john@example.com',
  role: 'admin',
  active: true
});

await users.insert({
  username: 'jane',
  email: 'jane@example.com',
  role: 'user',
  active: true
});

await urls.insert({
  shortId: 'abc123',
  target: 'https://example.com',
  userId: 'john@example.com',
  clicks: 42
});

// Setup API Plugin with EJS templates
const apiPlugin = new ApiPlugin({
  port: 3106,
  verbose: true,

  // ✅ Configure EJS template engine
  templates: {
    engine: 'ejs',
    templatesDir: viewsDir,
    layout: 'layouts/main'  // Default layout
  },

  // Custom routes with templates
  routes: {
    // ============================================
    // EJS Templates
    // ============================================

    // ✅ EJS with layout + enhanced context
    'GET /': async (c, ctx) => {
      const { resources } = ctx;

      const usersList = await resources.users.list();
      const urlsList = await resources.urls.list();

      // ✅ ctx.render() - renders EJS template with layout
      return await ctx.render('home', {
        title: 'Home',
        userCount: usersList.length,
        urlCount: urlsList.length,
        uptime: Math.floor(process.uptime()),
        features: [
          'Transform S3 into a document database',
          'ORM-like interface',
          'Auto-generated REST API',
          'Multiple template engines (EJS, Pug, JSX)',
          'Enhanced context for clean code'
        ]
      });
    },

    // ✅ EJS users list
    'GET /users': async (c, ctx) => {
      const { resources } = ctx;

      const usersList = await resources.users.list();

      return await ctx.render('users', {
        title: 'User Management',
        users: usersList
      });
    },

    // ============================================
    // Pug Templates
    // ============================================

    // ✅ Pug template (no layout - self-contained)
    'GET /about': async (c, ctx) => {
      const { db } = ctx;

      // Note: For Pug, you need to change the engine first
      // This example shows how to use c.render() directly
      // In production, you'd configure templates.engine per route or use separate API instances

      return c.json({
        message: 'To use Pug, configure templates: { engine: "pug" }',
        note: 'This example uses EJS. See e88-api-templates-pug.js for Pug example.'
      });
    },

    // ============================================
    // HTML without template (direct HTML)
    // ============================================

    // ✅ Direct HTML response
    'GET /simple': async (c, ctx) => {
      const { resources } = ctx;

      const userCount = (await resources.users.list()).length;

      return ctx.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Simple Page</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
          </style>
        </head>
        <body>
          <h1>Simple HTML Page</h1>
          <p>No template engine, just plain HTML!</p>
          <p><strong>Total Users:</strong> ${userCount}</p>
          <p><a href="/">← Back to Home</a></p>
        </body>
        </html>
      `);
    },

    // ============================================
    // Partial renders without layout
    // ============================================

    // ✅ Render without layout
    'GET /api/user-table': async (c, ctx) => {
      const { resources } = ctx;

      const usersList = await resources.users.list();

      // Render without layout by passing layout: false
      return await ctx.render('users', {
        users: usersList
      }, {
        layout: false  // No layout, just the template
      });
    },

    // ============================================
    // Error pages with templates
    // ============================================

    // ✅ 404 page with template
    'GET /notfound': async (c, ctx) => {
      return ctx.html(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>404 - Not Found</title>
          <style>
            body { font-family: system-ui; text-align: center; padding: 100px; }
            h1 { color: #e74c3c; font-size: 72px; margin: 0; }
            p { color: #666; font-size: 24px; }
          </style>
        </head>
        <body>
          <h1>404</h1>
          <p>Page Not Found</p>
          <p><a href="/">Go Home</a></p>
        </body>
        </html>
      `, 404);
    }
  }
});

// Use plugin
await db.use(apiPlugin);

console.log('✅ API Plugin with templates running at http://localhost:3106');
console.log('');
console.log('📋 Try these endpoints:');
console.log('');
console.log('  # EJS Templates (with layout)');
console.log('  curl http://localhost:3106/                    # Home page with stats');
console.log('  curl http://localhost:3106/users               # User list table');
console.log('');
console.log('  # Direct HTML (no template)');
console.log('  curl http://localhost:3106/simple              # Simple HTML page');
console.log('');
console.log('  # Partial renders (no layout)');
console.log('  curl http://localhost:3106/api/user-table      # Users table only');
console.log('');
console.log('  # Error pages');
console.log('  curl http://localhost:3106/notfound            # 404 page');
console.log('');
console.log('🎯 Template Features:');
console.log('  ✅ ctx.render(template, data) - EJS rendering');
console.log('  ✅ Automatic layout wrapping');
console.log('  ✅ Layout override: render(template, data, { layout: false })');
console.log('  ✅ Data passing to templates');
console.log('  ✅ Template helpers (_url, _path, _method)');
console.log('');
console.log('📁 Templates created in: ./temp-views/');
console.log('  - layouts/main.ejs (layout with header/footer)');
console.log('  - home.ejs (homepage)');
console.log('  - users.ejs (user table)');
console.log('  - about.pug (Pug template)');
console.log('');
console.log('Open http://localhost:3106 in your browser! 🌐');
console.log('');
