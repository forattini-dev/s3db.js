import type { Context, MiddlewareHandler } from 'hono';

export interface OpenGraphDefaults {
  siteName?: string;
  locale?: string;
  type?: string;
  twitterCard?: string;
  twitterSite?: string | null;
  defaultImage?: string | null;
}

export interface OpenGraphData extends OpenGraphDefaults {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  twitterCreator?: string;
}

type OpenGraphGenerator = (data: OpenGraphData) => string;

export class OpenGraphHelper {
  private defaults: Required<OpenGraphDefaults>;

  constructor(defaults: OpenGraphDefaults = {}) {
    this.defaults = {
      siteName: defaults.siteName || 'My Site',
      locale: defaults.locale || 'en_US',
      type: defaults.type || 'website',
      twitterCard: defaults.twitterCard || 'summary_large_image',
      twitterSite: defaults.twitterSite || null,
      defaultImage: defaults.defaultImage || null
    };
  }

  generateTags(data: OpenGraphData = {}): string {
    const og = { ...this.defaults, ...data };

    const image = og.image || og.defaultImage;

    const tags: (string | false | null | undefined)[] = [
      og.title && `<meta property="og:title" content="${this._escape(og.title)}">`,
      og.description && `<meta property="og:description" content="${this._escape(og.description)}">`,
      image && `<meta property="og:image" content="${this._escape(image)}">`,
      og.url && `<meta property="og:url" content="${this._escape(og.url)}">`,
      `<meta property="og:type" content="${this._escape(og.type)}">`,
      `<meta property="og:site_name" content="${this._escape(og.siteName)}">`,
      `<meta property="og:locale" content="${this._escape(og.locale)}">`,

      og.imageAlt && `<meta property="og:image:alt" content="${this._escape(og.imageAlt)}">`,
      og.imageWidth ? `<meta property="og:image:width" content="${og.imageWidth}">` : null,
      og.imageHeight ? `<meta property="og:image:height" content="${og.imageHeight}">` : null,

      `<meta name="twitter:card" content="${this._escape(og.twitterCard)}">`,
      og.twitterSite && `<meta name="twitter:site" content="${this._escape(og.twitterSite)}">`,
      og.twitterCreator && `<meta name="twitter:creator" content="${this._escape(og.twitterCreator)}">`,
      og.title && `<meta name="twitter:title" content="${this._escape(og.title)}">`,
      og.description && `<meta name="twitter:description" content="${this._escape(og.description)}">`,
      image && `<meta name="twitter:image" content="${this._escape(image)}">`,
    ];

    return tags.filter(Boolean).join('\n    ');
  }

  middleware(): MiddlewareHandler {
    return async (c: Context, next) => {
      c.set('og', ((data: OpenGraphData) => this.generateTags(data)) as OpenGraphGenerator);
      await next();
    };
  }

  private _escape(str: string | null | undefined): string {
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
