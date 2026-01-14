export function bumpProcessMaxListeners(additionalListeners: number): void {
  if (additionalListeners <= 0 || typeof process === 'undefined') return;
  if (typeof process.getMaxListeners !== 'function' || typeof process.setMaxListeners !== 'function') return;

  const current = process.getMaxListeners();
  if (current === 0) return;

  process.setMaxListeners(current + additionalListeners);
}
