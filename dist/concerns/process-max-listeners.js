export function bumpProcessMaxListeners(additionalListeners) {
    if (additionalListeners <= 0 || typeof process === 'undefined')
        return;
    if (typeof process.getMaxListeners !== 'function' || typeof process.setMaxListeners !== 'function')
        return;
    const current = process.getMaxListeners();
    if (current === 0)
        return;
    process.setMaxListeners(current + additionalListeners);
}
//# sourceMappingURL=process-max-listeners.js.map