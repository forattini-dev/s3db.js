import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import type { PuppeteerPlugin } from '../puppeteer.plugin.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface NetworkMonitorConfig {
  enabled: boolean;
  persist: boolean;
  filters: {
    types: string[] | null;
    statuses: number[] | null;
    minSize: number | null;
    maxSize: number | null;
    saveErrors: boolean;
    saveLargeAssets: boolean;
  };
  compression: {
    enabled: boolean;
    threshold: number;
  };
}

export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  postData?: string;
}

export interface NetworkResponse {
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  timestamp: number;
  responseTime: number;
  size?: number;
  body?: string | Buffer;
  compressed?: boolean;
}

export interface NetworkError {
  requestId: string;
  url: string;
  errorText: string;
  timestamp: number;
}

export interface NetworkSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  requestCount: number;
  errorCount: number;
  totalSize: number;
}

export interface NetworkStats {
  totalRequests: number;
  totalSize: number;
  byType: Record<string, { count: number; size: number }>;
  byStatus: Record<string, number>;
  errorCount: number;
  avgResponseTime: number;
}

interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

interface Database {
  createResource(config: Record<string, unknown>): Promise<unknown>;
  getResource(name: string): Promise<Resource>;
  resources: Record<string, Resource>;
}

interface Resource {
  name: string;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  list(options: { limit: number }): Promise<Record<string, unknown>[]>;
}

interface CDPSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, handler: (params: unknown) => void): void;
}

interface Page {
  url(): string;
  target(): { createCDPSession(): Promise<CDPSession> };
}

interface RequestWillBeSentParams {
  requestId: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
  };
  type: string;
  timestamp: number;
}

interface ResponseReceivedParams {
  requestId: string;
  response: {
    url: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
  };
  timestamp: number;
}

interface LoadingFinishedParams {
  requestId: string;
  timestamp: number;
  encodedDataLength: number;
}

interface LoadingFailedParams {
  requestId: string;
  timestamp: number;
  errorText: string;
}

export class NetworkMonitor {
  plugin: PuppeteerPlugin;
  config: NetworkMonitorConfig;
  requests: Map<string, Map<string, NetworkRequest>>;
  responses: Map<string, Map<string, NetworkResponse>>;
  sessions: Map<string, NetworkSession>;
  cdpSessions: Map<string, CDPSession>;

  constructor(plugin: PuppeteerPlugin) {
    this.plugin = plugin;
    this.config = (plugin.config as { networkMonitor: NetworkMonitorConfig }).networkMonitor;

    this.requests = new Map();
    this.responses = new Map();
    this.sessions = new Map();
    this.cdpSessions = new Map();
  }

  get database(): Database {
    return this.plugin.database as unknown as Database;
  }

  get logger(): Logger {
    return this.plugin.logger as Logger;
  }

  async initialize(): Promise<void> {
    if (this.config.persist) {
      await this._setupStorage();
    }
  }

  private async _setupStorage(): Promise<void> {
    const resourceNames = (this.plugin as unknown as { resourceNames: { networkSessions: string; networkRequests: string; networkErrors: string } }).resourceNames;

    try {
      await this.database.getResource(resourceNames.networkSessions);
    } catch {
      await this.database.createResource({
        name: resourceNames.networkSessions,
        attributes: {
          sessionId: 'string|required',
          startTime: 'number|required',
          endTime: 'number',
          requestCount: 'number',
          errorCount: 'number',
          totalSize: 'number'
        },
        timestamps: true,
        behavior: 'body-only'
      });
    }

    try {
      await this.database.getResource(resourceNames.networkRequests);
    } catch {
      await this.database.createResource({
        name: resourceNames.networkRequests,
        attributes: {
          sessionId: 'string|required',
          requestId: 'string|required',
          url: 'string|required',
          method: 'string|required',
          resourceType: 'string',
          status: 'number',
          statusText: 'string',
          mimeType: 'string',
          requestTimestamp: 'number',
          responseTimestamp: 'number',
          responseTime: 'number',
          size: 'number',
          requestHeaders: 'object',
          responseHeaders: 'object',
          body: 'string',
          compressed: 'boolean'
        },
        timestamps: true,
        behavior: 'body-only',
        partitions: {
          bySession: { fields: { sessionId: 'string' } },
          byType: { fields: { resourceType: 'string' } },
          byStatus: { fields: { status: 'number' } }
        }
      });
    }

    try {
      await this.database.getResource(resourceNames.networkErrors);
    } catch {
      await this.database.createResource({
        name: resourceNames.networkErrors,
        attributes: {
          sessionId: 'string|required',
          requestId: 'string|required',
          url: 'string|required',
          errorText: 'string|required',
          timestamp: 'number|required'
        },
        timestamps: true,
        behavior: 'body-only',
        partitions: {
          bySession: { fields: { sessionId: 'string' } }
        }
      });
    }
  }

  startSession(sessionId: string): NetworkSession {
    const session: NetworkSession = {
      sessionId,
      startTime: Date.now(),
      requestCount: 0,
      errorCount: 0,
      totalSize: 0
    };

    this.sessions.set(sessionId, session);
    this.requests.set(sessionId, new Map());
    this.responses.set(sessionId, new Map());

    this.plugin.emit('networkMonitor.sessionStarted', { sessionId });

    return session;
  }

  async attachToPage(page: Page, sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.startSession(sessionId);
    }

    const session = this.sessions.get(sessionId)!;
    const requests = this.requests.get(sessionId)!;
    const responses = this.responses.get(sessionId)!;

    // Create CDP session for network monitoring
    const cdpSession = await page.target().createCDPSession();
    this.cdpSessions.set(sessionId, cdpSession);

    // Enable network domain
    await cdpSession.send('Network.enable');

    // Request interception
    cdpSession.on('Network.requestWillBeSent', (params: unknown) => {
      const p = params as RequestWillBeSentParams;
      const resourceType = p.type;

      // Apply type filter
      if (this.config.filters.types && !this.config.filters.types.includes(resourceType)) {
        return;
      }

      const request: NetworkRequest = {
        requestId: p.requestId,
        url: p.request.url,
        method: p.request.method,
        resourceType,
        timestamp: p.timestamp * 1000,
        requestHeaders: p.request.headers,
        postData: p.request.postData
      };

      requests.set(p.requestId, request);
      session.requestCount++;

      this.plugin.emit('networkMonitor.request', {
        sessionId,
        url: request.url,
        method: request.method,
        type: resourceType
      });
    });

    // Response received
    cdpSession.on('Network.responseReceived', (params: unknown) => {
      const p = params as ResponseReceivedParams;
      const request = requests.get(p.requestId);
      if (!request) return;

      // Apply status filter
      if (this.config.filters.statuses && !this.config.filters.statuses.includes(p.response.status)) {
        return;
      }

      const response: NetworkResponse = {
        requestId: p.requestId,
        url: p.response.url,
        status: p.response.status,
        statusText: p.response.statusText,
        headers: p.response.headers,
        mimeType: p.response.mimeType,
        timestamp: p.timestamp * 1000,
        responseTime: (p.timestamp * 1000) - request.timestamp
      };

      responses.set(p.requestId, response);

      this.plugin.emit('networkMonitor.response', {
        sessionId,
        url: response.url,
        status: response.status,
        responseTime: response.responseTime
      });
    });

    // Loading finished
    cdpSession.on('Network.loadingFinished', async (params: unknown) => {
      const p = params as LoadingFinishedParams;
      const response = responses.get(p.requestId);
      if (!response) return;

      response.size = p.encodedDataLength;
      session.totalSize += p.encodedDataLength;

      // Apply size filters
      if (this.config.filters.minSize && p.encodedDataLength < this.config.filters.minSize) {
        return;
      }
      if (this.config.filters.maxSize && p.encodedDataLength > this.config.filters.maxSize) {
        // But save large assets if configured
        if (!this.config.filters.saveLargeAssets) {
          return;
        }
      }

      // Optionally get response body
      try {
        const bodyResult = await cdpSession.send('Network.getResponseBody', {
          requestId: p.requestId
        }) as { body: string; base64Encoded: boolean };

        if (bodyResult.body) {
          const body = bodyResult.base64Encoded
            ? Buffer.from(bodyResult.body, 'base64')
            : bodyResult.body;

          // Compress if enabled and above threshold
          if (this.config.compression.enabled &&
              typeof body === 'string' &&
              body.length > this.config.compression.threshold) {
            response.body = (await gzipAsync(Buffer.from(body))).toString('base64');
            response.compressed = true;
          } else {
            response.body = typeof body === 'string' ? body : body.toString('base64');
            response.compressed = false;
          }
        }
      } catch {
        // Body might not be available
      }
    });

    // Loading failed
    cdpSession.on('Network.loadingFailed', (params: unknown) => {
      const p = params as LoadingFailedParams;
      const request = requests.get(p.requestId);

      session.errorCount++;

      const error: NetworkError = {
        requestId: p.requestId,
        url: request?.url || 'unknown',
        errorText: p.errorText,
        timestamp: p.timestamp * 1000
      };

      this.plugin.emit('networkMonitor.error', {
        sessionId,
        url: error.url,
        error: error.errorText
      });
    });
  }

  async endSession(sessionId: string): Promise<NetworkSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.endTime = Date.now();

    // Cleanup CDP session
    const cdpSession = this.cdpSessions.get(sessionId);
    if (cdpSession) {
      try {
        await cdpSession.send('Network.disable');
      } catch {
        // Ignore cleanup errors
      }
      this.cdpSessions.delete(sessionId);
    }

    if (this.config.persist) {
      await this._persistSession(sessionId);
    }

    this.plugin.emit('networkMonitor.sessionEnded', {
      sessionId,
      requestCount: session.requestCount,
      errorCount: session.errorCount,
      totalSize: session.totalSize
    });

    return session;
  }

  private async _persistSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    const requests = this.requests.get(sessionId);
    const responses = this.responses.get(sessionId);

    if (!session || !requests || !responses) return;

    const resourceNames = (this.plugin as unknown as { resourceNames: { networkSessions: string; networkRequests: string } }).resourceNames;

    // Persist session
    const sessionsResource = this.database.resources[resourceNames.networkSessions];
    if (sessionsResource) {
      await sessionsResource.insert({
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        requestCount: session.requestCount,
        errorCount: session.errorCount,
        totalSize: session.totalSize
      });
    }

    // Persist requests with responses
    const requestsResource = this.database.resources[resourceNames.networkRequests];
    if (requestsResource) {
      for (const [requestId, request] of requests) {
        const response = responses.get(requestId);

        await requestsResource.insert({
          sessionId,
          requestId,
          url: request.url,
          method: request.method,
          resourceType: request.resourceType,
          status: response?.status,
          statusText: response?.statusText,
          mimeType: response?.mimeType,
          requestTimestamp: request.timestamp,
          responseTimestamp: response?.timestamp,
          responseTime: response?.responseTime,
          size: response?.size,
          requestHeaders: request.requestHeaders,
          responseHeaders: response?.headers,
          body: response?.body,
          compressed: response?.compressed
        });
      }
    }
  }

  getSessionStats(sessionId: string): NetworkStats | null {
    const session = this.sessions.get(sessionId);
    const requests = this.requests.get(sessionId);
    const responses = this.responses.get(sessionId);

    if (!session || !requests || !responses) return null;

    const byType: Record<string, { count: number; size: number }> = {};
    const byStatus: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseCount = 0;

    for (const [requestId, request] of requests) {
      const response = responses.get(requestId);

      // By type
      const type = request.resourceType || 'unknown';
      if (!byType[type]) {
        byType[type] = { count: 0, size: 0 };
      }
      byType[type].count++;
      byType[type].size += response?.size || 0;

      // By status
      if (response) {
        const status = String(response.status);
        byStatus[status] = (byStatus[status] || 0) + 1;

        totalResponseTime += response.responseTime;
        responseCount++;
      }
    }

    return {
      totalRequests: session.requestCount,
      totalSize: session.totalSize,
      byType,
      byStatus,
      errorCount: session.errorCount,
      avgResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0
    };
  }

  async decompressBody(compressedBody: string): Promise<string> {
    const buffer = Buffer.from(compressedBody, 'base64');
    const decompressed = await gunzipAsync(buffer);
    return decompressed.toString('utf8');
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.requests.delete(sessionId);
    this.responses.delete(sessionId);
    this.cdpSessions.delete(sessionId);
  }
}

export default NetworkMonitor;
