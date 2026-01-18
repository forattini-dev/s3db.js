/**
 * Lazy loader for embeddings data.
 *
 * Downloads embeddings from GitHub Releases only when needed,
 * caching them locally for subsequent uses.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { EmbeddingsData } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getPackageVersionFromPkg(): string {
  try {
    const paths = [
      join(__dirname, '..', '..', 'package.json'),
      join(__dirname, '..', '..', '..', 'package.json'),
      join(process.cwd(), 'package.json'),
    ];

    for (const pkgPath of paths) {
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 's3db.js') {
          return pkg.version;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return '19.3.0'; // Fallback version
}

let _packageVersion: string | null = null;
function getPackageVersion(): string {
  if (!_packageVersion) {
    _packageVersion = getPackageVersionFromPkg();
  }
  return _packageVersion;
}

const GITHUB_RELEASE_URL = 'https://github.com/forattini-dev/s3db.js/releases/download';

function getCacheDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir) {
    return join(homeDir, '.cache', 's3db.js');
  }

  try {
    return join(__dirname, '..', '..', 'node_modules', '.cache', 's3db.js');
  } catch {
    return join(process.cwd(), 'node_modules', '.cache', 's3db.js');
  }
}

/**
 * Embedding types available.
 */
export const EMBEDDING_TYPES = {
  CORE: 'core',
  PLUGINS: 'plugins',
};

const memoryCache = new Map<string, EmbeddingsData>();

export function getEmbeddingsCachePath(type: string, version?: string): string {
  const cacheDir = getCacheDir();
  const ver = version || getPackageVersion();
  return join(cacheDir, `embeddings-${type}-${ver}.json`);
}

export function hasLocalEmbeddings(type: string, version?: string): boolean {
  return existsSync(getEmbeddingsCachePath(type, version));
}

export function loadLocalEmbeddings(type: string, version?: string): EmbeddingsData | null {
  const cachePath = getEmbeddingsCachePath(type, version);

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const data = readFileSync(cachePath, 'utf-8');
    return JSON.parse(data) as EmbeddingsData;
  } catch {
    return null;
  }
}

export function saveLocalEmbeddings(type: string, data: EmbeddingsData, version?: string): void {
  const cachePath = getEmbeddingsCachePath(type, version);
  const cacheDir = dirname(cachePath);

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  writeFileSync(cachePath, JSON.stringify(data));
}

export async function downloadEmbeddings(type: string, version?: string): Promise<EmbeddingsData> {
  const ver = version || getPackageVersion();
  const filename = `embeddings-${type}.json`;
  const url = `${GITHUB_RELEASE_URL}/v${ver}/${filename}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download embeddings: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as EmbeddingsData;
    saveLocalEmbeddings(type, data, ver);
    return data;
  } catch (error) {
    throw new Error(`Failed to download embeddings from ${url}: ${error}`);
  }
}

export async function loadBundledEmbeddings(type: string): Promise<EmbeddingsData | null> {
  try {
    const filename = `embeddings-${type}.json`;

    // Try bundled path (mcp/data/)
    const bundledPath = join(__dirname, '..', 'data', filename);
    if (existsSync(bundledPath)) {
      const data = readFileSync(bundledPath, 'utf-8');
      return JSON.parse(data) as EmbeddingsData;
    }
  } catch {
    // Not available
  }

  return null;
}

export interface LoadEmbeddingsOptions {
  forceDownload?: boolean;
  version?: string;
  offline?: boolean;
  debug?: boolean;
}

function createEmptyEmbeddings(type: string): EmbeddingsData {
  return {
    version: '1.0.0',
    model: 'none',
    dimensions: 0,
    generatedAt: new Date().toISOString(),
    documents: [],
  };
}

/**
 * Load embeddings with lazy download strategy.
 *
 * Priority:
 * 1. Memory cache
 * 2. Local file cache (~/.cache/s3db.js/)
 * 3. Bundled file (development mode)
 * 4. GitHub Release download (first time or update)
 */
export async function loadEmbeddings(type: string, options: LoadEmbeddingsOptions = {}): Promise<EmbeddingsData> {
  const { forceDownload = false, version, offline = false, debug = false } = options;
  const cacheKey = `embeddings-${type}`;

  const log = (msg: string) => {
    if (debug) console.log(`[embeddings-loader] ${msg}`);
  };

  // 1. Memory cache
  if (!forceDownload && memoryCache.has(cacheKey)) {
    log(`Loaded from memory cache: ${cacheKey}`);
    return memoryCache.get(cacheKey)!;
  }

  // 2. Local file cache
  if (!forceDownload) {
    const cached = loadLocalEmbeddings(type, version);
    if (cached) {
      log(`Loaded from file cache: ${getEmbeddingsCachePath(type, version)}`);
      memoryCache.set(cacheKey, cached);
      return cached;
    }
  }

  // 3. Bundled file (development)
  const bundled = await loadBundledEmbeddings(type);
  if (bundled) {
    log('Loaded bundled embeddings');
    memoryCache.set(cacheKey, bundled);
    return bundled;
  }

  // 4. Download from GitHub Releases
  if (!offline) {
    try {
      log(`Downloading embeddings-${type} v${version || getPackageVersion()}...`);
      const downloaded = await downloadEmbeddings(type, version);
      log(`Downloaded and cached: ${downloaded.documents?.length || 0} documents`);
      memoryCache.set(cacheKey, downloaded);
      return downloaded;
    } catch (error) {
      log(`Download failed: ${error}`);
    }
  }

  // Fallback: empty embeddings (graceful degradation)
  log('No embeddings available, using empty fallback');
  const empty = createEmptyEmbeddings(type);
  memoryCache.set(cacheKey, empty);
  return empty;
}

export async function loadAllEmbeddings(options: LoadEmbeddingsOptions = {}): Promise<{ core: EmbeddingsData; plugins: EmbeddingsData }> {
  const [core, plugins] = await Promise.all([
    loadEmbeddings(EMBEDDING_TYPES.CORE, options),
    loadEmbeddings(EMBEDDING_TYPES.PLUGINS, options),
  ]);

  return { core, plugins };
}

export function clearCache(): void {
  memoryCache.clear();
}

export function getCacheStats(): any {
  const stats = {
    entriesInMemory: memoryCache.size,
    types: [] as any[],
  };

  for (const [key, data] of memoryCache.entries()) {
    stats.types.push({
      key,
      documents: data.documents?.length || 0,
      model: data.model,
      generatedAt: data.generatedAt,
    });
  }

  return stats;
}

export async function preloadEmbeddings(options: LoadEmbeddingsOptions = {}): Promise<void> {
  await loadAllEmbeddings(options);
}

export function clearEmbeddingsCache(type?: string, version?: string): void {
  const fs = require('fs');

  if (type) {
    const cachePath = getEmbeddingsCachePath(type, version);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } else {
    // Clear all types
    for (const t of Object.values(EMBEDDING_TYPES)) {
      const cachePath = getEmbeddingsCachePath(t, version);
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    }
  }
}

export { getPackageVersion };

export default {
  loadEmbeddings,
  loadAllEmbeddings,
  clearCache,
  getCacheStats,
  preloadEmbeddings,
  EMBEDDING_TYPES,
};
