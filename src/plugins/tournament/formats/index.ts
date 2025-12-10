import { BaseFormat } from './base-format.js';
import type { FormatConfig } from '../types.js';

type FormatConstructor = typeof BaseFormat & {
  type: string;
  displayName: string;
  defaultConfig: FormatConfig;
  new (config: FormatConfig): BaseFormat;
};

const formatRegistry = new Map<string, FormatConstructor>();

export function registerFormat(FormatClass: FormatConstructor): void {
  if (!FormatClass.type) {
    throw new Error('Format class must have a static type property');
  }
  formatRegistry.set(FormatClass.type, FormatClass);
}

export function getFormatClass(type: string): FormatConstructor | undefined {
  return formatRegistry.get(type);
}

export function createFormat(type: string, config: FormatConfig = {}): BaseFormat {
  const FormatClass = formatRegistry.get(type);
  if (!FormatClass) {
    throw new Error(`Unknown tournament format: ${type}. Available: ${getAvailableFormats().join(', ')}`);
  }
  const mergedConfig = { ...FormatClass.defaultConfig, ...config };
  return new (FormatClass as any)(mergedConfig) as BaseFormat;
}

export function getAvailableFormats(): string[] {
  return Array.from(formatRegistry.keys());
}

export function getFormatMetadata(): { type: string; displayName: string; defaultConfig: FormatConfig }[] {
  return Array.from(formatRegistry.entries()).map(([type, FormatClass]) => ({
    type,
    displayName: FormatClass.displayName,
    defaultConfig: FormatClass.defaultConfig
  }));
}

export { BaseFormat };

import { RoundRobinFormat } from './round-robin.js';
import { SingleEliminationFormat } from './single-elimination.js';
import { DoubleEliminationFormat } from './double-elimination.js';
import { SwissFormat } from './swiss.js';
import { GroupStageFormat } from './group-stage.js';
import { LeaguePlayoffsFormat } from './league-playoffs.js';
import { LadderFormat } from './ladder.js';
import { CircuitFormat } from './circuit.js';
import { PromotionRelegationFormat } from './promotion-relegation.js';

registerFormat(RoundRobinFormat as unknown as FormatConstructor);
registerFormat(SingleEliminationFormat as unknown as FormatConstructor);
registerFormat(DoubleEliminationFormat as unknown as FormatConstructor);
registerFormat(SwissFormat as unknown as FormatConstructor);
registerFormat(GroupStageFormat as unknown as FormatConstructor);
registerFormat(LeaguePlayoffsFormat as unknown as FormatConstructor);
registerFormat(LadderFormat as unknown as FormatConstructor);
registerFormat(CircuitFormat as unknown as FormatConstructor);
registerFormat(PromotionRelegationFormat as unknown as FormatConstructor);

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
