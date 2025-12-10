export class TechDetector {
    config;
    signatures;
    constructor(config = {}) {
        this.config = {
            detectFrameworks: config.detectFrameworks !== false,
            detectAnalytics: config.detectAnalytics !== false,
            detectMarketing: config.detectMarketing !== false,
            detectCDN: config.detectCDN !== false,
            detectWebServer: config.detectWebServer !== false,
            detectCMS: config.detectCMS !== false
        };
        this.signatures = {
            frameworks: {
                react: {
                    indicators: ['react', 'react-dom', '__REACT_DEVTOOLS_GLOBAL_HOOK__', '__REACT_'],
                    patterns: [
                        /react[\\/]dist/i,
                        /react\.js/i,
                        /react\.development\.js/i,
                        /__react/i,
                        /_react/i
                    ]
                },
                vue: {
                    indicators: ['vue', '__VUE__', '__VUE_SSR_CONTEXT__'],
                    patterns: [/vue[\\/]dist/i, /vue\.js/i, /vue\.global/i, /__vue/i]
                },
                angular: {
                    indicators: ['angular', 'ng-app', 'ng-controller', 'ng-version'],
                    patterns: [/angular[\\/]angular\.js/i, /angular\.min\.js/i, /ng-app/i, /__angular/i]
                },
                svelte: {
                    indicators: ['svelte', '__svelte', 'svelte:'],
                    patterns: [/svelte[\\/]/i, /svelte\.js/i]
                },
                ember: {
                    indicators: ['ember', 'Ember', '__EMBER'],
                    patterns: [/ember[\\/]/i, /ember\.js/i]
                },
                nextjs: {
                    indicators: ['__NEXT_DATA__', '__next', 'next.js'],
                    patterns: [/__next/i, /\/_next\//i]
                },
                nuxt: {
                    indicators: ['__NUXT__', 'nuxt'],
                    patterns: [/__nuxt/i, /\/_nuxt\//i]
                },
                gatsby: {
                    indicators: ['__GATSBY', 'gatsby'],
                    patterns: [/__gatsby/i, /gatsby\./i]
                },
                remix: {
                    indicators: ['__REMIX__', 'remix'],
                    patterns: [/__REMIX/i]
                },
                jquery: {
                    indicators: ['jQuery', '$.ajax', 'jQuery.ajax'],
                    patterns: [/jquery[\\/]/i, /jquery\.js/i, /jquery\.min\.js/i]
                },
                lodash: {
                    indicators: ['_', 'lodash'],
                    patterns: [/lodash[\\/]/i, /lodash\.js/i]
                },
                d3: {
                    indicators: ['d3', '__d3'],
                    patterns: [/d3[\\/]/i, /d3\.js/i, /d3\.min\.js/i]
                },
                threejs: {
                    indicators: ['THREE', 'three'],
                    patterns: [/three[\\/]/i, /three\.js/i]
                },
                chart: {
                    indicators: ['Chart', 'chart.js'],
                    patterns: [/chart\.js/i, /charts\//i]
                }
            },
            analytics: {
                googleAnalytics: {
                    indicators: ['ga(', 'gtag', 'google-analytics', '__utma'],
                    patterns: [/google-analytics\.com\/analytics\.js/i, /ga\.js/i, /gtag\.js/i, /UA-\d+-\d+/]
                },
                amplitude: {
                    indicators: ['amplitude', 'Amplitude'],
                    patterns: [/amplitude[\\/]/i, /amplitude\.js/i, /amplitude\.min\.js/i]
                },
                mixpanel: {
                    indicators: ['mixpanel', 'Mixpanel'],
                    patterns: [/mixpanel[\\/]/i, /mixpanel\.js/i]
                },
                hotjar: {
                    indicators: ['hj(', 'hotjar'],
                    patterns: [/hotjar[\\/]/i, /hotjar\.js/i]
                },
                segment: {
                    indicators: ['analytics.load', 'analytics.track'],
                    patterns: [/segment[\\/]/i, /analytics\.js/i]
                },
                intercom: {
                    indicators: ['Intercom', 'window.Intercom'],
                    patterns: [/intercom[\\/]/i, /intercom\.js/i]
                },
                drift: {
                    indicators: ['drift', 'Drift'],
                    patterns: [/drift[\\/]/i, /drift\.js/i]
                },
                zendesk: {
                    indicators: ['zendesk', 'Zendesk'],
                    patterns: [/zendesk[\\/]/i, /zendesk\.js/i]
                },
                newRelic: {
                    indicators: ['newRelic', 'newrelic'],
                    patterns: [/newrelic[\\/]/i, /newrelic\.js/i, /bam\.nr-data\.net/i]
                },
                datadog: {
                    indicators: ['datadogRum', 'DD_RUM'],
                    patterns: [/datadog[\\/]/i, /rum\.js/i, /datadoghq\.com/i]
                },
                logrocket: {
                    indicators: ['LogRocket', 'logrocket'],
                    patterns: [/logrocket[\\/]/i, /logrocket\.js/i]
                },
                fullstory: {
                    indicators: ['FS', 'FS.ready'],
                    patterns: [/fullstory[\\/]/i, /record\.js/i]
                },
                pendo: {
                    indicators: ['pendo', 'Pendo'],
                    patterns: [/pendo[\\/]/i, /pendo\.js/i]
                },
                mouseflow: {
                    indicators: ['mouseflow'],
                    patterns: [/mouseflow[\\/]/i, /mf\.js/i]
                }
            },
            marketing: {
                facebookPixel: {
                    indicators: ['fbq(', 'facebook pixel'],
                    patterns: [/facebook\.com\/en_US\/fbevents\.js/i, /fbq\(/]
                },
                linkedinInsight: {
                    indicators: ['_linkedin_partner_id'],
                    patterns: [/linkedin[\\/]/i, /px\.ads\.linkedin/i]
                },
                googleAds: {
                    indicators: ["gtag('config', 'G-", "gtag('event'"],
                    patterns: [/google-analytics\.com\//i, /gtag\.js/i]
                },
                twitterPixel: {
                    indicators: ['twtr', 'twitter'],
                    patterns: [/twitter\.com\/wfa\.js/i, /t\.co\//i]
                },
                pinterestTag: {
                    indicators: ['pintrk('],
                    patterns: [/s\.pinimg\.com\/ct\/core\.js/i]
                },
                snapchatPixel: {
                    indicators: ['snaptr'],
                    patterns: [/snapchat\.com\/snaptr\.js/i]
                },
                tiktokPixel: {
                    indicators: ['ttq'],
                    patterns: [/tiktok\.com\/.*pixel/i]
                },
                redditPixel: {
                    indicators: ['rdt'],
                    patterns: [/reddit\.com\/pixel/i]
                },
                hubspot: {
                    indicators: ['hbspt', 'HubSpot'],
                    patterns: [/hubspot[\\/]/i, /hs.*\.js/i]
                },
                marketo: {
                    indicators: ['mktoMunchkin'],
                    patterns: [/munchkin\.marketo\.net/i]
                },
                salesforce: {
                    indicators: ['_sfc_', 'salesforce'],
                    patterns: [/salesforce[\\/]/i]
                }
            },
            cdn: {
                cloudflare: {
                    indicators: ['Cloudflare', 'cf'],
                    patterns: [/cdn\.cloudflare\.com/i, /cloudflare[\\/]/i]
                },
                cloudfront: {
                    indicators: ['CloudFront'],
                    patterns: [/cloudfront\.net/i, /d[0-9a-z]+\.cloudfront\.net/i]
                },
                akamai: {
                    indicators: ['akamai'],
                    patterns: [/akamai[\\/]/i, /akamaized\.net/i]
                },
                fastly: {
                    indicators: ['fastly'],
                    patterns: [/fastly[\\/]/i, /fastly\.net/i]
                },
                stackpath: {
                    indicators: ['stackpath'],
                    patterns: [/stackpath[\\/]/i, /stackpathcdn\.com/i]
                },
                imperva: {
                    indicators: ['imperva'],
                    patterns: [/imperva[\\/]/i]
                },
                aws: {
                    indicators: ['amazonaws'],
                    patterns: [/amazonaws\.com/i, /s3[\./]/i, /cloudfront/i]
                },
                gcp: {
                    indicators: ['gstatic', 'googleapis'],
                    patterns: [/gstatic\.com/i, /googleapis\.com/i, /googleusercontent/i]
                },
                azure: {
                    indicators: ['azureedge'],
                    patterns: [/azureedge\.net/i, /azure[\\/]/i]
                }
            },
            webServer: {
                nginx: {
                    patterns: [/nginx/i],
                    headers: ['Server: nginx']
                },
                apache: {
                    patterns: [/apache/i],
                    headers: ['Server: Apache']
                },
                iis: {
                    patterns: [/iis/i, /asp\.net/i],
                    headers: ['Server: Microsoft-IIS', 'X-Powered-By: ASP.NET']
                },
                express: {
                    patterns: [/express/i],
                    headers: ['X-Powered-By: Express']
                },
                tomcat: {
                    patterns: [/tomcat/i],
                    headers: ['Server: Tomcat']
                },
                lighttpd: {
                    patterns: [/lighttpd/i],
                    headers: ['Server: lighttpd']
                }
            },
            cms: {
                wordpress: {
                    indicators: ['wp-content', 'wp-includes', 'WordPress'],
                    patterns: [/\/wp-content\//i, /\/wp-includes\//i, /wordpress/i]
                },
                shopify: {
                    indicators: ['Shopify', 'shopify', '__SHOPIFY__'],
                    patterns: [/shopify[\\/]/i, /cdn\.shopify\.com/i, /__SHOPIFY/i]
                },
                drupal: {
                    indicators: ['Drupal'],
                    patterns: [/drupal[\\/]/i, /sites\/all\/modules/i]
                },
                joomla: {
                    indicators: ['Joomla'],
                    patterns: [/joomla/i, /components\/com_/i]
                },
                wix: {
                    indicators: ['Wix', 'wix'],
                    patterns: [/wix[\\/]/i, /wixstatic/i]
                },
                squarespace: {
                    indicators: ['squarespace'],
                    patterns: [/squarespace[\\/]/i, /static\.squarespace\.com/i]
                },
                webflow: {
                    indicators: ['webflow'],
                    patterns: [/webflow[\\/]/i, /cdn\.webflow\.com/i]
                },
                weebly: {
                    indicators: ['weebly'],
                    patterns: [/weebly[\\/]/i, /cdn1\.editmysite/i]
                },
                bigcommerce: {
                    indicators: ['bigcommerce'],
                    patterns: [/bigcommerce[\\/]/i, /cdn\.bigcommerce\.com/i]
                },
                magento: {
                    indicators: ['Magento', 'magento'],
                    patterns: [/magento[\\/]/i, /skin\/frontend/i]
                }
            },
            libraries: {
                bootstrap: {
                    indicators: ['bootstrap'],
                    patterns: [/bootstrap[\\/]/i, /bootstrap\.js/i, /bootstrap\.css/i]
                },
                tailwind: {
                    indicators: ['tailwind'],
                    patterns: [/tailwind[\\/]/i, /tailwind\.css/i]
                },
                materialize: {
                    indicators: ['materialize'],
                    patterns: [/materialize[\\/]/i, /materialize\.js/i]
                },
                fontawesome: {
                    indicators: ['fontawesome', 'font-awesome'],
                    patterns: [/fontawesome[\\/]/i, /font-awesome/i]
                },
                animate: {
                    indicators: ['animate.css'],
                    patterns: [/animate[\\/]animate\.css/i]
                },
                aos: {
                    indicators: ['aos', 'AOS'],
                    patterns: [/aos[\\/]/i, /aos\.js/i]
                },
                gsap: {
                    indicators: ['gsap', 'TweenMax'],
                    patterns: [/gsap[\\/]/i, /TweenMax/i]
                },
                moment: {
                    indicators: ['moment'],
                    patterns: [/moment[\\/]/i, /moment\.js/i]
                },
                axios: {
                    indicators: ['axios'],
                    patterns: [/axios[\\/]/i, /axios\.js/i]
                },
                fetch: {
                    indicators: ['fetch'],
                    patterns: [/fetch/i]
                }
            }
        };
    }
    fingerprintSelective(html, activities = []) {
        if (!activities || activities.length === 0) {
            return this.fingerprint(html);
        }
        const result = {
            frameworks: [],
            analytics: [],
            marketing: [],
            cdn: [],
            webServers: [],
            cms: [],
            libraries: []
        };
        if (activities.includes('tech_frameworks')) {
            result.frameworks = this._detectFrameworks(html);
        }
        if (activities.includes('tech_analytics')) {
            result.analytics = this._detectAnalytics(html);
        }
        if (activities.includes('tech_marketing')) {
            result.marketing = this._detectMarketing(html);
        }
        if (activities.includes('tech_cdn')) {
            result.cdn = this._detectCDN(html);
        }
        if (activities.includes('tech_web_server')) {
            result.webServers = this._detectWebServers(html);
        }
        if (activities.includes('tech_cms')) {
            result.cms = this._detectCMS(html);
        }
        if (activities.includes('tech_libraries')) {
            result.libraries = this._detectLibraries(html);
        }
        return result;
    }
    fingerprint(html) {
        const result = {
            frameworks: [],
            analytics: [],
            marketing: [],
            cdn: [],
            webServers: [],
            cms: [],
            libraries: []
        };
        if (this.config.detectFrameworks) {
            result.frameworks = this._detectFrameworks(html);
        }
        if (this.config.detectAnalytics) {
            result.analytics = this._detectAnalytics(html);
        }
        if (this.config.detectMarketing) {
            result.marketing = this._detectMarketing(html);
        }
        if (this.config.detectCDN) {
            result.cdn = this._detectCDN(html);
        }
        if (this.config.detectWebServer) {
            result.webServers = this._detectWebServers(html);
        }
        if (this.config.detectCMS) {
            result.cms = this._detectCMS(html);
        }
        result.libraries = this._detectLibraries(html);
        return result;
    }
    _detectFrameworks(html) {
        return this._detectCategory(html, this.signatures.frameworks);
    }
    _detectAnalytics(html) {
        return this._detectCategory(html, this.signatures.analytics);
    }
    _detectMarketing(html) {
        return this._detectCategory(html, this.signatures.marketing);
    }
    _detectCDN(html) {
        return this._detectCategory(html, this.signatures.cdn);
    }
    _detectWebServers(html) {
        return this._detectCategory(html, this.signatures.webServer);
    }
    _detectCMS(html) {
        return this._detectCategory(html, this.signatures.cms);
    }
    _detectLibraries(html) {
        return this._detectCategory(html, this.signatures.libraries);
    }
    _detectCategory(html, signatures) {
        const detected = [];
        for (const [techName, signature] of Object.entries(signatures)) {
            if (this._isDetected(html, signature)) {
                detected.push(techName);
            }
        }
        return detected;
    }
    _isDetected(html, signature) {
        if (signature.indicators) {
            for (const indicator of signature.indicators) {
                if (html.toLowerCase().includes(indicator.toLowerCase())) {
                    return true;
                }
            }
        }
        if (signature.patterns) {
            for (const pattern of signature.patterns) {
                if (pattern.test(html)) {
                    return true;
                }
            }
        }
        if (signature.headers) {
            for (const header of signature.headers) {
                if (html.includes(header)) {
                    return true;
                }
            }
        }
        return false;
    }
}
export default TechDetector;
//# sourceMappingURL=tech-detector.js.map