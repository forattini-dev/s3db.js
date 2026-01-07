import type { ReckerHttpHandlerOptions, HandlerMetrics, AwsHttpRequest, AwsHttpResponse, HandleOptions } from './types.js';
export declare class ReckerHttpHandler {
    private options;
    private client;
    private deduplicator;
    private circuitBreaker;
    private metrics;
    private http2MetricsEnabled;
    constructor(options?: ReckerHttpHandlerOptions);
    get metadata(): {
        handlerProtocol: string;
    };
    handle(request: AwsHttpRequest, { abortSignal, requestTimeout }?: HandleOptions): Promise<{
        response: AwsHttpResponse;
    }>;
    updateHttpClientConfig(key: keyof ReckerHttpHandlerOptions, value: unknown): void;
    httpHandlerConfigs(): ReckerHttpHandlerOptions;
    getMetrics(): HandlerMetrics;
    resetMetrics(): void;
    destroy(): void;
}
export default ReckerHttpHandler;
//# sourceMappingURL=recker-http-handler.d.ts.map