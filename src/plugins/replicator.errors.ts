import { S3dbError } from '../errors.js';

export interface ReplicationErrorDetails {
  replicatorClass?: string;
  operation?: string;
  resourceName?: string;
  description?: string;
  [key: string]: unknown;
}

export class ReplicationError extends S3dbError {
  constructor(message: string, details: ReplicationErrorDetails = {}) {
    const { replicatorClass = 'unknown', operation = 'unknown', resourceName, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Replication Operation Error

Replicator: ${replicatorClass}
Operation: ${operation}
${resourceName ? `Resource: ${resourceName}` : ''}

Common causes:
1. Invalid replicator configuration
2. Target system not accessible
3. Resource not configured for replication
4. Invalid operation type
5. Transformation function errors

Solution:
Check replicator configuration and ensure target system is accessible.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/replicator.md
`.trim();
    }

    super(message, { ...rest, replicatorClass, operation, resourceName, description });
  }
}

export default ReplicationError;
