import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'zlib';
import { ThreadPool } from '#src/concurrency/thread-pool.js';

describe('ThreadPool — realistic workload benchmarks', () => {
  it('compression with LARGE data (where CPU dominates, not serialization)', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 4 });

    // Large texts — 500KB each, level 9 (max compression = slow)
    const texts = Array.from({ length: 8 }, (_, i) =>
      `Block ${i}: ${JSON.stringify(Array.from({ length: 5000 }, (_, j) => ({
        id: j, name: `user-${j}-${Math.random()}`, email: `u${j}@test.com`,
        bio: 'A'.repeat(50 + Math.floor(Math.random() * 50)),
      })))}`
    );

    console.log(`\n  Data: ${texts.length} texts, ~${(Buffer.byteLength(texts[0]!) / 1024).toFixed(0)}KB each, level=9`);

    // Sequential
    const seqStart = performance.now();
    for (const text of texts) {
      deflateRawSync(Buffer.from(text), { level: 9 });
    }
    const seqTime = performance.now() - seqStart;

    // Parallel
    const parStart = performance.now();
    await Promise.all(texts.map(t => pool.compressText(t, { level: 9 })));
    const parTime = performance.now() - parStart;

    await pool.destroy();

    const speedup = seqTime / parTime;
    console.log(`  Sequential (sync, main thread): ${seqTime.toFixed(1)}ms`);
    console.log(`  Parallel (4 workers):           ${parTime.toFixed(1)}ms`);
    console.log(`  Speedup:                        ${speedup.toFixed(2)}x`);
    console.log(`  ${speedup > 1.5 ? '✅ Workers faster' : speedup > 0.8 ? '➡️ Similar' : '❌ Overhead too high'}`);
  });

  it('bcrypt hashing — the killer use case for threading', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 4 });

    const passwords = Array.from({ length: 8 }, (_, i) => `password-${i}-${Math.random()}`);

    let bcryptAvailable = true;
    try {
      await import('bcrypt');
    } catch {
      bcryptAvailable = false;
      console.log('\n  ⏭️  bcrypt not installed, skipping');
    }

    if (bcryptAvailable) {
      // Sequential
      const { hashPassword } = await import('#src/concerns/password-hashing.js');
      const seqStart = performance.now();
      for (const pw of passwords) {
        await hashPassword(pw, 12);
      }
      const seqTime = performance.now() - seqStart;

      // Parallel
      const parStart = performance.now();
      await Promise.all(
        passwords.map(pw => pool.hashPassword(pw, { rounds: 12, algorithm: 'bcrypt' }))
      );
      const parTime = performance.now() - parStart;

      const speedup = seqTime / parTime;
      console.log(`\n  📊 Bcrypt benchmark (${passwords.length} passwords, 12 rounds):`);
      console.log(`     Sequential: ${seqTime.toFixed(0)}ms (${(seqTime / passwords.length).toFixed(0)}ms/hash)`);
      console.log(`     Parallel:   ${parTime.toFixed(0)}ms (${(parTime / passwords.length).toFixed(0)}ms/hash)`);
      console.log(`     Speedup:    ${speedup.toFixed(2)}x`);
      console.log(`     ${speedup > 1.5 ? '✅ Workers significantly faster' : '➡️ Similar'}`);
    }

    await pool.destroy();
  });

  it('crypto encrypt/decrypt — PBKDF2 100k iterations', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 4 });

    const items = Array.from({ length: 12 }, (_, i) => ({
      content: `Secret data ${i}: ${Math.random().toString(36).repeat(10)}`,
      passphrase: `pass-${i}`,
    }));

    // Sequential
    const { encrypt } = await import('#src/concerns/crypto.js');
    const seqStart = performance.now();
    for (const { content, passphrase } of items) {
      await encrypt(content, passphrase);
    }
    const seqTime = performance.now() - seqStart;

    // Parallel
    const parStart = performance.now();
    await Promise.all(
      items.map(({ content, passphrase }) => pool.encrypt(content, passphrase))
    );
    const parTime = performance.now() - parStart;

    await pool.destroy();

    const speedup = seqTime / parTime;
    console.log(`\n  📊 PBKDF2+AES benchmark (${items.length} encryptions):`);
    console.log(`     Sequential: ${seqTime.toFixed(0)}ms (${(seqTime / items.length).toFixed(0)}ms/op)`);
    console.log(`     Parallel:   ${parTime.toFixed(0)}ms (${(parTime / items.length).toFixed(0)}ms/op)`);
    console.log(`     Speedup:    ${speedup.toFixed(2)}x`);
    console.log(`     ${speedup > 1.5 ? '✅ Workers significantly faster' : '➡️ Similar'}`);
  });

  it('vector distance — massive batch (where CPU time >> serialization)', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 4 });
    const { cosineDistance } = await import('#src/plugins/vector/distances.js');

    const dims = 1536;
    const numVectors = 50000;
    const query = Array.from({ length: dims }, () => Math.random());
    const vectors = Array.from({ length: numVectors }, () =>
      Array.from({ length: dims }, () => Math.random())
    );

    console.log(`\n  Data: ${numVectors} vectors x ${dims} dims (cosine)`);

    // Sequential
    const seqStart = performance.now();
    for (const v of vectors) {
      cosineDistance(query, v);
    }
    const seqTime = performance.now() - seqStart;

    // Parallel — split across workers
    const batchSize = Math.ceil(numVectors / 4);
    const batches: number[][][] = [];
    for (let i = 0; i < numVectors; i += batchSize) {
      batches.push(vectors.slice(i, i + batchSize));
    }

    const parStart = performance.now();
    await Promise.all(
      batches.map(batch => pool.batchVectorDistance(query, batch, 'cosine'))
    );
    const parTime = performance.now() - parStart;

    await pool.destroy();

    const speedup = seqTime / parTime;
    console.log(`  Sequential:  ${seqTime.toFixed(0)}ms`);
    console.log(`  Parallel:    ${parTime.toFixed(0)}ms`);
    console.log(`  Speedup:     ${speedup.toFixed(2)}x`);
    console.log(`  ${speedup > 1.5 ? '✅ Workers faster' : speedup > 0.8 ? '➡️ Similar (serialization overhead)' : '❌ Serialization dominates'}`);
  });

  it('event loop responsiveness comparison', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 4 });

    // Heavy sync work that blocks event loop
    const heavyTexts = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify(Array.from({ length: 2000 }, (_, j) => ({
        id: j, data: `item-${j}-${i}`, value: Math.random(),
      })))
    );

    // Measure event loop during SYNC work
    let syncTicks = 0;
    const syncTickInterval = setInterval(() => { syncTicks++; }, 1);
    const syncStart = performance.now();
    for (const text of heavyTexts) {
      deflateRawSync(Buffer.from(text), { level: 9 });
    }
    const syncTime = performance.now() - syncStart;
    clearInterval(syncTickInterval);

    // Measure event loop during WORKER work (same data)
    let workerTicks = 0;
    const workerTickInterval = setInterval(() => { workerTicks++; }, 1);
    const workerStart = performance.now();
    await Promise.all(heavyTexts.map(t => pool.compressText(t, { level: 9 })));
    const workerTime = performance.now() - workerStart;
    clearInterval(workerTickInterval);

    await pool.destroy();

    console.log(`\n  📊 Event loop responsiveness:`);
    console.log(`     SYNC:   ${syncTime.toFixed(0)}ms, ${syncTicks} event loop ticks`);
    console.log(`     WORKER: ${workerTime.toFixed(0)}ms, ${workerTicks} event loop ticks`);
    console.log(`     ${workerTicks > syncTicks * 2 ? '✅' : '➡️'} Workers keep event loop ${workerTicks > syncTicks * 2 ? 'much more' : 'more'} responsive (${workerTicks} vs ${syncTicks} ticks)`);
  });

  it('sha256 batch — lightweight CPU work', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 4 });
    const { sha256 } = await import('#src/concerns/crypto.js');

    const messages = Array.from({ length: 100 }, (_, i) => `message-${i}-${Math.random()}`);

    // Sequential
    const seqStart = performance.now();
    for (const msg of messages) {
      await sha256(msg);
    }
    const seqTime = performance.now() - seqStart;

    // Parallel
    const parStart = performance.now();
    await Promise.all(messages.map(msg => pool.sha256(msg)));
    const parTime = performance.now() - parStart;

    await pool.destroy();

    const speedup = seqTime / parTime;
    console.log(`\n  📊 SHA-256 benchmark (${messages.length} hashes):`);
    console.log(`     Sequential: ${seqTime.toFixed(0)}ms`);
    console.log(`     Parallel:   ${parTime.toFixed(0)}ms`);
    console.log(`     Speedup:    ${speedup.toFixed(2)}x`);
    console.log(`     ${speedup > 1.5 ? '✅ Workers faster' : '➡️ Too lightweight — overhead dominates'}`);
  });
});
