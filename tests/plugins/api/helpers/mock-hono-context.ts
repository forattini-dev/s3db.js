export function createMockHonoContext(initialCookies = {}) {
  const cookies = {};

  Object.entries(initialCookies).forEach(([name, value]) => {
    if (value && typeof value === 'object' && value.value !== undefined) {
      cookies[name] = {
        value: String(value.value),
        options: { ...(value.options || {}) }
      };
    } else {
      cookies[name] = { value: String(value), options: {} };
    }
  });

  const setCookieHeaders = [];
  const setCookieRecords = [];
  const contextStore = new Map();

  const buildCookieHeader = () => {
    const parts = Object.entries(cookies)
      .map(([cookieName, data]) => `${cookieName}=${encodeURIComponent(data.value ?? '')}`);
    return parts.join('; ');
  };

  const context = {
    header(name, value) {
      if (typeof name !== 'string' || name.toLowerCase() !== 'set-cookie') {
        return;
      }

      setCookieHeaders.push(value);

      const segments = value.split(';').map((segment) => segment.trim()).filter(Boolean);
      if (!segments.length) {
        return;
      }

      const [pair, ...attributes] = segments;
      const [cookieNameRaw, encodedValue = ''] = pair.split('=');
      if (!cookieNameRaw) {
        return;
      }
      const cookieName = cookieNameRaw.trim();

      let decodedValue = encodedValue;
      try {
        decodedValue = encodedValue ? decodeURIComponent(encodedValue) : '';
      } catch {
        // Keep original encoded value if decoding fails
      }

      const options = {};
      attributes.forEach((attribute) => {
        const [attrNameRaw, ...rest] = attribute.split('=');
        const attrName = attrNameRaw.toLowerCase();
        const attrValue = rest.length > 0 ? rest.join('=').trim() : undefined;

        switch (attrName) {
          case 'max-age':
            options.maxAge = attrValue !== undefined ? parseInt(attrValue, 10) : undefined;
            break;
          case 'path':
            options.path = attrValue;
            break;
          case 'domain':
            options.domain = attrValue;
            break;
          case 'samesite':
            options.sameSite = attrValue;
            break;
          case 'secure':
            options.secure = true;
            break;
          case 'httponly':
            options.httpOnly = true;
            break;
          case 'expires':
            options.expires = attrValue;
            break;
          case 'priority':
            options.priority = attrValue;
            break;
          case 'partitioned':
            options.partitioned = true;
            break;
          default:
            break;
        }
      });

      setCookieRecords.push({
        header: value,
        name: cookieName,
        value: decodedValue,
        options: { ...options }
      });

      if (options.maxAge === 0) {
        delete cookies[cookieName];
        return;
      }

      cookies[cookieName] = { value: decodedValue, options };
    },
    req: {
      raw: {
        headers: {
          get(headerName) {
            if (!headerName || headerName.toLowerCase() !== 'cookie') {
              return null;
            }
            const headerValue = buildCookieHeader();
            return headerValue || null;
          }
        }
      },
      header(headerName) {
        if (!headerName || headerName.toLowerCase() !== 'cookie') {
          return null;
        }
        return buildCookieHeader() || null;
      }
    },
    get(key) {
      return contextStore.get(key);
    },
    set(key, value) {
      contextStore.set(key, value);
    },
    _cookies: cookies,
    _setCookieHeaders: setCookieHeaders,
    _setCookieRecords: setCookieRecords
  };

  return context;
}
