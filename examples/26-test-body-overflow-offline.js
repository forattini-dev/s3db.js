import { getBehavior } from '../src/behaviors/index.js';
import { setupDatabase, teardownDatabase } from './database.js';
import { calculateTotalSize } from '../src/concerns/calculator.js';

// Test body-overflow behavior offline
async function testBodyOverflowOffline() {
  console.log('🔧 Testing Body Overflow Behavior (Offline)...\n');

  try {
    // Get the body-overflow behavior
    const bodyOverflowBehavior = getBehavior('body-overflow');
    console.log('✅ Body overflow behavior loaded');

    // Create a mock resource and data
    const mockResource = {
      name: 'test-resource',
      behavior: 'body-overflow'
    };

    // Create large data that should trigger overflow
    const largeData = {
      name: 'John Doe',
      email: 'john@example.com',
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

    // Simulate mapped data (what would come from schema.mapper)
    const mappedData = {
      '0': 'John Doe',
      '1': 'john@example.com',
      '2': JSON.stringify(largeData.userAgentData)
    };

    console.log('\n📊 Original data size analysis:');
    const originalSize = calculateTotalSize(mappedData);
    console.log('  - Total mapped data size:', originalSize, 'bytes');
    console.log('  - S3 limit:', 2048, 'bytes');
    console.log('  - Exceeds limit:', originalSize > 2048 ? '✅ Yes' : '❌ No');

    // Test the body-overflow behavior
    console.log('\n🔄 Testing body-overflow behavior...');
    const result = await bodyOverflowBehavior.handleInsert({
      resource: mockResource,
      data: largeData,
      mappedData
    });

    console.log('\n📋 Body overflow result:');
    console.log('  - Metadata keys:', Object.keys(result.mappedData));
    console.log('  - Body content length:', result.body.length);
    console.log('  - Has overflow flag:', result.mappedData['$overflow'] === 'true' ? '✅ Yes' : '❌ No');

    // Calculate size of final metadata
    const finalMetadataSize = calculateTotalSize(result.mappedData);
    console.log('\n📊 Final metadata size analysis:');
    console.log('  - Final metadata size:', finalMetadataSize, 'bytes');
    console.log('  - S3 limit:', 2048, 'bytes');
    console.log('  - Within limit:', finalMetadataSize <= 2048 ? '✅ Yes' : '❌ No');

    // Test the get behavior
    console.log('\n🔄 Testing get behavior...');
    const getResult = await bodyOverflowBehavior.handleGet({
      resource: mockResource,
      metadata: result.mappedData,
      body: result.body
    });

    console.log('\n📋 Get result:');
    console.log('  - Retrieved data keys:', Object.keys(getResult.metadata));
    console.log('  - User agent data present:', getResult.metadata['2'] ? '✅ Yes' : '❌ No');

    // Verify the data is complete
    const retrievedUserAgentData = getResult.metadata['2'] ? JSON.parse(getResult.metadata['2']) : null;
    console.log('  - User agent data complete:', retrievedUserAgentData && retrievedUserAgentData.browser ? '✅ Yes' : '❌ No');

    console.log('\n🎉 Body overflow test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }  } finally {
    await teardownDatabase();
  }
}

testBodyOverflowOffline(); 