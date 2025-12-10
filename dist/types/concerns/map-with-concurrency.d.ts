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
export declare function mapWithConcurrency<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, options?: MapWithConcurrencyOptions<T>): Promise<MapWithConcurrencyResult<T, R>>;
export interface ForEachWithConcurrencyResult<T> {
    errors: MapWithConcurrencyError<T>[];
}
export declare function forEachWithConcurrency<T>(items: T[], fn: (item: T, index: number) => Promise<void>, options?: MapWithConcurrencyOptions<T>): Promise<ForEachWithConcurrencyResult<T>>;
export default mapWithConcurrency;
//# sourceMappingURL=map-with-concurrency.d.ts.map