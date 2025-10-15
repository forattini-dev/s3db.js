import { S3dbError } from '../errors.js';

/**
 * FulltextError - Errors related to fulltext search operations
 *
 * Used for fulltext search operations including:
 * - Index creation and updates
 * - Search query execution
 * - Index configuration
 * - Text analysis and tokenization
 * - Search result ranking
 *
 * @extends S3dbError
 */
export class FulltextError extends S3dbError {
  constructor(message, details = {}) {
    const { resourceName, query, operation = 'unknown', ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Fulltext Search Operation Error

Operation: ${operation}
${resourceName ? `Resource: ${resourceName}` : ''}
${query ? `Query: ${query}` : ''}

Common causes:
1. Resource not indexed for fulltext search
2. Invalid query syntax
3. Index not built yet
4. Search configuration missing
5. Field not indexed

Solution:
Ensure resource is configured for fulltext search and index is built.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/fulltext.md
`.trim();
    }

    super(message, { ...rest, resourceName, query, operation, description,
      suggestion: details.suggestion || 'Check fulltext configuration and ensure resource is indexed.' });
  }
}

export default FulltextError;
