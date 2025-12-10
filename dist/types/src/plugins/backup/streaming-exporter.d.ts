import type { Resource } from '../../resource.class.js';
export interface StreamingExporterOptions {
    encoding?: BufferEncoding;
    compress?: boolean;
    batchSize?: number;
    onProgress?: ((stats: ProgressStats) => void) | null;
}
export interface ProgressStats {
    resourceName: string;
    recordCount: number;
    bytesWritten: number;
}
export interface ExportStats {
    recordCount: number;
    bytesWritten: number;
}
export interface ExportResourcesResult {
    recordCount: number;
    bytesWritten: number;
    filePath: string;
    compressed: boolean;
}
export declare class StreamingExporter {
    encoding: BufferEncoding;
    compress: boolean;
    batchSize: number;
    onProgress: ((stats: ProgressStats) => void) | null;
    constructor(options?: StreamingExporterOptions);
    exportResource(resource: Resource, outputPath: string, type?: 'full' | 'incremental', sinceTimestamp?: Date | null): Promise<ExportStats>;
    exportResources(resources: Record<string, Resource>, outputDir: string, type?: 'full' | 'incremental', sinceTimestamp?: Date | null): Promise<Map<string, ExportResourcesResult>>;
}
export default StreamingExporter;
//# sourceMappingURL=streaming-exporter.d.ts.map