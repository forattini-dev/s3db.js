/**
 * Documentation Search Tools - Fuzzy Search
 * Provides search tools for core docs and plugin docs using Fuse.js.
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, basename, relative } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { execSync } from 'child_process';
import type { S3dbMCPServer } from '../entrypoint.js';
import type { S3dbSearchDocsArgs, S3dbListTopicsArgs } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../');
const LOCAL_DOCS_ROOT = join(PROJECT_ROOT, 'docs');

const CACHE_DIR = join(homedir(), '.cache', 's3db-mcp');
const CACHED_DOCS_ROOT = join(CACHE_DIR, 'docs');
const REPO_URL = 'https://github.com/forattini-dev/s3db.js.git';

function getDocsRoot(): string {
  if (existsSync(LOCAL_DOCS_ROOT)) {
    return LOCAL_DOCS_ROOT;
  }
  return CACHED_DOCS_ROOT;
}

let DOCS_ROOT = LOCAL_DOCS_ROOT;

interface DocEntry {
  id: string;
  path: string;
  title: string;
  content: string;
  category: string;
}

interface SearchResult {
  id: string;
  path: string;
  title: string;
  content: string;
  snippet: string;
  score: number;
}

const CORE_PATHS = ['core', 'guides', 'reference', 'clients', 'benchmarks'];
const PLUGIN_PATHS = ['plugins'];

let FuseConstructor: any | null = null;
let coreIndex: any | null = null;
let pluginIndex: any | null = null;
let coreDocs: DocEntry[] = [];
let pluginDocs: DocEntry[] = [];

async function getFuseConstructor(): Promise<any> {
  if (FuseConstructor) {
    return FuseConstructor;
  }

  const module = await import('fuse.js');
  FuseConstructor = module.default;
  return FuseConstructor;
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return basename(filename, '.md').replace(/-/g, ' ');
}

function loadMarkdownFiles(basePath: string, category: string): DocEntry[] {
  const entries: DocEntry[] = [];

  if (!existsSync(basePath)) return entries;

  function walkDir(dir: string) {
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (file.endsWith('.md') && !file.startsWith('_')) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const relPath = relative(DOCS_ROOT, fullPath);
          entries.push({
            id: relPath,
            path: relPath,
            title: extractTitle(content, file),
            content: content.slice(0, 5000),
            category,
          });
        } catch (err) {
          // Skip unreadable files
        }
      }
    }
  }

  walkDir(basePath);
  return entries;
}

async function buildIndex(docs: DocEntry[]): Promise<any> {
  const Fuse = await getFuseConstructor();

  return new Fuse(docs, {
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'content', weight: 0.6 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

async function loadCoreDocs(): Promise<void> {
  if (coreDocs.length > 0) return;

  for (const subdir of CORE_PATHS) {
    const path = join(DOCS_ROOT, subdir);
    coreDocs.push(...loadMarkdownFiles(path, subdir));
  }

  // Also load root-level docs
  const rootFiles = readdirSync(DOCS_ROOT).filter(f =>
    f.endsWith('.md') && !f.startsWith('_')
  );
  for (const file of rootFiles) {
    try {
      const content = readFileSync(join(DOCS_ROOT, file), 'utf-8');
      coreDocs.push({
        id: file,
        path: file,
        title: extractTitle(content, file),
        content: content.slice(0, 5000),
        category: 'root',
      });
    } catch (err) {}
  }

  coreIndex = await buildIndex(coreDocs);
}

async function loadPluginDocs(): Promise<void> {
  if (pluginDocs.length > 0) return;

  for (const subdir of PLUGIN_PATHS) {
    const path = join(DOCS_ROOT, subdir);
    pluginDocs.push(...loadMarkdownFiles(path, 'plugins'));
  }

  pluginIndex = await buildIndex(pluginDocs);
}

function pathToResourceUri(path: string): string | null {
  // Convert doc file paths to s3db:// URIs
  // plugins/cache/README.md → s3db://plugin/cache
  // core/partitions.md → s3db://core/partitions
  // guides/testing.md → s3db://guide/testing
  // schema.md → s3db://core/schema
  const normalized = path.replace(/\\/g, '/');
  const pluginMatch = normalized.match(/^plugins\/([^/]+)/);
  if (pluginMatch) return `s3db://plugin/${pluginMatch[1]}`;
  const coreMatch = normalized.match(/^core\/([^.]+)\.md$/);
  if (coreMatch) return `s3db://core/${coreMatch[1]}`;
  const guideMatch = normalized.match(/^guides\/([^.]+)\.md$/);
  if (guideMatch) return `s3db://guide/${guideMatch[1].replace(/-/g, '-')}`;
  const refMatch = normalized.match(/^reference\/([^.]+)\.md$/);
  if (refMatch) return `s3db://reference/${refMatch[1]}`;
  return null;
}

function extractSnippet(content: string, query: string, maxLength = 300): string {
  const lowerContent = content.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  let bestPos = 0;
  for (const term of terms) {
    const pos = lowerContent.indexOf(term);
    if (pos !== -1) {
      bestPos = pos;
      break;
    }
  }

  const start = Math.max(0, bestPos - 50);
  const end = Math.min(content.length, start + maxLength);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet.trim();
}

function search(index: any | null, docs: DocEntry[], query: string, limit = 5): SearchResult[] {
  if (!index) return [];

  const results = index.search(query, { limit });

  return results.map(r => ({
    id: r.item.id,
    path: r.item.path,
    title: r.item.title,
    content: r.item.content,
    snippet: extractSnippet(r.item.content, query),
    score: 1 - (r.score || 0),
  }));
}

async function searchDocs(type: 'core' | 'plugins', query: string, limit = 5): Promise<any> {
  try {
    if (type === 'core') {
      await loadCoreDocs();
    } else {
      await loadPluginDocs();
    }

    const docs = type === 'core' ? coreDocs : pluginDocs;
    const index = type === 'core' ? coreIndex : pluginIndex;
    const results = search(index, docs, query, limit);

    return {
      success: true,
      query,
      type,
      resultCount: results.length,
      totalDocs: docs.length,
      results: results.map(r => ({
        title: r.title,
        path: r.path,
        uri: pathToResourceUri(r.path),
        snippet: r.snippet,
        score: r.score,
      })),
    };
  } catch (error: any) {
    return {
      success: false,
      query,
      type,
      error: error.message,
    };
  }
}

async function listTopics(type: 'core' | 'plugins'): Promise<any> {
  try {
    if (type === 'core') {
      await loadCoreDocs();
      const categories = [...new Set(coreDocs.map(d => d.category))];
      return {
        success: true,
        type,
        totalDocuments: coreDocs.length,
        topics: categories.map(cat => ({
          category: cat,
          documents: coreDocs.filter(d => d.category === cat).map(d => ({
            path: d.path,
            title: d.title,
          })),
        })),
      };
    } else {
      await loadPluginDocs();
      const byPlugin = new Map<string, DocEntry[]>();
      for (const doc of pluginDocs) {
        const parts = doc.path.split('/');
        const plugin = parts[1] || 'general';
        if (!byPlugin.has(plugin)) byPlugin.set(plugin, []);
        byPlugin.get(plugin)!.push(doc);
      }
      return {
        success: true,
        type,
        totalDocuments: pluginDocs.length,
        topics: Array.from(byPlugin.entries()).map(([plugin, docs]) => ({
          plugin,
          documents: docs.map(d => ({
            path: d.path,
            title: d.title,
          })),
        })),
      };
    }
  } catch (error: any) {
    return {
      success: false,
      type,
      error: error.message,
    };
  }
}

export const docsSearchTools = [
  {
    name: 's3dbSearchDocs',
    description: `Search all s3db.js documentation (core + plugins) using fuzzy search. Covers: resource API, schema validation, CRUD, partitioning, behaviors, encoding, encryption, security config (passphrase, pepper, bcrypt, argon2, password hashing), CLI, and all plugins (Cache, Audit, TTL, API, Vector, Graph, etc). TIP: For security/password/encryption topics, read s3db://core/security directly instead of searching.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "how do partitions work", "cache plugin config", "create resource")',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 5)',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 's3dbSearchCoreDocs',
    description: `Search s3db.js CORE documentation using fuzzy search.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 's3dbSearchPluginDocs',
    description: `Search s3db.js PLUGIN documentation using fuzzy search.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 's3dbListCoreTopics',
    description: 'List all available topics in s3db.js CORE documentation',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 's3dbListPluginTopics',
    description: 'List all available topics in s3db.js PLUGIN documentation',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

export function createDocsSearchHandlers(server: S3dbMCPServer) {
  return {
    async s3dbSearchDocs(args: S3dbSearchDocsArgs): Promise<any> {
      const { query, limit = 5 } = args;
      // Search both core and plugin docs, merge and sort by score
      const [coreResults, pluginResults] = await Promise.all([
        searchDocs('core', query, limit),
        searchDocs('plugins', query, limit),
      ]);

      const allResults = [
        ...(coreResults.results || []).map((r: any) => ({ ...r, source: 'core' })),
        ...(pluginResults.results || []).map((r: any) => ({ ...r, source: 'plugin' })),
      ].sort((a, b) => b.score - a.score).slice(0, limit);

      return {
        success: true,
        query,
        resultCount: allResults.length,
        totalDocs: (coreResults.totalDocs || 0) + (pluginResults.totalDocs || 0),
        results: allResults,
        hint: 'Read full docs via s3db:// URIs shown in each result.',
      };
    },

    async s3dbSearchCoreDocs(args: S3dbSearchDocsArgs): Promise<any> {
      const { query, limit = 5 } = args;
      return searchDocs('core', query, limit);
    },

    async s3dbSearchPluginDocs(args: S3dbSearchDocsArgs): Promise<any> {
      const { query, limit = 5 } = args;
      return searchDocs('plugins', query, limit);
    },

    async s3dbListCoreTopics(_args: S3dbListTopicsArgs): Promise<any> {
      return listTopics('core');
    },

    async s3dbListPluginTopics(_args: S3dbListTopicsArgs): Promise<any> {
      return listTopics('plugins');
    },
  };
}

async function ensureDocsAvailable(): Promise<boolean> {
  if (existsSync(LOCAL_DOCS_ROOT)) {
    DOCS_ROOT = LOCAL_DOCS_ROOT;
    return true;
  }

  if (existsSync(CACHED_DOCS_ROOT)) {
    DOCS_ROOT = CACHED_DOCS_ROOT;
    return true;
  }

  console.error('📚 Docs not found locally. Cloning from GitHub...');

  try {
    mkdirSync(CACHE_DIR, { recursive: true });

    const tempDir = join(CACHE_DIR, 'repo-temp');

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    execSync(
      `git clone --depth 1 --filter=blob:none --sparse "${REPO_URL}" "${tempDir}"`,
      { stdio: 'pipe' }
    );

    execSync(
      'git sparse-checkout set docs',
      { cwd: tempDir, stdio: 'pipe' }
    );

    const clonedDocs = join(tempDir, 'docs');
    if (existsSync(clonedDocs)) {
      if (existsSync(CACHED_DOCS_ROOT)) {
        rmSync(CACHED_DOCS_ROOT, { recursive: true, force: true });
      }
      execSync(`mv "${clonedDocs}" "${CACHED_DOCS_ROOT}"`, { stdio: 'pipe' });
    }

    rmSync(tempDir, { recursive: true, force: true });

    DOCS_ROOT = CACHED_DOCS_ROOT;
    console.error('✅ Docs cloned successfully to', CACHED_DOCS_ROOT);
    return true;
  } catch (err) {
    console.error('⚠️  Failed to clone docs:', (err as Error).message);
    console.error('   Documentation search will be unavailable.');
    return false;
  }
}

export async function preloadSearch(): Promise<void> {
  const docsAvailable = await ensureDocsAvailable();
  if (!docsAvailable) {
    return;
  }
  await loadCoreDocs();
  await loadPluginDocs();
}

export default {
  docsSearchTools,
  createDocsSearchHandlers,
  preloadSearch,
};
