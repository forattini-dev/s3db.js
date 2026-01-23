import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, basename, relative } from "path";
import { fileURLToPath } from "url";
import Fuse from "fuse.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "../../");
const DOCS_ROOT = join(PROJECT_ROOT, "docs");
const CORE_PATHS = ["core", "guides", "reference", "clients", "benchmarks"];
const PLUGIN_PATHS = ["plugins"];
let coreIndex = null;
let pluginIndex = null;
let coreDocs = [];
let pluginDocs = [];
function extractTitle(content, filename) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return basename(filename, ".md").replace(/-/g, " ");
}
function loadMarkdownFiles(basePath, category) {
  const entries = [];
  if (!existsSync(basePath)) return entries;
  function walkDir(dir) {
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (file.endsWith(".md") && !file.startsWith("_")) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const relPath = relative(DOCS_ROOT, fullPath);
          entries.push({
            id: relPath,
            path: relPath,
            title: extractTitle(content, file),
            content: content.slice(0, 5e3),
            category
          });
        } catch (err) {
        }
      }
    }
  }
  walkDir(basePath);
  return entries;
}
function buildIndex(docs) {
  return new Fuse(docs, {
    keys: [
      { name: "title", weight: 0.4 },
      { name: "content", weight: 0.6 }
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2
  });
}
function loadCoreDocs() {
  if (coreDocs.length > 0) return;
  for (const subdir of CORE_PATHS) {
    const path = join(DOCS_ROOT, subdir);
    coreDocs.push(...loadMarkdownFiles(path, subdir));
  }
  const rootFiles = readdirSync(DOCS_ROOT).filter(
    (f) => f.endsWith(".md") && !f.startsWith("_")
  );
  for (const file of rootFiles) {
    try {
      const content = readFileSync(join(DOCS_ROOT, file), "utf-8");
      coreDocs.push({
        id: file,
        path: file,
        title: extractTitle(content, file),
        content: content.slice(0, 5e3),
        category: "root"
      });
    } catch (err) {
    }
  }
  coreIndex = buildIndex(coreDocs);
}
function loadPluginDocs() {
  if (pluginDocs.length > 0) return;
  for (const subdir of PLUGIN_PATHS) {
    const path = join(DOCS_ROOT, subdir);
    pluginDocs.push(...loadMarkdownFiles(path, "plugins"));
  }
  pluginIndex = buildIndex(pluginDocs);
}
function extractSnippet(content, query, maxLength = 200) {
  const lowerContent = content.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
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
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";
  return snippet.trim();
}
function search(index, docs, query, limit = 5) {
  if (!index) return [];
  const results = index.search(query, { limit });
  return results.map((r) => ({
    id: r.item.id,
    path: r.item.path,
    title: r.item.title,
    content: r.item.content,
    snippet: extractSnippet(r.item.content, query),
    score: 1 - (r.score || 0)
  }));
}
async function searchDocs(type, query, limit = 5) {
  try {
    if (type === "core") {
      loadCoreDocs();
      const results = search(coreIndex, coreDocs, query, limit);
      return {
        success: true,
        query,
        type,
        mode: "fuzzy",
        resultCount: results.length,
        totalDocs: coreDocs.length,
        results: results.map((r) => ({
          ...r,
          fullContent: r.content.length > 3e3 ? r.content.slice(0, 3e3) + "\n\n... (truncated)" : r.content
        }))
      };
    } else {
      loadPluginDocs();
      const results = search(pluginIndex, pluginDocs, query, limit);
      return {
        success: true,
        query,
        type,
        mode: "fuzzy",
        resultCount: results.length,
        totalDocs: pluginDocs.length,
        results: results.map((r) => ({
          ...r,
          fullContent: r.content.length > 3e3 ? r.content.slice(0, 3e3) + "\n\n... (truncated)" : r.content
        }))
      };
    }
  } catch (error) {
    return {
      success: false,
      query,
      type,
      error: error.message
    };
  }
}
async function listTopics(type) {
  try {
    if (type === "core") {
      loadCoreDocs();
      const categories = [...new Set(coreDocs.map((d) => d.category))];
      return {
        success: true,
        type,
        totalDocuments: coreDocs.length,
        topics: categories.map((cat) => ({
          category: cat,
          documents: coreDocs.filter((d) => d.category === cat).map((d) => ({
            path: d.path,
            title: d.title
          }))
        }))
      };
    } else {
      loadPluginDocs();
      const byPlugin = /* @__PURE__ */ new Map();
      for (const doc of pluginDocs) {
        const parts = doc.path.split("/");
        const plugin = parts[1] || "general";
        if (!byPlugin.has(plugin)) byPlugin.set(plugin, []);
        byPlugin.get(plugin).push(doc);
      }
      return {
        success: true,
        type,
        totalDocuments: pluginDocs.length,
        topics: Array.from(byPlugin.entries()).map(([plugin, docs]) => ({
          plugin,
          documents: docs.map((d) => ({
            path: d.path,
            title: d.title
          }))
        }))
      };
    }
  } catch (error) {
    return {
      success: false,
      type,
      error: error.message
    };
  }
}
const docsSearchTools = [
  {
    name: "s3dbSearchCoreDocs",
    description: `Search s3db.js CORE documentation using fuzzy search.
Core docs include: getting started, database/resource API, schema validation,
CRUD operations, partitioning, behaviors, encoding, encryption, streaming, and CLI.
Use this for questions about the main s3db.js functionality.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Search query (e.g., "how do partitions work", "create resource with validation")'
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 5)",
          default: 5
        }
      },
      required: ["query"]
    }
  },
  {
    name: "s3dbSearchPluginDocs",
    description: `Search s3db.js PLUGIN documentation using fuzzy search.
Plugin docs include: CachePlugin, AuditPlugin, ReplicatorPlugin, GeoPlugin,
MetricsPlugin, TTLPlugin, BackupPlugin, QueuePlugin, ApiPlugin, and more.
Use this for questions about specific plugins and their configuration.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Search query (e.g., "cache plugin configuration", "how to use geo plugin")'
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default: 5)",
          default: 5
        }
      },
      required: ["query"]
    }
  },
  {
    name: "s3dbListCoreTopics",
    description: "List all available topics in s3db.js CORE documentation",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "s3dbListPluginTopics",
    description: "List all available topics in s3db.js PLUGIN documentation",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];
function createDocsSearchHandlers(server) {
  return {
    async s3dbSearchCoreDocs(args) {
      const { query, limit = 5 } = args;
      return searchDocs("core", query, limit);
    },
    async s3dbSearchPluginDocs(args) {
      const { query, limit = 5 } = args;
      return searchDocs("plugins", query, limit);
    },
    async s3dbListCoreTopics(_args) {
      return listTopics("core");
    },
    async s3dbListPluginTopics(_args) {
      return listTopics("plugins");
    }
  };
}
async function preloadSearch() {
  loadCoreDocs();
  loadPluginDocs();
}
var docs_search_default = {
  docsSearchTools,
  createDocsSearchHandlers,
  preloadSearch
};
export {
  createDocsSearchHandlers,
  docs_search_default as default,
  docsSearchTools,
  preloadSearch
};
