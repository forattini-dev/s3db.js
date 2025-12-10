import crypto from 'crypto';

export interface DerivedKeys {
  encryption: Buffer;
  signing: Buffer;
}

export interface KeystoreResult {
  current: DerivedKeys;
  keystore: DerivedKeys[];
}

export interface JwtKeyResult {
  current: { signing: Buffer; encryption: Buffer };
  keystore: DerivedKeys[];
}

export function deriveKey(secret: string | Buffer, context: string, length: number = 32): Buffer {
  const secretBuffer = typeof secret === 'string'
    ? Buffer.from(secret, 'utf8')
    : secret;

  const derived = crypto.hkdfSync(
    'sha256',
    secretBuffer,
    Buffer.alloc(0),
    context,
    length
  );

  return Buffer.from(derived);
}

export function deriveKeystore(
  secret: string | string[],
  encryptionContext: string,
  signingContext: string
): KeystoreResult {
  const secrets = Array.isArray(secret) ? secret : [secret];

  const currentSecret = secrets[0]!;
  const current: DerivedKeys = {
    encryption: deriveKey(currentSecret, encryptionContext),
    signing: deriveKey(currentSecret, signingContext),
  };

  const keystore = secrets.map(s => ({
    encryption: deriveKey(s, encryptionContext),
    signing: deriveKey(s, signingContext),
  }));

  return { current, keystore };
}

export function deriveOidcKeys(cookieSecret: string | string[]): KeystoreResult {
  return deriveKeystore(
    cookieSecret,
    'OIDC Session Encryption',
    'OIDC Cookie Signing'
  );
}

export function deriveJwtKeys(jwtSecret: string | string[]): JwtKeyResult {
  return deriveKeystore(
    jwtSecret,
    'JWT Token Encryption',
    'JWT Token Signing'
  );
}
