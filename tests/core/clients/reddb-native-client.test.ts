import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRedDbClientMock } = vi.hoisted(() => ({
  createRedDbClientMock: vi.fn(),
}));

vi.mock('recker', () => ({
  createRedDbClient: createRedDbClientMock,
}));

import { RedDbNativeClient } from '#src/clients/reddb-native-client.class.js';

function createMockNativeClient() {
  return {
    system: {
      health: vi.fn(),
      ready: vi.fn(),
      stats: vi.fn(),
    },
    sql: {
      query: vi.fn(),
      explain: vi.fn(),
      batch: vi.fn(),
    },
    collections: {
      list: vi.fn(),
      create: vi.fn(),
      describe: vi.fn(),
      drop: vi.fn(),
    },
    indexes: {
      list: vi.fn(),
      statuses: vi.fn(),
      create: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      warmup: vi.fn(),
      rebuild: vi.fn(),
    },
    rows: {
      scan: vi.fn(),
      create: vi.fn(),
      bulkCreate: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    documents: {
      create: vi.fn(),
      bulkCreate: vi.fn(),
    },
    nodes: {
      create: vi.fn(),
      bulkCreate: vi.fn(),
    },
    edges: {
      create: vi.fn(),
      bulkCreate: vi.fn(),
    },
    vectors: {
      create: vi.fn(),
      bulkCreate: vi.fn(),
      bulkInsertBinary: vi.fn(),
      similar: vi.fn(),
      ivfSearch: vi.fn(),
    },
    kv: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
    getCapabilities: vi.fn().mockReturnValue({
      requestedTransport: 'auto',
      allowTransportFallback: true,
      availableTransports: {
        http: true,
        grpc: true,
        wire: true,
      },
      namespaces: {
        system: true,
        sql: true,
        collections: true,
        indexes: true,
        rows: true,
        documents: true,
        nodes: true,
        edges: true,
        vectors: true,
        kv: true,
      },
      features: {
        grpcNative: true,
        wireSql: true,
        wireBulkRows: true,
        wireBinaryBulkScalars: true,
        httpBinaryBulkEmulation: true,
        sqlBatchEmulationOverHttp: false,
        sqlBatchEmulationOverWire: false,
        kvListViaSql: true,
      },
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RedDbNativeClient', () => {
  const silentLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    trace: () => {},
  };

  let nativeClient: ReturnType<typeof createMockNativeClient>;

  beforeEach(() => {
    nativeClient = createMockNativeClient();
    createRedDbClientMock.mockReset();
    createRedDbClientMock.mockReturnValue(nativeClient);
  });

  it('resolves reddb connection strings into recker transport config', async () => {
    const client = new RedDbNativeClient({
      connectionString: 'reddb://read-token:write-token@reddb.internal:8080/tenant-a/v1?collection=events&transport=wire&wireAddress=reddb.internal%3A7001&wirePoolSize=8&grpcKeepalive.timeMs=5000&operationTimeouts.sql=1500',
      logger: silentLogger,
    });

    expect(createRedDbClientMock).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://reddb.internal:8080',
      authToken: 'read-token',
      writeToken: 'write-token',
      transport: 'wire',
      wireAddress: 'reddb.internal:7001',
      wirePoolSize: 8,
      grpcKeepalive: {
        timeMs: 5000,
      },
      operationTimeouts: {
        sql: 1500,
      },
    }));

    expect(client.baseUrl).toBe('http://reddb.internal:8080');
    expect(client.collection).toBe('events');
    expect(client.bucket).toBe('events');
    expect(client.keyPrefix).toBe('tenant-a/v1');
    expect(client.connectionString).toBe('reddb://read-token:write-token@reddb.internal:8080/tenant-a/v1?collection=events');

    await client.close();
    expect(nativeClient.close).toHaveBeenCalledOnce();
  });

  it('lets explicit config override connection string transport tuning', () => {
    new RedDbNativeClient({
      connectionString: 'reddb://read-token@reddb.internal:8080/app?collection=events&transport=http&wirePoolSize=4',
      transport: 'grpc',
      grpcAddress: 'reddb.internal:50051',
      wirePoolSize: 16,
      operationTimeouts: { sql: 900, bulk: 2500 },
      logger: silentLogger,
    });

    expect(createRedDbClientMock).toHaveBeenCalledWith(expect.objectContaining({
      transport: 'grpc',
      grpcAddress: 'reddb.internal:50051',
      wirePoolSize: 16,
      operationTimeouts: {
        sql: 900,
        bulk: 2500,
      },
    }));
  });

  it('exposes the underlying recker namespaces and capabilities', () => {
    const client = new RedDbNativeClient({
      baseUrl: 'http://localhost:8080',
      collection: 'analytics',
      logger: silentLogger,
    });

    expect(client.system).toBe(nativeClient.system);
    expect(client.sql).toBe(nativeClient.sql);
    expect(client.documents).toBe(nativeClient.documents);
    expect(client.nodes).toBe(nativeClient.nodes);
    expect(client.edges).toBe(nativeClient.edges);
    expect(client.vectors).toBe(nativeClient.vectors);
    expect(client.kv).toBe(nativeClient.kv);
    expect(client.getCapabilities()).toEqual(nativeClient.getCapabilities());
  });

  it('supports wrapping an existing recker client instance', async () => {
    const providedClient = createMockNativeClient();

    const client = new RedDbNativeClient({
      baseUrl: 'http://localhost:8080',
      collection: 'analytics',
      client: providedClient as any,
      logger: silentLogger,
    });

    expect(createRedDbClientMock).not.toHaveBeenCalled();
    expect(client.client).toBe(providedClient);

    await client.destroy();
    expect(providedClient.close).toHaveBeenCalledOnce();
  });
});
