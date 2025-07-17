const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const base = alphabet.length;
const charToValue = Object.fromEntries([...alphabet].map((c, i) => [c, i]));

export const encode = n => {
  if (typeof n !== 'number' || isNaN(n)) return 'undefined';
  if (!isFinite(n)) return 'undefined';
  if (n === 0) return alphabet[0];
  if (n < 0) return '-' + encode(-Math.floor(n));
  n = Math.floor(n);
  let s = '';
  while (n) {
    s = alphabet[n % base] + s;
    n = Math.floor(n / base);
  }
  return s;
};

export const decode = s => {
  if (typeof s !== 'string') return NaN;
  if (s === '') return 0;
  let negative = false;
  if (s[0] === '-') {
    negative = true;
    s = s.slice(1);
  }
  let r = 0;
  for (let i = 0; i < s.length; i++) {
    const idx = charToValue[s[i]];
    if (idx === undefined) return NaN;
    r = r * base + idx;
  }
  return negative ? -r : r;
};

export const encodeDecimal = n => {
  if (typeof n !== 'number' || isNaN(n)) return 'undefined';
  if (!isFinite(n)) return 'undefined';
  const negative = n < 0;
  n = Math.abs(n);
  const [intPart, decPart] = n.toString().split('.');
  const encodedInt = encode(Number(intPart));
  if (decPart) {
    return (negative ? '-' : '') + encodedInt + '.' + decPart;
  }
  return (negative ? '-' : '') + encodedInt;
};

export const decodeDecimal = s => {
  if (typeof s !== 'string') return NaN;
  let negative = false;
  if (s[0] === '-') {
    negative = true;
    s = s.slice(1);
  }
  const [intPart, decPart] = s.split('.');
  const decodedInt = decode(intPart);
  if (isNaN(decodedInt)) return NaN;
  const num = decPart ? Number(decodedInt + '.' + decPart) : decodedInt;
  return negative ? -num : num;
};
