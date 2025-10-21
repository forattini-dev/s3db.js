/**
 * Middlewares - Export all API middlewares
 */

export { createValidationMiddleware, createQueryValidation, listQueryValidation } from './validator.js';

// Note: CORS, Rate Limiting, Logging, and Compression middlewares
// are currently implemented in api.plugin.js as inline functions.
// They can be extracted to separate files if needed for better organization.

export default {
  createValidationMiddleware,
  createQueryValidation,
  listQueryValidation
};
