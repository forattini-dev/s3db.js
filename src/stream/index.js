export * from './resource-ids-read-stream.class'
export * from './resource-ids-transformer.class'
export * from './resource-write-stream.class'

export function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}
