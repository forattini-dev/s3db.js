import type { HttpClientOptions } from './types.js';

export type NormalizedRetryProfile = 'dual' | 'recker-only' | 'sdk-only';

export interface AwsRetryConfig {
  retryProfile: NormalizedRetryProfile;
  maxAttempts?: number;
  retryMode?: 'standard' | 'adaptive';
}

function normalizeRetryProfileValue(value: unknown): NormalizedRetryProfile {
  const normalized = String(value || 'dual').trim().replace('aws-only', 'sdk-only');

  if (normalized === 'dual' || normalized === 'recker-only' || normalized === 'sdk-only') {
    return normalized;
  }

  return 'dual';
}

export function normalizeHttpClientRetryConfig(options: HttpClientOptions = {}): AwsRetryConfig {
  const retryProfile = normalizeRetryProfileValue((options.retryProfile || options.retryCoordination) as unknown);
  const rawAttempts = options.retryAttempts ?? options.awsMaxAttempts;
  const maxAttempts =
    typeof rawAttempts === 'number' && Number.isFinite(rawAttempts) && rawAttempts > 0
      ? Math.max(1, Math.trunc(rawAttempts))
      : undefined;

  const retryMode = options.retryMode ?? options.awsRetryMode;

  return {
    retryProfile,
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
    ...(retryMode !== undefined ? { retryMode } : {}),
  };
}

export function normalizeEtagHeader(headerValue: string | undefined | null): string[] {
  if (headerValue === undefined || headerValue === null) {
    return [];
  }

  return String(headerValue)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
}

