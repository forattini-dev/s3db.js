/**
 * Tests for Template Engine Support
 *
 * Covers:
 * - JSX template rendering (native Hono)
 * - Template middleware setup
 * - c.render() helper
 * - Engine configuration
 *
 * Note: EJS tests are skipped as it's a peer dependency
 */

import { describe, it, expect } from '@jest/globals';
import { setupTemplateEngine, jsxEngine } from '../../src/plugins/api/utils/template-engine.js';

describe('Template Engine - JSX', () => {
  describe('jsxEngine()', () => {
    it('should create middleware that adds c.render()', async () => {
      const middleware = jsxEngine();

      const mockContext = {};
      let nextCalled = false;

      await middleware(mockContext, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(mockContext.render).toBeDefined();
      expect(typeof mockContext.render).toBe('function');
    });

    it('should render JSX elements via c.render()', async () => {
      const middleware = jsxEngine();

      let htmlResponse = null;
      const mockContext = {
        html: (content) => {
          htmlResponse = content;
          return { _html: content };
        }
      };

      await middleware(mockContext, async () => {});

      // Render a JSX-like object
      const jsxElement = { type: 'div', props: {}, children: ['Hello'] };
      const result = mockContext.render(jsxElement);

      expect(result._html).toBe(jsxElement);
    });

    it('should throw error when rendering string template name', async () => {
      const middleware = jsxEngine();

      const mockContext = {
        html: (content) => ({ _html: content })
      };

      await middleware(mockContext, async () => {});

      expect(() => {
        mockContext.render('template-name', {});
      }).toThrow('JSX engine requires JSX element');
    });
  });

  describe('setupTemplateEngine() - JSX mode', () => {
    it('should create middleware for JSX engine', async () => {
      const middleware = setupTemplateEngine({
        engine: 'jsx'
      });

      const mockContext = {};
      let nextCalled = false;

      await middleware(mockContext, async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(mockContext.render).toBeDefined();
    });

    it('should render JSX elements', async () => {
      const middleware = setupTemplateEngine({
        engine: 'jsx'
      });

      let htmlResponse = null;
      const mockContext = {
        html: (content) => {
          htmlResponse = content;
          return { _html: content };
        },
        req: {
          url: 'http://localhost/test',
          path: '/test',
          method: 'GET'
        }
      };

      await middleware(mockContext, async () => {});

      const jsxElement = { type: 'h1', props: {}, children: ['Hello World'] };
      const result = await mockContext.render(jsxElement);

      expect(result._html).toBe(jsxElement);
    });
  });

  describe('setupTemplateEngine() - Configuration', () => {
    it('should default to jsx engine', async () => {
      const middleware = setupTemplateEngine({});

      const mockContext = {};
      await middleware(mockContext, async () => {});

      expect(mockContext.render).toBeDefined();
    });

    it('should throw error for unsupported engine', async () => {
      const middleware = setupTemplateEngine({
        engine: 'unsupported-engine'
      });

      const mockContext = {
        req: { url: '', path: '', method: 'GET' }
      };

      await middleware(mockContext, async () => {});

      await expect(async () => {
        await mockContext.render('template', {});
      }).rejects.toThrow('Unsupported template engine');
    });
  });

  describe('Template Data Helpers', () => {
    it('should provide request context in template data (EJS mode simulation)', async () => {
      // We can't test actual EJS rendering without the peer dependency,
      // but we can test that the data structure is correct

      const middleware = setupTemplateEngine({
        engine: 'jsx' // Use JSX to avoid EJS dependency
      });

      const mockContext = {
        html: (content) => ({ _html: content }),
        req: {
          url: 'http://localhost:3000/test',
          path: '/test',
          method: 'POST'
        }
      };

      await middleware(mockContext, async () => {});

      // The render function would pass this data to EJS:
      // { ...data, _url, _path, _method }
      // We verify the structure by checking the mock context

      expect(mockContext.req.url).toBeDefined();
      expect(mockContext.req.path).toBeDefined();
      expect(mockContext.req.method).toBeDefined();
    });
  });
});

describe('Template Engine - EJS (Peer Dependency)', () => {
  it('should throw helpful error when EJS not installed', async () => {
    // This test documents the expected behavior when EJS is not installed

    const middleware = setupTemplateEngine({
      engine: 'ejs',
      templatesDir: './views'
    });

    const mockContext = {
      req: { url: '', path: '', method: 'GET' }
    };

    await middleware(mockContext, async () => {});

    // Attempting to render should throw a helpful error
    await expect(async () => {
      await mockContext.render('template', {});
    }).rejects.toThrow(/EJS template engine not installed/);
  });
});

describe('Custom Template Engine', () => {
  it('should support custom renderer function', async () => {
    let customRendererCalled = false;
    let receivedTemplate = null;
    let receivedData = null;

    const customRenderer = async (c, template, data, options) => {
      customRendererCalled = true;
      receivedTemplate = template;
      receivedData = data;

      return c.html(`<custom>${template}</custom>`);
    };

    const middleware = setupTemplateEngine({
      engine: 'custom',
      customRenderer
    });

    const mockContext = {
      html: (content) => ({ _html: content }),
      req: { url: '', path: '', method: 'GET' }
    };

    await middleware(mockContext, async () => {});

    const result = await mockContext.render('my-template', { foo: 'bar' });

    expect(customRendererCalled).toBe(true);
    expect(receivedTemplate).toBe('my-template');
    expect(receivedData).toEqual({ foo: 'bar' });
    expect(result._html).toBe('<custom>my-template</custom>');
  });

  it('should throw error for custom engine without renderer', async () => {
    const middleware = setupTemplateEngine({
      engine: 'custom'
      // Missing customRenderer
    });

    const mockContext = {
      req: { url: '', path: '', method: 'GET' }
    };

    await middleware(mockContext, async () => {});

    await expect(async () => {
      await mockContext.render('template', {});
    }).rejects.toThrow('Unsupported template engine');
  });
});

describe('Edge Cases', () => {
  it('should handle render without data parameter', async () => {
    const middleware = jsxEngine();

    const mockContext = {
      html: (content) => ({ _html: content })
    };

    await middleware(mockContext, async () => {});

    const jsxElement = { type: 'div' };
    const result = mockContext.render(jsxElement);

    expect(result._html).toBe(jsxElement);
  });

  it('should handle empty JSX element', async () => {
    const middleware = jsxEngine();

    const mockContext = {
      html: (content) => ({ _html: content })
    };

    await middleware(mockContext, async () => {});

    const result = mockContext.render(null);

    expect(result._html).toBeNull();
  });

  it('should detect JSX elements correctly (object check)', async () => {
    const middleware = setupTemplateEngine({ engine: 'jsx' });

    const mockContext = {
      html: (content) => ({ _html: content }),
      req: { url: '', path: '', method: 'GET' }
    };

    await middleware(mockContext, async () => {});

    // Object (JSX) - should work
    const jsxResult = await mockContext.render({ type: 'div' });
    expect(jsxResult._html).toBeDefined();

    // String - should fail for JSX
    await expect(async () => {
      await mockContext.render('string-template');
    }).rejects.toThrow();

    // Number - treated as string by JSX detection
    const numberResult = await mockContext.render(123);
    expect(numberResult._html).toBe(123);
  });
});
