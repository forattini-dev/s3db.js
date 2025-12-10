import { PluginError } from '../errors.js';

export interface CookieFarmErrorDetails {
  pluginName?: string;
  operation?: string;
  statusCode?: number;
  retriable?: boolean;
  suggestion?: string;
  code?: string;
  personaId?: string;
  docs?: string;
  [key: string]: unknown;
}

export class CookieFarmError extends PluginError {
  constructor(message: string, details: CookieFarmErrorDetails = {}) {
    const merged = {
      pluginName: details.pluginName || 'CookieFarmPlugin',
      operation: details.operation || 'unknown',
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Check CookieFarmPlugin configuration and persona storage before retrying.',
      ...details
    };
    super(message, merged);
  }
}

export class PersonaNotFoundError extends CookieFarmError {
  constructor(personaId: string, details: CookieFarmErrorDetails = {}) {
    super(`Persona not found: ${personaId}`, {
      code: 'PERSONA_NOT_FOUND',
      personaId,
      statusCode: 404,
      retriable: false,
      suggestion: 'Ensure the persona exists or create it before running CookieFarm operations.',
      docs: details.docs || 'https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/cookie-farm.md',
      ...details
    });
    this.name = 'PersonaNotFoundError';
  }
}

export class WarmupError extends CookieFarmError {
  constructor(message: string, details: CookieFarmErrorDetails = {}) {
    super(message, {
      code: 'WARMUP_ERROR',
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? true,
      suggestion: details.suggestion ?? 'Inspect warmup logs and retry; ensure upstream services are reachable.',
      ...details
    });
    this.name = 'WarmupError';
  }
}

export class GenerationError extends CookieFarmError {
  constructor(message: string, details: CookieFarmErrorDetails = {}) {
    super(message, {
      code: 'GENERATION_ERROR',
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Review persona generation inputs and plugin configuration before retrying.',
      ...details
    });
    this.name = 'GenerationError';
  }
}

export class QualityCalculationError extends CookieFarmError {
  constructor(message: string, details: CookieFarmErrorDetails = {}) {
    super(message, {
      code: 'QUALITY_CALCULATION_ERROR',
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Verify quality metrics configuration and input scores.',
      ...details
    });
    this.name = 'QualityCalculationError';
  }
}
