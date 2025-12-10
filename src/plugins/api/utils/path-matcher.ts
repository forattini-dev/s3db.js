export type AuthDriverName = 'jwt' | 'apiKey' | 'basic' | 'oauth2' | 'oidc';

export interface PathAuthRule {
  pattern: string;
  drivers?: AuthDriverName[];
  required?: boolean;
  [key: string]: unknown;
}

function patternToRegex(pattern: string): RegExp {
  let escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  escaped = escaped.replace(/\*\*/g, '__DOUBLE_STAR__');
  escaped = escaped.replace(/\*/g, '([^/]+)');
  escaped = escaped.replace(/__DOUBLE_STAR__/g, '(.*)');

  return new RegExp(`^${escaped}$`);
}

export function matchPath(pattern: string, path: string): boolean {
  const regex = patternToRegex(pattern);
  return regex.test(path);
}

function calculateSpecificity(pattern: string): number {
  const segments = pattern.split('/').filter(s => s !== '');

  let score = 0;

  for (const segment of segments) {
    if (segment === '**') {
      score += 10;
    } else if (segment === '*') {
      score += 100;
    } else {
      score += 1000;
    }
  }

  return score;
}

export function findBestMatch<T extends PathAuthRule>(rules: T[] | null | undefined, path: string): T | null {
  if (!rules || rules.length === 0) {
    return null;
  }

  const matches = rules
    .map(rule => ({
      rule,
      specificity: calculateSpecificity(rule.pattern)
    }))
    .filter(({ rule }) => matchPath(rule.pattern, path))
    .sort((a, b) => b.specificity - a.specificity);

  return matches.length > 0 ? matches[0]!.rule : null;
}

export function validatePathAuth(pathAuth: unknown): void {
  if (!Array.isArray(pathAuth)) {
    throw new Error('pathAuth must be an array of rules');
  }

  const validDrivers: AuthDriverName[] = ['jwt', 'apiKey', 'basic', 'oauth2', 'oidc'];

  for (const [index, rule] of pathAuth.entries()) {
    if (!rule.pattern || typeof rule.pattern !== 'string') {
      throw new Error(`pathAuth[${index}]: pattern is required and must be a string`);
    }

    if (!rule.pattern.startsWith('/')) {
      throw new Error(`pathAuth[${index}]: pattern must start with / (got: ${rule.pattern})`);
    }

    if (rule.drivers !== undefined && !Array.isArray(rule.drivers)) {
      throw new Error(`pathAuth[${index}]: drivers must be an array (got: ${typeof rule.drivers})`);
    }

    if (rule.required !== undefined && typeof rule.required !== 'boolean') {
      throw new Error(`pathAuth[${index}]: required must be a boolean (got: ${typeof rule.required})`);
    }

    if (rule.drivers) {
      for (const driver of rule.drivers) {
        if (!validDrivers.includes(driver as AuthDriverName)) {
          throw new Error(
            `pathAuth[${index}]: invalid driver '${driver}'. ` +
            `Valid drivers: ${validDrivers.join(', ')}`
          );
        }
      }
    }
  }
}

export default {
  matchPath,
  findBestMatch,
  validatePathAuth
};
