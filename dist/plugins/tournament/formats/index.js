import { BaseFormat } from './base-format.js';
const formatRegistry = new Map();
export function registerFormat(FormatClass) {
    if (!FormatClass.type) {
        throw new Error('Format class must have a static type property');
    }
    formatRegistry.set(FormatClass.type, FormatClass);
}
export function getFormatClass(type) {
    return formatRegistry.get(type);
}
export function createFormat(type, config = {}) {
    const FormatClass = formatRegistry.get(type);
    if (!FormatClass) {
        throw new Error(`Unknown tournament format: ${type}. Available: ${getAvailableFormats().join(', ')}`);
    }
    const mergedConfig = { ...FormatClass.defaultConfig, ...config };
    return new FormatClass(mergedConfig);
}
export function getAvailableFormats() {
    return Array.from(formatRegistry.keys());
}
export function getFormatMetadata() {
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
registerFormat(RoundRobinFormat);
registerFormat(SingleEliminationFormat);
registerFormat(DoubleEliminationFormat);
registerFormat(SwissFormat);
registerFormat(GroupStageFormat);
registerFormat(LeaguePlayoffsFormat);
registerFormat(LadderFormat);
registerFormat(CircuitFormat);
registerFormat(PromotionRelegationFormat);
export { RoundRobinFormat, SingleEliminationFormat, DoubleEliminationFormat, SwissFormat, GroupStageFormat, LeaguePlayoffsFormat, LadderFormat, CircuitFormat, PromotionRelegationFormat };
//# sourceMappingURL=index.js.map