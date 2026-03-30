export type HtmlEscapedString = string & {
  readonly __s3dbHtmlEscaped: true;
};

const HTML_ESCAPE_MARKER: unique symbol = Symbol('s3db-html-escaped');

type HtmlSafeString = string & {
  readonly [HTML_ESCAPE_MARKER]: true;
};

type HtmlEscapeValue = string | number | boolean | null | undefined | unknown | HtmlSafeString;

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (char) => htmlEscapeMap[char] ?? char);
}

function isHtmlEscaped(value: unknown): value is HtmlSafeString {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<symbol, unknown>)[HTML_ESCAPE_MARKER] === 'boolean'
  );
}

function renderValue(value: HtmlEscapeValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((entry) => renderValue(entry as HtmlEscapeValue)).join('');
  }

  if (isHtmlEscaped(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    return escapeHtml(value);
  }

  return escapeHtml(String(value));
}

function asHtmlEscaped(value: string): HtmlEscapedString {
  const escaped = new String(value) as HtmlSafeString;
  (escaped as unknown as Record<symbol, unknown>)[HTML_ESCAPE_MARKER] = true;
  return escaped as unknown as HtmlEscapedString;
}

export function html(
  strings: TemplateStringsArray,
  ...values: HtmlEscapeValue[]
): HtmlEscapedString {
  let result = strings[0] ?? '';
  for (let index = 0; index < values.length; index += 1) {
    result += renderValue(values[index]);
    result += strings[index + 1] ?? '';
  }
  return asHtmlEscaped(result);
}
