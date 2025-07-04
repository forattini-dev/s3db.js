import { setupDatabase, teardownDatabase } from './database.js';
import { calculateTotalSize } from '../src/concerns/calculator.js';

// Debug body-overflow behavior
async function debugBodyOverflow() {
  console.log('🔧 Debugging Body Overflow Behavior...\n');

  const db = await setupDatabase();
  console.log('✅ Connected to database');

    // Create a resource with body-overflow behavior
    const testResource = await db.createResource({
      name: 'test-body-overflow',
      behavior: 'body-overflow',
      timestamps: true,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        largeData: 'string|optional'
      }
    });

    console.log('\n📋 Resource Configuration:');
    console.log('  - Name:', testResource.name);
    console.log('  - Behavior:', testResource.behavior);

    // Create a large data object that should trigger overflow
    const largeData = {
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

    // Create a test record with large data
    const testRecord = await testResource.insert({
      name: 'John Doe',
      email: 'john@example.com',
      largeData: JSON.stringify(largeData)
    });

    console.log('\n✅ Test record inserted:', testRecord.id);

    // Get the record back
    const retrievedRecord = await testResource.get(testRecord.id);
    console.log('\n✅ Test record retrieved:', retrievedRecord.id);

    // Check if largeData is present
    console.log('\n📋 Data verification:');
    console.log('  - Large data present:', retrievedRecord.largeData ? '✅ Yes' : '❌ No');
    console.log('  - Large data size:', retrievedRecord.largeData ? retrievedRecord.largeData.length : 0, 'characters');

    // Test the size calculation
    const mappedData = await testResource.schema.mapper(testRecord);
    const totalSize = calculateTotalSize(mappedData);
    console.log('\n📊 Size analysis:');
    console.log('  - Total mapped data size:', totalSize, 'bytes');
    console.log('  - S3 limit:', 2048, 'bytes');
    console.log('  - Exceeds limit:', totalSize > 2048 ? '✅ Yes' : '❌ No');

    console.log('\n🎉 Body overflow test completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await teardownDatabase();
  }
}

debugBodyOverflow(); 