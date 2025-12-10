import { S3dbError } from '../errors.js';
export class AuditError extends S3dbError {
    constructor(message, details = {}) {
        const { resourceName, operation = 'unknown', auditId, ...rest } = details;
        let description = details.description;
        if (!description) {
            description = `
Audit Operation Error

Operation: ${operation}
${resourceName ? `Resource: ${resourceName}` : ''}
${auditId ? `Audit ID: ${auditId}` : ''}

Common causes:
1. Audit log storage not accessible
2. Resource not configured for auditing
3. Invalid audit log format
4. Audit query failed
5. Insufficient permissions

Solution:
Check audit plugin configuration and storage accessibility.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/audit.md
`.trim();
        }
        super(message, { ...rest, resourceName, operation, auditId, description });
    }
}
export default AuditError;
//# sourceMappingURL=audit.errors.js.map