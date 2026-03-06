/**
 * Normalize a static request path by removing the configured mount prefix.
 */
export function stripStaticMountPath(requestPath: string, mountPath: string = '/'): string {
  const normalizedRequestPath = normalizeStaticPath(requestPath);
  const normalizedMountPath = normalizeMountPath(mountPath);

  if (normalizedMountPath === '/') {
    return normalizedRequestPath;
  }

  if (normalizedRequestPath === normalizedMountPath || normalizedRequestPath === `${normalizedMountPath}/`) {
    return '/';
  }

  if (normalizedRequestPath.startsWith(`${normalizedMountPath}/`)) {
    return normalizedRequestPath.slice(normalizedMountPath.length) || '/';
  }

  return normalizedRequestPath;
}

function normalizeStaticPath(value: string): string {
  if (!value || value === '/') {
    return '/';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.replace(/\/{2,}/g, '/');
}

function normalizeMountPath(value: string): string {
  if (!value || value === '/') {
    return '/';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}
