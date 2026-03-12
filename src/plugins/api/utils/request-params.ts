export function decodeRequestParam(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || !value.includes('%')) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function decodeRequestParams(params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, decodeRequestParam(value) ?? value])
  );
}
