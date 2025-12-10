import { BaseFormat } from './base-format.js';
import type { FormatConfig } from '../types.js';
type FormatConstructor = typeof BaseFormat & {
    type: string;
    displayName: string;
    defaultConfig: FormatConfig;
    new (config: FormatConfig): BaseFormat;
};
export declare function registerFormat(FormatClass: FormatConstructor): void;
export declare function getFormatClass(type: string): FormatConstructor | undefined;
export declare function createFormat(type: string, config?: FormatConfig): BaseFormat;
export declare function getAvailableFormats(): string[];
export declare function getFormatMetadata(): {
    type: string;
    displayName: string;
    defaultConfig: FormatConfig;
}[];
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
export { RoundRobinFormat, SingleEliminationFormat, DoubleEliminationFormat, SwissFormat, GroupStageFormat, LeaguePlayoffsFormat, LadderFormat, CircuitFormat, PromotionRelegationFormat };
//# sourceMappingURL=index.d.ts.map