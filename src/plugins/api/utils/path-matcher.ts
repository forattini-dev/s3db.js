export type AuthDriverName = 'jwt' | 'apiKey' | 'basic' | 'oauth2' | 'oidc';

export interface PathPatternRule {
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

export function findBestMatch<T extends PathPatternRule>(rules: T[] | null | undefined, path: string): T | null {
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
export default {
  matchPath,
  findBestMatch
};
