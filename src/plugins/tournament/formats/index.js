/**
 * Tournament Format Registry
 * Central registry for all tournament format implementations
 */
import { BaseFormat } from './base-format.js';

const formatRegistry = new Map();

/**
 * Register a format class
 * @param {typeof BaseFormat} FormatClass - Format class to register
 */
export function registerFormat(FormatClass) {
  if (!FormatClass.type) {
    throw new Error('Format class must have a static type property');
  }
  formatRegistry.set(FormatClass.type, FormatClass);
}

/**
 * Get a format class by type
 * @param {string} type - Format type identifier
 * @returns {typeof BaseFormat|undefined}
 */
export function getFormatClass(type) {
  return formatRegistry.get(type);
}

/**
 * Create a format instance
 * @param {string} type - Format type identifier
 * @param {Object} config - Format configuration
 * @returns {BaseFormat}
 */
export function createFormat(type, config = {}) {
  const FormatClass = formatRegistry.get(type);
  if (!FormatClass) {
    throw new Error(`Unknown tournament format: ${type}. Available: ${getAvailableFormats().join(', ')}`);
  }
  const mergedConfig = { ...FormatClass.defaultConfig, ...config };
  return new FormatClass(mergedConfig);
}

/**
 * Get list of available format types
 * @returns {string[]}
 */
export function getAvailableFormats() {
  return Array.from(formatRegistry.keys());
}

/**
 * Get format metadata for all formats
 * @returns {Array<{ type: string, displayName: string, defaultConfig: Object }>}
 */
export function getFormatMetadata() {
  return Array.from(formatRegistry.entries()).map(([type, FormatClass]) => ({
    type,
    displayName: FormatClass.displayName,
    defaultConfig: FormatClass.defaultConfig
  }));
}

// Re-export base class
export { BaseFormat };

// Import and register all formats
import { RoundRobinFormat } from './round-robin.js';
import { SingleEliminationFormat } from './single-elimination.js';
import { DoubleEliminationFormat } from './double-elimination.js';
import { SwissFormat } from './swiss.js';
import { GroupStageFormat } from './group-stage.js';
import { LeaguePlayoffsFormat } from './league-playoffs.js';
import { LadderFormat } from './ladder.js';
import { CircuitFormat } from './circuit.js';
import { PromotionRelegationFormat } from './promotion-relegation.js';

registerFormat(RoundRobinFormat);
registerFormat(SingleEliminationFormat);
registerFormat(DoubleEliminationFormat);
registerFormat(SwissFormat);
registerFormat(GroupStageFormat);
registerFormat(LeaguePlayoffsFormat);
registerFormat(LadderFormat);
registerFormat(CircuitFormat);
registerFormat(PromotionRelegationFormat);

export {
  RoundRobinFormat,
  SingleEliminationFormat,
  DoubleEliminationFormat,
  SwissFormat,
  GroupStageFormat,
  LeaguePlayoffsFormat,
  LadderFormat,
  CircuitFormat,
  PromotionRelegationFormat
};
