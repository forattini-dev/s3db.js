import { ValidationError } from '../errors.js';
import { encode as b62encode, decode as b62decode } from './base62.js';

export type PasswordAlgorithm = 'bcrypt' | 'argon2id';

export interface BcryptConfig {
  rounds?: number;
}

export interface Argon2Config {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
}

export interface SecurityConfig {
  passphrase?: string;
  pepper?: string;
  bcrypt?: BcryptConfig;
  argon2?: Argon2Config;
}

const DEFAULT_ALGORITHM: PasswordAlgorithm = 'bcrypt';
const DEFAULT_ARGON2_MEMORY_COST = 65536;
const DEFAULT_ARGON2_TIME_COST = 3;
const DEFAULT_ARGON2_PARALLELISM = 4;

// --- Bcrypt ---

interface BcryptModule {
  hashSync: (password: string, rounds: number) => string;
  hash: (password: string, rounds: number) => Promise<string>;
  compare: (plaintext: string, hash: string) => Promise<boolean>;
}

let bcryptModule: BcryptModule | null = null;

async function getBcrypt(): Promise<BcryptModule> {
  if (bcryptModule) return bcryptModule;

  try {
    // @ts-expect-error bcrypt has no type declarations
    const module = await import('bcrypt');
    bcryptModule = (module.default || module) as BcryptModule;
    return bcryptModule;
  } catch {
    throw new ValidationError('bcrypt is not installed', {
      field: 'bcrypt',
      statusCode: 500,
      retriable: false,
      suggestion: 'Install bcrypt with: pnpm add bcrypt'
    });
  }
}

function getBcryptSync(): BcryptModule {
  if (!bcryptModule) {
    throw new ValidationError('bcrypt not loaded - call hashPassword() first or use the async version', {
      field: 'bcrypt',
      statusCode: 500,
      retriable: false,
      suggestion: 'Use hashPassword() (async) instead of hashPasswordSync(), or ensure bcrypt is loaded first.'
    });
  }
  return bcryptModule;
}

// --- Argon2id ---

interface Argon2Module {
  hash: (password: string, options?: Record<string, unknown>) => Promise<string>;
  verify: (hash: string, password: string) => Promise<boolean>;
}

let argon2Module: Argon2Module | null = null;

async function getArgon2(): Promise<Argon2Module> {
  if (argon2Module) return argon2Module;

  try {
    const module = await import('argon2');
    argon2Module = (module.default || module) as Argon2Module;
    return argon2Module;
  } catch {
    throw new ValidationError('Failed to load argon2 module', {
      field: 'argon2',
      statusCode: 500,
      retriable: false,
      suggestion: 'Ensure argon2 native bindings are compiled correctly. Try: pnpm rebuild argon2'
    });
  }
}

// --- Public API ---

function applyPepper(password: string, pepper?: string): string {
  return pepper ? password + pepper : password;
}

export function hashPasswordSync(password: string, rounds: number = 12, pepper?: string): string {
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password must be a non-empty string', {
      field: 'password',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide a non-empty string before calling hashPasswordSync().'
    });
  }

  if (rounds < 12 || rounds > 31) {
    throw new ValidationError('Bcrypt rounds must be between 12 and 31', {
      field: 'rounds',
      statusCode: 400,
      retriable: false,
      suggestion: 'Configure bcrypt rounds between 12 and 31 (inclusive).'
    });
  }

  const bcrypt = getBcryptSync();
  return bcrypt.hashSync(applyPepper(password, pepper), rounds);
}

export interface HashPasswordOptions {
  rounds?: number;
  algorithm?: PasswordAlgorithm;
  pepper?: string;
  argon2?: Argon2Config;
}

export async function hashPassword(password: string, rounds?: number, algorithm?: PasswordAlgorithm, pepper?: string): Promise<string>;
export async function hashPassword(password: string, options?: HashPasswordOptions): Promise<string>;
export async function hashPassword(password: string, roundsOrOptions?: number | HashPasswordOptions, algorithm?: PasswordAlgorithm, pepper?: string): Promise<string> {
  let rounds = 12;
  let algo: PasswordAlgorithm = DEFAULT_ALGORITHM;
  let pepperValue: string | undefined;
  let argon2Config: Argon2Config | undefined;

  if (typeof roundsOrOptions === 'object' && roundsOrOptions !== null) {
    rounds = roundsOrOptions.rounds ?? 12;
    algo = roundsOrOptions.algorithm ?? DEFAULT_ALGORITHM;
    pepperValue = roundsOrOptions.pepper;
    argon2Config = roundsOrOptions.argon2;
  } else {
    rounds = roundsOrOptions ?? 12;
    algo = algorithm ?? DEFAULT_ALGORITHM;
    pepperValue = pepper;
  }

  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password must be a non-empty string', {
      field: 'password',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide a non-empty string before calling hashPassword().'
    });
  }

  const peppered = applyPepper(password, pepperValue);

  if (algo === 'argon2id') {
    const memoryCost = argon2Config?.memoryCost ?? DEFAULT_ARGON2_MEMORY_COST;
    const timeCost = argon2Config?.timeCost ?? DEFAULT_ARGON2_TIME_COST;
    const parallelism = argon2Config?.parallelism ?? DEFAULT_ARGON2_PARALLELISM;

    if (!Number.isInteger(Math.log2(memoryCost))) {
      throw new ValidationError('Argon2 memoryCost must be a power of 2', {
        field: 'memoryCost',
        statusCode: 400,
        retriable: false,
        suggestion: 'Use a power-of-2 memoryCost (e.g., 65536 = 2^16).'
      });
    }

    const argon2 = await getArgon2();
    return argon2.hash(peppered, {
      type: 2, // argon2id
      memoryCost,
      timeCost,
      parallelism,
    });
  }

  if (rounds < 12 || rounds > 31) {
    throw new ValidationError('Bcrypt rounds must be between 12 and 31', {
      field: 'rounds',
      statusCode: 400,
      retriable: false,
      suggestion: 'Configure bcrypt rounds between 12 and 31 (inclusive).'
    });
  }

  const bcrypt = await getBcrypt();
  return bcrypt.hash(peppered, rounds);
}

export async function verifyPassword(plaintext: string, hash: string, pepper?: string): Promise<boolean> {
  if (!plaintext || typeof plaintext !== 'string') return false;
  if (!hash || typeof hash !== 'string') return false;

  const peppered = applyPepper(plaintext, pepper);

  try {
    const fullHash = expandHash(hash);

    if (fullHash.startsWith('$argon2')) {
      const argon2 = await getArgon2();
      return argon2.verify(fullHash, peppered);
    }

    const bcrypt = await getBcrypt();
    return bcrypt.compare(peppered, fullHash);
  } catch {
    return false;
  }
}

export function detectAlgorithm(hash: string): PasswordAlgorithm | null {
  if (!hash || typeof hash !== 'string') return null;
  if (hash.startsWith('$argon2')) return 'argon2id';
  if (hash.startsWith('$2')) return 'bcrypt';
  if (isCompactArgon2(hash)) return 'argon2id';
  if (isCompactBcrypt(hash)) return 'bcrypt';
  return null;
}

function isCompactArgon2(str: string): boolean {
  return typeof str === 'string' && str.startsWith('$') && str.includes('|');
}

function isCompactBcrypt(str: string): boolean {
  if (!str || typeof str !== 'string' || !str.startsWith('$')) return false;
  if (str.startsWith('$2') || str.startsWith('$argon2')) return false;
  const sep = str.indexOf('$', 1);
  return sep > 1;
}

export function isArgon2Hash(str: string): boolean {
  if (typeof str !== 'string') return false;
  return str.startsWith('$argon2') || isCompactArgon2(str);
}

export function isBcryptHash(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  if (str.startsWith('$2') && str.length === 60) return true;
  return isCompactBcrypt(str);
}

export function isPasswordHash(str: string): boolean {
  return isBcryptHash(str) || isArgon2Hash(str);
}

export function compactHash(hash: string): string {
  if (!hash || typeof hash !== 'string') {
    throw new ValidationError('Invalid hash', {
      field: 'hash',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide a valid password hash.'
    });
  }

  if (isCompactBcrypt(hash) || isCompactArgon2(hash)) return hash;

  if (hash.startsWith('$argon2')) {
    return compactArgon2(hash);
  }

  if (hash.startsWith('$2')) {
    return compactBcrypt(hash);
  }

  throw new ValidationError('Not a valid password hash', {
    field: 'hash',
    statusCode: 400,
    retriable: false,
    suggestion: 'Provide a bcrypt ($2b$...) or argon2id ($argon2id$...) hash.'
  });
}

function compactBcrypt(hash: string): string {
  const parts = hash.split('$');
  if (parts.length !== 4) {
    throw new ValidationError('Invalid bcrypt hash format', {
      field: 'bcryptHash',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide a complete bcrypt hash (e.g., "$2b$12$...").'
    });
  }

  const rounds = parseInt(parts[2]!, 10);
  return `$${b62encode(rounds)}$${parts[3]}`;
}

function compactArgon2(hash: string): string {
  const match = hash.match(/^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$(.+)\$(.+)$/);
  if (!match) {
    throw new ValidationError('Invalid argon2id hash format', {
      field: 'argon2Hash',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide a complete argon2id hash.'
    });
  }

  const [, version, memStr, timeCost, parallelism, salt, digest] = match;
  const mem = Math.log2(parseInt(memStr!, 10));

  if (!Number.isInteger(mem)) {
    throw new ValidationError('Argon2 memoryCost must be a power of 2 for compaction', {
      field: 'memoryCost',
      statusCode: 400,
      retriable: false,
      suggestion: 'Use a power-of-2 memoryCost (e.g., 65536 = 2^16).'
    });
  }

  return `$${b62encode(parseInt(version!, 10))}|${b62encode(mem)}|${b62encode(parseInt(timeCost!, 10))}|${b62encode(parseInt(parallelism!, 10))}$${salt}$${digest}`;
}

export function expandHash(compactHashStr: string): string {
  if (!compactHashStr || typeof compactHashStr !== 'string') {
    throw new ValidationError('Invalid compacted hash', {
      field: 'compactHash',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide a compacted hash returned from compactHash().'
    });
  }

  if (compactHashStr.startsWith('$argon2') || compactHashStr.startsWith('$2')) {
    return compactHashStr;
  }

  if (isCompactArgon2(compactHashStr)) {
    return expandArgon2(compactHashStr);
  }

  if (isCompactBcrypt(compactHashStr)) {
    return expandBcrypt(compactHashStr);
  }

  throw new ValidationError('Unrecognized hash format', {
    field: 'compactHash',
    statusCode: 400,
    retriable: false,
    suggestion: 'Provide a valid compact or full password hash.'
  });
}

function expandBcrypt(compact: string): string {
  const sep = compact.indexOf('$', 1);
  if (sep === -1) {
    throw new ValidationError('Invalid compact bcrypt format', {
      field: 'compactBcrypt',
      statusCode: 400,
      retriable: false,
      suggestion: 'Expected format: $b62rounds$salt+hash'
    });
  }

  const rounds = b62decode(compact.slice(1, sep));
  const roundsStr = rounds.toString().padStart(2, '0');
  return `$2b$${roundsStr}$${compact.slice(sep + 1)}`;
}

function expandArgon2(compact: string): string {
  const paramsEnd = compact.indexOf('$', 1);
  if (paramsEnd === -1) {
    throw new ValidationError('Invalid compact argon2 format', {
      field: 'compactArgon2',
      statusCode: 400,
      retriable: false,
      suggestion: 'Expected format: $v|m|t|p$salt$hash (base62 encoded params)'
    });
  }

  const params = compact.slice(1, paramsEnd).split('|');
  if (params.length !== 4) {
    throw new ValidationError('Invalid compact argon2 format', {
      field: 'compactArgon2',
      statusCode: 400,
      retriable: false,
      suggestion: 'Expected 4 pipe-separated base62 params: version|memLog2|timeCost|parallelism'
    });
  }

  const version = b62decode(params[0]!);
  const memoryCost = Math.pow(2, b62decode(params[1]!));
  const timeCost = b62decode(params[2]!);
  const parallelism = b62decode(params[3]!);
  const rest = compact.slice(paramsEnd + 1);
  const lastDollar = rest.lastIndexOf('$');
  const salt = rest.slice(0, lastDollar);
  const digest = rest.slice(lastDollar + 1);

  return `$argon2id$v=${version}$m=${memoryCost},t=${timeCost},p=${parallelism}$${salt}$${digest}`;
}

export default {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  compactHash,
  expandHash,
  isBcryptHash,
  isArgon2Hash,
  isPasswordHash,
  detectAlgorithm
};
