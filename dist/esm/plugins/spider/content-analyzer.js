let logger = null;
export function setLogger(l) {
    logger = l;
}
const TRACKING_PIXEL_PATTERNS = {
    google_analytics: /googleadservices|google-analytics|analytics\.google|gtag/i,
    facebook_pixel: /facebook\.com|fbcdn\.net/i,
    twitter: /twitter\.com|twimg\.com/i,
    linkedin: /linkedin\.com|licdn\.com/i,
    reddit: /reddit\.com|redditmedia\.com/i,
    tiktok: /tiktok\.com|tiktokcdn\.com/i,
    snapchat: /snapchat\.com|sc-static\.net/i,
    pinterest: /pinterest\.com|pinimg\.com/i,
    hubspot: /hubspot\.com|hs-script\.com/i,
    mixpanel: /mixpanel\.com/i,
    amplitude: /amplitude\.com/i,
    segment: /segment\.com|cdn\.segment\.com/i,
    hotjar: /hotjar\.com|hjcdn\.com/i,
    crazy_egg: /crazyegg\.com/i,
    mouseflow: /mouseflow\.com/i,
    fullstory: /fullstory\.com/i,
    drift: /drift\.com|driftt\.com/i,
    intercom: /intercom\.io|intercomcdn\.com/i,
    zendesk: /zendesk\.com|zopim\.com/i,
    qualtrics: /qualtrics\.com/i,
    surveysparrow: /surveysparrow\.com/i,
    google_adsense: /google.*ad|adsense\.google|pagead|googleadmanager/i,
    google_tag_manager: /gtm\.js|googletagmanager\.com/i,
    appnexus: /appnexus\.com|ams\.xandr\.com/i,
    criteo: /criteo\.com|criteocdn\.com/i,
    doubleclick: /doubleclick\.net|googlesyndication\.com/i,
    rubicon: /rubiconproject\.com|rpxl\.io/i,
    openx: /openx\.com|openxcdn\.com/i,
    pubmatic: /pubmatic\.com/i,
    flurry: /flurry\.com/i,
    chartbeat: /chartbeat\.net/i,
    comscore: /comscore\.com/i,
    quantcast: /quantcast\.com|quantserve\.com/i,
    urchin: /urchin\.js|analytics\.google|stats\./i
};
function detectTrackingService(url) {
    for (const [service, pattern] of Object.entries(TRACKING_PIXEL_PATTERNS)) {
        if (pattern.test(url)) {
            return service;
        }
    }
    return null;
}
export async function analyzeIFrames(page) {
    try {
        const iframes = await page.evaluate(() => {
            const frames = Array.from(document.querySelectorAll('iframe'));
            return frames.map((frame) => ({
                src: frame.src || null,
                title: frame.title || null,
                name: frame.name || null,
                id: frame.id || null,
                className: frame.className || null,
                width: frame.width || null,
                height: frame.height || null,
                sandbox: frame.sandbox?.toString() || null,
                frameBorder: frame.frameBorder || null,
                loading: frame.loading || null,
                referrerPolicy: frame.referrerPolicy || null,
                allow: frame.allow || null,
                credentialless: frame.credentialless || false,
                visible: {
                    offsetParent: frame.offsetParent !== null,
                    clientHeight: frame.clientHeight,
                    clientWidth: frame.clientWidth
                }
            }));
        });
        const categorized = {
            advertising: [],
            analytics: [],
            social: [],
            embedded_content: [],
            unknown: []
        };
        iframes.forEach((iframe) => {
            if (!iframe.src || iframe.src === '') {
                categorized.unknown.push(iframe);
                return;
            }
            const src = iframe.src.toLowerCase();
            if (/doubleclick|google.*ad|adsense|criteo|appnexus|rubicon|openx|pubmatic|xandr/i.test(src)) {
                categorized.advertising.push(iframe);
            }
            else if (/google.*analytics|gtag|mixpanel|amplitude|segment|hotjar|fullstory/i.test(src)) {
                categorized.analytics.push(iframe);
            }
            else if (/facebook|twitter|linkedin|reddit|youtube|instagram|tiktok/i.test(src)) {
                categorized.social.push(iframe);
            }
            else if (/youtube|vimeo|dailymotion|soundcloud|spotify|disqus|typeform|zendesk/i.test(src)) {
                categorized.embedded_content.push(iframe);
            }
            else {
                categorized.unknown.push(iframe);
            }
        });
        return {
            present: iframes.length > 0,
            count: iframes.length,
            iframes,
            categorized
        };
    }
    catch (error) {
        logger?.error('[ContentAnalyzer] Error analyzing iframes:', error);
        return {
            present: false,
            count: 0,
            iframes: [],
            categorized: {
                advertising: [],
                analytics: [],
                social: [],
                embedded_content: [],
                unknown: []
            },
            error: error.message
        };
    }
}
export async function detectTrackingPixels(page) {
    try {
        const trackingElements = await page.evaluate(() => {
            const pixels = [];
            Array.from(document.querySelectorAll('img')).forEach((img) => {
                const src = img.src || '';
                const isTrackingPixel = src.includes('gif') ||
                    src.includes('pixel') ||
                    src.includes('beacon') ||
                    src.includes('track') ||
                    (img.width === 1 && img.height === 1) ||
                    (parseInt(String(img.width)) <= 10 && parseInt(String(img.height)) <= 10);
                if (isTrackingPixel && src.length > 0) {
                    pixels.push({
                        type: 'img',
                        src,
                        width: img.width,
                        height: img.height,
                        alt: img.alt || null
                    });
                }
            });
            const scripts = Array.from(document.querySelectorAll('script'));
            scripts.forEach((script) => {
                const content = script.textContent || '';
                if (/gtag|ga\(|_gaq|_gat|analytics\.push|amplitude\.getInstance|mixpanel\.track|intercom|drift|zendesk|fbq|twq\.track|rdt|_fbp|_fbc/i.test(content)) {
                    pixels.push({
                        type: 'script_tracking',
                        service: 'inline_tracking_script',
                        snippet: content.substring(0, 200)
                    });
                }
            });
            const trackingAttrs = [];
            document.querySelectorAll('[data-track], [data-analytics], [data-event]').forEach((el) => {
                trackingAttrs.push({
                    tag: el.tagName.toLowerCase(),
                    attributes: Object.fromEntries(Array.from(el.attributes)
                        .filter((attr) => /track|analytics|event|ga|gtag|amplitude|mixpanel|segment|hotjar/i.test(attr.name))
                        .map((attr) => [attr.name, attr.value]))
                });
            });
            return {
                pixels,
                trackingScripts: pixels.filter((p) => p.type === 'script_tracking').length,
                trackingAttributes: trackingAttrs
            };
        });
        if (page.client && typeof page.client.send === 'function') {
            try {
                // Network monitoring would be setup here
            }
            catch {
                // Network monitoring not available in this context
            }
        }
        const services = {};
        trackingElements.pixels.forEach((pixel) => {
            if (pixel.src) {
                const service = detectTrackingService(pixel.src);
                if (service) {
                    if (!services[service]) {
                        services[service] = [];
                    }
                    services[service].push(pixel);
                }
            }
        });
        return {
            present: trackingElements.pixels.length > 0 || trackingElements.trackingScripts > 0,
            detectedServices: Object.keys(services),
            pixelCount: trackingElements.pixels.filter((p) => p.type === 'img').length,
            trackingScriptCount: trackingElements.trackingScripts,
            trackingAttributeCount: trackingElements.trackingAttributes.length,
            pixels: trackingElements.pixels,
            services,
            trackingAttributes: trackingElements.trackingAttributes
        };
    }
    catch (error) {
        logger?.error('[ContentAnalyzer] Error detecting tracking pixels:', error);
        return {
            present: false,
            detectedServices: [],
            pixelCount: 0,
            trackingScriptCount: 0,
            trackingAttributeCount: 0,
            pixels: [],
            services: {},
            trackingAttributes: [],
            error: error.message
        };
    }
}
//# sourceMappingURL=content-analyzer.js.map