/**
 * Custom errors for CookieFarmPlugin
 */

export class CookieFarmError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CookieFarmError';
    this.code = code;
    this.details = details;
  }
}

export class PersonaNotFoundError extends CookieFarmError {
  constructor(personaId) {
    super(
      `Persona not found: ${personaId}`,
      'PERSONA_NOT_FOUND',
      { personaId }
    );
    this.name = 'PersonaNotFoundError';
  }
}

export class WarmupError extends CookieFarmError {
  constructor(message, details = {}) {
    super(message, 'WARMUP_ERROR', details);
    this.name = 'WarmupError';
  }
}

export class GenerationError extends CookieFarmError {
  constructor(message, details = {}) {
    super(message, 'GENERATION_ERROR', details);
    this.name = 'GenerationError';
  }
}

export class QualityCalculationError extends CookieFarmError {
  constructor(message, details = {}) {
    super(message, 'QUALITY_CALCULATION_ERROR', details);
    this.name = 'QualityCalculationError';
  }
}
