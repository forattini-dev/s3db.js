import S3db from '../src/index.js';
import { calculateTotalSize } from '../src/concerns/calculator.js';

// Debug clicks resource specifically
async function debugClicksResource() {
  console.log('🔧 Debugging Clicks Resource...\n');

  const db = await setupDatabase());

  try {
    // Connect to databaseconsole.log('✅ Connected to database');

    // Get the clicks resource
    const clicksResource = await db.getResource('clicks');
    
    console.log('\n📋 Clicks Resource Configuration:');
    console.log('  - Name:', clicksResource.name);
    console.log('  - Behavior:', clicksResource.behavior);
    console.log('  - Timestamps:', clicksResource.config.timestamps);
    console.log('  - Partitions:', Object.keys(clicksResource.config.partitions || {}));

    // Create test data similar to what's causing the error
    const testClickData = {
      queryParams: 'utm_source=google&utm_medium=cpc&utm_campaign=test',
      userAgentData: {
        browser: 'Chrome',
        browserDetails: {
          name: 'Chrome',
          version: '120.0.0.0',
          engine: 'Blink',
          isHeadless: false,
          isInApp: false,
          isPWA: false,
          isElectron: false,
          isReactNative: false,
          isCordova: false,
          isCapacitor: false
        },
        os: 'Windows',
        osDetails: {
          name: 'Windows',
          version: '11',
          architecture: 'x64',
          isMobile: false,
          isTablet: false,
          isDesktop: true,
          isTouch: false,
          isRetina: false
        },
        device: 'Desktop',
        deviceDetails: {
          type: 'desktop',
          model: 'Unknown',
          brand: 'Unknown',
          isSmartTV: false,
          isGaming: false,
          isIoT: false,
          isWearable: false
        },
        engine: 'Blink',
        language: 'en-US',
        isBot: false,
        botType: null,
        isAIBot: false,
        aiBotType: null,
        aiBotPurpose: null,
        securityInfo: {
          hasDoNotTrack: false,
          hasPrivacyMode: false,
          hasVPN: false,
          hasTor: false,
          isSecure: true
        },
        performanceInfo: {
          hasWebGL: true,
          hasWebRTC: true,
          hasServiceWorker: true,
          hasPushAPI: true,
          hasNotifications: true,
          hasGeolocation: true,
          hasWebAssembly: true
        },
        accessibilityInfo: {
          hasScreenReader: false,
          hasHighContrast: false,
          hasLargeText: false,
          hasReducedMotion: false
        },
        networkInfo: {
          connectionType: 'wifi',
          isSlowConnection: false,
          isFastConnection: true,
          isOffline: false
        },
        capabilities: {
          canPlayVideo: true,
          canPlayAudio: true,
          canUseCamera: true,
          canUseMicrophone: true,
          canUseGPS: true,
          canUseBluetooth: true,
          canUseNFC: false,
          canUseFingerprint: false
        },
        environmentInfo: {
          isDevelopment: false,
          isTesting: false,
          isProduction: true,
          isEmulator: false,
          isVirtualMachine: false,
          isDocker: false,
          isKubernetes: false,
          isServerless: false
        },
        technologyStack: {
          hasReact: true,
          hasVue: false,
          hasAngular: false,
          hasSvelte: false,
          hasJQuery: false,
          hasBootstrap: false,
          hasTailwind: false,
          hasMaterialUI: false
        },
        mediaSupport: {
          hasVideoSupport: true,
          hasAudioSupport: true,
          hasWebM: true,
          hasMP4: true,
          hasH264: true,
          hasH265: false,
          hasVP8: true,
          hasVP9: true,
          hasAV1: false
        },
        inputMethods: {
          hasTouch: false,
          hasMouse: true,
          hasKeyboard: true,
          hasGamepad: false,
          hasPen: false,
          hasVoice: false,
          hasGesture: false
        },
        privacyFeatures: {
          hasAdBlocker: false,
          hasTrackingProtection: false,
          hasFingerprintProtection: false,
          hasCookieBlocking: false,
          hasScriptBlocking: false
        },
        accessibilityFeatures: {
          hasScreenReader: false,
          hasHighContrast: false,
          hasLargeText: false,
          hasReducedMotion: false,
          hasColorBlindnessSupport: false,
          hasKeyboardNavigation: true,
          hasVoiceControl: false
        },
        raw: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    console.log('\n📊 Testing data size before mapping...');
    console.log('  - User agent data size:', JSON.stringify(testClickData.userAgentData).length, 'characters');

    // Test the mapping process
    const mappedData = await clicksResource.schema.mapper(testClickData);
    const totalSize = calculateTotalSize(mappedData);
    
    console.log('\n📊 Mapped data size analysis:');
    console.log('  - Total mapped data size:', totalSize, 'bytes');
    console.log('  - S3 limit:', 2048, 'bytes');
    console.log('  - Exceeds limit:', totalSize > 2048 ? '✅ Yes' : '❌ No');

    // Test the behavior manually
    console.log('\n🔄 Testing behavior manually...');
    const behaviorImpl = await import('../src/behaviors/index.js');
    const bodyOverflowBehavior = behaviorImpl.getBehavior(clicksResource.behavior);
    
    const behaviorResult = await bodyOverflowBehavior.handleInsert({
      resource: clicksResource,
      data: testClickData,
      mappedData
    });

    console.log('\n📋 Behavior result:');
    console.log('  - Metadata keys:', Object.keys(behaviorResult.mappedData));
    console.log('  - Body content length:', behaviorResult.body.length);
    console.log('  - Has overflow flag:', behaviorResult.mappedData['$overflow'] === 'true' ? '✅ Yes' : '❌ No');

    // Calculate final metadata size
    const finalMetadataSize = calculateTotalSize(behaviorResult.mappedData);
    console.log('\n📊 Final metadata size:');
    console.log('  - Final metadata size:', finalMetadataSize, 'bytes');
    console.log('  - Within limit:', finalMetadataSize <= 2048 ? '✅ Yes' : '❌ No');

    // Test actual insert
    console.log('\n🔄 Testing actual insert...');
    try {
      const insertedClick = await clicksResource.insert(testClickData);
      console.log('✅ Click inserted successfully:', insertedClick.id);
    } catch (error) {
      console.error('❌ Insert failed:', error.message);
      console.error('Error details:', error);
    }
  } finally {
    await teardownDatabase();
  }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

debugClicksResource(); 