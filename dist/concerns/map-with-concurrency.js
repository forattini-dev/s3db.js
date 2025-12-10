export async function mapWithConcurrency(items, fn, options = {}) {
    const { concurrency = 10, onError = null } = options;
    const results = [];
    const errors = [];
    const executing = new Set();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const promise = (async () => {
            try {
                const result = await fn(item, i);
                results.push(result);
                return result;
            }
            catch (error) {
                const err = error;
                if (onError) {
                    await onError(err, item);
                }
                errors.push({ item, index: i, message: err.message, raw: err });
                return null;
            }
        })();
        executing.add(promise);
        promise.finally(() => executing.delete(promise));
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);
    return { results, errors };
}
export async function forEachWithConcurrency(items, fn, options = {}) {
    const { concurrency = 10, onError = null } = options;
    const errors = [];
    const executing = new Set();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const promise = (async () => {
            try {
                await fn(item, i);
            }
            catch (error) {
                const err = error;
                if (onError) {
                    await onError(err, item);
                }
                errors.push({ item, index: i, message: err.message, raw: err });
            }
        })();
        executing.add(promise);
        promise.finally(() => executing.delete(promise));
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);
    return { errors };
}
export default mapWithConcurrency;
//# sourceMappingURL=map-with-concurrency.js.map