import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRedDbClientMock } = vi.hoisted(() => ({
  createRedDbClientMock: vi.fn(),
}));

vi.mock('recker', () => ({
  createRedDbClient: createRedDbClientMock,
}));

import { RedDbClient } from '#src/clients/reddb-client.class.js';

function createNativeQueryEnvelope(
  records: Array<Record<string, unknown>> = [],
  data: Record<string, unknown> = {}
) {
  return {
    data: {
      result: {
        records,
      },
      ...data,
    },
    transport: 'wire',
    requestedTransport: 'auto',
    degradedFromRequestedTransport: false,
    emulated: false,
    metrics: {
      operation: 'sql.query',
      requestedTransport: 'auto',
      transport: 'wire',
      degradedFromRequestedTransport: false,
      emulated: false,
      startedAt: Date.now(),
      durationMs: 1,
    },
  };
}

function createNativeEntityEnvelope(id?: number) {
  return {
    data: {
      id,
    },
    transport: 'grpc',
    requestedTransport: 'auto',
    degradedFromRequestedTransport: false,
    emulated: false,
    metrics: {
      operation: 'rows.create',
      requestedTransport: 'auto',
      transport: 'grpc',
      degradedFromRequestedTransport: false,
      emulated: false,
      startedAt: Date.now(),
      durationMs: 1,
    },
  };
}

function createMockNativeClient() {
  return {
    sql: {
      query: vi.fn(),
    },
    rows: {
      create: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    indexes: {
      create: vi.fn(),
      warmup: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      list: vi.fn(),
      statuses: vi.fn(),
      rebuild: vi.fn(),
    },
    collections: {
      list: vi.fn(),
      create: vi.fn(),
      describe: vi.fn(),
      drop: vi.fn(),
    },
    system: {
      health: vi.fn(),
      ready: vi.fn(),
      stats: vi.fn(),
    },
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RedDbClient native recker integration', () => {
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

  it('forwards V2 transport tuning into createRedDbClient', async () => {
    const client = new RedDbClient({
      baseUrl: 'http://localhost:8080',
      authToken: 'auth-token',
      writeToken: 'write-token',
      transport: 'auto',
      wireAddress: '127.0.0.1:7001',
      wirePoolSize: 4,
      wireKeepAlive: true,
      wireKeepAliveInitialDelayMs: 15000,
      wireConnectTimeout: 2000,
      grpcAddress: '127.0.0.1:50051',
      grpcKeepalive: { timeMs: 5000, timeoutMs: 2000 },
      operationTimeouts: { sql: 1234, bulk: 5678 },
      ensureIndexes: false,
      logger: silentLogger,
    });

    expect(createRedDbClientMock).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://localhost:8080',
      authToken: 'auth-token',
      writeToken: 'write-token',
      transport: 'auto',
      wireAddress: '127.0.0.1:7001',
      wirePoolSize: 4,
      wireKeepAlive: true,
      wireKeepAliveInitialDelayMs: 15000,
      wireConnectTimeout: 2000,
      grpcAddress: '127.0.0.1:50051',
      grpcKeepalive: { timeMs: 5000, timeoutMs: 2000 },
      operationTimeouts: { sql: 1234, bulk: 5678 },
    }));

    await client.destroy();
    expect(nativeClient.close).toHaveBeenCalledOnce();
  });

  it('uses native rows.create for new objects', async () => {
    nativeClient.sql.query.mockResolvedValueOnce(createNativeQueryEnvelope([]));
    nativeClient.rows.create.mockResolvedValueOnce(createNativeEntityEnvelope(55));

    const client = new RedDbClient({
      baseUrl: 'http://localhost:8080',
      bucket: 'test-bucket',
      collection: 'test-collection',
      ensureIndexes: false,
      logger: silentLogger,
    });

    const result = await client.putObject({
      key: 'users/alice.json',
      body: '{"name":"Alice"}',
      contentType: 'application/json',
      metadata: { role: 'admin' },
    });

    expect(nativeClient.rows.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'test-collection',
      payload: expect.objectContaining({
        fields: expect.objectContaining({
          _key: 'users/alice.json',
          _content_type: 'application/json',
        }),
      }),
    }));
    expect(result.VersionId).toBe('55');

    await client.destroy();
  });

  it('uses native SQL delete for deleteObject', async () => {
    nativeClient.sql.query.mockResolvedValueOnce(createNativeQueryEnvelope([], { affected_rows: 1 }));

    const client = new RedDbClient({
      baseUrl: 'http://localhost:8080',
      bucket: 'test-bucket',
      collection: 'test-collection',
      ensureIndexes: false,
      logger: silentLogger,
    });

    const result = await client.deleteObject('users/alice.json');

    expect(nativeClient.sql.query).toHaveBeenCalledWith(
      expect.stringContaining(`DELETE FROM "test-collection" WHERE _key = 'users/alice.json'`)
    );
    expect(result.VersionId).toBe('');

    await client.destroy();
  });
});
