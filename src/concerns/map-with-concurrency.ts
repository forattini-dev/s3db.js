export interface MapWithConcurrencyOptions<T> {
  concurrency?: number;
  onError?: ((error: Error, item: T) => void | Promise<void>) | null;
}

export interface MapWithConcurrencyError<T> {
  item: T;
  index: number;
  message: string;
  raw: Error;
}

export interface MapWithConcurrencyResult<T, R> {
  results: R[];
  errors: MapWithConcurrencyError<T>[];
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: MapWithConcurrencyOptions<T> = {}
): Promise<MapWithConcurrencyResult<T, R>> {
  const {
    concurrency = 10,
    onError = null
  } = options;

  const results: R[] = [];
  const errors: MapWithConcurrencyError<T>[] = [];
  const executing = new Set<Promise<R | null>>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as T;

    const promise = (async (): Promise<R | null> => {
      try {
        const result = await fn(item, i);
        results.push(result);
        return result;
      } catch (error) {
        const err = error as Error;
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

export interface ForEachWithConcurrencyResult<T> {
  errors: MapWithConcurrencyError<T>[];
}

export async function forEachWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  options: MapWithConcurrencyOptions<T> = {}
): Promise<ForEachWithConcurrencyResult<T>> {
  const {
    concurrency = 10,
    onError = null
  } = options;

  const errors: MapWithConcurrencyError<T>[] = [];
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as T;

    const promise = (async (): Promise<void> => {
      try {
        await fn(item, i);
      } catch (error) {
        const err = error as Error;
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
