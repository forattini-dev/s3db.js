const ANSI_RESET = '\x1b[0m';
const PASTEL_COLORS = {
  method: '\x1b[38;5;117m',
  url: '\x1b[38;5;195m',
  arrow: '\x1b[38;5;244m',
  time: '\x1b[38;5;176m',
  size: '\x1b[38;5;147m'
};

export function colorizeStatus(status, value) {
  let colorCode = '';
  if (status >= 500) colorCode = '\x1b[31m';
  else if (status >= 400) colorCode = '\x1b[33m';
  else if (status >= 300) colorCode = '\x1b[36m';
  else if (status >= 200) colorCode = '\x1b[32m';
  return colorCode ? `${colorCode}${value}${ANSI_RESET}` : value;
}

export function formatPrettyHttpLog({ method, url, status, duration, contentLength, colorize = true }) {
  const sizeDisplay = contentLength === '-' || contentLength == null ? '–' : contentLength;
  const durationFormatted = typeof duration === 'number' ? duration.toFixed(3) : duration;

  if (colorize) {
    const methodText = `${PASTEL_COLORS.method}${method}${ANSI_RESET}`;
    const urlText = `${PASTEL_COLORS.url}${url}${ANSI_RESET}`;
    const arrowSymbol = `${PASTEL_COLORS.arrow}⇒${ANSI_RESET}`;
    const timeText = `${PASTEL_COLORS.time}${durationFormatted}${ANSI_RESET}`;
    const sizeText = `${PASTEL_COLORS.size}${sizeDisplay}${ANSI_RESET}`;
    const statusText = colorizeStatus(status, String(status));

    return `${methodText} ${urlText} ${arrowSymbol} ${statusText} (${timeText} ms, ${sizeText})`;
  }

  return `${method} ${url} ⇒ ${status} (${durationFormatted} ms, ${sizeDisplay})`;
}
