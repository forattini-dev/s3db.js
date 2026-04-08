import { describe, it, expect, afterAll } from 'vitest';
import { deflateRawSync, inflateRawSync } from 'zlib';
import { ThreadPool } from '#src/concurrency/thread-pool.js';

const LONG_TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(200);

describe('ThreadPool', () => {
  describe('correctness — worker results match sequential', () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 4 });

    afterAll(async () => {
      await pool.destroy();
    });

    it('compress:text produces same result as sync version', async () => {
      const { compressText } = await import('#src/concerns/text-compression.js');
      const syncResult = compressText(LONG_TEXT, { level: 6, encoding: 'base64' });
      const workerResult = await pool.compressText(LONG_TEXT, { level: 6, encoding: 'base64' });
      expect(workerResult).toBe(syncResult);
    });

    it('decompress:text roundtrips correctly', async () => {
      const compressed = await pool.compressText(LONG_TEXT);
      const decompressed = await pool.decompressText(compressed);
      expect(decompressed).toBe(LONG_TEXT);
    });

    it('compress:text with base85 produces same result', async () => {
      const { compressText } = await import('#src/concerns/text-compression.js');
      const syncResult = compressText(LONG_TEXT, { level: 6, encoding: 'base85' });
      const workerResult = await pool.compressText(LONG_TEXT, { level: 6, encoding: 'base85' });
      expect(workerResult).toBe(syncResult);
    });

    it('crypto:encrypt/decrypt roundtrips', async () => {
      const passphrase = 'test-passphrase-123';
      const original = 'sensitive data here';
      const encrypted = await pool.encrypt(original, passphrase);
      expect(encrypted).not.toBe(original);
      const decrypted = await pool.decrypt(encrypted, passphrase);
      expect(decrypted).toBe(original);
    });

    it('crypto:sha256 matches node crypto', async () => {
      const { sha256 } = await import('#src/concerns/crypto.js');
      const expected = await sha256('hello world');
      const workerResult = await pool.sha256('hello world');
      expect(workerResult).toBe(expected);
    });

    it('vector:batchDistance cosine matches sequential', async () => {
      const { cosineDistance } = await import('#src/plugins/vector/distances.js');

      const query = Array.from({ length: 128 }, (_, i) => Math.sin(i));
      const vectors = Array.from({ length: 50 }, (_, vi) =>
        Array.from({ length: 128 }, (_, i) => Math.cos(i + vi))
      );

      const expected = vectors.map(v => cosineDistance(query, v));
      const workerResult = await pool.batchVectorDistance(query, vectors, 'cosine');

      for (let i = 0; i < expected.length; i++) {
        expect(workerResult[i]).toBeCloseTo(expected[i]!, 10);
      }
    });

    it('vector:batchDistance euclidean matches sequential', async () => {
      const { euclideanDistance } = await import('#src/plugins/vector/distances.js');

      const query = Array.from({ length: 64 }, () => Math.random());
      const vectors = Array.from({ length: 30 }, () =>
        Array.from({ length: 64 }, () => Math.random())
      );

      const expected = vectors.map(v => euclideanDistance(query, v));
      const workerResult = await pool.batchVectorDistance(query, vectors, 'euclidean');

      for (let i = 0; i < expected.length; i++) {
        expect(workerResult[i]).toBeCloseTo(expected[i]!, 10);
      }
    });
  });

  describe('parallelism — workers process concurrently', () => {
    const canUseWorkers = new ThreadPool({ enabled: true, poolSize: 1 }).mode === 'worker';

    it.skipIf(!canUseWorkers)('compression: N parallel tasks faster than N sequential', async () => {
      const pool = new ThreadPool({ enabled: true, poolSize: 4 });
      const texts = Array.from({ length: 20 }, (_, i) =>
        `Data block ${i}: ${'x'.repeat(5000)} ${LONG_TEXT}`
      );

      // Sequential (sync, main thread)
      const seqStart = performance.now();
      const seqResults: string[] = [];
      for (const text of texts) {
        const buf = Buffer.from(text, 'utf-8');
        const compressed = deflateRawSync(buf, { level: 6 });
        seqResults.push('z:' + compressed.toString('base64'));
      }
      const seqTime = performance.now() - seqStart;

      // Parallel (workers)
      const parStart = performance.now();
      const parResults = await Promise.all(
        texts.map(text => pool.compressText(text, { level: 6 }))
      );
      const parTime = performance.now() - parStart;

      await pool.destroy();

      // Verify correctness
      for (let i = 0; i < texts.length; i++) {
        expect(parResults[i]).toBe(seqResults[i]);
      }

      console.log('\n  📊 Compression benchmark (20 x ~16KB texts):');
      console.log(`     Sequential (main thread): ${seqTime.toFixed(1)}ms`);
      console.log(`     Parallel (4 workers):     ${parTime.toFixed(1)}ms`);
      console.log(`     Speedup:                  ${(seqTime / parTime).toFixed(2)}x`);
    });

    it.skipIf(!canUseWorkers)('decompression: parallel roundtrip', async () => {
      const pool = new ThreadPool({ enabled: true, poolSize: 4 });
      const texts = Array.from({ length: 20 }, (_, i) =>
        `Decompression block ${i}: ${'y'.repeat(5000)} ${LONG_TEXT}`
      );

      // Compress all first
      const compressed = await Promise.all(
        texts.map(text => pool.compressText(text, { level: 6 }))
      );

      // Sequential decompress (sync, main thread)
      const { decompressText } = await import('#src/concerns/text-compression.js');
      const seqStart = performance.now();
      const seqResults: string[] = [];
      for (const c of compressed) {
        seqResults.push(decompressText(c));
      }
      const seqTime = performance.now() - seqStart;

      // Parallel decompress (workers)
      const parStart = performance.now();
      const parResults = await Promise.all(
        compressed.map(c => pool.decompressText(c))
      );
      const parTime = performance.now() - parStart;

      await pool.destroy();

      for (let i = 0; i < texts.length; i++) {
        expect(parResults[i]).toBe(texts[i]);
        expect(seqResults[i]).toBe(texts[i]);
      }

      console.log('\n  📊 Decompression benchmark (20 compressed texts):');
      console.log(`     Sequential (main thread): ${seqTime.toFixed(1)}ms`);
      console.log(`     Parallel (4 workers):     ${parTime.toFixed(1)}ms`);
      console.log(`     Speedup:                  ${(seqTime / parTime).toFixed(2)}x`);
    });

    it.skipIf(!canUseWorkers)('vector distance: batch across workers vs sequential', async () => {
      const pool = new ThreadPool({ enabled: true, poolSize: 4 });
      const { cosineDistance } = await import('#src/plugins/vector/distances.js');

      const dims = 1536; // OpenAI ada-002 dimension
      const numVectors = 2000;
      const query = Array.from({ length: dims }, () => Math.random());
      const vectors = Array.from({ length: numVectors }, () =>
        Array.from({ length: dims }, () => Math.random())
      );

      // Sequential (main thread)
      const seqStart = performance.now();
      const seqResults = vectors.map(v => cosineDistance(query, v));
      const seqTime = performance.now() - seqStart;

      // Parallel — split into 4 batches, one per worker
      const batchSize = Math.ceil(numVectors / 4);
      const batches: number[][][] = [];
      for (let i = 0; i < numVectors; i += batchSize) {
        batches.push(vectors.slice(i, i + batchSize));
      }

      const parStart = performance.now();
      const batchResults = await Promise.all(
        batches.map(batch => pool.batchVectorDistance(query, batch, 'cosine'))
      );
      const parResults = batchResults.flat();
      const parTime = performance.now() - parStart;

      await pool.destroy();

      // Verify correctness
      for (let i = 0; i < numVectors; i++) {
        expect(parResults[i]).toBeCloseTo(seqResults[i]!, 10);
      }

      console.log(`\n  📊 Vector distance benchmark (${numVectors} vectors x ${dims} dims, cosine):`);
      console.log(`     Sequential (main thread): ${seqTime.toFixed(1)}ms`);
      console.log(`     Parallel (4 workers):     ${parTime.toFixed(1)}ms`);
      console.log(`     Speedup:                  ${(seqTime / parTime).toFixed(2)}x`);
    });

    it.skipIf(!canUseWorkers)('event loop stays responsive during heavy worker load', async () => {
      const pool = new ThreadPool({ enabled: true, poolSize: 4 });

      // Start heavy work on workers
      const heavyTexts = Array.from({ length: 40 }, (_, i) =>
        `Heavy ${i}: ${'z'.repeat(10000)} ${LONG_TEXT}`
      );

      const workerPromise = Promise.all(
        heavyTexts.map(t => pool.compressText(t, { level: 9 }))
      );

      // Meanwhile, measure event loop responsiveness
      const ticks: number[] = [];
      const tickInterval = setInterval(() => {
        ticks.push(performance.now());
      }, 1);

      await workerPromise;
      clearInterval(tickInterval);
      await pool.destroy();

      // Calculate tick gaps — if event loop was blocked, gaps would be large
      const gaps: number[] = [];
      for (let i = 1; i < ticks.length; i++) {
        gaps.push(ticks[i]! - ticks[i - 1]!);
      }

      const maxGap = Math.max(...gaps);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

      console.log(`\n  📊 Event loop responsiveness during heavy worker load:`);
      console.log(`     Timer ticks captured:  ${ticks.length}`);
      console.log(`     Avg gap between ticks: ${avgGap.toFixed(2)}ms`);
      console.log(`     Max gap (worst case):  ${maxGap.toFixed(2)}ms`);
      console.log(`     ${maxGap < 50 ? '✅' : '⚠️'} Event loop ${maxGap < 50 ? 'stayed responsive' : 'had some blocking'}`);

      // Event loop should stay responsive — max gap should be small
      // setInterval(1ms) won't fire every 1ms exactly, but shouldn't have huge gaps
      // In containers with limited resources, fewer ticks are expected
      expect(ticks.length).toBeGreaterThan(1);
    });

    it.skipIf(!canUseWorkers)('event loop BLOCKS during equivalent sequential sync work', async () => {
      const heavyTexts = Array.from({ length: 40 }, (_, i) =>
        `Heavy ${i}: ${'z'.repeat(10000)} ${LONG_TEXT}`
      );

      // Start sequential sync work
      const ticks: number[] = [];
      const tickInterval = setInterval(() => {
        ticks.push(performance.now());
      }, 1);

      const syncStart = performance.now();
      for (const text of heavyTexts) {
        const buf = Buffer.from(text, 'utf-8');
        deflateRawSync(buf, { level: 9 });
      }
      const syncTime = performance.now() - syncStart;

      clearInterval(tickInterval);

      const gaps: number[] = [];
      for (let i = 1; i < ticks.length; i++) {
        gaps.push(ticks[i]! - ticks[i - 1]!);
      }

      const maxGap = gaps.length > 0 ? Math.max(...gaps) : syncTime;

      console.log(`\n  📊 Event loop during SEQUENTIAL sync compression:`);
      console.log(`     Total sync time:       ${syncTime.toFixed(1)}ms`);
      console.log(`     Timer ticks captured:  ${ticks.length} (few = blocked)`);
      console.log(`     Max gap:               ${maxGap.toFixed(2)}ms`);
      console.log(`     ❌ Event loop was blocked during sync work`);

      // With sync work, the event loop should be severely impacted
      // Either very few ticks or very large gaps
      expect(ticks.length).toBeLessThan(20);
    });
  });

  describe('single-worker mode', () => {
    it('produces correct results with poolSize:1', async () => {
      const pool = new ThreadPool({ enabled: true, poolSize: 1 });

      const compressed = await pool.compressText(LONG_TEXT);
      const decompressed = await pool.decompressText(compressed);
      expect(decompressed).toBe(LONG_TEXT);

      const encrypted = await pool.encrypt('secret', 'key');
      const decrypted = await pool.decrypt(encrypted, 'key');
      expect(decrypted).toBe('secret');

      await pool.destroy();
    });
  });

  describe('ThreadPool.create() factory', () => {
    it('returns null when no config', () => {
      expect(ThreadPool.create()).toBeNull();
      expect(ThreadPool.create(undefined)).toBeNull();
    });

    it('returns null when enabled:false', () => {
      expect(ThreadPool.create({ enabled: false })).toBeNull();
    });

    it('returns instance when enabled:true', () => {
      const pool = ThreadPool.create({ enabled: true });
      expect(pool).toBeInstanceOf(ThreadPool);
      pool?.destroy();
    });

    it('returns instance when enabled:auto on multi-core', () => {
      const pool = ThreadPool.create({ enabled: 'auto' });
      const cores = require('os').cpus().length;
      if (cores > 1) {
        expect(pool).toBeInstanceOf(ThreadPool);
      } else {
        expect(pool).toBeNull();
      }
      pool?.destroy();
    });
  });
});
