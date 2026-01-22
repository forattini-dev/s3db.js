/**
 * S3DB CLI Table Component
 *
 * String-based table renderer for CLI output using tuiuiu border styles
 */

import { cyan, gray, green, yellow, red, bold, dim } from 'tuiuiu.js/colors';

type BorderStyle = 'single' | 'double' | 'round' | 'bold' | 'ascii' | 'none';

interface BorderChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  topMid: string;
  bottomMid: string;
  leftMid: string;
  rightMid: string;
  midMid: string;
}

const BORDERS: Record<BorderStyle, BorderChars> = {
  single: {
    topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
    horizontal: '─', vertical: '│',
    topMid: '┬', bottomMid: '┴', leftMid: '├', rightMid: '┤', midMid: '┼',
  },
  double: {
    topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝',
    horizontal: '═', vertical: '║',
    topMid: '╦', bottomMid: '╩', leftMid: '╠', rightMid: '╣', midMid: '╬',
  },
  round: {
    topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯',
    horizontal: '─', vertical: '│',
    topMid: '┬', bottomMid: '┴', leftMid: '├', rightMid: '┤', midMid: '┼',
  },
  bold: {
    topLeft: '┏', topRight: '┓', bottomLeft: '┗', bottomRight: '┛',
    horizontal: '━', vertical: '┃',
    topMid: '┳', bottomMid: '┻', leftMid: '┣', rightMid: '┫', midMid: '╋',
  },
  ascii: {
    topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
    horizontal: '-', vertical: '|',
    topMid: '+', bottomMid: '+', leftMid: '+', rightMid: '+', midMid: '+',
  },
  none: {
    topLeft: '', topRight: '', bottomLeft: '', bottomRight: '',
    horizontal: '', vertical: '',
    topMid: '', bottomMid: '', leftMid: '', rightMid: '', midMid: '',
  },
};

export interface TableOptions {
  head: string[];
  rows: (string | number | boolean | null | undefined)[][];
  borderStyle?: BorderStyle;
  headerColor?: (s: string) => string;
  borderColor?: (s: string) => string;
  padding?: number;
  maxColWidth?: number;
}

/**
 * Calculate column widths based on content
 */
function calculateWidths(head: string[], rows: any[][], maxWidth?: number): number[] {
  const widths = head.map(h => String(h).length);

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cellWidth = String(row[i] ?? '').length;
      widths[i] = Math.max(widths[i] || 0, cellWidth);
    }
  }

  if (maxWidth) {
    return widths.map(w => Math.min(w, maxWidth));
  }

  return widths;
}

/**
 * Pad a string to a specific width
 */
function pad(str: string, width: number): string {
  const s = String(str);
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

/**
 * Create a horizontal line
 */
function horizontalLine(
  widths: number[],
  borders: BorderChars,
  left: string,
  mid: string,
  right: string,
  padding: number,
  borderColor: (s: string) => string
): string {
  if (!left) return '';

  const parts = widths.map(w => borders.horizontal.repeat(w + padding * 2));
  return borderColor(left + parts.join(mid) + right);
}

/**
 * Create a data row
 */
function dataRow(
  cells: any[],
  widths: number[],
  borders: BorderChars,
  padding: number,
  borderColor: (s: string) => string,
  cellFormatter?: (cell: any, index: number) => string
): string {
  const paddingStr = ' '.repeat(padding);
  const formattedCells = cells.map((cell, i) => {
    const value = cell ?? '';
    const padded = pad(String(value), widths[i] || 0);
    return cellFormatter ? cellFormatter(padded, i) : padded;
  });

  if (borders.vertical) {
    return borderColor(borders.vertical) +
      formattedCells.map(c => paddingStr + c + paddingStr).join(borderColor(borders.vertical)) +
      borderColor(borders.vertical);
  }

  return formattedCells.join('  ');
}

/**
 * Render a table to string
 */
export function renderTable(options: TableOptions): string {
  const {
    head,
    rows,
    borderStyle = 'single',
    headerColor = cyan,
    borderColor = gray,
    padding = 1,
    maxColWidth = 50,
  } = options;

  const borders = BORDERS[borderStyle];
  const widths = calculateWidths(head, rows, maxColWidth);
  const lines: string[] = [];

  // Top border
  const topLine = horizontalLine(widths, borders, borders.topLeft, borders.topMid, borders.topRight, padding, borderColor);
  if (topLine) lines.push(topLine);

  // Header row
  const headerRow = dataRow(head, widths, borders, padding, borderColor, (cell) => bold(headerColor(cell)));
  lines.push(headerRow);

  // Header separator
  const sepLine = horizontalLine(widths, borders, borders.leftMid, borders.midMid, borders.rightMid, padding, borderColor);
  if (sepLine) lines.push(sepLine);

  // Data rows
  for (const row of rows) {
    lines.push(dataRow(row, widths, borders, padding, borderColor));
  }

  // Bottom border
  const bottomLine = horizontalLine(widths, borders, borders.bottomLeft, borders.bottomMid, borders.bottomRight, padding, borderColor);
  if (bottomLine) lines.push(bottomLine);

  return lines.join('\n');
}

/**
 * Print a table directly to console
 */
export function printTable(options: TableOptions): void {
  console.log(renderTable(options));
}

/**
 * Create a table instance for building incrementally
 */
export class Table {
  private head: string[] = [];
  private rows: any[][] = [];
  private options: Partial<TableOptions>;

  constructor(options: Partial<TableOptions> = {}) {
    this.options = options;
    if (options.head) {
      this.head = options.head;
    }
  }

  setHead(head: string[]): this {
    this.head = head;
    return this;
  }

  push(row: any[]): this {
    this.rows.push(row);
    return this;
  }

  toString(): string {
    return renderTable({
      head: this.head,
      rows: this.rows,
      ...this.options,
    });
  }

  print(): void {
    console.log(this.toString());
  }
}
