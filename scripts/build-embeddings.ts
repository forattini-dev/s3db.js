/**
 * Build Embeddings Script for S3DB
 *
 * Generates pre-computed embeddings for MCP documentation.
 * Splits into TWO separate embedding files:
 * - embeddings-core.json: Core documentation (getting started, client, schema, etc.)
 * - embeddings-plugins.json: Plugin documentation
 *
 * Requirements:
 * - fastembed (devDependency)
 * - Node.js 18+
 *
 * Usage:
 *   pnpm build:embeddings
 *   pnpm build:embeddings --debug
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Parse command line arguments
function parseArgs(): { debug: boolean } {
  const args = process.argv.slice(2);
  return {
    debug: args.includes('--debug'),
  };
}

// Important domain terms for s3db
const DOMAIN_TERMS = [
  // Core concepts
  'database', 'resource', 'schema', 'validation', 'attributes', 'metadata',
  'insert', 'update', 'delete', 'query', 'list', 'get', 'patch', 'replace',
  'partition', 'partitioning', 'orphaned', 'migration', 'async',
  // Storage
  's3', 'bucket', 'object', 'key', 'prefix', 'body', 'metadata',
  'overflow', 'behavior', 'enforce-limits', 'body-only', 'truncate',
  // Security
  'encryption', 'secret', 'aes', 'gcm', 'pbkdf2',
  // Performance
  'compression', 'encoding', 'base62', 'dictionary', 'benchmark',
  'streaming', 'batch', 'pool', 'parallel', 'concurrent',
  // Field types
  'embedding', 'vector', 'ip4', 'ip6', 'timestamp', 'uuid',
  // MCP
  'mcp', 'model-context-protocol', 'ai', 'claude', 'agent', 'tool',
  // Plugins
  'plugin', 'cache', 'audit', 'replicator', 'backup', 'geo', 'metrics',
  'ttl', 'fulltext', 'queue', 'scheduler', 'coordinator', 'consistency',
  'eventual', 'graph', 'tree', 'state-machine', 'identity', 'api',
  // Cloud
  'aws', 'minio', 'localstack', 'cloudflare', 'r2', 'digitalocean', 'spaces',
  // Connections
  'connection', 'client', 'memory', 'filesystem', 'connect', 'disconnect',
];

// Recursively walk directory for markdown files
function walkDir(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'examples') {
        files.push(...walkDir(fullPath));
      }
    } else if (extname(entry) === '.md') {
      files.push(fullPath);
    }
  }

  return files;
}

// Extract title from markdown content
function extractTitle(content: string, filename: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  const frontmatterMatch = content.match(/^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/);
  if (frontmatterMatch) return frontmatterMatch[1].trim();

  return basename(filename, '.md').replace(/[-_]/g, ' ');
}

// Extract keywords from content
function extractKeywords(content: string, title: string): string[] {
  const keywords = new Set<string>();
  const textLower = content.toLowerCase();

  // Add domain terms that appear in content
  for (const term of DOMAIN_TERMS) {
    if (textLower.includes(term)) {
      keywords.add(term);
    }
  }

  // Extract from title
  const titleWords = title.toLowerCase().split(/[\s\-_]+/);
  for (const word of titleWords) {
    const cleaned = word.replace(/[^a-z0-9]/g, '');
    if (cleaned.length > 2) {
      keywords.add(cleaned);
    }
  }

  // Code block language identifiers
  const codeBlockMatches = content.matchAll(/```(\w+)/g);
  for (const match of codeBlockMatches) {
    if (match[1] && match[1].length > 2) {
      keywords.add(match[1].toLowerCase());
    }
  }

  // Headers (H2-H4)
  const headerMatches = content.matchAll(/^#{2,4}\s+(.+)$/gm);
  for (const match of headerMatches) {
    const words = match[1].toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 3) {
        keywords.add(cleaned);
      }
    }
  }

  // Inline code (important API names)
  const inlineCodeMatches = content.matchAll(/`([^`]+)`/g);
  for (const match of inlineCodeMatches) {
    const code = match[1].toLowerCase();
    if (code.length > 2 && code.length < 30 && !code.includes(' ')) {
      keywords.add(code.replace(/[()[\]{}]/g, ''));
    }
  }

  // Function/method names
  const functionMatches = content.matchAll(/\b(create\w+|get\w+|set\w+|use\w+|on\w+)\b/gi);
  for (const match of functionMatches) {
    keywords.add(match[1].toLowerCase());
  }

  return Array.from(keywords).slice(0, 30);
}

// Clean content for embedding
function cleanContentForEmbedding(content: string): string {
  let cleaned = content.replace(/^---[\s\S]*?---\n?/, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '[code example]');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned.trim();
}

interface DocumentSection {
  heading: string;
  level: number;
  content: string;
}

// Split document into sections based on headings
function splitIntoSections(content: string): DocumentSection[] {
  const lines = content.split('\n');
  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        if (currentSection.content.length > 50) {
          sections.push(currentSection);
        }
      }

      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    } else {
      if (line.trim()) {
        if (!currentSection) {
          currentSection = {
            heading: 'Introduction',
            level: 1,
            content: '',
          };
          currentContent = [];
        }
        currentContent.push(line);
      }
    }
  }

  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    if (currentSection.content.length > 50) {
      sections.push(currentSection);
    }
  }

  return sections;
}

interface IndexedDoc {
  id: string;
  path: string;
  title: string;
  category: 'core' | 'plugin';
  keywords: string[];
  content: string;
  section?: string;
  parentPath?: string;
}

interface EmbeddingsOutput {
  version: string;
  model: string;
  dimensions: number;
  generatedAt: string;
  documents: Array<{
    id: string;
    path: string;
    title: string;
    category: 'core' | 'plugin';
    keywords: string[];
    section?: string;
    parentPath?: string;
    vector: number[];
  }>;
}

// Index documents from markdown files with chunking
function indexDocs(docsPath: string, isPlugin: boolean): IndexedDoc[] {
  const files = walkDir(docsPath);
  const docs: IndexedDoc[] = [];
  let docIndex = 0;
  const category = isPlugin ? 'plugin' : 'core';

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const relativePath = relative(projectRoot, file);
    const docTitle = extractTitle(content, file);

    const sections = splitIntoSections(content);

    if (sections.length <= 1) {
      docs.push({
        id: `${category}-${docIndex++}`,
        path: relativePath,
        title: docTitle,
        category,
        keywords: extractKeywords(content, docTitle),
        content: cleanContentForEmbedding(content).slice(0, 1000),
      });
    } else {
      // Add document overview
      const introSection = sections.find(s => s.level === 1) || sections[0];
      docs.push({
        id: `${category}-${docIndex++}`,
        path: relativePath,
        title: docTitle,
        category,
        keywords: extractKeywords(content, docTitle),
        content: cleanContentForEmbedding(`${docTitle}. ${introSection?.content || ''}`).slice(0, 500),
      });

      // Add each H2 section as a separate chunk
      for (const section of sections) {
        if (section.level === 2 && section.content.length > 100) {
          const chunkTitle = `${docTitle} - ${section.heading}`;
          const sectionKeywords = extractKeywords(section.content, chunkTitle);

          docs.push({
            id: `${category}-${docIndex++}`,
            path: relativePath,
            title: chunkTitle,
            category,
            keywords: sectionKeywords,
            content: cleanContentForEmbedding(section.content).slice(0, 1000),
            section: section.heading,
            parentPath: relativePath,
          });
        }
      }
    }
  }

  return docs;
}

async function main() {
  const { debug } = parseArgs();

  console.log('[build-embeddings] Starting s3db.js embeddings generation...');
  console.log(`  Project root: ${projectRoot}`);

  const docsDir = join(projectRoot, 'docs');
  const pluginsDir = join(projectRoot, 'docs/plugins');
  const outputDir = join(projectRoot, 'mcp/data');

  if (!existsSync(docsDir)) {
    console.error('[build-embeddings] Error: Docs directory not found');
    process.exit(1);
  }

  // Index core docs (exclude plugins directory)
  console.log('[build-embeddings] Indexing core documentation...');
  const coreFiles = walkDir(docsDir).filter(f => !f.includes('/plugins/'));
  const coreDocs: IndexedDoc[] = [];
  let coreDocIndex = 0;

  for (const file of coreFiles) {
    const content = readFileSync(file, 'utf-8');
    const relativePath = relative(projectRoot, file);
    const docTitle = extractTitle(content, file);
    const sections = splitIntoSections(content);

    if (sections.length <= 1) {
      coreDocs.push({
        id: `core-${coreDocIndex++}`,
        path: relativePath,
        title: docTitle,
        category: 'core',
        keywords: extractKeywords(content, docTitle),
        content: cleanContentForEmbedding(content).slice(0, 1000),
      });
    } else {
      const introSection = sections.find(s => s.level === 1) || sections[0];
      coreDocs.push({
        id: `core-${coreDocIndex++}`,
        path: relativePath,
        title: docTitle,
        category: 'core',
        keywords: extractKeywords(content, docTitle),
        content: cleanContentForEmbedding(`${docTitle}. ${introSection?.content || ''}`).slice(0, 500),
      });

      for (const section of sections) {
        if (section.level === 2 && section.content.length > 100) {
          const chunkTitle = `${docTitle} - ${section.heading}`;
          coreDocs.push({
            id: `core-${coreDocIndex++}`,
            path: relativePath,
            title: chunkTitle,
            category: 'core',
            keywords: extractKeywords(section.content, chunkTitle),
            content: cleanContentForEmbedding(section.content).slice(0, 1000),
            section: section.heading,
            parentPath: relativePath,
          });
        }
      }
    }
  }

  // Add CLAUDE.md and README.md as core docs
  for (const rootFile of ['CLAUDE.md', 'README.md']) {
    const filePath = join(projectRoot, rootFile);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const docTitle = extractTitle(content, rootFile);
      coreDocs.push({
        id: `core-${coreDocIndex++}`,
        path: rootFile,
        title: docTitle,
        category: 'core',
        keywords: extractKeywords(content, docTitle),
        content: cleanContentForEmbedding(content).slice(0, 1000),
      });
    }
  }

  console.log(`[build-embeddings] Found ${coreDocs.length} core documents`);

  // Index plugin docs
  console.log('[build-embeddings] Indexing plugin documentation...');
  const pluginDocs = indexDocs(pluginsDir, true);
  console.log(`[build-embeddings] Found ${pluginDocs.length} plugin documents`);

  // Try to load fastembed
  let FlagEmbedding: any;
  let EmbeddingModel: any;
  let hasEmbeddings = false;

  try {
    const fastembed = await import('fastembed');
    FlagEmbedding = fastembed.FlagEmbedding;
    EmbeddingModel = fastembed.EmbeddingModel;
    hasEmbeddings = true;
    console.log('[build-embeddings] fastembed loaded successfully');
  } catch (error) {
    console.log('[build-embeddings] fastembed not installed. Creating embeddings without vectors...');
    console.log('[build-embeddings] To enable semantic search, install fastembed:');
    console.log('  pnpm add -D fastembed');
  }

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate embeddings or create vector-less files
  async function processDocuments(docs: IndexedDoc[], outputFile: string, label: string) {
    if (docs.length === 0) {
      console.log(`[build-embeddings] No ${label} documents found, skipping...`);
      return;
    }

    let vectors: number[][] = [];
    let dimensions = 0;
    let model = 'none';

    if (hasEmbeddings) {
      console.log(`[build-embeddings] Generating embeddings for ${label}...`);
      const embedding = await FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
        showDownloadProgress: true,
      });

      const texts = docs.map(doc => {
        const text = `${doc.title}. ${doc.content}`;
        return `passage: ${text.slice(0, 1000)}`;
      });

      const batchSize = 32;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        console.log(
          `[build-embeddings] Processing ${label} batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`
        );

        for await (const batchVectors of embedding.embed(batch, batchSize)) {
          vectors.push(...batchVectors);
        }
      }

      dimensions = vectors[0]?.length || 0;
      model = 'BGESmallENV15';
    }

    const output: EmbeddingsOutput = {
      version: '1.0',
      model,
      dimensions,
      generatedAt: new Date().toISOString(),
      documents: docs.map((doc, i) => ({
        id: doc.id,
        path: doc.path,
        title: doc.title,
        category: doc.category,
        keywords: doc.keywords,
        section: doc.section,
        parentPath: doc.parentPath,
        vector: vectors[i]?.map((v: number) => Math.round(v * 10000) / 10000) || [],
      })),
    };

    const outputPath = join(outputDir, outputFile);
    const jsonOutput = JSON.stringify(output, null, 2);
    writeFileSync(outputPath, jsonOutput);

    const sizeKB = (jsonOutput.length / 1024).toFixed(1);
    console.log(`[build-embeddings] Saved ${outputFile} (${docs.length} docs, ${sizeKB}KB)`);

    if (debug && docs.length > 0) {
      console.log(`\n[debug] Sample ${label} documents:`);
      for (const doc of docs.slice(0, 3)) {
        console.log(`  - ${doc.title}`);
        console.log(`    Keywords: ${doc.keywords.slice(0, 5).join(', ')}`);
      }
    }
  }

  await processDocuments(coreDocs, 'embeddings-core.json', 'core');
  await processDocuments(pluginDocs, 'embeddings-plugins.json', 'plugins');

  console.log('[build-embeddings] Done!');
}

main().catch((error) => {
  console.error('[build-embeddings] Error:', error);
  process.exit(1);
});
