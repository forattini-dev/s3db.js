export function bumpProcessMaxListeners(delta) {
    if (delta === 0 || typeof process === 'undefined')
        return;
    if (typeof process.getMaxListeners !== 'function' || typeof process.setMaxListeners !== 'function')
        return;
    const current = process.getMaxListeners();
    if (current === 0 && delta > 0)
        return;
    const newValue = Math.max(0, current + delta);
    process.setMaxListeners(newValue);
}
//# sourceMappingURL=process-max-listeners.js.map