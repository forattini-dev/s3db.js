import { isBcryptHash, verifyPassword as verifyBcryptPassword } from '#src/concerns/password-hashing.js';
import { decode as decodeBase62 } from '#src/concerns/base62.js';

interface PasswordVerifyOptions {
  pepper?: string;
}

const ARGON2_COMPACT_HASH_RE = /^\$([^|]+)\|([^|]+)\|([^|]+)\|([^$]+)\$([^$]+)\$([^$]+)$/;

function buildPasswordCandidates(password: string, pepper: string | undefined): string[] {
  if (pepper) {
    return [password, `${password}${pepper}`, `${pepper}${password}`].filter((value, index, list) => list.indexOf(value) === index);
  }
  return [password];
}

function decodeCompactArgon2Param(value: string): number {
  const decoded = decodeBase62(value);
  return Number.isFinite(decoded) ? decoded : NaN;
}

function expandArgon2CompactHash(storedHash: string): string {
  const match = ARGON2_COMPACT_HASH_RE.exec(storedHash);
  if (!match) {
    return storedHash;
  }

  const [, encodedVersion, encodedMemory, encodedTime, encodedParallelism, salt, hash] = match;

  const version = decodeCompactArgon2Param(encodedVersion!);
  const memoryExponent = decodeCompactArgon2Param(encodedMemory!);
  const timeCost = decodeCompactArgon2Param(encodedTime!);
  const parallelism = decodeCompactArgon2Param(encodedParallelism!);

  if ([version, memoryExponent, timeCost, parallelism].some((value) => Number.isNaN(value))) {
    return storedHash;
  }

  const memory = Math.pow(2, memoryExponent);

  return `$argon2id$v=${version}$m=${memory},t=${timeCost},p=${parallelism}$${salt}$${hash}`;
}

function isArgon2Hash(storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  if (storedHash.startsWith('$argon2id$')) {
    return true;
  }

  return ARGON2_COMPACT_HASH_RE.test(storedHash);
}

async function verifyArgon2Password(passwordCandidates: string[], storedHash: string): Promise<boolean> {
  let argon2: any;

  try {
    argon2 = await import('argon2');
  } catch {
    return false;
  }

  if (!argon2 || typeof argon2.verify !== 'function') {
    return false;
  }

  for (const password of passwordCandidates) {
    try {
      const ok = await argon2.verify(storedHash, password);
      if (ok) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

async function verifyBcryptPasswordWithCandidates(passwordCandidates: string[], storedHash: string): Promise<boolean> {
  for (const password of passwordCandidates) {
    const ok = await verifyBcryptPassword(password, storedHash);
    if (ok) {
      return true;
    }
  }

  return false;
}

export async function verifyPassword(
  plaintext: string,
  storedHash: string,
  options: PasswordVerifyOptions = {}
): Promise<boolean> {
  if (!plaintext || typeof plaintext !== 'string') {
    return false;
  }

  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const candidates = buildPasswordCandidates(plaintext, options.pepper);

  if (isArgon2Hash(storedHash)) {
    const expandedHash = storedHash.startsWith('$argon2id$') ? storedHash : expandArgon2CompactHash(storedHash);
    const ok = await verifyArgon2Password(candidates, expandedHash);
    if (ok) {
      return true;
    }

    return false;
  }

  if (isBcryptHash(storedHash) || storedHash.startsWith('$2')) {
    const ok = await verifyBcryptPasswordWithCandidates(candidates, storedHash);
    return ok;
  }

  return false;
}
