import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
export class NetworkMonitor {
    plugin;
    config;
    requests;
    responses;
    sessions;
    cdpSessions;
    constructor(plugin) {
        this.plugin = plugin;
        this.config = plugin.config.networkMonitor;
        this.requests = new Map();
        this.responses = new Map();
        this.sessions = new Map();
        this.cdpSessions = new Map();
    }
    get database() {
        return this.plugin.database;
    }
    get logger() {
        return this.plugin.logger;
    }
    async initialize() {
        if (this.config.persist) {
            await this._setupStorage();
        }
    }
    async _setupStorage() {
        const resourceNames = this.plugin.resourceNames;
        try {
            await this.database.getResource(resourceNames.networkSessions);
        }
        catch {
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
        }
        catch {
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
        }
        catch {
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
    startSession(sessionId) {
        const session = {
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
    async attachToPage(page, sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.startSession(sessionId);
        }
        const session = this.sessions.get(sessionId);
        const requests = this.requests.get(sessionId);
        const responses = this.responses.get(sessionId);
        // Create CDP session for network monitoring
        const cdpSession = await page.target().createCDPSession();
        this.cdpSessions.set(sessionId, cdpSession);
        // Enable network domain
        await cdpSession.send('Network.enable');
        // Request interception
        cdpSession.on('Network.requestWillBeSent', (params) => {
            const p = params;
            const resourceType = p.type;
            // Apply type filter
            if (this.config.filters.types && !this.config.filters.types.includes(resourceType)) {
                return;
            }
            const request = {
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
        cdpSession.on('Network.responseReceived', (params) => {
            const p = params;
            const request = requests.get(p.requestId);
            if (!request)
                return;
            // Apply status filter
            if (this.config.filters.statuses && !this.config.filters.statuses.includes(p.response.status)) {
                return;
            }
            const response = {
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
        cdpSession.on('Network.loadingFinished', async (params) => {
            const p = params;
            const response = responses.get(p.requestId);
            if (!response)
                return;
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
                });
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
                    }
                    else {
                        response.body = typeof body === 'string' ? body : body.toString('base64');
                        response.compressed = false;
                    }
                }
            }
            catch {
                // Body might not be available
            }
        });
        // Loading failed
        cdpSession.on('Network.loadingFailed', (params) => {
            const p = params;
            const request = requests.get(p.requestId);
            session.errorCount++;
            const error = {
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
    async endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        session.endTime = Date.now();
        // Cleanup CDP session
        const cdpSession = this.cdpSessions.get(sessionId);
        if (cdpSession) {
            try {
                await cdpSession.send('Network.disable');
            }
            catch {
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
    async _persistSession(sessionId) {
        const session = this.sessions.get(sessionId);
        const requests = this.requests.get(sessionId);
        const responses = this.responses.get(sessionId);
        if (!session || !requests || !responses)
            return;
        const resourceNames = this.plugin.resourceNames;
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
    getSessionStats(sessionId) {
        const session = this.sessions.get(sessionId);
        const requests = this.requests.get(sessionId);
        const responses = this.responses.get(sessionId);
        if (!session || !requests || !responses)
            return null;
        const byType = {};
        const byStatus = {};
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
    async decompressBody(compressedBody) {
        const buffer = Buffer.from(compressedBody, 'base64');
        const decompressed = await gunzipAsync(buffer);
        return decompressed.toString('utf8');
    }
    clearSession(sessionId) {
        this.sessions.delete(sessionId);
        this.requests.delete(sessionId);
        this.responses.delete(sessionId);
        this.cdpSessions.delete(sessionId);
    }
}
export default NetworkMonitor;
//# sourceMappingURL=network-monitor.js.map