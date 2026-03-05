import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  compactHash,
  expandHash,
  detectAlgorithm,
  isBcryptHash,
  isArgon2Hash,
  isPasswordHash,
} from '#src/concerns/password-hashing.js';
import { ValidatorManager } from '#src/validator.class.js';

// ─── Low-level: hashPassword / verifyPassword ───────────────────────────────

describe('Password Hashing (low-level)', () => {
  describe('bcrypt', () => {
    it('should hash and verify', async () => {
      const hash = await hashPassword('secret', 12, 'bcrypt');
      expect(hash.startsWith('$2')).toBe(true);
      expect(hash.length).toBe(60);
      expect(await verifyPassword('secret', hash)).toBe(true);
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });

    it('should hash with default algorithm (bcrypt)', async () => {
      const hash = await hashPassword('test');
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('should produce unique hashes (salt)', async () => {
      const a = await hashPassword('same', 12, 'bcrypt');
      const b = await hashPassword('same', 12, 'bcrypt');
      expect(a).not.toBe(b);
    });

    it('should reject rounds < 12', async () => {
      await expect(hashPassword('pw', 11, 'bcrypt')).rejects.toThrow('Bcrypt rounds must be between 12 and 31');
    });

    it('should reject rounds > 31', async () => {
      await expect(hashPassword('pw', 32, 'bcrypt')).rejects.toThrow('Bcrypt rounds must be between 12 and 31');
    });

    it('should reject empty password', async () => {
      await expect(hashPassword('', 12, 'bcrypt')).rejects.toThrow('Password must be a non-empty string');
    });
  });

  describe('bcrypt + pepper', () => {
    it('should hash and verify with pepper', async () => {
      const hash = await hashPassword('secret', 12, 'bcrypt', 'my-pepper');
      expect(await verifyPassword('secret', hash, 'my-pepper')).toBe(true);
    });

    it('should fail without pepper', async () => {
      const hash = await hashPassword('secret', 12, 'bcrypt', 'my-pepper');
      expect(await verifyPassword('secret', hash)).toBe(false);
    });

    it('should fail with wrong pepper', async () => {
      const hash = await hashPassword('secret', 12, 'bcrypt', 'pepper-a');
      expect(await verifyPassword('secret', hash, 'pepper-b')).toBe(false);
    });
  });

  describe('bcrypt sync', () => {
    it('should hash sync after module load', async () => {
      await hashPassword('preload', 12, 'bcrypt');
      const hash = hashPasswordSync('sync-test', 12);
      expect(hash.startsWith('$2')).toBe(true);
      expect(await verifyPassword('sync-test', hash)).toBe(true);
    });

    it('should hash sync with pepper', async () => {
      await hashPassword('preload', 12, 'bcrypt');
      const hash = hashPasswordSync('sync-test', 12, 'sync-pepper');
      expect(await verifyPassword('sync-test', hash, 'sync-pepper')).toBe(true);
      expect(await verifyPassword('sync-test', hash)).toBe(false);
    });
  });

  describe('argon2id', () => {
    it('should hash and verify', async () => {
      const hash = await hashPassword('secret', 12, 'argon2id');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(await verifyPassword('secret', hash)).toBe(true);
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });

    it('should produce unique hashes (salt)', async () => {
      const a = await hashPassword('same', 12, 'argon2id');
      const b = await hashPassword('same', 12, 'argon2id');
      expect(a).not.toBe(b);
    });

    it('should ignore rounds parameter', async () => {
      const hash = await hashPassword('test', 12, 'argon2id');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(await verifyPassword('test', hash)).toBe(true);
    });

    it('should reject empty password', async () => {
      await expect(hashPassword('', 12, 'argon2id')).rejects.toThrow('Password must be a non-empty string');
    });
  });

  describe('argon2id + pepper', () => {
    it('should hash and verify with pepper', async () => {
      const hash = await hashPassword('secret', 12, 'argon2id', 'a2-pepper');
      expect(await verifyPassword('secret', hash, 'a2-pepper')).toBe(true);
    });

    it('should fail without pepper', async () => {
      const hash = await hashPassword('secret', 12, 'argon2id', 'a2-pepper');
      expect(await verifyPassword('secret', hash)).toBe(false);
    });

    it('should fail with wrong pepper', async () => {
      const hash = await hashPassword('secret', 12, 'argon2id', 'pepper-x');
      expect(await verifyPassword('secret', hash, 'pepper-y')).toBe(false);
    });
  });

  describe('options object overload', () => {
    it('should accept options for bcrypt', async () => {
      const hash = await hashPassword('test', { rounds: 12, algorithm: 'bcrypt', pepper: 'opt' });
      expect(hash.startsWith('$2')).toBe(true);
      expect(await verifyPassword('test', hash, 'opt')).toBe(true);
    });

    it('should accept options for argon2id', async () => {
      const hash = await hashPassword('test', { algorithm: 'argon2id', pepper: 'opt' });
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(await verifyPassword('test', hash, 'opt')).toBe(true);
    });

    it('should default to bcrypt/12 with empty options', async () => {
      const hash = await hashPassword('test', {});
      expect(hash.startsWith('$2')).toBe(true);
    });
  });
});

// ─── compactHash / expandHash ────────────────────────────────────────────────
// Compact format uses base62-encoded params:
//   bcrypt:  $<b62rounds>$<53 saltHash>       e.g. $c$... (c = 12 in base62)
//   argon2:  $<b62v>|<b62m>|<b62t>|<b62p>$<salt>$<hash>  e.g. $j|g|3|4$...

describe('compactHash / expandHash', () => {
  describe('bcrypt compaction', () => {
    it('should compact to $b62rounds$saltHash format', async () => {
      const hash = await hashPassword('test', 12, 'bcrypt');
      const compact = compactHash(hash);
      // 12 in base62 = "c"
      expect(compact).toMatch(/^\$c\$.{53}$/);
      expect(compact.length).toBe(56);
    });

    it('should preserve rounds in compact format', async () => {
      const hash = await hashPassword('test', 14, 'bcrypt');
      const compact = compactHash(hash);
      // 14 in base62 = "e"
      expect(compact).toMatch(/^\$e\$/);
    });

    it('should expand compact bcrypt back to full', async () => {
      const hash = await hashPassword('test', 12, 'bcrypt');
      const compact = compactHash(hash);
      const expanded = expandHash(compact);
      expect(expanded).toBe(hash);
    });

    it('should pass through full bcrypt hash on expand', async () => {
      const hash = await hashPassword('test', 12, 'bcrypt');
      expect(expandHash(hash)).toBe(hash);
    });

    it('should verify via compact hash', async () => {
      const hash = await hashPassword('test', 12, 'bcrypt');
      const compact = compactHash(hash);
      expect(await verifyPassword('test', compact)).toBe(true);
      expect(await verifyPassword('wrong', compact)).toBe(false);
    });
  });

  describe('argon2id compaction', () => {
    it('should compact to $v|m|t|p$salt$hash with base62 params', async () => {
      const hash = await hashPassword('test', 12, 'argon2id');
      const compact = compactHash(hash);
      // v=19 → "j", m=log2(65536)=16 → "g", t=3 → "3", p=4 → "4"
      expect(compact).toMatch(/^\$j\|g\|3\|4\$/);
      expect(compact.length).toBeLessThan(hash.length);
    });

    it('should expand compact argon2 back to full', async () => {
      const hash = await hashPassword('test', 12, 'argon2id');
      const compact = compactHash(hash);
      const expanded = expandHash(compact);
      expect(expanded).toBe(hash);
    });

    it('should pass through full argon2 hash on expand', async () => {
      const hash = await hashPassword('test', 12, 'argon2id');
      expect(expandHash(hash)).toBe(hash);
    });

    it('should verify via compact hash', async () => {
      const hash = await hashPassword('test', 12, 'argon2id');
      const compact = compactHash(hash);
      expect(await verifyPassword('test', compact)).toBe(true);
      expect(await verifyPassword('wrong', compact)).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('should not double-compact bcrypt', async () => {
      const hash = await hashPassword('test', 12, 'bcrypt');
      const compact = compactHash(hash);
      expect(compactHash(compact)).toBe(compact);
    });

    it('should not double-compact argon2', async () => {
      const hash = await hashPassword('test', 12, 'argon2id');
      const compact = compactHash(hash);
      expect(compactHash(compact)).toBe(compact);
    });
  });

  describe('errors', () => {
    it('should throw on invalid input', () => {
      expect(() => compactHash('')).toThrow('Invalid hash');
      expect(() => compactHash('not-a-hash')).toThrow('Not a valid password hash');
    });

    it('should throw on invalid expand input', () => {
      expect(() => expandHash('')).toThrow('Invalid compacted hash');
    });
  });
});

// ─── Detection helpers ───────────────────────────────────────────────────────

describe('Detection helpers', () => {
  describe('detectAlgorithm', () => {
    it('should detect full bcrypt', async () => {
      const hash = await hashPassword('test', 12, 'bcrypt');
      expect(detectAlgorithm(hash)).toBe('bcrypt');
    });

    it('should detect compact bcrypt', async () => {
      const compact = compactHash(await hashPassword('test', 12, 'bcrypt'));
      expect(detectAlgorithm(compact)).toBe('bcrypt');
    });

    it('should detect full argon2id', async () => {
      const hash = await hashPassword('test', 12, 'argon2id');
      expect(detectAlgorithm(hash)).toBe('argon2id');
    });

    it('should detect compact argon2id', async () => {
      const compact = compactHash(await hashPassword('test', 12, 'argon2id'));
      expect(detectAlgorithm(compact)).toBe('argon2id');
    });

    it('should return null for unknown strings', () => {
      expect(detectAlgorithm('')).toBe(null);
      expect(detectAlgorithm('random')).toBe(null);
      expect(detectAlgorithm('a'.repeat(53))).toBe(null);
    });
  });

  describe('isBcryptHash', () => {
    it('should detect full bcrypt hash', async () => {
      expect(isBcryptHash(await hashPassword('test', 12, 'bcrypt'))).toBe(true);
    });

    it('should detect compact bcrypt hash', async () => {
      const compact = compactHash(await hashPassword('test', 12, 'bcrypt'));
      expect(isBcryptHash(compact)).toBe(true);
    });

    it('should reject argon2/empty/short', async () => {
      expect(isBcryptHash(await hashPassword('test', 12, 'argon2id'))).toBe(false);
      expect(isBcryptHash('')).toBe(false);
      expect(isBcryptHash('short')).toBe(false);
    });
  });

  describe('isArgon2Hash', () => {
    it('should detect full argon2id hash', async () => {
      expect(isArgon2Hash(await hashPassword('test', 12, 'argon2id'))).toBe(true);
    });

    it('should detect compact argon2id hash', async () => {
      const compact = compactHash(await hashPassword('test', 12, 'argon2id'));
      expect(isArgon2Hash(compact)).toBe(true);
    });

    it('should reject bcrypt', async () => {
      expect(isArgon2Hash(await hashPassword('test', 12, 'bcrypt'))).toBe(false);
    });
  });

  describe('isPasswordHash', () => {
    it('should detect all formats', async () => {
      const bcryptFull = await hashPassword('test', 12, 'bcrypt');
      const argonFull = await hashPassword('test', 12, 'argon2id');
      expect(isPasswordHash(bcryptFull)).toBe(true);
      expect(isPasswordHash(argonFull)).toBe(true);
      expect(isPasswordHash(compactHash(bcryptFull))).toBe(true);
      expect(isPasswordHash(compactHash(argonFull))).toBe(true);
    });

    it('should reject non-hashes', () => {
      expect(isPasswordHash('random')).toBe(false);
      expect(isPasswordHash('')).toBe(false);
    });
  });

  describe('cross-algorithm verifyPassword', () => {
    it('should auto-detect full bcrypt', async () => {
      const hash = await hashPassword('pw', 12, 'bcrypt');
      expect(await verifyPassword('pw', hash)).toBe(true);
    });

    it('should auto-detect full argon2id', async () => {
      const hash = await hashPassword('pw', 12, 'argon2id');
      expect(await verifyPassword('pw', hash)).toBe(true);
    });

    it('should auto-detect compact bcrypt', async () => {
      const compact = compactHash(await hashPassword('pw', 12, 'bcrypt'));
      expect(await verifyPassword('pw', compact)).toBe(true);
    });

    it('should auto-detect compact argon2id', async () => {
      const compact = compactHash(await hashPassword('pw', 12, 'argon2id'));
      expect(await verifyPassword('pw', compact)).toBe(true);
    });

    it('should return false for invalid inputs', async () => {
      expect(await verifyPassword('', 'hash')).toBe(false);
      expect(await verifyPassword('pw', '')).toBe(false);
      expect(await verifyPassword(null as any, 'h')).toBe(false);
      expect(await verifyPassword('pw', null as any)).toBe(false);
    });
  });
});

// ─── Validator integration ───────────────────────────────────────────────────
// Tests password types through the Validator (the real path resources use).

describe('Validator password types', () => {
  const PASSWORD_TYPES = ['password', 'password:bcrypt', 'password:argon2id'] as const;

  // ── Without pepper ──

  describe.each(PASSWORD_TYPES)('type "%s" without pepper', (type) => {
    const isArgon = type === 'password:argon2id';

    it('should hash on validate and produce a valid hash', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 } } });
      const schema = { $$async: true, pw: { type } };
      const check = validator.compile(schema);
      const data = { pw: 'my-secret-123' };
      const result = await check(data);

      expect(result).toBe(true);

      const hashed = data.pw;
      expect(hashed).not.toBe('my-secret-123');

      if (isArgon) {
        expect(hashed).toMatch(/^\$j\|g\|3\|4\$/);
        expect(await verifyPassword('my-secret-123', hashed)).toBe(true);
      } else {
        expect(hashed).toMatch(/^\$c\$/);
        expect(hashed.length).toBe(56);
        expect(await verifyPassword('my-secret-123', hashed)).toBe(true);
      }
    });

    it('should reject wrong password on verify', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 } } });
      const check = validator.compile({ $$async: true, pw: { type } });
      const data = { pw: 'correct' };
      await check(data);

      expect(await verifyPassword('wrong', data.pw)).toBe(false);
    });

    it('should produce different hashes each time (salt)', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 } } });
      const check = validator.compile({ $$async: true, pw: { type } });

      const d1 = { pw: 'same-password' };
      const d2 = { pw: 'same-password' };
      await check(d1);
      await check(d2);

      expect(d1.pw).not.toBe(d2.pw);
    });
  });

  // ── With pepper ──

  describe.each(PASSWORD_TYPES)('type "%s" with pepper', (type) => {
    const pepper = 'global-server-pepper-xyz';

    it('should hash with pepper and verify correctly', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 }, pepper } });
      const check = validator.compile({ $$async: true, pw: { type } });
      const data = { pw: 'peppered-pass' };
      await check(data);

      const hashed = data.pw;
      expect(hashed).not.toBe('peppered-pass');

      expect(await verifyPassword('peppered-pass', hashed, pepper)).toBe(true);
    });

    it('should fail verify without pepper', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 }, pepper } });
      const check = validator.compile({ $$async: true, pw: { type } });
      const data = { pw: 'peppered-pass' };
      await check(data);

      expect(await verifyPassword('peppered-pass', data.pw)).toBe(false);
    });

    it('should fail verify with wrong pepper', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 }, pepper } });
      const check = validator.compile({ $$async: true, pw: { type } });
      const data = { pw: 'peppered-pass' };
      await check(data);

      expect(await verifyPassword('peppered-pass', data.pw, 'wrong-pepper')).toBe(false);
    });
  });

  // ── bcrypt custom rounds ──

  describe('bcrypt custom rounds via Validator', () => {
    it('should use configured bcryptRounds=12', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 } } });
      const check = validator.compile({ $$async: true, pw: { type: 'password' } });
      const data = { pw: 'test-rounds' };
      await check(data);

      expect(data.pw).toMatch(/^\$c\$/);
      const expanded = expandHash(data.pw);
      expect(expanded.startsWith('$2b$12$')).toBe(true);
      expect(await verifyPassword('test-rounds', data.pw)).toBe(true);
    });

    it('should use configured bcryptRounds=14', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 14 } } });
      const check = validator.compile({ $$async: true, pw: { type: 'password:bcrypt' } });
      const data = { pw: 'test-rounds' };
      await check(data);

      // 14 in base62 = "e"
      expect(data.pw).toMatch(/^\$e\$/);
      const expanded = expandHash(data.pw);
      expect(expanded.startsWith('$2b$14$')).toBe(true);
    });
  });

  // ── autoHash=false ──

  describe('autoHash=false', () => {
    it('should NOT hash when autoHash is false', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 } }, autoHash: false });
      const check = validator.compile({ $$async: true, pw: { type: 'password' } });
      const data = { pw: 'plain-text' };
      const result = await check(data);

      expect(result).toBe(true);
      expect(data.pw).toBe('plain-text');
    });

    it.each(['password:bcrypt', 'password:argon2id'] as const)(
      'should NOT hash %s when autoHash is false',
      async (type) => {
        const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 } }, autoHash: false });
        const check = validator.compile({ $$async: true, pw: { type } });
        const data = { pw: 'stays-plain' };
        await check(data);

        expect(data.pw).toBe('stays-plain');
      }
    );
  });

  // ── Multiple password fields ──

  describe('multiple password fields in one schema', () => {
    it('should hash each field with its own algorithm', async () => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 }, pepper: 'multi-pepper' } });
      const check = validator.compile({
        $$async: true,
        loginPw: { type: 'password' },
        apiKey: { type: 'password:bcrypt' },
        masterPw: { type: 'password:argon2id' },
      });

      const data = { loginPw: 'login-123', apiKey: 'key-456', masterPw: 'master-789' };
      const result = await check(data);
      expect(result).toBe(true);

      expect(data.loginPw).toMatch(/^\$c\$/);
      expect(data.apiKey).toMatch(/^\$c\$/);
      expect(data.loginPw.length).toBe(56);
      expect(data.apiKey.length).toBe(56);

      expect(data.masterPw).toMatch(/^\$j\|g\|3\|4\$/);

      expect(await verifyPassword('login-123', data.loginPw, 'multi-pepper')).toBe(true);
      expect(await verifyPassword('key-456', data.apiKey, 'multi-pepper')).toBe(true);
      expect(await verifyPassword('master-789', data.masterPw, 'multi-pepper')).toBe(true);

      expect(await verifyPassword('login-123', data.loginPw)).toBe(false);
      expect(await verifyPassword('key-456', data.apiKey)).toBe(false);
      expect(await verifyPassword('master-789', data.masterPw)).toBe(false);
    });
  });

  // ── String shorthand syntax ──

  describe('string shorthand syntax', () => {
    it.each([
      ['password', false],
      ['password:bcrypt', false],
      ['password:argon2id', true],
    ] as const)('should hash with shorthand "%s"', async (shorthand, isArgon) => {
      const validator = new ValidatorManager({ security: { bcrypt: { rounds: 12 } } });
      const check = validator.compile({ $$async: true, pw: shorthand });
      const data = { pw: 'shorthand-test' } as any;
      await check(data);

      expect(data.pw).not.toBe('shorthand-test');

      if (isArgon) {
        expect(data.pw).toMatch(/^\$j\|g\|3\|4\$/);
      } else {
        expect(data.pw).toMatch(/^\$c\$/);
        expect(data.pw.length).toBe(56);
      }

      expect(await verifyPassword('shorthand-test', data.pw)).toBe(true);
    });
  });
});
