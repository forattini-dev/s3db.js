import { S3dbError } from '../errors.js';

export interface BackupErrorDetails {
  driver?: string;
  operation?: string;
  backupId?: string;
  description?: string;
  [key: string]: unknown;
}

export class BackupError extends S3dbError {
  constructor(message: string, details: BackupErrorDetails = {}) {
    const { driver = 'unknown', operation = 'unknown', backupId, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Backup Operation Error

Driver: ${driver}
Operation: ${operation}
${backupId ? `Backup ID: ${backupId}` : ''}

Common causes:
1. Invalid backup driver configuration
2. Destination storage not accessible
3. Insufficient permissions
4. Network connectivity issues
5. Invalid backup file format

Solution:
Check driver configuration and ensure destination storage is accessible.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/backup.md
`.trim();
    }

    super(message, { ...rest, driver, operation, backupId, description });
  }
}

export default BackupError;
