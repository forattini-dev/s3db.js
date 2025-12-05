/**
 * Tests for cookie chunking utilities
 * @group api
 */

import {
  setChunkedCookie,
  getChunkedCookie,
  deleteChunkedCookie,
  isChunkedCookie,
  CookieChunkOverflowError
} from '../../../src/plugins/api/concerns/cookie-chunking.js';

describe('Cookie Chunking', () => {
  let mockContext;

  beforeEach(() => {
    const cookies = {};
    const setCookieHeaders = [];

    const buildCookieHeader = () => {
      const parts = Object.entries(cookies)
        .map(([cookieName, data]) => `${cookieName}=${encodeURIComponent(data.value ?? '')}`);
      return parts.join('; ');
    };

    mockContext = {
      header: (name, value) => {
        if (typeof name !== 'string' || name.toLowerCase() !== 'set-cookie') {
          return;
        }

        setCookieHeaders.push(value);

        const segments = value.split(';').map((segment) => segment.trim()).filter(Boolean);
        if (segments.length === 0) {
          return;
        }

        const [pair, ...attributes] = segments;
        const [cookieNameRaw, encodedValue = ''] = pair.split('=');
        const cookieName = cookieNameRaw.trim();

        let decodedValue = encodedValue;
        try {
          decodedValue = encodedValue ? decodeURIComponent(encodedValue) : '';
        } catch (err) {
          // Fall back to raw value if decoding fails
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

        if (options.maxAge === 0) {
          delete cookies[cookieName];
          return;
        }

        cookies[cookieName] = { value: decodedValue, options };
      },
      req: {
        raw: {
          headers: {
            get: (headerName) => {
              if (!headerName || headerName.toLowerCase() !== 'cookie') {
                return null;
              }
              const header = buildCookieHeader();
              return header || null;
            }
          }
        },
        cookie: (name) => cookies[name]?.value || null
      },
      _cookies: cookies,
      _setCookieHeaders: setCookieHeaders
    };
  });

  describe('setChunkedCookie', () => {
    test('sets single cookie for small values', () => {
      const smallValue = 'small-cookie-value';
      setChunkedCookie(mockContext, 'test', smallValue, { httpOnly: true });

      // Should have main cookie
      expect(mockContext._cookies.test).toBeDefined();
      expect(mockContext._cookies.test.value).toBe(smallValue);

      // Should NOT have chunks
      expect(mockContext._cookies['test.__chunks']).toBeUndefined();
      expect(mockContext._cookies['test.0']).toBeUndefined();
    });

    test('chunks large values into multiple cookies', () => {
      // Create large value (> 4KB)
      const largeValue = 'x'.repeat(8000);
      setChunkedCookie(mockContext, 'session', largeValue, { httpOnly: true });

      // Should have metadata cookie
      expect(mockContext._cookies['session.__chunks']).toBeDefined();
      const chunkCount = parseInt(mockContext._cookies['session.__chunks'].value, 10);
      expect(chunkCount).toBeGreaterThan(1);

      // Should have chunk cookies
      for (let i = 0; i < chunkCount; i++) {
        expect(mockContext._cookies[`session.${i}`]).toBeDefined();
      }

      // Should NOT have main cookie
      expect(mockContext._cookies.session).toBeUndefined();
    });

    test('throws error for extremely large values', () => {
      const hugeValue = 'x'.repeat(50000);
      let thrownError;

      try {
        setChunkedCookie(mockContext, 'huge', hugeValue, {});
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(CookieChunkOverflowError);
      expect(thrownError.details.cookieName).toBe('huge');
      expect(thrownError.details.chunkCount).toBeGreaterThan(10);
      expect(thrownError.details.payloadBytes).toBeGreaterThan(0);
    });

    test('invokes overflow handler when provided', () => {
      const hugeValue = 'x'.repeat(50000);
      const handler = vi.fn(() => true);

      expect(() => {
        setChunkedCookie(mockContext, 'huge', hugeValue, {}, { onOverflow: handler });
      }).not.toThrow();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          cookieName: 'huge',
          chunkLimit: 10,
          value: hugeValue
        })
      );
    });

    test('deletes cookie for empty value', () => {
      // Set cookie first
      setChunkedCookie(mockContext, 'test', 'value', {});
      expect(mockContext._cookies.test).toBeDefined();

      // Clear cookie by setting empty value
      setChunkedCookie(mockContext, 'test', '', {});

      // Should be deleted (undefined after maxAge: 0)
      expect(mockContext._cookies.test).toBeUndefined();
    });

    test('preserves cookie options', () => {
      const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 3600
      };

      setChunkedCookie(mockContext, 'test', 'value', options);

      expect(mockContext._cookies.test.options).toMatchObject(options);
    });

    test('only deletes stale chunk indexes', () => {
      // Simulate existing 4-chunk cookie in request
      for (let i = 0; i < 4; i++) {
        mockContext._cookies[`session.${i}`] = { value: `old-${i}` };
      }
      mockContext._cookies['session.__chunks'] = { value: '4' };
      mockContext._setCookieHeaders.length = 0;

      const newValue = 'x'.repeat(7000); // Should produce 2 chunks
      setChunkedCookie(mockContext, 'session', newValue, {});

      const deletionHeaders = mockContext._setCookieHeaders.filter(
        (header) => header.includes('Max-Age=0') && header.includes('session.')
      );
      expect(deletionHeaders).toHaveLength(2);
      expect(deletionHeaders.some((header) => header.includes('session.2'))).toBe(true);
      expect(deletionHeaders.some((header) => header.includes('session.3'))).toBe(true);
    });
  });

  describe('getChunkedCookie', () => {
    test('retrieves single cookie', () => {
      const value = 'single-cookie-value';
      mockContext._cookies.test = { value };

      const retrieved = getChunkedCookie(mockContext, 'test');
      expect(retrieved).toBe(value);
    });

    test('reassembles chunked cookies', () => {
      const part1 = 'x'.repeat(4000);
      const part2 = 'y'.repeat(4000);
      const fullValue = part1 + part2;

      // Manually set chunks
      mockContext._cookies['session.__chunks'] = { value: '2' };
      mockContext._cookies['session.0'] = { value: part1 };
      mockContext._cookies['session.1'] = { value: part2 };

      const retrieved = getChunkedCookie(mockContext, 'session');
      expect(retrieved).toBe(fullValue);
      expect(retrieved.length).toBe(8000);
    });

    test('returns null for missing cookie', () => {
      const retrieved = getChunkedCookie(mockContext, 'missing');
      expect(retrieved).toBeNull();
    });

    test('returns null for incomplete chunks', () => {
      // Set metadata but missing chunk
      mockContext._cookies['session.__chunks'] = { value: '2' };
      mockContext._cookies['session.0'] = { value: 'chunk0' };
      // session.1 is missing

      const retrieved = getChunkedCookie(mockContext, 'session');
      expect(retrieved).toBeNull();
    });

    test('returns null for invalid chunk count', () => {
      mockContext._cookies['test.__chunks'] = { value: 'invalid' };

      const retrieved = getChunkedCookie(mockContext, 'test');
      expect(retrieved).toBeNull();
    });

    test('reassembles chunked cookies when metadata is missing', () => {
      mockContext._cookies['session.0'] = { value: 'abc' };
      mockContext._cookies['session.1'] = { value: '123' };

      const retrieved = getChunkedCookie(mockContext, 'session');
      expect(retrieved).toBe('abc123');
    });
  });

  describe('deleteChunkedCookie', () => {
    test('deletes single cookie', () => {
      mockContext._cookies.test = { value: 'value' };

      deleteChunkedCookie(mockContext, 'test', { path: '/' });

      // Should be deleted (undefined after maxAge: 0)
      expect(mockContext._cookies.test).toBeUndefined();
    });

    test('deletes all chunks and metadata', () => {
      // Set up chunked cookie
      mockContext._cookies['session.__chunks'] = { value: '3' };
      mockContext._cookies['session.0'] = { value: 'chunk0' };
      mockContext._cookies['session.1'] = { value: 'chunk1' };
      mockContext._cookies['session.2'] = { value: 'chunk2' };

      deleteChunkedCookie(mockContext, 'session', { path: '/' });

      // All should be deleted (undefined after maxAge: 0)
      expect(mockContext._cookies.session).toBeUndefined();
      expect(mockContext._cookies['session.__chunks']).toBeUndefined();

      // Should delete all possible chunks (0-9)
      for (let i = 0; i < 10; i++) {
        expect(mockContext._cookies[`session.${i}`]).toBeUndefined();
      }

      const deletions = mockContext._setCookieHeaders.filter((header) => header.includes('Max-Age=0'));
      // Metadata + three chunks
      expect(deletions.length).toBe(4);
    });

    test('no-ops when no matching cookies exist', () => {
      mockContext._setCookieHeaders.length = 0;
      deleteChunkedCookie(mockContext, 'ghost', {});
      expect(mockContext._setCookieHeaders).toHaveLength(0);
    });
  });

  describe('isChunkedCookie', () => {
    test('returns true for chunked cookie', () => {
      mockContext._cookies['session.__chunks'] = { value: '2' };
      expect(isChunkedCookie(mockContext, 'session')).toBe(true);
    });

    test('returns false for non-chunked cookie', () => {
      mockContext._cookies.test = { value: 'value' };
      expect(isChunkedCookie(mockContext, 'test')).toBe(false);
    });

    test('returns false for missing cookie', () => {
      expect(isChunkedCookie(mockContext, 'missing')).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    test('round-trip: set and get chunked cookie', () => {
      const largeValue = 'abc'.repeat(3000); // 9KB

      setChunkedCookie(mockContext, 'session', largeValue, { httpOnly: true });
      const retrieved = getChunkedCookie(mockContext, 'session');

      expect(retrieved).toBe(largeValue);
    });

    test('overwrites existing chunks when value changes', () => {
      // First: set large value (multiple chunks)
      const largeValue = 'x'.repeat(10000);
      setChunkedCookie(mockContext, 'session', largeValue, {});

      const firstChunkCount = parseInt(mockContext._cookies['session.__chunks'].value, 10);
      expect(firstChunkCount).toBeGreaterThan(2);

      // Second: set small value (single cookie)
      setChunkedCookie(mockContext, 'session', 'small', {});

      // Should have single cookie now
      expect(mockContext._cookies.session).toBeDefined();
      expect(mockContext._cookies.session.value).toBe('small');

      // Old chunks should be deleted (undefined after maxAge: 0)
      for (let i = 0; i < firstChunkCount; i++) {
        expect(mockContext._cookies[`session.${i}`]).toBeUndefined();
      }
    });

    test('handles Unicode characters correctly', () => {
      const unicodeValue = '你好世界🚀'.repeat(500);
      setChunkedCookie(mockContext, 'test', unicodeValue, {});
      const retrieved = getChunkedCookie(mockContext, 'test');
      expect(retrieved).toBe(unicodeValue);
    });
  });
});
