export async function detectAntiBotServices(page) {
    try {
        const result = await page.evaluate(() => {
            const detected = {
                detected: false,
                services: [],
                captchaPresent: false,
                captchaType: null,
                scripts: [],
                cookies: []
            };
            const antiBotPatterns = [
                {
                    name: 'Cloudflare',
                    scriptPatterns: [/cloudflare/i, /cf-ray/i, /cf_chl_/i, /__cf_bm/i],
                    cookiePatterns: [/cf_clearance/i, /__cf_bm/i, /cf_chl_/i],
                    elementPatterns: ['div#cf-wrapper', '.cf-browser-verification']
                },
                {
                    name: 'reCAPTCHA',
                    scriptPatterns: [/recaptcha/i, /google\.com\/recaptcha/i],
                    elementPatterns: ['.g-recaptcha', '#recaptcha', 'iframe[src*="recaptcha"]']
                },
                {
                    name: 'hCaptcha',
                    scriptPatterns: [/hcaptcha/i, /hcaptcha\.com/i],
                    elementPatterns: ['.h-captcha', '#hcaptcha', 'iframe[src*="hcaptcha"]']
                },
                {
                    name: 'Imperva/Incapsula',
                    scriptPatterns: [/incapsula/i, /visid_incap/i, /incap_ses/i],
                    cookiePatterns: [/visid_incap/i, /incap_ses/i]
                },
                {
                    name: 'Akamai',
                    scriptPatterns: [/akamai/i, /ak_bmsc/i],
                    cookiePatterns: [/ak_bmsc/i, /bm_sz/i]
                },
                {
                    name: 'DataDome',
                    scriptPatterns: [/datadome/i],
                    cookiePatterns: [/datadome/i]
                },
                {
                    name: 'PerimeterX',
                    scriptPatterns: [/perimeterx/i, /_px/i],
                    cookiePatterns: [/_px/i, /_pxvid/i]
                },
                {
                    name: 'FingerprintJS',
                    scriptPatterns: [/fingerprintjs/i, /fpjs/i],
                    elementPatterns: []
                },
                {
                    name: 'GeeTest',
                    scriptPatterns: [/geetest/i, /gt\.js/i],
                    elementPatterns: ['.geetest_', '#geetest']
                },
                {
                    name: 'Arkose Labs/FunCaptcha',
                    scriptPatterns: [/arkoselabs/i, /funcaptcha/i],
                    elementPatterns: ['#arkose', '.funcaptcha']
                }
            ];
            // Collect all scripts
            const scripts = Array.from(document.querySelectorAll('script'));
            const scriptSources = scripts
                .map(s => s.src || s.textContent || '')
                .filter(Boolean);
            detected.scripts = scriptSources.filter(s => s.length < 500);
            // Check cookies
            const cookies = document.cookie.split(';').map(c => c.trim());
            detected.cookies = cookies;
            // Check for each anti-bot service
            for (const service of antiBotPatterns) {
                const indicators = [];
                // Check scripts
                for (const pattern of service.scriptPatterns || []) {
                    const found = scriptSources.some(src => pattern.test(src));
                    if (found) {
                        indicators.push(`script:${pattern.source}`);
                    }
                }
                // Check cookies
                for (const pattern of service.cookiePatterns || []) {
                    const found = cookies.some(c => pattern.test(c));
                    if (found) {
                        indicators.push(`cookie:${pattern.source}`);
                    }
                }
                // Check DOM elements
                for (const selector of service.elementPatterns || []) {
                    const element = document.querySelector(selector);
                    if (element) {
                        indicators.push(`element:${selector}`);
                    }
                }
                if (indicators.length > 0) {
                    detected.services.push({
                        name: service.name,
                        detected: true,
                        indicators
                    });
                    detected.detected = true;
                    // Check for CAPTCHA
                    if (['reCAPTCHA', 'hCaptcha', 'GeeTest', 'Arkose Labs/FunCaptcha'].includes(service.name)) {
                        detected.captchaPresent = true;
                        detected.captchaType = service.name;
                    }
                }
            }
            return detected;
        });
        return result;
    }
    catch (error) {
        const err = error;
        return {
            detected: false,
            services: [],
            captchaPresent: false,
            captchaType: null,
            scripts: [],
            cookies: [],
            error: err.message
        };
    }
}
export async function detectFingerprinting(page) {
    try {
        const result = await page.evaluate(() => {
            const detected = {
                fingerprintingDetected: false,
                capabilities: [],
                canvasFingerprint: false,
                webglFingerprint: false,
                audioFingerprint: false,
                fontFingerprint: false,
                screenFingerprint: false,
                hardwareFingerprint: false,
                apiCallsDetected: []
            };
            // Canvas fingerprinting
            const canvas = document.createElement('canvas');
            const canvasCtx = canvas.getContext('2d');
            detected.canvasFingerprint = !!canvasCtx;
            detected.capabilities.push({
                name: 'Canvas 2D',
                available: !!canvasCtx
            });
            // WebGL fingerprinting
            const webglCanvas = document.createElement('canvas');
            const gl = webglCanvas.getContext('webgl') || webglCanvas.getContext('experimental-webgl');
            detected.webglFingerprint = !!gl;
            if (gl) {
                const glContext = gl;
                const debugInfo = glContext.getExtension('WEBGL_debug_renderer_info');
                detected.capabilities.push({
                    name: 'WebGL',
                    available: true,
                    details: {
                        vendor: debugInfo ? glContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
                        renderer: debugInfo ? glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null
                    }
                });
            }
            // Audio fingerprinting
            const AudioContext = window.AudioContext ||
                window.webkitAudioContext;
            detected.audioFingerprint = !!AudioContext;
            detected.capabilities.push({
                name: 'AudioContext',
                available: !!AudioContext
            });
            // Screen fingerprinting
            detected.screenFingerprint = true;
            detected.capabilities.push({
                name: 'Screen',
                available: true,
                details: {
                    width: screen.width,
                    height: screen.height,
                    colorDepth: screen.colorDepth,
                    pixelRatio: window.devicePixelRatio
                }
            });
            // Hardware fingerprinting
            detected.hardwareFingerprint = true;
            detected.capabilities.push({
                name: 'Hardware',
                available: true,
                details: {
                    hardwareConcurrency: navigator.hardwareConcurrency,
                    deviceMemory: navigator.deviceMemory,
                    platform: navigator.platform
                }
            });
            // Font fingerprinting check
            detected.fontFingerprint = true;
            detected.capabilities.push({
                name: 'Fonts',
                available: true
            });
            // Check if fingerprinting is likely occurring
            detected.fingerprintingDetected = detected.canvasFingerprint ||
                detected.webglFingerprint ||
                detected.audioFingerprint;
            return detected;
        });
        return result;
    }
    catch (error) {
        const err = error;
        return {
            fingerprintingDetected: false,
            capabilities: [],
            canvasFingerprint: false,
            webglFingerprint: false,
            audioFingerprint: false,
            fontFingerprint: false,
            screenFingerprint: false,
            hardwareFingerprint: false,
            apiCallsDetected: [],
            error: err.message
        };
    }
}
export async function detectBlockingSignals(page) {
    try {
        const pageContent = await page.content();
        const result = {
            blocked: false,
            signals: []
        };
        // Check for common blocking patterns in page content
        const blockingPatterns = [
            {
                type: 'access-denied',
                patterns: [/access denied/i, /forbidden/i, /blocked/i, /403/]
            },
            {
                type: 'rate-limited',
                patterns: [/rate limit/i, /too many requests/i, /429/]
            },
            {
                type: 'bot-detected',
                patterns: [/bot detected/i, /automated/i, /suspicious/i, /unusual traffic/i]
            },
            {
                type: 'verification-required',
                patterns: [/verify.*human/i, /not a robot/i, /prove.*human/i]
            },
            {
                type: 'javascript-challenge',
                patterns: [/javascript.*required/i, /enable javascript/i, /checking your browser/i]
            }
        ];
        for (const { type, patterns } of blockingPatterns) {
            const evidence = [];
            for (const pattern of patterns) {
                if (pattern.test(pageContent)) {
                    evidence.push(pattern.source);
                }
            }
            if (evidence.length > 0) {
                result.signals.push({
                    type,
                    detected: true,
                    evidence
                });
                result.blocked = true;
            }
        }
        return result;
    }
    catch (error) {
        const err = error;
        return {
            blocked: false,
            signals: [],
            error: err.message
        };
    }
}
export async function detectAntiBotsAndFingerprinting(page) {
    try {
        const [antiBots, fingerprinting, blocking] = await Promise.all([
            detectAntiBotServices(page),
            detectFingerprinting(page),
            detectBlockingSignals(page)
        ]);
        // Calculate risk level
        let riskLevel = 'low';
        if (blocking.blocked) {
            riskLevel = 'high';
        }
        else if (antiBots.captchaPresent || antiBots.services.length > 2) {
            riskLevel = 'high';
        }
        else if (antiBots.detected || fingerprinting.fingerprintingDetected) {
            riskLevel = 'medium';
        }
        return {
            antiBots,
            fingerprinting,
            blocking,
            summary: {
                antiBotDetected: antiBots.detected,
                fingerprintingAttempted: fingerprinting.fingerprintingDetected,
                accessBlocked: blocking.blocked,
                riskLevel
            }
        };
    }
    catch (error) {
        const err = error;
        return {
            antiBots: {
                detected: false,
                services: [],
                captchaPresent: false,
                captchaType: null,
                scripts: [],
                cookies: []
            },
            fingerprinting: {
                fingerprintingDetected: false,
                capabilities: [],
                canvasFingerprint: false,
                webglFingerprint: false,
                audioFingerprint: false,
                fontFingerprint: false,
                screenFingerprint: false,
                hardwareFingerprint: false,
                apiCallsDetected: []
            },
            blocking: {
                blocked: false,
                signals: []
            },
            summary: {
                antiBotDetected: false,
                fingerprintingAttempted: false,
                accessBlocked: false,
                riskLevel: 'low'
            },
            error: err.message
        };
    }
}
//# sourceMappingURL=anti-bot-detector.js.map