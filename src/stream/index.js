export * from "./resource-reader.class"
export * from "./resource-writer.class"
export * from "./resource-ids-reader.class"
export * from "./resource-ids-page-reader.class"

export function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}
