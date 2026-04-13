import { describe, it } from 'vitest';
import { deflateRawSync } from 'zlib';
import { ThreadPool } from '#src/concurrency/thread-pool.js';

describe('ThreadPool — 2 workers (matching container 2 CPUs)', () => {
  it('compression 8x 771KB level=9', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 2 });

    const texts = Array.from({ length: 8 }, (_, i) =>
      `Block ${i}: ${JSON.stringify(Array.from({ length: 5000 }, (_, j) => ({
        id: j, name: `user-${j}-${Math.random()}`, email: `u${j}@test.com`,
        bio: 'A'.repeat(50 + Math.floor(Math.random() * 50)),
      })))}`
    );

    console.log(`\n  Data: ${texts.length} x ~${(Buffer.byteLength(texts[0]!) / 1024).toFixed(0)}KB, level=9, 2 workers`);

    const seqStart = performance.now();
    for (const text of texts) { deflateRawSync(Buffer.from(text), { level: 9 }); }
    const seqTime = performance.now() - seqStart;

    const parStart = performance.now();
    await Promise.all(texts.map(t => pool.compressText(t, { level: 9 })));
    const parTime = performance.now() - parStart;

    await pool.destroy();
    console.log(`  Seq: ${seqTime.toFixed(0)}ms | Par: ${parTime.toFixed(0)}ms | Speedup: ${(seqTime / parTime).toFixed(2)}x`);
  });

  it('bcrypt 8x 12 rounds', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 2 });
    const passwords = Array.from({ length: 8 }, (_, i) => `password-${i}-${Math.random()}`);

    try { await import('bcrypt'); } catch { console.log('  bcrypt not installed'); await pool.destroy(); return; }

    const { hashPassword } = await import('#src/concerns/password-hashing.js');

    const seqStart = performance.now();
    for (const pw of passwords) { await hashPassword(pw, 12); }
    const seqTime = performance.now() - seqStart;

    const parStart = performance.now();
    await Promise.all(passwords.map(pw => pool.hashPassword(pw, { rounds: 12 })));
    const parTime = performance.now() - parStart;

    await pool.destroy();
    console.log(`\n  Bcrypt 8x: Seq: ${seqTime.toFixed(0)}ms | Par: ${parTime.toFixed(0)}ms | Speedup: ${(seqTime / parTime).toFixed(2)}x`);
  });

  it('PBKDF2+AES 12x', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 2 });
    const items = Array.from({ length: 12 }, (_, i) => ({
      content: `Secret ${i}: ${Math.random().toString(36).repeat(10)}`,
      passphrase: `pass-${i}`,
    }));

    const { encrypt } = await import('#src/concerns/crypto.js');

    const seqStart = performance.now();
    for (const { content, passphrase } of items) { await encrypt(content, passphrase); }
    const seqTime = performance.now() - seqStart;

    const parStart = performance.now();
    await Promise.all(items.map(({ content, passphrase }) => pool.encrypt(content, passphrase)));
    const parTime = performance.now() - parStart;

    await pool.destroy();
    console.log(`\n  PBKDF2 12x: Seq: ${seqTime.toFixed(0)}ms | Par: ${parTime.toFixed(0)}ms | Speedup: ${(seqTime / parTime).toFixed(2)}x`);
  });

  it('event loop ticks: sync vs worker', async () => {
    const pool = new ThreadPool({ enabled: true, poolSize: 2 });
    const texts = Array.from({ length: 20 }, (_, i) =>
      JSON.stringify(Array.from({ length: 2000 }, (_, j) => ({ id: j, data: `item-${j}-${i}`, v: Math.random() })))
    );

    let syncTicks = 0;
    const si = setInterval(() => { syncTicks++; }, 1);
    for (const t of texts) { deflateRawSync(Buffer.from(t), { level: 9 }); }
    clearInterval(si);

    let workerTicks = 0;
    const wi = setInterval(() => { workerTicks++; }, 1);
    await Promise.all(texts.map(t => pool.compressText(t, { level: 9 })));
    clearInterval(wi);

    await pool.destroy();
    console.log(`\n  Event loop: Sync ${syncTicks} ticks | Worker ${workerTicks} ticks`);
  });
});
