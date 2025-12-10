import { BackupError } from '../backup.errors.js';
import { createLogger } from '../../concerns/logger.js';
export default class BaseBackupDriver {
    config;
    logger;
    database;
    constructor(config = {}) {
        this.config = {
            compression: 'gzip',
            encryption: null,
            logLevel: 'info',
            ...config
        };
        this.logger = createLogger({
            name: 'BackupDriver',
            level: this.config.logLevel
        });
    }
    async setup(database) {
        this.database = database;
        await this.onSetup();
    }
    async onSetup() {
        // Override in subclasses
    }
    async upload(_filePath, backupId, _manifest) {
        throw new BackupError('upload() method must be implemented by subclass', {
            operation: 'upload',
            driver: this.constructor.name,
            backupId,
            suggestion: 'Extend BaseBackupDriver and implement the upload() method'
        });
    }
    async download(backupId, _targetPath, _metadata) {
        throw new BackupError('download() method must be implemented by subclass', {
            operation: 'download',
            driver: this.constructor.name,
            backupId,
            suggestion: 'Extend BaseBackupDriver and implement the download() method'
        });
    }
    async delete(backupId, _metadata) {
        throw new BackupError('delete() method must be implemented by subclass', {
            operation: 'delete',
            driver: this.constructor.name,
            backupId,
            suggestion: 'Extend BaseBackupDriver and implement the delete() method'
        });
    }
    async list(_options = {}) {
        throw new BackupError('list() method must be implemented by subclass', {
            operation: 'list',
            driver: this.constructor.name,
            suggestion: 'Extend BaseBackupDriver and implement the list() method'
        });
    }
    async verify(backupId, _expectedChecksum, _metadata) {
        throw new BackupError('verify() method must be implemented by subclass', {
            operation: 'verify',
            driver: this.constructor.name,
            backupId,
            suggestion: 'Extend BaseBackupDriver and implement the verify() method'
        });
    }
    getType() {
        throw new BackupError('getType() method must be implemented by subclass', {
            operation: 'getType',
            driver: this.constructor.name,
            suggestion: 'Extend BaseBackupDriver and implement the getType() method'
        });
    }
    getStorageInfo() {
        return {
            type: this.getType(),
            config: this.config
        };
    }
    async cleanup() {
        // Override in subclasses if needed
    }
    log(message) {
        if (this.config.logLevel) {
            this.logger.info(`[${this.getType()}BackupDriver] ${message}`);
        }
    }
}
//# sourceMappingURL=base-backup-driver.class.js.map