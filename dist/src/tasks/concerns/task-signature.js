function getFnName(fn) {
    if (typeof fn === 'function' && fn.name) {
        return fn.name;
    }
    return 'anonymous';
}
export function extractLengthHint(item) {
    if (item == null)
        return undefined;
    if (typeof item === 'string' || Array.isArray(item)) {
        return item.length;
    }
    if (typeof item === 'object') {
        const obj = item;
        if (typeof obj.length === 'number') {
            return obj.length;
        }
        if (typeof obj.size === 'number') {
            return obj.size;
        }
    }
    return undefined;
}
export function deriveSignature(fn, metadata = {}, signatureOverride, priority = 0) {
    if (signatureOverride)
        return signatureOverride;
    if (metadata.signature)
        return metadata.signature;
    const fnName = getFnName(fn);
    const hintSource = metadata.item ??
        metadata.items ??
        metadata.payload ??
        metadata.body ??
        metadata.data ??
        metadata.value;
    const lengthHint = metadata.itemLength ??
        metadata.length ??
        (typeof metadata.size === 'number' ? metadata.size : undefined) ??
        extractLengthHint(hintSource);
    const hint = lengthHint != null ? `${fnName}:${lengthHint}` : fnName;
    return `${hint}:p${priority}`;
}
//# sourceMappingURL=task-signature.js.map