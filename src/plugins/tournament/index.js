/**
 * Tournament Plugin - Module Exports
 */

// Main plugin
export { TournamentPlugin } from '../tournament.plugin.js';

// Managers
export { TournamentManager } from './tournament-manager.js';
export { MatchManager } from './match-manager.js';
export { RegistrationManager } from './registration-manager.js';

// Formats
export {
  BaseFormat,
  RoundRobinFormat,
  SingleEliminationFormat,
  DoubleEliminationFormat,
  SwissFormat,
  GroupStageFormat,
  LeaguePlayoffsFormat,
  LadderFormat,
  CircuitFormat,
  PromotionRelegationFormat,
  registerFormat,
  getFormatClass,
  createFormat,
  getAvailableFormats,
  getFormatMetadata
} from './formats/index.js';

// Utilities
export {
  randomSeeding,
  manualSeeding,
  snakeSeeding,
  bracketSeeding,
  nextPowerOf2,
  calculateByes,
  applySeeding
} from './seeding-strategies.js';

export {
  calculateRoundRobinStandings,
  calculateEliminationStandings,
  calculateSwissStandings,
  calculateLadderRankings,
  calculateCircuitStandings,
  sortStandings,
  applyHeadToHead
} from './standings-calculator.js';

export {
  generateSingleEliminationBracket,
  generateDoubleEliminationBracket,
  generateRoundRobinSchedule,
  generateSwissPairing,
  generateGSLBracket
} from './bracket-generator.js';
