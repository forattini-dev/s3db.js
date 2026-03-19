import { ReckerSEOAdapter } from '../../src/plugins/spider/recker-seo-adapter.js';

describe('ReckerSEOAdapter', () => {
  it('normalizes detailed report timestamp to ISO string', async () => {
    const adapter = new ReckerSEOAdapter();
    const rawTimestamp = new Date('2026-03-19T12:34:56.000Z');

    (adapter as any).reckerAvailable = true;
    (adapter as any).analyzeSeo = vi.fn().mockResolvedValue({
      url: 'https://example.com',
      timestamp: rawTimestamp,
      grade: 'A',
      score: 95,
      summary: {
        totalChecks: 1,
        passed: 1,
        warnings: 0,
        errors: 0,
        infos: 0,
        passRate: 100,
        issuesByCategory: {},
        topIssues: [],
        quickWins: [],
        vitals: {
          wordCount: 100,
          readingTime: 1,
          imageCount: 0,
          linkCount: 0
        },
        completeness: {
          meta: 100,
          social: 100,
          technical: 100,
          content: 100,
          images: 100,
          links: 100
        }
      },
      checks: [],
      structuredData: {
        count: 0,
        types: [],
        items: []
      },
      content: {
        wordCount: 100,
        characterCount: 500,
        sentenceCount: 5,
        paragraphCount: 2,
        readingTimeMinutes: 1,
        avgWordsPerSentence: 20,
        avgParagraphLength: 50,
        listCount: 0,
        strongTagCount: 0,
        emTagCount: 0
      },
      headings: {
        structure: [],
        h1Count: 1,
        hasProperHierarchy: true,
        issues: []
      },
      keywords: {
        primary: null,
        secondary: [],
        density: {}
      },
      links: {
        total: 0,
        internal: 0,
        external: 0,
        nofollow: 0,
        broken: 0,
        withoutText: 0,
        sponsoredLinks: 0,
        ugcLinks: 0
      },
      images: {
        total: 0,
        withAlt: 0,
        withoutAlt: 0,
        lazy: 0,
        missingDimensions: 0,
        modernFormats: 0,
        altTextLengths: [],
        imageAltTexts: [],
        imageFilenames: [],
        imagesWithAsyncDecoding: 0
      },
      social: {
        openGraph: {
          present: false,
          hasTitle: false,
          hasDescription: false,
          hasImage: false,
          hasUrl: false,
          issues: []
        },
        twitterCard: {
          present: false,
          hasCard: false,
          hasTitle: false,
          hasDescription: false,
          hasImage: false,
          issues: []
        }
      },
      technical: {
        hasCanonical: false,
        hasRobotsMeta: false,
        hasViewport: false,
        hasCharset: true,
        hasLang: true
      }
    });

    const report = await adapter.getDetailedReport('<html></html>', 'https://example.com');

    expect(report).not.toBeNull();
    expect(report?.timestamp).toBe(rawTimestamp.toISOString());
    expect(typeof report?.timestamp).toBe('string');
  });
});
