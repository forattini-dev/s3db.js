/**
 * S3DB CLI UI Components
 *
 * Uses tuiuiu.js for colors and styling
 */

import { c, tpl, compose, red, green, yellow, cyan, gray, bold, dim } from 'tuiuiu.js/colors';

/**
 * Pre-composed styles for consistent CLI output
 */
export const styles = {
  // Status colors
  error: compose(red, bold),
  success: compose(green),
  warning: compose(yellow),
  info: compose(cyan),
  muted: compose(gray, dim),

  // Semantic styles
  title: compose(cyan, bold),
  label: compose(cyan),
  value: (v: string | number) => String(v),
  highlight: compose(bold),

  // Icons with colors
  checkmark: () => green('✓'),
  cross: () => red('✗'),
  arrow: () => cyan('→'),
  bullet: () => gray('•'),
};

/**
 * Chainable color API (re-export from tuiuiu)
 */
export { c, tpl };

/**
 * Simple functions for common cases
 */
export { red, green, yellow, cyan, gray, bold, dim };

/**
 * Print a styled message
 */
export function print(message: string): void {
  console.log(message);
}

/**
 * Print an error message
 */
export function printError(message: string): void {
  console.error(styles.error(`Error: ${message}`));
}

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(styles.success(`${styles.checkmark()} ${message}`));
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.log(styles.warning(`⚠️  ${message}`));
}

/**
 * Print an info message
 */
export function printInfo(message: string): void {
  console.log(styles.info(`ℹ️  ${message}`));
}

/**
 * Print a header/title
 */
export function printHeader(title: string): void {
  console.log(styles.title(`\n${title}\n`));
}

/**
 * Print a section header
 */
export function printSection(title: string): void {
  console.log(bold(title));
}

/**
 * Print a key-value pair
 */
export function printKeyValue(key: string, value: string | number | boolean): void {
  const displayValue = typeof value === 'boolean'
    ? (value ? green('✓') : red('✗'))
    : String(value);
  console.log(`  ${key}: ${displayValue}`);
}

/**
 * Print a muted/gray message
 */
export function printMuted(message: string): void {
  console.log(styles.muted(message));
}

/**
 * Print a tip/hint
 */
export function printTip(message: string): void {
  console.log(styles.muted(`💡 ${message}`));
}
