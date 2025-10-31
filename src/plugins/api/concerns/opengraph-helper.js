/**
 * OpenGraph Helper
 *
 * Generates OpenGraph and Twitter Card meta tags for social media previews.
 *
 * @example
 * const og = new OpenGraphHelper({
 *   siteName: 'My Site',
 *   locale: 'en_US',
 *   twitterSite: '@mysite'
 * });
 *
 * const tags = og.generateTags({
 *   title: 'Page Title',
 *   description: 'Page description',
 *   image: '/og-image.jpg',
 *   url: 'https://example.com/page'
 * });
 */
export class OpenGraphHelper {
  constructor(defaults = {}) {
    this.defaults = {
      siteName: defaults.siteName || 'My Site',
      locale: defaults.locale || 'en_US',
      type: defaults.type || 'website',
      twitterCard: defaults.twitterCard || 'summary_large_image',
      twitterSite: defaults.twitterSite || null,
      defaultImage: defaults.defaultImage || null
    };
  }

  /**
   * Generate OpenGraph meta tags
   *
   * @param {Object} data - OpenGraph data
   * @param {string} data.title - Page title
   * @param {string} data.description - Page description
   * @param {string} data.image - Image URL (absolute or relative)
   * @param {string} data.url - Canonical URL
   * @param {string} data.type - Content type (default: 'website')
   * @param {string} data.locale - Locale (default: from defaults)
   * @param {string} data.siteName - Site name (default: from defaults)
   * @param {string} data.imageAlt - Image alt text
   * @param {number} data.imageWidth - Image width in pixels
   * @param {number} data.imageHeight - Image height in pixels
   * @param {string} data.twitterCard - Twitter card type (default: from defaults)
   * @param {string} data.twitterSite - Twitter @username (default: from defaults)
   * @param {string} data.twitterCreator - Twitter creator @username
   * @returns {string} HTML meta tags
   */
  generateTags(data = {}) {
    const og = { ...this.defaults, ...data };

    // Use default image if none provided
    const image = og.image || og.defaultImage;

    const tags = [
      // Basic OpenGraph
      og.title && `<meta property="og:title" content="${this._escape(og.title)}">`,
      og.description && `<meta property="og:description" content="${this._escape(og.description)}">`,
      image && `<meta property="og:image" content="${this._escape(image)}">`,
      og.url && `<meta property="og:url" content="${this._escape(og.url)}">`,
      `<meta property="og:type" content="${this._escape(og.type)}">`,
      `<meta property="og:site_name" content="${this._escape(og.siteName)}">`,
      `<meta property="og:locale" content="${this._escape(og.locale)}">`,

      // Image metadata
      og.imageAlt && `<meta property="og:image:alt" content="${this._escape(og.imageAlt)}">`,
      og.imageWidth && `<meta property="og:image:width" content="${og.imageWidth}">`,
      og.imageHeight && `<meta property="og:image:height" content="${og.imageHeight}">`,

      // Twitter Cards
      `<meta name="twitter:card" content="${this._escape(og.twitterCard)}">`,
      og.twitterSite && `<meta name="twitter:site" content="${this._escape(og.twitterSite)}">`,
      og.twitterCreator && `<meta name="twitter:creator" content="${this._escape(og.twitterCreator)}">`,
      og.title && `<meta name="twitter:title" content="${this._escape(og.title)}">`,
      og.description && `<meta name="twitter:description" content="${this._escape(og.description)}">`,
      image && `<meta name="twitter:image" content="${this._escape(image)}">`,
    ];

    return tags.filter(Boolean).join('\n    ');
  }

  /**
   * Create Hono middleware that injects OG helper into context
   *
   * @example
   * app.use('*', ogHelper.middleware());
   *
   * // In route handler:
   * const ogTags = c.get('og')({ title: 'My Page', ... });
   */
  middleware() {
    return async (c, next) => {
      c.set('og', (data) => this.generateTags(data));
      await next();
    };
  }

  /**
   * Escape HTML entities to prevent XSS
   * @private
   */
  _escape(str) {
    if (str === null || str === undefined) return '';

    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default OpenGraphHelper;
