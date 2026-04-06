/**
 * Filesystem CrawlStorage Driver
 *
 * Stores crawl results and errors as JSON files on the local filesystem.
 * Supports JSON (one file per result) or JSONL (one file, one line per result).
 */

import { promises as fsp } from 'fs';
import path from 'path';
import type { CrawlStorageAdapter } from 'recker/scrape/crawl-storage';
import type { AdapterContext } from '../index.js';

export class FilesystemCrawlStorage implements CrawlStorageAdapter {
  private directory: string;
  private format: 'json' | 'jsonl';
  private resultCount = 0;

  constructor(config: Record<string, any>) {
    this.directory = config.directory;
    if (!this.directory) throw new Error('filesystem crawl storage requires config.directory');
    this.format = config.format || 'json';
  }

  private async _ensureDir(): Promise<void> {
    await fsp.mkdir(this.directory, { recursive: true });
    await fsp.mkdir(path.join(this.directory, 'results'), { recursive: true });
    await fsp.mkdir(path.join(this.directory, 'errors'), { recursive: true });
  }

  private _fileHash(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  async saveResult(result: any): Promise<void> {
    await this._ensureDir();
    this.resultCount++;

    if (this.format === 'jsonl') {
      await fsp.appendFile(
        path.join(this.directory, 'results.jsonl'),
        JSON.stringify(result) + '\n'
      );
    } else {
      const filename = `${this._fileHash(result.url)}_${this.resultCount}.json`;
      await fsp.writeFile(
        path.join(this.directory, 'results', filename),
        JSON.stringify(result, null, 2)
      );
    }
  }

  async saveError(error: { url: string; error: string }): Promise<void> {
    await this._ensureDir();

    if (this.format === 'jsonl') {
      await fsp.appendFile(
        path.join(this.directory, 'errors.jsonl'),
        JSON.stringify(error) + '\n'
      );
    } else {
      const filename = `${this._fileHash(error.url)}_error.json`;
      await fsp.writeFile(
        path.join(this.directory, 'errors', filename),
        JSON.stringify(error, null, 2)
      );
    }
  }

  async getResultCount(): Promise<number> {
    if (this.format === 'jsonl') {
      try {
        const content = await fsp.readFile(path.join(this.directory, 'results.jsonl'), 'utf-8');
        return content.trim().split('\n').filter(Boolean).length;
      } catch {
        return 0;
      }
    }
    try {
      const files = await fsp.readdir(path.join(this.directory, 'results'));
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  async getResults(): Promise<any[]> {
    if (this.format === 'jsonl') {
      try {
        const content = await fsp.readFile(path.join(this.directory, 'results.jsonl'), 'utf-8');
        return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      } catch {
        return [];
      }
    }
    try {
      const dir = path.join(this.directory, 'results');
      const files = await fsp.readdir(dir);
      const results: any[] = [];
      for (const file of files.filter(f => f.endsWith('.json'))) {
        const content = await fsp.readFile(path.join(dir, file), 'utf-8');
        results.push(JSON.parse(content));
      }
      return results;
    } catch {
      return [];
    }
  }

  async getErrors(): Promise<Array<{ url: string; error: string }>> {
    if (this.format === 'jsonl') {
      try {
        const content = await fsp.readFile(path.join(this.directory, 'errors.jsonl'), 'utf-8');
        return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      } catch {
        return [];
      }
    }
    try {
      const dir = path.join(this.directory, 'errors');
      const files = await fsp.readdir(dir);
      const errors: any[] = [];
      for (const file of files.filter(f => f.endsWith('.json'))) {
        const content = await fsp.readFile(path.join(dir, file), 'utf-8');
        errors.push(JSON.parse(content));
      }
      return errors;
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      if (this.format === 'jsonl') {
        await fsp.unlink(path.join(this.directory, 'results.jsonl')).catch(() => {});
        await fsp.unlink(path.join(this.directory, 'errors.jsonl')).catch(() => {});
      } else {
        const resultsDir = path.join(this.directory, 'results');
        const errorsDir = path.join(this.directory, 'errors');
        for (const dir of [resultsDir, errorsDir]) {
          const files = await fsp.readdir(dir).catch(() => [] as string[]);
          for (const file of files) {
            await fsp.unlink(path.join(dir, file));
          }
        }
      }
      this.resultCount = 0;
    } catch {
      // directory may not exist yet
    }
  }

  async close(): Promise<void> {
    // no-op
  }
}

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  return new FilesystemCrawlStorage(config);
}
