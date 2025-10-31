/**
 * Example 88: API Plugin - Pug Templates Only
 *
 * Demonstrates pure Pug template usage with enhanced context
 *
 * Run: node docs/examples/e88-api-templates-pug-only.js
 */

import { Database, ApiPlugin } from '../../dist/s3db.es.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Create temp views directory
const viewsDir = './temp-views-pug';
mkdirSync(viewsDir, { recursive: true });

// Create Pug templates
writeFileSync(join(viewsDir, 'layout.pug'), `
doctype html
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title= title || 'My App'
    style.
      body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
      .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
      .footer { border-top: 1px solid #ccc; padding-top: 20px; margin-top: 40px; color: #666; }
      nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
      nav a:hover { text-decoration: underline; }
  body
    .header
      h1= title || 'My App'
      nav
        a(href="/") Home
        a(href="/users") Users
        a(href="/stats") Stats

    main
      block content

    .footer
      p Generated with s3db.js API Plugin + Pug
`);

writeFileSync(join(viewsDir, 'home.pug'), `
extends layout

block content
  h2 Welcome to s3db.js with Pug! 🎉

  p This homepage is rendered with <strong>Pug</strong> template engine.

  .card(style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;")
    h3 📊 Statistics
    ul
      li <strong>Total Users:</strong> #{userCount}
      li <strong>Total URLs:</strong> #{urlCount}
      li <strong>Uptime:</strong> #{uptime} seconds

  .card(style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;")
    h3 ✨ Why Pug?
    ul
      li Clean, minimal syntax
      li Built-in template inheritance (extends/block)
      li Powerful mixins and includes
      li JavaScript expressions
      li Conditional rendering
`);

writeFileSync(join(viewsDir, 'users.pug'), `
extends layout

block content
  h2 User Management

  p.
    Total: <strong>#{users.length}</strong> users

  if users.length > 0
    table(border="1" cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse;")
      thead
        tr
          th Username
          th Email
          th Role
          th Active
      tbody
        each user in users
          tr
            td= user.username
            td= user.email
            td= user.role
            td= user.active ? '✅' : '❌'
  else
    p No users found.

  hr

  h3 Add New User
  form(method="POST" action="/users" style="background: #f5f5f5; padding: 20px; border-radius: 8px;")
    div(style="margin-bottom: 10px;")
      label(for="username") Username:
      input(type="text" id="username" name="username" required style="margin-left: 10px;")

    div(style="margin-bottom: 10px;")
      label(for="email") Email:
      input(type="email" id="email" name="email" required style="margin-left: 10px;")

    div(style="margin-bottom: 10px;")
      label(for="role") Role:
      select(id="role" name="role" style="margin-left: 10px;")
        option(value="user") User
        option(value="admin") Admin

    button(type="submit" style="padding: 10px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer;") Create User
`);

writeFileSync(join(viewsDir, 'stats.pug'), `
extends layout

block content
  h2 System Statistics

  .card(style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;")
    h3 📈 Real-time Stats
    table(style="width: 100%;")
      tr
        td <strong>Total Users:</strong>
        td #{stats.users}
      tr
        td <strong>Total URLs:</strong>
        td #{stats.urls}
      tr
        td <strong>Total Clicks:</strong>
        td #{stats.clicks}
      tr
        td <strong>Uptime:</strong>
        td #{stats.uptime} seconds
      tr
        td <strong>Memory Used:</strong>
        td #{stats.memoryMB} MB

  .card(style="background: #e1f5fe; padding: 20px; border-radius: 8px; margin: 20px 0;")
    h3 🚀 Performance
    ul
      li <strong>Request ID:</strong> #{requestId}
      li <strong>Render Time:</strong> #{renderTime}ms
      li <strong>Template Engine:</strong> Pug
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
  }
});

const urls = await db.createResource({
  name: 'urls',
  attributes: {
    shortId: 'string|required',
    target: 'string|required',
    clicks: 'number|default:0'
  }
});

// Seed data
await users.insert({ username: 'john', email: 'john@example.com', role: 'admin' });
await users.insert({ username: 'jane', email: 'jane@example.com', role: 'user' });
await urls.insert({ shortId: 'abc', target: 'https://example.com', clicks: 42 });

// Setup API Plugin with Pug
const apiPlugin = new ApiPlugin({
  port: 3107,
  verbose: true,

  // ✅ Configure Pug template engine
  templates: {
    engine: 'pug',
    templatesDir: viewsDir
  },

  routes: {
    // ✅ Home page with Pug template
    'GET /': async (c, ctx) => {
      const { resources } = ctx;

      const usersList = await resources.users.list();
      const urlsList = await resources.urls.list();

      // ✅ Render Pug template
      return await ctx.render('home', {
        title: 'Home',
        userCount: usersList.length,
        urlCount: urlsList.length,
        uptime: Math.floor(process.uptime())
      });
    },

    // ✅ Users page
    'GET /users': async (c, ctx) => {
      const { resources } = ctx;

      const usersList = await resources.users.list();

      return await ctx.render('users', {
        title: 'User Management',
        users: usersList
      });
    },

    // ✅ Stats page with performance metrics
    'GET /stats': async (c, ctx) => {
      const { resources, requestId } = ctx;
      const startTime = Date.now();

      const usersList = await resources.users.list();
      const urlsList = await resources.urls.list();

      const totalClicks = urlsList.reduce((sum, url) => sum + (url.clicks || 0), 0);
      const memoryUsage = process.memoryUsage();

      const result = await ctx.render('stats', {
        title: 'System Statistics',
        stats: {
          users: usersList.length,
          urls: urlsList.length,
          clicks: totalClicks,
          uptime: Math.floor(process.uptime()),
          memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024)
        },
        requestId,
        renderTime: Date.now() - startTime
      });

      return result;
    },

    // ✅ Create user (form submission)
    'POST /users': async (c, ctx) => {
      const { resources } = ctx;

      const body = await ctx.formData();

      const userData = {
        username: body.get('username'),
        email: body.get('email'),
        role: body.get('role') || 'user',
        active: true
      };

      // Validate
      const { valid, errors } = ctx.validator.validate('users', userData);

      if (!valid) {
        return ctx.html(`
          <h1>Validation Error</h1>
          <p>${errors[0].message}</p>
          <p><a href="/users">← Back</a></p>
        `, 400);
      }

      // Insert user
      await resources.users.insert(userData);

      // Redirect back to users page
      return ctx.redirect('/users');
    }
  }
});

// Use plugin
await db.use(apiPlugin);

console.log('✅ API Plugin with Pug templates running at http://localhost:3107');
console.log('');
console.log('📋 Try these endpoints:');
console.log('');
console.log('  curl http://localhost:3107/              # Home page (Pug)');
console.log('  curl http://localhost:3107/users         # User list (Pug with form)');
console.log('  curl http://localhost:3107/stats         # Stats page (Pug)');
console.log('');
console.log('  # Create user via form');
console.log('  curl -X POST http://localhost:3107/users \\');
console.log('    -F "username=bob" \\');
console.log('    -F "email=bob@example.com" \\');
console.log('    -F "role=user"');
console.log('');
console.log('🎯 Pug Features Used:');
console.log('  ✅ Template inheritance (extends layout)');
console.log('  ✅ Block content replacement');
console.log('  ✅ Conditionals (if/else)');
console.log('  ✅ Loops (each user in users)');
console.log('  ✅ String interpolation #{variable}');
console.log('  ✅ Forms with POST handling');
console.log('');
console.log('📁 Templates created in: ./temp-views-pug/');
console.log('  - layout.pug (base layout with header/footer)');
console.log('  - home.pug (extends layout)');
console.log('  - users.pug (extends layout with form)');
console.log('  - stats.pug (extends layout with metrics)');
console.log('');
console.log('Open http://localhost:3107 in your browser! 🌐');
console.log('');
