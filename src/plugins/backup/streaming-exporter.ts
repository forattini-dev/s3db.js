import { createWriteStream, type WriteStream } from 'fs';
import zlib from 'node:zlib';
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

export class StreamingExporter {
  encoding: BufferEncoding;
  compress: boolean;
  batchSize: number;
  onProgress: ((stats: ProgressStats) => void) | null;

  constructor(options: StreamingExporterOptions = {}) {
    this.encoding = options.encoding || 'utf8';
    this.compress = options.compress !== false;
    this.batchSize = options.batchSize || 100;
    this.onProgress = options.onProgress || null;
  }

  async exportResource(
    resource: Resource,
    outputPath: string,
    type: 'full' | 'incremental' = 'full',
    sinceTimestamp: Date | null = null
  ): Promise<ExportStats> {
    let recordCount = 0;
    let bytesWritten = 0;

    const writeStream: WriteStream = createWriteStream(outputPath);

    let outputStream: WriteStream | zlib.Gzip = writeStream;
    if (this.compress) {
      const gzipStream = zlib.createGzip();
      gzipStream.pipe(writeStream);
      outputStream = gzipStream;
    }

    try {
      let records: Record<string, unknown>[];
      if (type === 'incremental' && sinceTimestamp) {
        records = await resource.list({
          where: { updatedAt: { $gt: sinceTimestamp.toISOString() } }
        } as any);
      } else {
        records = await resource.list();
      }

      for (const record of records) {
        const line = JSON.stringify(record) + '\n';
        const canWrite = outputStream.write(line, this.encoding);

        recordCount++;
        bytesWritten += Buffer.byteLength(line, this.encoding);

        if (this.onProgress && recordCount % 1000 === 0) {
          this.onProgress({
            resourceName: resource.name,
            recordCount,
            bytesWritten
          });
        }

        if (!canWrite) {
          await new Promise<void>(resolve => outputStream.once('drain', resolve));
        }
      }

      outputStream.end();

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      return { recordCount, bytesWritten };

    } catch (error) {
      outputStream.destroy();
      throw error;
    }
  }

  async exportResources(
    resources: Record<string, Resource>,
    outputDir: string,
    type: 'full' | 'incremental' = 'full',
    sinceTimestamp: Date | null = null
  ): Promise<Map<string, ExportResourcesResult>> {
    const results = new Map<string, ExportResourcesResult>();

    for (const [resourceName, resource] of Object.entries(resources)) {
      const ext = this.compress ? '.jsonl.gz' : '.jsonl';
      const outputPath = `${outputDir}/${resourceName}${ext}`;

      const stats = await this.exportResource(resource, outputPath, type, sinceTimestamp);

      results.set(resourceName, {
        ...stats,
        filePath: outputPath,
        compressed: this.compress
      });
    }

    return results;
  }
}

export default StreamingExporter;
