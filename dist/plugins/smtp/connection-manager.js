import { ConnectionError, AuthenticationError, SMTPError, RateLimitError } from './errors.js';
export class SMTPConnectionManager {
    mode;
    options;
    _nodemailer;
    _transport;
    _server;
    _isConnected;
    constructor(options = {}) {
        this.mode = options.mode || 'relay';
        this.options = options;
        this._nodemailer = null;
        this._transport = null;
        this._server = null;
        this._isConnected = false;
    }
    async initialize() {
        if (this._isConnected)
            return;
        if (this.mode === 'relay') {
            await this._initializeRelay();
        }
        else if (this.mode === 'server') {
            await this._initializeServer();
        }
        else {
            throw new Error(`Unsupported SMTP mode: ${this.mode}`);
        }
        this._isConnected = true;
    }
    async _initializeRelay() {
        try {
            // @ts-ignore - nodemailer has no type declarations
            const nodemailer = await import('nodemailer');
            this._nodemailer = nodemailer;
            const { host, port = 587, secure = false, auth = {}, pool = {}, maxConnections = 5, maxMessages = 100, rateDelta = 1000, rateLimit = 5, ...otherConfig } = this.options;
            if (!host) {
                throw new Error('SMTP relay requires "host" option');
            }
            if (!auth.user || !auth.pass) {
                throw new AuthenticationError('SMTP relay requires auth.user and auth.pass', {
                    suggestion: 'Provide user and password for SMTP relay'
                });
            }
            this._transport = nodemailer.default.createTransport({
                host,
                port,
                secure,
                auth,
                connectionUrl: null,
                pool: {
                    maxConnections,
                    maxMessages,
                    rateDelta,
                    rateLimit,
                    ...pool
                },
                ...otherConfig
            });
            const verified = await this._transport.verify();
            if (!verified) {
                throw new ConnectionError('Failed to verify SMTP relay connection', {
                    host,
                    port,
                    suggestion: 'Check host, port, and credentials'
                });
            }
        }
        catch (err) {
            if (err instanceof AuthenticationError || err instanceof ConnectionError) {
                throw err;
            }
            throw new ConnectionError(`Failed to initialize SMTP relay: ${err.message}`, {
                originalError: err,
                suggestion: 'Verify SMTP configuration (host, port, auth)'
            });
        }
    }
    async _initializeServer() {
        try {
            const SMTPServer = await import('smtp-server');
            const ServerClass = SMTPServer.SMTPServer;
            const { port = 25, host = '0.0.0.0', secure = false, requireAuth = false, authHandler = null, onMailFrom = null, onRcptTo = null, onData = null, ...otherConfig } = this.options;
            this._server = new ServerClass({
                port,
                host,
                secure,
                allowInsecureAuth: !secure,
                disableReverseLookup: true,
                ...otherConfig,
                onAuth: async (auth, session, callback) => {
                    if (!requireAuth) {
                        return callback(null, { user: 'anonymous' });
                    }
                    if (authHandler) {
                        try {
                            const result = await authHandler(auth, session);
                            return callback(null, result);
                        }
                        catch (err) {
                            return callback(new AuthenticationError(err.message));
                        }
                    }
                    callback(new AuthenticationError('Authentication required'));
                },
                onMailFrom: async (address, session, callback) => {
                    if (onMailFrom) {
                        try {
                            await onMailFrom(address, session);
                        }
                        catch (err) {
                            return callback(err);
                        }
                    }
                    callback();
                },
                onRcptTo: async (address, session, callback) => {
                    if (onRcptTo) {
                        try {
                            await onRcptTo(address, session);
                        }
                        catch (err) {
                            return callback(err);
                        }
                    }
                    callback();
                },
                onData: async (stream, session, callback) => {
                    if (onData) {
                        try {
                            await onData(stream, session);
                        }
                        catch (err) {
                            return callback(err);
                        }
                    }
                    callback();
                }
            });
            await new Promise((resolve, reject) => {
                this._server.listen(port, host, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }
        catch (err) {
            throw new ConnectionError(`Failed to initialize SMTP server: ${err.message}`, {
                originalError: err,
                suggestion: 'Verify port is available and npm package "smtp-server" is installed'
            });
        }
    }
    async sendEmail(message) {
        if (!this._isConnected || !this._transport) {
            throw new ConnectionError('SMTP relay not initialized. Call initialize() first');
        }
        try {
            const info = await this._transport.sendMail(message);
            return {
                messageId: info.messageId,
                response: info.response,
                accepted: info.accepted,
                rejected: info.rejected
            };
        }
        catch (err) {
            const error = err;
            if (error.code === 'EAUTH' || error.responseCode === 535) {
                throw new AuthenticationError(`SMTP authentication failed: ${error.message}`, {
                    originalError: error
                });
            }
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
                throw new ConnectionError(`SMTP connection error: ${error.message}`, {
                    originalError: error,
                    retriable: true
                });
            }
            if (error.responseCode === 429 || error.code === 'RATE_LIMITED') {
                throw new RateLimitError(`SMTP rate limited: ${error.message}`, {
                    originalError: error
                });
            }
            throw new SMTPError(`SMTP sendMail failed: ${error.message}`, {
                originalError: error,
                retriable: true
            });
        }
    }
    async verify() {
        if (this.mode === 'relay') {
            if (!this._transport)
                return false;
            try {
                return await this._transport.verify();
            }
            catch (_err) {
                return false;
            }
        }
        else if (this.mode === 'server') {
            return !!(this._server && this._server.server && !this._server.server.closed);
        }
        return false;
    }
    async close() {
        if (this.mode === 'relay' && this._transport) {
            this._transport.close();
            this._transport = null;
        }
        else if (this.mode === 'server' && this._server) {
            await new Promise((resolve) => {
                this._server.close(() => resolve());
            });
            this._server = null;
        }
        this._isConnected = false;
    }
    getStatus() {
        return {
            mode: this.mode,
            isConnected: this._isConnected,
            transportType: this._transport ? 'nodemailer' : (this._server ? 'smtp-server' : null)
        };
    }
}
//# sourceMappingURL=connection-manager.js.map