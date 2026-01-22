/**
 * S3DB CLI Components
 *
 * Re-exports all CLI UI components using tuiuiu.js
 */

// UI utilities and styles
export {
  styles,
  c,
  tpl,
  red,
  green,
  yellow,
  cyan,
  gray,
  bold,
  dim,
  print,
  printError,
  printSuccess,
  printWarning,
  printInfo,
  printHeader,
  printSection,
  printKeyValue,
  printMuted,
  printTip,
} from './ui.js';

// Table component
export { Table, renderTable, printTable, type TableOptions } from './table.js';

// Spinner component
export { Spinner, createSpinner, spinner, type SpinnerOptions } from './spinner.js';
