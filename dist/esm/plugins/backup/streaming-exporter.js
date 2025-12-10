import { createWriteStream } from 'fs';
import zlib from 'node:zlib';
export class StreamingExporter {
    encoding;
    compress;
    batchSize;
    onProgress;
    constructor(options = {}) {
        this.encoding = options.encoding || 'utf8';
        this.compress = options.compress !== false;
        this.batchSize = options.batchSize || 100;
        this.onProgress = options.onProgress || null;
    }
    async exportResource(resource, outputPath, type = 'full', sinceTimestamp = null) {
        let recordCount = 0;
        let bytesWritten = 0;
        const writeStream = createWriteStream(outputPath);
        let outputStream = writeStream;
        if (this.compress) {
            const gzipStream = zlib.createGzip();
            gzipStream.pipe(writeStream);
            outputStream = gzipStream;
        }
        try {
            let records;
            if (type === 'incremental' && sinceTimestamp) {
                records = await resource.list({
                    where: { updatedAt: { $gt: sinceTimestamp.toISOString() } }
                });
            }
            else {
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
                    await new Promise(resolve => outputStream.once('drain', resolve));
                }
            }
            outputStream.end();
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
            return { recordCount, bytesWritten };
        }
        catch (error) {
            outputStream.destroy();
            throw error;
        }
    }
    async exportResources(resources, outputDir, type = 'full', sinceTimestamp = null) {
        const results = new Map();
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
//# sourceMappingURL=streaming-exporter.js.map