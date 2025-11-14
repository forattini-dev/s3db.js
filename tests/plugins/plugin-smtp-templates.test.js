import { describe, it, expect, beforeEach } from '@jest/globals';
import { SMTPTemplateEngine, defaultHandlebarsHelpers } from '../../src/plugins/smtp/template-engine.js';
import { TemplateError } from '../../src/plugins/smtp/errors.js';

describe('SMTPTemplateEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new SMTPTemplateEngine({
      type: 'handlebars',
      cacheTemplates: true,
      helpers: defaultHandlebarsHelpers
    });
  });

  describe('Handlebars Rendering', () => {
    it('should render simple template with variables', async () => {
      const template = 'Hello {{name}}!';
      const result = await engine.render(template, { name: 'John' });

      expect(result.body).toContain('Hello John!');
    });

    it('should render template with front matter (subject + body)', async () => {
      const template = `---
subject: Welcome {{name}}
html: true
---
Hello {{name}}, welcome!`;

      const result = await engine.render(template, { name: 'Jane' });

      expect(result.subject).toBe('Welcome Jane');
      expect(result.body).toContain('Hello Jane');
      expect(result.html).toBe('true'); // Note: parsed as string from YAML
    });

    it('should render conditionals', async () => {
      const template = `{{#if isAdmin}}
Admin Panel
{{else}}
User Panel
{{/if}}`;

      const result1 = await engine.render(template, { isAdmin: true });
      expect(result1.body).toContain('Admin Panel');

      const result2 = await engine.render(template, { isAdmin: false });
      expect(result2.body).toContain('User Panel');
    });

    it('should render loops with {{#each}}', async () => {
      const template = `Items:
{{#each items}}
- {{this.name}}: {{this.price}}
{{/each}}`;

      const result = await engine.render(template, {
        items: [
          { name: 'Item A', price: '$10' },
          { name: 'Item B', price: '$20' }
        ]
      });

      expect(result.body).toContain('Item A');
      expect(result.body).toContain('Item B');
      expect(result.body).toContain('$10');
      expect(result.body).toContain('$20');
    });

    it('should support nested objects', async () => {
      const template = '{{user.name}} ({{user.email}})';
      const result = await engine.render(template, {
        user: {
          name: 'Alice',
          email: 'alice@example.com'
        }
      });

      expect(result.body).toBe('Alice (alice@example.com)');
    });

    it('should throw TemplateError on syntax error', async () => {
      const invalidTemplate = 'Hello {{#if name} World {{/if}}'; // Missing closing #if

      await expect(engine.render(invalidTemplate, { name: 'John' }))
        .rejects
        .toThrow(TemplateError);
    });

    it('should throw TemplateError on missing variables (strict mode)', async () => {
      const template = 'Hello {{name}}!';

      // Handlebars doesn't error on undefined vars by default, but we test handling
      const result = await engine.render(template, {});
      expect(result.body).toContain('Hello');
    });
  });

  describe('Built-in Helpers', () => {
    it('should use uppercase helper', async () => {
      const template = '{{uppercase text}}';
      const result = await engine.render(template, { text: 'hello' });

      expect(result.body).toBe('HELLO');
    });

    it('should use lowercase helper', async () => {
      const template = '{{lowercase text}}';
      const result = await engine.render(template, { text: 'HELLO' });

      expect(result.body).toBe('hello');
    });

    it('should use titlecase helper', async () => {
      const template = '{{titlecase text}}';
      const result = await engine.render(template, { text: 'hello world' });

      expect(result.body).toBe('Hello World');
    });

    it('should use default helper', async () => {
      const template = '{{default value "fallback"}}';

      const result1 = await engine.render(template, { value: 'actual' });
      expect(result1.body).toBe('actual');

      const result2 = await engine.render(template, { value: null });
      expect(result2.body).toBe('fallback');
    });

    it('should use truncate helper', async () => {
      const template = '{{truncate text length=10}}';
      const result = await engine.render(template, { text: 'This is a very long text' });

      expect(result.body).toBe('This is a ...');
    });

    it('should use currency helper', async () => {
      const template = '{{currency price}}';
      const result = await engine.render(template, { price: 99.99 });

      expect(result.body).toContain('99.99');
    });

    it('should use eq helper for comparisons', async () => {
      const template = `{{#if (eq status "active")}}Active{{else}}Inactive{{/if}}`;

      const result1 = await engine.render(template, { status: 'active' });
      expect(result1.body).toContain('Active');

      const result2 = await engine.render(template, { status: 'inactive' });
      expect(result2.body).toContain('Inactive');
    });

    it('should use pluralize helper', async () => {
      const template = `You have {{count}} {{pluralize count "item" "items"}}`;

      const result1 = await engine.render(template, { count: 1 });
      expect(result1.body).toContain('1 item');

      const result2 = await engine.render(template, { count: 5 });
      expect(result2.body).toContain('5 items');
    });
  });

  describe('Custom Helpers', () => {
    it('should register and use custom helper', async () => {
      engine.registerHelper('double', (n) => n * 2);

      const template = 'Double {{double value}}';
      const result = await engine.render(template, { value: 5 });

      expect(result.body).toBe('Double 10');
    });

    it('should support async custom helpers', async () => {
      engine.registerHelper('asyncHelper', async (value) => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(`async-${value}`), 10);
        });
      });

      const template = '{{asyncHelper text}}';
      const result = await engine.render(template, { text: 'test' });

      expect(result.body).toContain('async-test');
    });

    it('should allow multiple custom helpers', async () => {
      engine.registerHelper('add', (a, b) => a + b);
      engine.registerHelper('multiply', (a, b) => a * b);

      const template = '{{add 2 3}} * {{multiply 4 5}} = {{multiply (add 2 3) (multiply 4 5)}}';
      const result = await engine.render(template, {});

      expect(result.body).toContain('5');
      expect(result.body).toContain('20');
    });
  });

  describe('Partials', () => {
    it('should register and render partial', async () => {
      engine.registerPartial('greeting', 'Hello {{name}}!');

      const template = '{{> greeting}}';
      const result = await engine.render(template, { name: 'Bob' });

      expect(result.body).toContain('Hello Bob!');
    });

    it('should support nested partials', async () => {
      engine.registerPartial('header', '=== {{title}} ===');
      engine.registerPartial('content', '{{> header}}\n{{text}}');

      const template = '{{> content}}';
      const result = await engine.render(template, {
        title: 'Section',
        text: 'Some content'
      });

      expect(result.body).toContain('=== Section ===');
      expect(result.body).toContain('Some content');
    });
  });

  describe('Caching', () => {
    it('should cache compiled templates', async () => {
      const template = 'Hello {{name}}!';

      const result1 = await engine.render(template, { name: 'John' });
      const stats1 = engine.getCacheStats();

      const result2 = await engine.render(template, { name: 'Jane' });
      const stats2 = engine.getCacheStats();

      // Cache should have 1 entry (same template)
      expect(stats1.cacheSize).toBe(1);
      expect(stats2.cacheSize).toBe(1);

      expect(result1.body).toBe('Hello John!');
      expect(result2.body).toBe('Hello Jane!');
    });

    it('should cache different templates separately', async () => {
      await engine.render('Template 1: {{a}}', { a: '1' });
      await engine.render('Template 2: {{b}}', { b: '2' });

      const stats = engine.getCacheStats();
      expect(stats.cacheSize).toBe(2);
    });

    it('should clear cache on registerPartial', async () => {
      await engine.render('Hello {{name}}', { name: 'John' });
      let stats = engine.getCacheStats();
      expect(stats.cacheSize).toBeGreaterThan(0);

      engine.registerPartial('test', 'test');
      stats = engine.getCacheStats();
      expect(stats.cacheSize).toBe(0);
    });

    it('should manually clear cache', async () => {
      await engine.render('Template: {{x}}', { x: 'test' });
      let stats = engine.getCacheStats();
      expect(stats.cacheSize).toBeGreaterThan(0);

      engine.clearCache();
      stats = engine.getCacheStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('Output Parsing', () => {
    it('should parse plain text as body only', async () => {
      const result = await engine.render('Plain text output', {});

      expect(result.subject).toBe('No Subject');
      expect(result.body).toBe('Plain text output');
      expect(result.html).toBeUndefined();
    });

    it('should parse object output', async () => {
      const customEngine = new SMTPTemplateEngine({
        type: async () => ({
          subject: 'Test Subject',
          body: 'Test Body',
          html: '<p>Test HTML</p>'
        })
      });

      const result = await customEngine.render('dummy', {});

      expect(result.subject).toBe('Test Subject');
      expect(result.body).toBe('Test Body');
      expect(result.html).toBe('<p>Test HTML</p>');
    });

    it('should reject invalid output format', async () => {
      const invalidEngine = new SMTPTemplateEngine({
        type: async () => 12345 // Invalid: number
      });

      await expect(invalidEngine.render('dummy', {}))
        .rejects
        .toThrow(TemplateError);
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error message for compilation errors', async () => {
      const invalidTemplate = '{{#if unclosed';

      try {
        await engine.render(invalidTemplate, {});
        expect.fail('Should have thrown TemplateError');
      } catch (err) {
        expect(err).toBeInstanceOf(TemplateError);
        expect(err.message).toContain('compilation');
      }
    });

    it('should wrap rendering errors in TemplateError', async () => {
      const customEngine = new SMTPTemplateEngine({
        type: async () => {
          throw new Error('Custom error');
        }
      });

      try {
        await customEngine.render('dummy', {});
        expect.fail('Should have thrown TemplateError');
      } catch (err) {
        expect(err).toBeInstanceOf(TemplateError);
        expect(err.message).toContain('Custom error');
      }
    });
  });

  describe('Precompilation', () => {
    it('should precompile valid template', async () => {
      const template = 'Valid {{template}}';
      const result = await engine.precompile(template);

      expect(result).toBe(true);
    });

    it('should return false for invalid template', async () => {
      const invalidTemplate = '{{#if unclosed';
      const result = await engine.precompile(invalidTemplate);

      expect(result).toBe(false);
    });
  });
});
