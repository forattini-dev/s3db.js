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
  const normalized = path.replace(/\\/g, '/');
  const pluginMatch = normalized.match(/^plugins\/([^/]+)\/(.+)$/);
  if (pluginMatch) {
    const [, pluginName, rest] = pluginMatch;
    if (rest === 'README.md') {
      return `s3db://plugin/${pluginName}`;
    }
    const subDoc = rest.replace(/\.md$/, '');
    return `s3db://plugin/${pluginName}/${subDoc}`;
  }
  const coreMatch = normalized.match(/^core\/([^.]+)\.md$/);
  if (coreMatch) return `s3db://core/${coreMatch[1]}`;
  const guideMatch = normalized.match(/^guides\/([^.]+)\.md$/);
  if (guideMatch) return `s3db://guide/${guideMatch[1]}`;
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

function regexSearch(docs: DocEntry[], pattern: string, limit = 5): SearchResult[] {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'gim');
  } catch (err: any) {
    throw new Error(`Invalid regex pattern: ${err.message}`);
  }

  const results: SearchResult[] = [];

  for (const doc of docs) {
    const match = regex.exec(doc.content);
    if (match) {
      const matchPos = match.index;
      const start = Math.max(0, matchPos - 50);
      const end = Math.min(doc.content.length, matchPos + match[0].length + 200);
      let snippet = doc.content.slice(start, end);
      if (start > 0) snippet = '...' + snippet;
      if (end < doc.content.length) snippet = snippet + '...';

      results.push({
        id: doc.id,
        path: doc.path,
        title: doc.title,
        content: doc.content,
        snippet: snippet.trim(),
        score: 1.0,
      });

      if (results.length >= limit) break;
    }
    regex.lastIndex = 0;
  }

  return results;
}

function filterDocsByGroup(docs: DocEntry[], group: string): DocEntry[] {
  const pluginGroupMatch = group.match(/^plugin:(.+)$/);
  if (pluginGroupMatch) {
    const pluginName = pluginGroupMatch[1].toLowerCase();
    return docs.filter(d => {
      const normalized = d.path.replace(/\\/g, '/');
      const match = normalized.match(/^plugins\/([^/]+)/);
      return match && match[1].toLowerCase() === pluginName;
    });
  }

  switch (group.toLowerCase()) {
    case 'core':
      return docs.filter(d => d.category === 'core' || d.category === 'root');
    case 'plugins':
      return docs.filter(d => d.category === 'plugins');
    case 'guides':
      return docs.filter(d => d.category === 'guides');
    case 'reference':
      return docs.filter(d => d.category === 'reference');
    case 'clients':
      return docs.filter(d => d.category === 'clients');
    case 'benchmarks':
      return docs.filter(d => d.category === 'benchmarks');
    default:
      return docs;
  }
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
    description: `Search all s3db.js documentation (core + plugins). Supports fuzzy search (query), regex search (pattern), and document group filtering (group). Use group to narrow scope before searching. TIP: For security/password/encryption topics, read s3db://core/security directly.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Fuzzy search query (e.g., "how do partitions work", "cache plugin config")',
        },
        pattern: {
          type: 'string',
          description: 'Regex pattern to search doc content (e.g., "partition.*O\\\\(1\\\\)", "bcrypt|argon2")',
        },
        group: {
          type: 'string',
          description: 'Filter by doc group: "core", "plugins", "guides", "reference", "clients", "benchmarks", or "plugin:<name>" (e.g., "plugin:state-machine"). Without query/pattern, returns browsable index.',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 5)',
          default: 5,
        },
      },
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
      const { query, pattern, group, limit = 5 } = args;

      if (!query && !pattern && !group) {
        return {
          success: false,
          error: 'Provide at least one of: query (fuzzy search), pattern (regex search), or group (browse docs).',
        };
      }

      await loadCoreDocs();
      await loadPluginDocs();

      let targetDocs = [...coreDocs, ...pluginDocs];
      if (group) {
        targetDocs = filterDocsByGroup(targetDocs, group);
      }

      if (!query && !pattern) {
        return {
          success: true,
          group,
          resultCount: targetDocs.length,
          totalDocs: targetDocs.length,
          results: targetDocs.slice(0, limit).map(d => ({
            title: d.title,
            path: d.path,
            uri: pathToResourceUri(d.path),
            category: d.category,
          })),
          hint: 'Read full docs via s3db:// URIs shown in each result.',
        };
      }

      let results: SearchResult[];

      if (pattern) {
        results = regexSearch(targetDocs, pattern, limit);
      } else {
        const tempIndex = await buildIndex(targetDocs);
        results = search(tempIndex, targetDocs, query!, limit);
      }

      return {
        success: true,
        query: query || undefined,
        pattern: pattern || undefined,
        group: group || undefined,
        resultCount: results.length,
        totalDocs: targetDocs.length,
        results: results.map(r => ({
          title: r.title,
          path: r.path,
          uri: pathToResourceUri(r.path),
          snippet: r.snippet,
          score: r.score,
        })),
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
