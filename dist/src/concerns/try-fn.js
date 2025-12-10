export function tryFn(fnOrPromise) {
    if (fnOrPromise == null) {
        const err = new Error('fnOrPromise cannot be null or undefined');
        err.stack = new Error().stack;
        return [false, err, undefined];
    }
    if (typeof fnOrPromise === 'function') {
        try {
            const result = fnOrPromise();
            if (result == null) {
                return [true, null, result];
            }
            if (typeof result.then === 'function') {
                return result
                    .then((data) => [true, null, data])
                    .catch((error) => {
                    if (error instanceof Error && Object.isExtensible(error)) {
                        const desc = Object.getOwnPropertyDescriptor(error, 'stack');
                        if (desc?.writable && desc.configurable && Object.prototype.hasOwnProperty.call(error, 'stack')) {
                            try {
                                error.stack = new Error().stack;
                            }
                            catch {
                                // Ignore
                            }
                        }
                    }
                    return [false, error instanceof Error ? error : new Error(String(error)), undefined];
                });
            }
            return [true, null, result];
        }
        catch (error) {
            if (error instanceof Error && Object.isExtensible(error)) {
                const desc = Object.getOwnPropertyDescriptor(error, 'stack');
                if (desc?.writable && desc.configurable && Object.prototype.hasOwnProperty.call(error, 'stack')) {
                    try {
                        error.stack = new Error().stack;
                    }
                    catch {
                        // Ignore
                    }
                }
            }
            return [false, error instanceof Error ? error : new Error(String(error)), undefined];
        }
    }
    if (typeof fnOrPromise.then === 'function') {
        return Promise.resolve(fnOrPromise)
            .then((data) => [true, null, data])
            .catch((error) => {
            if (error instanceof Error && Object.isExtensible(error)) {
                const desc = Object.getOwnPropertyDescriptor(error, 'stack');
                if (desc?.writable && desc.configurable && Object.prototype.hasOwnProperty.call(error, 'stack')) {
                    try {
                        error.stack = new Error().stack;
                    }
                    catch {
                        // Ignore
                    }
                }
            }
            return [false, error instanceof Error ? error : new Error(String(error)), undefined];
        });
    }
    return [true, null, fnOrPromise];
}
/**
 * Synchronous version of tryFn for cases where you know the function is synchronous
 */
export function tryFnSync(fn) {
    try {
        const result = fn();
        return [true, null, result];
    }
    catch (err) {
        return [false, err instanceof Error ? err : new Error(String(err)), undefined];
    }
}
export default tryFn;
//# sourceMappingURL=try-fn.js.map