import type { PuppeteerPlugin } from '../puppeteer.plugin.js';

export interface ConsoleMonitorConfig {
  enabled: boolean;
  persist: boolean;
  filters: {
    levels: string[] | null;
    excludePatterns: RegExp[];
    includeStackTraces: boolean;
    includeSourceLocation: boolean;
    captureNetwork: boolean;
  };
}

export interface ConsoleMessage {
  level: string;
  text: string;
  timestamp: number;
  url?: string;
  location?: {
    url: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  stackTrace?: string[];
}

export interface ConsoleSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  messageCount: number;
  errorCount: number;
  warningCount: number;
}

export interface ConsoleStats {
  totalMessages: number;
  byLevel: Record<string, number>;
  errorsCount: number;
  warningsCount: number;
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

interface ConsoleMessageHandle {
  type(): string;
  text(): string;
  location(): { url: string; lineNumber?: number; columnNumber?: number };
  stackTrace?(): Array<{ url: string; lineNumber?: number; columnNumber?: number }>;
}

interface PageErrorEvent extends Error {
  message: string;
  stack?: string;
}

interface Page {
  on(event: 'console', handler: (msg: ConsoleMessageHandle) => void): void;
  on(event: 'pageerror', handler: (error: PageErrorEvent) => void): void;
  url(): string;
}

export class ConsoleMonitor {
  plugin: PuppeteerPlugin;
  config: ConsoleMonitorConfig;
  messages: Map<string, ConsoleMessage[]>;
  sessions: Map<string, ConsoleSession>;
  storage: Resource | null;

  constructor(plugin: PuppeteerPlugin) {
    this.plugin = plugin;
    this.config = (plugin.config as unknown as { consoleMonitor: ConsoleMonitorConfig }).consoleMonitor;

    this.messages = new Map();
    this.sessions = new Map();
    this.storage = null;
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
    const resourceNames = (this.plugin as unknown as { resourceNames: { consoleSessions: string; consoleMessages: string; consoleErrors: string } }).resourceNames;

    try {
      await this.database.getResource(resourceNames.consoleSessions);
    } catch {
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
    } catch {
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
    } catch {
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

  startSession(sessionId: string): ConsoleSession {
    const session: ConsoleSession = {
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

  attachToPage(page: Page, sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      this.startSession(sessionId);
    }

    const session = this.sessions.get(sessionId)!;
    const messages = this.messages.get(sessionId)!;

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

      const message: ConsoleMessage = {
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
          message.stackTrace = stackTrace.map(frame =>
            `${frame.url}:${frame.lineNumber}:${frame.columnNumber}`
          );
        }
      }

      messages.push(message);
      session.messageCount++;

      if (level === 'error') {
        session.errorCount++;
      } else if (level === 'warning') {
        session.warningCount++;
      }

      this.plugin.emit('consoleMonitor.message', {
        sessionId,
        level,
        text
      });
    });

    page.on('pageerror', (error) => {
      const errorMessage: ConsoleMessage = {
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

  async endSession(sessionId: string): Promise<ConsoleSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

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

  private async _persistSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    const messages = this.messages.get(sessionId);

    if (!session || !messages) return;

    const resourceNames = (this.plugin as unknown as { resourceNames: { consoleSessions: string; consoleMessages: string; consoleErrors: string } }).resourceNames;

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

  getSessionMessages(sessionId: string): ConsoleMessage[] {
    return this.messages.get(sessionId) || [];
  }

  getSessionStats(sessionId: string): ConsoleStats | null {
    const session = this.sessions.get(sessionId);
    const messages = this.messages.get(sessionId);

    if (!session || !messages) return null;

    const byLevel: Record<string, number> = {};
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

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.messages.delete(sessionId);
  }
}

export default ConsoleMonitor;
