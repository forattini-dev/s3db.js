# RedDbNativeClient

The **RedDbNativeClient** exposes RedDB's native namespaces directly through the `recker` V2 client. Use it when you want first-class access to SQL, rows, documents, graphs, vectors, and key-value features instead of the S3-compatible object mapping used by `RedDbClient`.

**Best for:**

- workloads that should use RedDB structures directly instead of storing everything as `_key` + `_body`
- latency-sensitive services that want to use the best available RedDB transport (`wire`, `grpc`, or `http`)
- mixed workloads where one part of the system uses s3db resources and another part uses native RedDB primitives

## Quick Start

```javascript
import { RedDbNativeClient } from 's3db.js';

const client = new RedDbNativeClient({
  connectionString: 'reddb://readToken:writeToken@localhost:8080/app?collection=events&transport=wire&wireAddress=127.0.0.1:7001'
});

const stats = await client.system.stats();
const rows = await client.sql.query('SELECT * FROM events LIMIT 10');

await client.close();
```

## When To Use It

Use `RedDbNativeClient` when you want to model data according to the structure RedDB already provides:

- `rows` for structured table-like records
- `documents` for document-native payloads
- `nodes` and `edges` for graph relationships
- `vectors` for embedding storage and similarity search
- `kv` for fast key-value access
- `sql` when you want direct query control

Use `RedDbClient` instead when the rest of your code expects the s3db.js storage contract (`putObject`, `getObject`, `listObjects`, prefixes, and metadata).

## Connection String Format

```
reddb://[authToken[:writeToken]@]host[:port][/keyPrefix][?collection=name&transport=wire]
```

The `reddb://` URI is parsed by s3db.js and converted into the underlying `recker` client options.

### Supported Query Parameters

The connection string can carry transport tuning using flat keys or nested dotted keys:

```bash
reddb://localhost:8080/app?collection=events&transport=wire&wireAddress=127.0.0.1:7001&wirePoolSize=8
reddb://localhost:8080/app?transport=grpc&grpcAddress=127.0.0.1:50051&grpcKeepalive.timeMs=5000
reddb://localhost:8080/app?operationTimeouts.sql=1200&operationTimeouts.bulk=3000
```

## Configuration Options

```typescript
interface RedDbNativeClientConfig {
  connectionString?: string;
  baseUrl?: string;
  authToken?: string;
  writeToken?: string;
  collection?: string;
  bucket?: string;
  keyPrefix?: string;
  region?: string;
  transport?: 'auto' | 'http' | 'grpc' | 'wire';
  allowTransportFallback?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  http2?: boolean;
  wireAddress?: string;
  wireTls?: boolean | RedDbWireTlsOptions;
  wirePoolSize?: number;
  wireKeepAlive?: boolean;
  wireKeepAliveInitialDelayMs?: number;
  wireConnectTimeout?: number;
  grpcAddress?: string;
  grpcTls?: boolean | RedDbGrpcTlsOptions;
  grpcOptions?: Record<string, string | number>;
  grpcKeepalive?: RedDbGrpcKeepaliveOptions;
  operationTimeouts?: RedDbOperationTimeouts;
  batchConcurrency?: number;
}
```

## Exposed Namespaces

The wrapper exposes the same namespaces as the `recker` RedDB client:

- `system`
- `sql`
- `collections`
- `indexes`
- `rows`
- `documents`
- `nodes`
- `edges`
- `vectors`
- `kv`

You can also inspect transport capabilities:

```javascript
const capabilities = client.getCapabilities();
console.log(capabilities.availableTransports);
```

## Examples

### SQL and Rows

```javascript
import { RedDbNativeClient } from 's3db.js';

const client = new RedDbNativeClient({
  baseUrl: 'http://localhost:8080',
  collection: 'orders',
  transport: 'wire',
  wireAddress: '127.0.0.1:7001',
});

await client.rows.create({
  collection: 'orders',
  payload: {
    fields: {
      order_id: 'ord_1',
      total: 199.99,
      status: 'paid',
    },
  },
});

const result = await client.sql.query('SELECT order_id, total FROM orders WHERE status = "paid"');
console.log(result.data.result?.records);
```

### Key-Value Access

```javascript
const client = new RedDbNativeClient({
  baseUrl: 'http://localhost:8080',
  collection: 'feature-flags',
});

await client.kv.put({
  collection: 'feature-flags',
  key: 'checkout.v2',
  value: true,
});

const flag = await client.kv.get({
  collection: 'feature-flags',
  key: 'checkout.v2',
});
```

### Graph Modeling

```javascript
const client = new RedDbNativeClient({
  baseUrl: 'http://localhost:8080',
  collection: 'social',
});

await client.nodes.create({
  collection: 'social',
  payload: {
    type: 'user',
    name: 'Alice',
  },
});

await client.edges.create({
  collection: 'social',
  payload: {
    type: 'follows',
    from: 'user:alice',
    to: 'user:bob',
  },
});
```

## Performance Notes

- Prefer `wire` or `grpc` when your RedDB deployment exposes them.
- Use `sql` for direct reads and range scans when you already know the query shape.
- Use `rows.bulkCreate`, `documents.bulkCreate`, or `vectors.bulkInsertBinary` for write-heavy ingestion.
- Tune `operationTimeouts`, keepalive, and pool size per transport instead of relying on one global timeout.

## See Also

- [RedDbClient](./reddb-client.md)
- [Storage Clients](./README.md)
- [Recker in s3db.js](/dependencies/recker.md)
