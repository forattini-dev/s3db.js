export interface HttpLogParams {
    method: string;
    url: string;
    status: number;
    duration: number | string;
    contentLength?: string | number | null;
    colorize?: boolean;
}
export declare function colorizeStatus(status: number, value: string): string;
export declare function formatPrettyHttpLog({ method, url, status, duration, contentLength, colorize }: HttpLogParams): string;
//# sourceMappingURL=http-logger.d.ts.map