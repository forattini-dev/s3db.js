import { describe, expect, test } from '@jest/globals'
import { URLPatternMatcher } from '../../../src/plugins/spider/url-pattern-matcher.js'

describe('URLPatternMatcher', () => {
  describe('Express-style patterns', () => {
    test('should match simple :param pattern', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo_meta_tags'],
          metadata: { type: 'product' }
        }
      })

      const result = matcher.match('https://amazon.com/dp/B08N5WRWNW')

      expect(result).not.toBeNull()
      expect(result.pattern).toBe('product')
      expect(result.params.asin).toBe('B08N5WRWNW')
      expect(result.activities).toEqual(['seo_meta_tags'])
      expect(result.metadata.type).toBe('product')
    })

    test('should match multiple :param in path', () => {
      const matcher = new URLPatternMatcher({
        blogPost: {
          match: '/blog/:year/:month/:slug',
          activities: ['seo_content']
        }
      })

      const result = matcher.match('https://example.com/blog/2024/01/my-post')

      expect(result).not.toBeNull()
      expect(result.pattern).toBe('blogPost')
      expect(result.params).toEqual({
        year: '2024',
        month: '01',
        slug: 'my-post'
      })
    })

    test('should match optional segments using multiple patterns (recommended)', () => {
      // For truly optional path segments, use two patterns
      const matcher = new URLPatternMatcher({
        itemWithId: {
          match: '/item/:id',
          activities: ['detail'],
          priority: 10
        },
        itemList: {
          match: '/item',
          activities: ['list'],
          priority: 5
        }
      })

      // With param -> higher priority pattern
      const withId = matcher.match('https://example.com/item/123')
      expect(withId).not.toBeNull()
      expect(withId.pattern).toBe('itemWithId')
      expect(withId.params.id).toBe('123')

      // Without param -> lower priority pattern
      const withoutId = matcher.match('https://example.com/item')
      expect(withoutId).not.toBeNull()
      expect(withoutId.pattern).toBe('itemList')
    })

    test('should match * wildcard (anything except /)', () => {
      const matcher = new URLPatternMatcher({
        category: {
          match: '/category/*',
          activities: ['links']
        }
      })

      const result = matcher.match('https://example.com/category/electronics')
      expect(result).not.toBeNull()
      expect(result.pattern).toBe('category')

      // Should NOT match nested paths
      const nested = matcher.match('https://example.com/category/electronics/phones')
      expect(nested).toBeNull()
    })

    test('should match ** wildcard (anything including /)', () => {
      const matcher = new URLPatternMatcher({
        docs: {
          match: '/docs/**',
          activities: ['content']
        }
      })

      const result = matcher.match('https://example.com/docs/api/v2/reference')
      expect(result).not.toBeNull()
      expect(result.pattern).toBe('docs')
    })

    test('should handle URL-encoded parameters', () => {
      const matcher = new URLPatternMatcher({
        search: {
          match: '/search/:query',
          activities: ['basic']
        }
      })

      const result = matcher.match('https://example.com/search/hello%20world')
      expect(result).not.toBeNull()
      expect(result.params.query).toBe('hello world')
    })
  })

  describe('Regex patterns', () => {
    test('should match regex pattern', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: /\/dp\/([A-Z0-9]{10})(?:\/|$)/i,
          activities: ['seo'],
          extract: { asin: 0 }
        }
      })

      const result = matcher.match('https://amazon.com/dp/B08N5WRWNW')
      expect(result).not.toBeNull()
      expect(result.pattern).toBe('product')
    })

    test('should match regex with capture groups', () => {
      const matcher = new URLPatternMatcher({
        order: {
          match: /\/order\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
          activities: ['security']
        }
      })

      const result = matcher.match('https://example.com/order/550e8400-e29b-41d4-a716-446655440000')
      expect(result).not.toBeNull()
      expect(result.pattern).toBe('order')
    })

    test('should not match invalid pattern', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: /\/dp\/([A-Z0-9]{10})$/i,
          activities: ['seo']
        }
      })

      const result = matcher.match('https://amazon.com/dp/INVALID')
      expect(result).toBeNull()
    })
  })

  describe('Query string extraction', () => {
    test('should extract query parameters via extract config', () => {
      const matcher = new URLPatternMatcher({
        search: {
          match: '/s',
          activities: ['links'],
          extract: {
            query: 'k',
            page: 'page'
          }
        }
      })

      const result = matcher.match('https://amazon.com/s?k=laptops&page=2')
      expect(result).not.toBeNull()
      expect(result.params.query).toBe('laptops')
      expect(result.params.page).toBe('2')
    })

    test('should handle missing query params', () => {
      const matcher = new URLPatternMatcher({
        search: {
          match: '/s',
          activities: ['links'],
          extract: {
            query: 'k',
            page: 'page'
          }
        }
      })

      const result = matcher.match('https://amazon.com/s?k=laptops')
      expect(result).not.toBeNull()
      expect(result.params.query).toBe('laptops')
      expect(result.params.page).toBeUndefined()
    })
  })

  describe('Default pattern', () => {
    test('should return default pattern when no match', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        },
        default: {
          activities: ['basic'],
          metadata: { type: 'other' }
        }
      })

      const result = matcher.match('https://amazon.com/unknown/page')
      expect(result).not.toBeNull()
      expect(result.pattern).toBe('default')
      expect(result.isDefault).toBe(true)
      expect(result.activities).toEqual(['basic'])
    })

    test('should return null when no match and no default', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        }
      })

      const result = matcher.match('https://amazon.com/unknown/page')
      expect(result).toBeNull()
    })
  })

  describe('Pattern priority', () => {
    test('should match higher priority pattern first', () => {
      const matcher = new URLPatternMatcher({
        specificProduct: {
          match: /\/dp\/B08N5WRWNW/,
          activities: ['full'],
          priority: 20
        },
        product: {
          match: '/dp/:asin',
          activities: ['basic'],
          priority: 10
        }
      })

      // Specific ASIN should match specificProduct
      const specific = matcher.match('https://amazon.com/dp/B08N5WRWNW')
      expect(specific.pattern).toBe('specificProduct')

      // Other ASINs should match product
      const other = matcher.match('https://amazon.com/dp/B09XYZ1234')
      expect(other.pattern).toBe('product')
    })

    test('should prefer more specific patterns (more params) when same priority', () => {
      const matcher = new URLPatternMatcher({
        detailed: {
          match: '/products/:category/:id',
          activities: ['full'],
          priority: 0
        },
        simple: {
          match: '/products/:id',
          activities: ['basic'],
          priority: 0
        }
      })

      const result = matcher.match('https://example.com/products/electronics/123')
      expect(result.pattern).toBe('detailed')
      expect(result.params).toEqual({ category: 'electronics', id: '123' })
    })
  })

  describe('matches() quick check', () => {
    test('should return true for matching URLs', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        }
      })

      expect(matcher.matches('https://amazon.com/dp/B08N5WRWNW')).toBe(true)
      expect(matcher.matches('https://amazon.com/cart')).toBe(false)
    })

    test('should return false for default matches', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        },
        default: {
          activities: ['basic']
        }
      })

      // Default match should return false from matches()
      expect(matcher.matches('https://amazon.com/cart')).toBe(false)
    })
  })

  describe('Runtime pattern management', () => {
    test('should add pattern at runtime', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        }
      })

      expect(matcher.matches('https://example.com/category/test')).toBe(false)

      matcher.addPattern('category', {
        match: '/category/:name',
        activities: ['links']
      })

      expect(matcher.matches('https://example.com/category/test')).toBe(true)
    })

    test('should remove pattern', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        }
      })

      expect(matcher.matches('https://amazon.com/dp/B08N5WRWNW')).toBe(true)

      matcher.removePattern('product')

      expect(matcher.matches('https://amazon.com/dp/B08N5WRWNW')).toBe(false)
    })

    test('should get pattern names', () => {
      const matcher = new URLPatternMatcher({
        product: { match: '/dp/:asin', activities: [] },
        category: { match: '/category/:name', activities: [] },
        search: { match: '/s', activities: [] }
      })

      const names = matcher.getPatternNames()
      expect(names).toContain('product')
      expect(names).toContain('category')
      expect(names).toContain('search')
      expect(names).toHaveLength(3)
    })
  })

  describe('filterUrls()', () => {
    test('should filter URLs by pattern', () => {
      const matcher = new URLPatternMatcher({
        product: { match: '/dp/:asin', activities: ['seo'] },
        category: { match: '/category/:name', activities: ['links'] }
      })

      const urls = [
        'https://amazon.com/dp/AAA1234567',
        'https://amazon.com/dp/BBB1234567',
        'https://amazon.com/category/electronics',
        'https://amazon.com/cart'
      ]

      // Filter all matching URLs
      const allMatches = matcher.filterUrls(urls)
      expect(allMatches).toHaveLength(3)

      // Filter only product URLs
      const productUrls = matcher.filterUrls(urls, ['product'])
      expect(productUrls).toHaveLength(2)
      expect(productUrls[0].match.pattern).toBe('product')
      expect(productUrls[1].match.pattern).toBe('product')

      // Filter only category URLs
      const categoryUrls = matcher.filterUrls(urls, ['category'])
      expect(categoryUrls).toHaveLength(1)
      expect(categoryUrls[0].match.pattern).toBe('category')
    })
  })

  describe('Edge cases', () => {
    test('should handle path-only input (no full URL)', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        }
      })

      const result = matcher.match('/dp/B08N5WRWNW')
      expect(result).not.toBeNull()
      expect(result.params.asin).toBe('B08N5WRWNW')
    })

    test('should handle URLs with trailing slash', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        }
      })

      const result = matcher.match('https://amazon.com/dp/B08N5WRWNW/')
      expect(result).not.toBeNull()
      expect(result.params.asin).toBe('B08N5WRWNW')
    })

    test('should handle URLs with hash', () => {
      const matcher = new URLPatternMatcher({
        product: {
          match: '/dp/:asin',
          activities: ['seo']
        }
      })

      const result = matcher.match('https://amazon.com/dp/B08N5WRWNW#reviews')
      expect(result).not.toBeNull()
      expect(result.params.asin).toBe('B08N5WRWNW')
    })

    test('should escape special regex chars in Express patterns', () => {
      const matcher = new URLPatternMatcher({
        file: {
          match: '/files/:name.pdf',
          activities: ['basic']
        }
      })

      const result = matcher.match('https://example.com/files/report.pdf')
      expect(result).not.toBeNull()
      expect(result.params.name).toBe('report')
    })

    test('should handle empty patterns config', () => {
      const matcher = new URLPatternMatcher({})

      const result = matcher.match('https://example.com/anything')
      expect(result).toBeNull()
    })
  })
})
