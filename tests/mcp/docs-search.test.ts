import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');

// Import the modules under test
const docsSearch = await import('../../mcp/tools/docs-search.js');
const resources = await import('../../mcp/resources.js');
const docsData = await import('../../mcp/docs-data.js');

describe('MCP Docs Search', () => {
  let handlers: any;

  beforeAll(async () => {
    await docsSearch.preloadSearch();
    const mockServer = {} as any;
    handlers = docsSearch.createDocsSearchHandlers(mockServer);
  });

  // =========================================================================
  // Bug Fix #1: getPluginByName normalization
  // =========================================================================
  describe('getPluginByName normalization', () => {
    it('resolves "statemachine" (no hyphen)', () => {
      const plugin = docsData.getPluginByName('statemachine');
      expect(plugin).toBeDefined();
      expect(plugin!.name).toBe('StateMachinePlugin');
    });

    it('resolves "state-machine" (with hyphen)', () => {
      const plugin = docsData.getPluginByName('state-machine');
      expect(plugin).toBeDefined();
      expect(plugin!.name).toBe('StateMachinePlugin');
    });

    it('resolves "StateMachinePlugin" (full name)', () => {
      const plugin = docsData.getPluginByName('StateMachinePlugin');
      expect(plugin).toBeDefined();
      expect(plugin!.name).toBe('StateMachinePlugin');
    });

    it('resolves "eventual-consistency" with hyphens', () => {
      const plugin = docsData.getPluginByName('eventual-consistency');
      expect(plugin).toBeDefined();
    });

    it('resolves "s3-queue" with hyphen', () => {
      const plugin = docsData.getPluginByName('s3-queue');
      expect(plugin).toBeDefined();
    });

    it('returns undefined for non-existent plugin', () => {
      const plugin = docsData.getPluginByName('nonexistent');
      expect(plugin).toBeUndefined();
    });
  });

  // =========================================================================
  // Bug Fix #2: pathToResourceUri sub-doc URIs
  // =========================================================================
  describe('readResource URI resolution', () => {
    it('resolves s3db://plugin/state-machine to full README', () => {
      const result = resources.readResource('s3db://plugin/state-machine');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('State Machine Plugin');
      expect(result!.text.length).toBeGreaterThan(500);
    });

    it('resolves s3db://plugin/statemachine to full README', () => {
      const result = resources.readResource('s3db://plugin/statemachine');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('State Machine Plugin');
    });

    it('resolves s3db://plugin/state-machine/triggers to triggers.md', () => {
      const result = resources.readResource('s3db://plugin/state-machine/triggers');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('Triggers');
      expect(result!.text).toContain('event');
      expect(result!.text).toContain('cron');
    });

    it('resolves s3db://plugin/state-machine/guards to guards.md', () => {
      const result = resources.readResource('s3db://plugin/state-machine/guards');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('Guards');
    });

    it('resolves s3db://plugin/state-machine/actions to actions.md', () => {
      const result = resources.readResource('s3db://plugin/state-machine/actions');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('Actions');
    });

    it('resolves s3db://plugin/state-machine/states to states.md', () => {
      const result = resources.readResource('s3db://plugin/state-machine/states');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('States');
    });

    it('resolves s3db://plugin/state-machine/retries to retries.md', () => {
      const result = resources.readResource('s3db://plugin/state-machine/retries');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('Retries');
    });

    it('resolves nested sub-doc s3db://plugin/state-machine/guides/api-reference', () => {
      const result = resources.readResource('s3db://plugin/state-machine/guides/api-reference');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('API Reference');
    });

    it('resolves nested sub-doc s3db://plugin/state-machine/guides/configuration', () => {
      const result = resources.readResource('s3db://plugin/state-machine/guides/configuration');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('Configuration');
    });

    it('returns fallback for non-existent sub-doc', () => {
      const result = resources.readResource('s3db://plugin/state-machine/nonexistent');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('Sub-document not found');
    });

    it('returns error for non-existent plugin', () => {
      const result = resources.readResource('s3db://plugin/nonexistent');
      expect(result).not.toBeNull();
      expect(result!.text).toContain('Plugin not found');
    });
  });

  // =========================================================================
  // Fuzzy search (existing behavior + scoped)
  // =========================================================================
  describe('s3dbSearchDocs - fuzzy search', () => {
    it('returns results for state machine query', async () => {
      const result = await handlers.s3dbSearchDocs({ query: 'state machine triggers' });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeGreaterThan(0);
    });

    it('returns individual URIs for plugin sub-docs', async () => {
      const result = await handlers.s3dbSearchDocs({
        query: 'state machine triggers event cron',
        limit: 10,
      });
      expect(result.success).toBe(true);

      const uris = result.results.map((r: any) => r.uri).filter(Boolean);
      const hasSubDocUri = uris.some((u: string) => u.includes('/state-machine/') && u !== 's3db://plugin/state-machine');
      expect(hasSubDocUri).toBe(true);
    });

    it('requires at least one parameter', async () => {
      const result = await handlers.s3dbSearchDocs({});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Provide at least one');
    });
  });

  // =========================================================================
  // Regex search
  // =========================================================================
  describe('s3dbSearchDocs - regex search', () => {
    it('finds docs matching a regex pattern', async () => {
      const result = await handlers.s3dbSearchDocs({ pattern: 'entry.*exit' });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeGreaterThan(0);
      expect(result.results[0].snippet).toBeTruthy();
    });

    it('finds docs with alternation pattern', async () => {
      const result = await handlers.s3dbSearchDocs({ pattern: 'bcrypt|argon2' });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeGreaterThan(0);
    });

    it('returns error for invalid regex', async () => {
      await expect(
        handlers.s3dbSearchDocs({ pattern: '[invalid' })
      ).rejects.toThrow('Invalid regex pattern');
    });

    it('respects limit parameter', async () => {
      const result = await handlers.s3dbSearchDocs({ pattern: 'plugin', limit: 2 });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeLessThanOrEqual(2);
    });

    it('combines regex with group filter', async () => {
      const result = await handlers.s3dbSearchDocs({
        pattern: 'entry.*action',
        group: 'plugin:state-machine',
      });
      expect(result.success).toBe(true);
      for (const r of result.results) {
        expect(r.path).toContain('state-machine');
      }
    });
  });

  // =========================================================================
  // Group filtering
  // =========================================================================
  describe('s3dbSearchDocs - group filter', () => {
    it('browses plugin:state-machine docs without query', async () => {
      const result = await handlers.s3dbSearchDocs({ group: 'plugin:state-machine', limit: 20 });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeGreaterThan(5);

      for (const r of result.results) {
        expect(r.path).toContain('state-machine');
      }

      const titles = result.results.map((r: any) => r.title.toLowerCase());
      expect(titles.some((t: string) => t.includes('trigger'))).toBe(true);
      expect(titles.some((t: string) => t.includes('guard'))).toBe(true);
      expect(titles.some((t: string) => t.includes('action'))).toBe(true);
    });

    it('browses core docs', async () => {
      const result = await handlers.s3dbSearchDocs({ group: 'core' });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeGreaterThan(0);
    });

    it('browses plugins group', async () => {
      const result = await handlers.s3dbSearchDocs({ group: 'plugins' });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeGreaterThan(10);
    });

    it('scoped fuzzy search within a plugin', async () => {
      const result = await handlers.s3dbSearchDocs({
        query: 'retries',
        group: 'plugin:state-machine',
      });
      expect(result.success).toBe(true);
      expect(result.resultCount).toBeGreaterThan(0);

      for (const r of result.results) {
        expect(r.path).toContain('state-machine');
      }
    });

    it('scoped search only returns docs from the filtered group', async () => {
      const result = await handlers.s3dbSearchDocs({
        query: 'cache',
        group: 'plugin:state-machine',
      });
      expect(result.success).toBe(true);
      for (const r of result.results) {
        expect(r.path).toContain('state-machine');
      }
    });

    it('unknown group returns all docs gracefully', async () => {
      const result = await handlers.s3dbSearchDocs({ group: 'nonexistent', query: 'state' });
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // End-to-end: search → URI → readResource pipeline
  // =========================================================================
  describe('search → read pipeline', () => {
    it('all URIs from search results are resolvable', async () => {
      const result = await handlers.s3dbSearchDocs({
        query: 'state machine guards actions triggers',
        limit: 10,
      });
      expect(result.success).toBe(true);

      for (const r of result.results) {
        if (!r.uri) continue;
        const resource = resources.readResource(r.uri);
        expect(resource, `URI ${r.uri} should resolve`).not.toBeNull();
        expect(resource!.text.length, `URI ${r.uri} should have content`).toBeGreaterThan(100);
      }
    });

    it('plugin:state-machine group URIs all resolve', async () => {
      const result = await handlers.s3dbSearchDocs({
        group: 'plugin:state-machine',
        limit: 20,
      });
      expect(result.success).toBe(true);

      for (const r of result.results) {
        if (!r.uri) continue;
        const resource = resources.readResource(r.uri);
        expect(resource, `URI ${r.uri} should resolve`).not.toBeNull();
        expect(resource!.text.length, `URI ${r.uri} should have content`).toBeGreaterThan(50);
      }
    });
  });
});
