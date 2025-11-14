/**
 * Example: SMTP Plugin - Email Templates with Handlebars
 *
 * This example demonstrates email template rendering with Handlebars,
 * custom helpers, and partial templates.
 *
 * Prerequisites:
 * - npm install nodemailer handlebars
 *
 * @example
 * node e52-smtp-templates.js
 */

import { Database } from '../src/database.class.js';
import { MemoryClient } from '../src/clients/memory-client.class.js';
import { SMTPPlugin } from '../src/plugins/smtp.plugin.js';

// Create database
const db = new Database({
  client: new MemoryClient({ bucket: 'demo' })
});
await db.connect();

// Create SMTP plugin with Handlebars templates
const smtpPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'test', pass: 'test' },
  templateEngine: 'handlebars',
  templateDir: './email-templates', // Optional: load from files
  verbose: false
});

db.installPlugin(smtpPlugin);
await smtpPlugin.initialize();

console.log('✅ SMTP plugin initialized with template support');

// 1. Simple inline Handlebars template
console.log('\n=== Example 1: Simple Template ===');

const welcomeTemplate = `---
subject: Welcome {{name}}!
html: true
---
<h1>Hello {{name}}</h1>

<p>Welcome to our service!</p>

<p>Your account has been created with the email: <strong>{{email}}</strong></p>

<p>Best regards,<br/>The Team</p>
`;

try {
  const email1 = await smtpPlugin.sendEmail({
    from: 'welcome@example.com',
    to: 'john@example.com',
    template: welcomeTemplate,
    templateData: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  });

  console.log(`✅ Welcome email sent: ${email1.id}`);
  console.log(`   Subject: "${email1.subject}"`);
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// 2. Template with conditionals and loops
console.log('\n=== Example 2: Template with Loops & Conditionals ===');

const orderTemplate = `---
subject: Order Confirmation #{{orderId}}
html: true
---
<h2>Order Confirmation</h2>

<p>Hi {{customerName}},</p>

<p>Thank you for your order! Here are your items:</p>

<table style="border-collapse: collapse; width: 100%;">
  <thead>
    <tr style="border-bottom: 2px solid #333;">
      <th style="padding: 10px; text-align: left;">Item</th>
      <th style="padding: 10px; text-align: right;">Qty</th>
      <th style="padding: 10px; text-align: right;">Price</th>
      <th style="padding: 10px; text-align: right;">Total</th>
    </tr>
  </thead>
  <tbody>
    {{#each items}}
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 10px;">{{this.name}}</td>
      <td style="padding: 10px; text-align: right;">{{this.quantity}}</td>
      <td style="padding: 10px; text-align: right;">{{currency this.price}}</td>
      <td style="padding: 10px; text-align: right;">{{currency this.total}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>

<h3 style="text-align: right; margin-top: 20px;">
  Total: {{currency total}}
</h3>

{{#if isPremium}}
<p style="background: #f0f0f0; padding: 10px; border-left: 4px solid #28a745;">
  ✨ Premium member - Free shipping applied!
</p>
{{/if}}

<p>Order will be shipped to:</p>
<p>{{shippingAddress}}</p>

<p>Tracking information will be sent within 24 hours.</p>
`;

try {
  const email2 = await smtpPlugin.sendEmail({
    from: 'orders@example.com',
    to: 'jane@example.com',
    template: orderTemplate,
    templateData: {
      orderId: 'ORD-2024-001',
      customerName: 'Jane Smith',
      items: [
        { name: 'Widget Pro', quantity: 2, price: 99.99, total: 199.98 },
        { name: 'Gadget Plus', quantity: 1, price: 149.99, total: 149.99 },
        { name: 'Accessory Kit', quantity: 3, price: 24.99, total: 74.97 }
      ],
      total: 424.94,
      isPremium: true,
      shippingAddress: '123 Main St, NYC, NY 10001'
    }
  });

  console.log(`✅ Order confirmation sent: ${email2.id}`);
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// 3. Template with custom helpers
console.log('\n=== Example 3: Custom Template Helpers ===');

// Register custom helpers
smtpPlugin.registerTemplateHelper('discount', (price, percent) => {
  const discounted = price * (1 - percent / 100);
  return `$${discounted.toFixed(2)}`;
});

smtpPlugin.registerTemplateHelper('badge', (status) => {
  const colors = {
    pending: '#FFC107',
    shipped: '#17A2B8',
    delivered: '#28A745',
    cancelled: '#DC3545'
  };
  return `<span style="background: ${colors[status] || '#6C757D'}; color: white; padding: 4px 8px; border-radius: 4px;">${status.toUpperCase()}</span>`;
});

const statusTemplate = `---
subject: Order Status: {{badge status}}
html: true
---
<h2>Your Order Status</h2>

<p>Order {{orderId}} is currently: {{badge status}}</p>

{{#if (eq status "shipped")}}
<p>Your package is on the way! Tracking: <strong>{{trackingNumber}}</strong></p>
{{/if}}

{{#if (eq status "delivered")}}
<p>Your package has been delivered! Hope you enjoy!</p>
{{/if}}

{{#if discount}}
<p style="font-size: 18px; color: #28A745;">
  💰 You saved: <strong>{{discount originalPrice discountPercent}}</strong>
</p>
{{/if}}
`;

try {
  const email3 = await smtpPlugin.sendEmail({
    from: 'updates@example.com',
    to: 'bob@example.com',
    template: statusTemplate,
    templateData: {
      orderId: 'ORD-2024-002',
      status: 'shipped',
      trackingNumber: 'TRACK123456789',
      originalPrice: 99.99,
      discountPercent: 20,
      discount: true
    }
  });

  console.log(`✅ Status update sent: ${email3.id}`);
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// 4. Partial templates (reusable components)
console.log('\n=== Example 4: Partial Templates ===');

// Register header and footer partials
smtpPlugin.registerTemplatePartial('header', `
<div style="background: #2C3E50; color: white; padding: 20px; text-align: center;">
  <h1>{{companyName}}</h1>
  <p>{{tagline}}</p>
</div>
`);

smtpPlugin.registerTemplatePartial('footer', `
<div style="background: #ECF0F1; padding: 20px; margin-top: 30px; border-top: 1px solid #BDC3C7;">
  <p style="text-align: center; color: #7F8C8D; font-size: 12px;">
    &copy; {{year}} {{companyName}}. All rights reserved.
  </p>
  <p style="text-align: center;">
    <a href="{{unsubscribeLink}}" style="color: #3498DB; text-decoration: none;">Unsubscribe</a> |
    <a href="{{preferencesLink}}" style="color: #3498DB; text-decoration: none;">Preferences</a>
  </p>
</div>
`);

const newsletterTemplate = `---
subject: {{subject}}
html: true
---
{{> header}}

<div style="padding: 20px;">
  <h2>{{title}}</h2>

  <p>{{content}}</p>

  {{#each articles}}
  <div style="margin: 20px 0; padding: 15px; background: #F8F9FA; border-left: 4px solid #3498DB;">
    <h3>{{this.title}}</h3>
    <p>{{this.summary}}</p>
    <a href="{{this.link}}" style="color: #3498DB; text-decoration: none;">Read more →</a>
  </div>
  {{/each}}
</div>

{{> footer}}
`;

try {
  const email4 = await smtpPlugin.sendEmail({
    from: 'newsletter@example.com',
    to: 'alice@example.com',
    template: newsletterTemplate,
    templateData: {
      subject: 'Weekly Newsletter - November 2024',
      companyName: 'TechCorp',
      tagline: 'Stay updated with the latest news',
      title: 'This Week in Tech',
      content: 'Here are the top stories this week...',
      articles: [
        {
          title: 'AI Breakthroughs',
          summary: 'New developments in machine learning...',
          link: 'https://example.com/article-1'
        },
        {
          title: 'Cloud Innovation',
          summary: 'Latest cloud computing trends...',
          link: 'https://example.com/article-2'
        }
      ],
      year: new Date().getFullYear(),
      unsubscribeLink: 'https://example.com/unsubscribe?token=abc123',
      preferencesLink: 'https://example.com/preferences?token=abc123'
    }
  });

  console.log(`✅ Newsletter sent: ${email4.id}`);
} catch (err) {
  console.error('❌ Failed:', err.message);
}

// 5. Check template cache
console.log('\n=== Template Cache Stats ===');
const stats = smtpPlugin.getTemplateCacheStats();
console.log(`Cached templates: ${stats.cacheSize}`);
console.log(`Entries: ${stats.entries.join(', ')}`);

// 6. Clear cache if needed
// smtpPlugin.clearTemplateCache();

await smtpPlugin.close();
console.log('\n✅ SMTP plugin closed');

// ============================================================================
// Built-in Helpers Reference
// ============================================================================

/*
Available built-in helpers:

1. formatDate(date, format="YYYY-MM-DD")
   {{formatDate createdAt format="YYYY-MM-DD"}}
   {{formatDate createdAt format="YYYY-MM-DD HH:mm"}}

2. uppercase(str)
   {{uppercase name}}

3. lowercase(str)
   {{lowercase NAME}}

4. titlecase(str)
   {{titlecase "john doe"}} → "John Doe"

5. eq(a, b) - Equality comparison
   {{#if (eq status "active")}}Active{{/if}}

6. default(value, fallback)
   {{default description "No description"}}

7. pluralize(count, singular, plural)
   {{pluralize itemCount "item" "items"}}

8. truncate(text, length=100)
   {{truncate description length=50}}

9. currency(amount, locale, currency)
   {{currency price}} → "$99.99"
   {{currency price currency="EUR"}} → "€99.99"

10. json(obj)
    {{json metadata}}

11. range(n)
    {{#each (range 5)}}Item {{this}}{{/each}}

Custom Helpers:
- registerTemplateHelper(name, fn)
- registerTemplatePartial(name, template)
*/
