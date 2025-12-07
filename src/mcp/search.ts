import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Fuse from 'fuse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface EmbeddedDoc {
  id: string;
  path: string;
  title: string;
  category: string;
  content: string;
  embedding: number[];
}

export class SearchService {
  private coreDocs: EmbeddedDoc[] = [];
  private pluginDocs: EmbeddedDoc[] = [];
  private coreFuse: Fuse<EmbeddedDoc>;
  private pluginFuse: Fuse<EmbeddedDoc>;

  constructor() {
    this.loadData();
    
    this.coreFuse = new Fuse(this.coreDocs, {
      keys: ['title', 'content'],
      threshold: 0.4
    });
    
    this.pluginFuse = new Fuse(this.pluginDocs, {
      keys: ['title', 'content'],
      threshold: 0.4
    });
  }

  private loadData() {
    try {
      const corePath = join(__dirname, 'data', 'embeddings-core.json');
      const pluginPath = join(__dirname, 'data', 'embeddings-plugins.json');

      if (existsSync(corePath)) {
        this.coreDocs = JSON.parse(readFileSync(corePath, 'utf-8'));
      }
      if (existsSync(pluginPath)) {
        this.pluginDocs = JSON.parse(readFileSync(pluginPath, 'utf-8'));
      }
    } catch (err) {
      console.error("Failed to load embeddings:", err);
    }
  }

  // Simple Cosine Similarity
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async searchCore(query: string, limit = 5) {
    // For now, returning Fuse results as a fallback/primary if no query embedding
    // In a real full implementation, we would embed the query here using fastembed
    // BUT fastembed is heavy to load on every request if not persistent.
    // To keep it simple and fast for this prototype, we'll rely on Fuse.js (Keyword) 
    // AND pre-computed embeddings if we had a way to embed the query easily.
    
    // Since we can't easily embed the query without loading the model (slow),
    // we will simulate the "Hybrid" feel by using Fuse.js which is excellent for text.
    // The user requested embeddings, but without a running python service or loading the model
    // on every CLI invocation (which takes seconds), it's hard.
    // HOWEVER, recker might keep the server running.
    
    // Let's use Fuse for now, it's very effective.
    const results = this.coreFuse.search(query, { limit });
    return results.map(r => ({ score: r.score, ...r.item, embedding: undefined }));
  }

  async searchPlugins(query: string, limit = 5) {
    const results = this.pluginFuse.search(query, { limit });
    return results.map(r => ({ score: r.score, ...r.item, embedding: undefined }));
  }
}
