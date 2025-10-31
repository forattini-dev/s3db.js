/**
 * Example 91: API Plugin - OpenGraph Helper for Social Media Previews
 *
 * Demonstrates OpenGraphHelper class for generating og: and twitter: meta tags.
 *
 * Use Case: URL shortener redirect pages with rich social media previews
 *
 * Run: node docs/examples/e91-api-opengraph-helper.js
 */

import { Database, ApiPlugin, OpenGraphHelper } from '../../dist/s3db.es.js';

const db = new Database({
  connectionString: 'memory://',
  verbose: false
});

await db.connect();

// Create URLs resource
await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    shortId: 'string|required',
    target: 'string|required',
    openGraph: {
      title: 'string|optional',
      description: 'string|optional',
      image: 'string|optional'
    }
  },
  timestamps: true
});

// Seed URLs with OpenGraph data
await db.resources.urls.insert({
  id: 'url1',
  shortId: 'blog-post',
  target: 'https://example.com/blog/my-post',
  openGraph: {
    title: 'My Amazing Blog Post',
    description: 'Learn how to build amazing things with s3db.js',
    image: 'https://example.com/images/blog-post.jpg'
  }
});

await db.resources.urls.insert({
  id: 'url2',
  shortId: 'product',
  target: 'https://example.com/products/widget',
  openGraph: {
    title: 'Our Amazing Widget',
    description: 'The best widget you will ever use',
    image: 'https://example.com/images/widget.jpg'
  }
});

// ✅ Create OpenGraphHelper with defaults
const ogHelper = new OpenGraphHelper({
  siteName: 'Stone Links',           // Your site name
  locale: 'pt_BR',                    // Locale (en_US, pt_BR, etc.)
  type: 'website',                    // Default type
  twitterCard: 'summary_large_image', // Twitter card type
  twitterSite: '@stonepagarme',       // Your Twitter handle
  defaultImage: 'https://cdn.stone.co/default-og.png'  // Fallback image
});

console.log('✅ Created OpenGraphHelper with defaults');
console.log('');

// ============================================
// Setup API Plugin with Custom Routes
// ============================================

await db.use(new ApiPlugin({
  port: 3109,
  verbose: false,

  routes: {
    /**
     * Redirect route with OpenGraph tags
     * - Generates rich social media preview
     * - Meta refresh redirects to target URL
     */
    '/:shortId': async (c, ctx) => {
      const { resources } = ctx;
      const shortId = ctx.param('shortId');

      // Get URL
      const urlList = await resources.urls.query({ shortId });
      const url = urlList[0];

      if (!url) {
        return ctx.html('<h1>404 - URL not found</h1>', 404);
      }

      // ✅ Generate OpenGraph tags
      const ogTags = ogHelper.generateTags({
        title: url.openGraph?.title || url.target,
        description: url.openGraph?.description || `Redirecting to ${url.target}`,
        image: url.openGraph?.image,
        url: `https://l.stne.io/${url.shortId}`,
        type: 'website'
      });

      // Return HTML with meta tags + redirect
      return ctx.html(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${url.openGraph?.title || 'Redirecionando...'}</title>

  <!-- ✅ OpenGraph & Twitter Card tags -->
${ogTags}

  <!-- Meta refresh redirect (works without JavaScript) -->
  <meta http-equiv="refresh" content="0;url=${url.target}">

  <!-- JavaScript fallback -->
  <script>
    window.location.href = '${url.target}';
  </script>

  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      text-align: center;
    }
    a { color: #00AF55; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Redirecionando...</h1>
  <p>Você será redirecionado para:</p>
  <p><a href="${url.target}">${url.target}</a></p>
  <p><small>Se não funcionar, clique no link acima.</small></p>
</body>
</html>
      `);
    },

    /**
     * Example: Custom OpenGraph for specific route
     */
    '/custom': async (c, ctx) => {
      // ✅ Generate tags with custom data
      const ogTags = ogHelper.generateTags({
        title: 'Custom Page',
        description: 'This page has custom OpenGraph tags',
        image: 'https://example.com/custom.jpg',
        url: 'https://example.com/custom',
        imageWidth: 1200,
        imageHeight: 630,
        imageAlt: 'Custom page preview',
        twitterCreator: '@developer'
      });

      return ctx.html(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Custom Page</title>
${ogTags}
</head>
<body>
  <h1>Custom Page with OpenGraph</h1>
  <p>View source to see generated meta tags!</p>
</body>
</html>
      `);
    },

    /**
     * API endpoint: Get OpenGraph tags as JSON
     */
    '/api/og-tags/:shortId': async (c, ctx) => {
      const { resources } = ctx;
      const shortId = ctx.param('shortId');

      const urlList = await resources.urls.query({ shortId });
      const url = urlList[0];

      if (!url) {
        return ctx.notFound();
      }

      // ✅ Generate tags and return as JSON (for debugging)
      const ogTags = ogHelper.generateTags({
        title: url.openGraph?.title || url.target,
        description: url.openGraph?.description,
        image: url.openGraph?.image,
        url: `https://l.stne.io/${url.shortId}`
      });

      return ctx.json({
        success: true,
        url: url,
        ogTags: ogTags,
        ogTagsArray: ogTags.split('\n    ').filter(Boolean)
      });
    }
  }
}));

console.log('✅ API Plugin with OpenGraph running at http://localhost:3109');
console.log('');
console.log('📋 Test Commands:');
console.log('');

console.log('# 1️⃣ Visit redirect page (view source to see OpenGraph tags)');
console.log('curl http://localhost:3109/blog-post');
console.log('# or open in browser: http://localhost:3109/blog-post');
console.log('');

console.log('# 2️⃣ Get OpenGraph tags as JSON (for debugging)');
console.log('curl http://localhost:3109/api/og-tags/blog-post | jq');
console.log('');

console.log('# 3️⃣ Custom OpenGraph page');
console.log('curl http://localhost:3109/custom');
console.log('');

console.log('🎯 Generated Tags Include:');
console.log('  ✅ og:title, og:description, og:image, og:url');
console.log('  ✅ og:type, og:site_name, og:locale');
console.log('  ✅ og:image:width, og:image:height, og:image:alt');
console.log('  ✅ twitter:card, twitter:site, twitter:creator');
console.log('  ✅ twitter:title, twitter:description, twitter:image');
console.log('  ✅ XSS protection (HTML entity escaping)');
console.log('');

console.log('📱 Social Media Preview:');
console.log('  When you share these URLs on:');
console.log('  - Facebook → Shows og:image, og:title, og:description');
console.log('  - Twitter → Shows twitter:image, twitter:title, twitter:description');
console.log('  - LinkedIn → Shows og:image, og:title, og:description');
console.log('  - WhatsApp → Shows og:image, og:title');
console.log('');

console.log('💡 Tips:');
console.log('  - Image should be at least 1200x630px for best results');
console.log('  - Use absolute URLs for images');
console.log('  - Test with: https://www.opengraph.xyz/ or https://cards-dev.twitter.com/validator');
console.log('');
