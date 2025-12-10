export class ConsoleMonitor {
    plugin;
    config;
    messages;
    sessions;
    storage;
    constructor(plugin) {
        this.plugin = plugin;
        this.config = plugin.config.consoleMonitor;
        this.messages = new Map();
        this.sessions = new Map();
        this.storage = null;
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
            await this.database.getResource(resourceNames.consoleSessions);
        }
        catch {
            await this.database.createResource({
                name: resourceNames.consoleSessions,
                attributes: {
                    sessionId: 'string|required',
                    startTime: 'number|required',
                    endTime: 'number',
                    messageCount: 'number',
                    errorCount: 'number',
                    warningCount: 'number'
                },
                timestamps: true,
                behavior: 'body-only'
            });
        }
        try {
            await this.database.getResource(resourceNames.consoleMessages);
        }
        catch {
            await this.database.createResource({
                name: resourceNames.consoleMessages,
                attributes: {
                    sessionId: 'string|required',
                    level: 'string|required',
                    text: 'string|required',
                    timestamp: 'number|required',
                    url: 'string',
                    location: 'object',
                    stackTrace: 'array'
                },
                timestamps: true,
                behavior: 'body-only',
                partitions: {
                    bySession: { fields: { sessionId: 'string' } },
                    byLevel: { fields: { level: 'string' } }
                }
            });
        }
        try {
            await this.database.getResource(resourceNames.consoleErrors);
        }
        catch {
            await this.database.createResource({
                name: resourceNames.consoleErrors,
                attributes: {
                    sessionId: 'string|required',
                    message: 'string|required',
                    stack: 'string',
                    timestamp: 'number|required',
                    url: 'string'
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
            messageCount: 0,
            errorCount: 0,
            warningCount: 0
        };
        this.sessions.set(sessionId, session);
        this.messages.set(sessionId, []);
        this.plugin.emit('consoleMonitor.sessionStarted', { sessionId });
        return session;
    }
    attachToPage(page, sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.startSession(sessionId);
        }
        const session = this.sessions.get(sessionId);
        const messages = this.messages.get(sessionId);
        page.on('console', (msg) => {
            const level = msg.type();
            // Apply level filter
            if (this.config.filters.levels && !this.config.filters.levels.includes(level)) {
                return;
            }
            const text = msg.text();
            // Apply exclude patterns
            for (const pattern of this.config.filters.excludePatterns || []) {
                if (pattern.test(text)) {
                    return;
                }
            }
            const message = {
                level,
                text,
                timestamp: Date.now(),
                url: page.url()
            };
            if (this.config.filters.includeSourceLocation) {
                const location = msg.location();
                if (location) {
                    message.location = {
                        url: location.url,
                        lineNumber: location.lineNumber,
                        columnNumber: location.columnNumber
                    };
                }
            }
            if (this.config.filters.includeStackTraces && msg.stackTrace) {
                const stackTrace = msg.stackTrace();
                if (stackTrace && stackTrace.length > 0) {
                    message.stackTrace = stackTrace.map(frame => `${frame.url}:${frame.lineNumber}:${frame.columnNumber}`);
                }
            }
            messages.push(message);
            session.messageCount++;
            if (level === 'error') {
                session.errorCount++;
            }
            else if (level === 'warning') {
                session.warningCount++;
            }
            this.plugin.emit('consoleMonitor.message', {
                sessionId,
                level,
                text
            });
        });
        page.on('pageerror', (error) => {
            const errorMessage = {
                level: 'pageerror',
                text: error.message,
                timestamp: Date.now(),
                url: page.url()
            };
            if (error.stack) {
                errorMessage.stackTrace = error.stack.split('\n');
            }
            messages.push(errorMessage);
            session.errorCount++;
            this.plugin.emit('consoleMonitor.pageError', {
                sessionId,
                message: error.message
            });
        });
    }
    async endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        session.endTime = Date.now();
        if (this.config.persist) {
            await this._persistSession(sessionId);
        }
        this.plugin.emit('consoleMonitor.sessionEnded', {
            sessionId,
            messageCount: session.messageCount,
            errorCount: session.errorCount
        });
        return session;
    }
    async _persistSession(sessionId) {
        const session = this.sessions.get(sessionId);
        const messages = this.messages.get(sessionId);
        if (!session || !messages)
            return;
        const resourceNames = this.plugin.resourceNames;
        // Persist session
        const sessionsResource = this.database.resources[resourceNames.consoleSessions];
        if (sessionsResource) {
            await sessionsResource.insert({
                sessionId: session.sessionId,
                startTime: session.startTime,
                endTime: session.endTime,
                messageCount: session.messageCount,
                errorCount: session.errorCount,
                warningCount: session.warningCount
            });
        }
        // Persist messages
        const messagesResource = this.database.resources[resourceNames.consoleMessages];
        if (messagesResource) {
            for (const message of messages) {
                await messagesResource.insert({
                    sessionId,
                    level: message.level,
                    text: message.text,
                    timestamp: message.timestamp,
                    url: message.url,
                    location: message.location,
                    stackTrace: message.stackTrace
                });
            }
        }
    }
    getSessionMessages(sessionId) {
        return this.messages.get(sessionId) || [];
    }
    getSessionStats(sessionId) {
        const session = this.sessions.get(sessionId);
        const messages = this.messages.get(sessionId);
        if (!session || !messages)
            return null;
        const byLevel = {};
        for (const message of messages) {
            byLevel[message.level] = (byLevel[message.level] || 0) + 1;
        }
        return {
            totalMessages: session.messageCount,
            byLevel,
            errorsCount: session.errorCount,
            warningsCount: session.warningCount
        };
    }
    clearSession(sessionId) {
        this.sessions.delete(sessionId);
        this.messages.delete(sessionId);
    }
}
export default ConsoleMonitor;
//# sourceMappingURL=console-monitor.js.map