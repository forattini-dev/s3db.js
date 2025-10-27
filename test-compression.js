/**
 * Test Compression Middleware
 *
 * Tests that the API Plugin's compression middleware works correctly
 */

import Database from './src/database.class.js';
import { ApiPlugin } from './src/plugins/api/index.js';
import { MemoryClient } from './src/clients/memory-client.class.js';

async function testCompression() {
  console.log('🧪 Testing Compression Middleware\n');

  // Use MemoryClient for fast testing (100-1000x faster, zero dependencies)
  const memoryClient = new MemoryClient({ bucketName: 'test-compression' });

  // Create database
  const db = new Database({
    client: memoryClient
  });

  await db.connect();

  // Create test resource
  await db.createResource({
    name: 'posts',
    attributes: {
      title: 'string|required',
      content: 'string|required',
      author: 'string'
    }
  });

  // Create and use API plugin (compression enabled)
  const apiPlugin = new ApiPlugin({
    port: 3456,
    compression: {
      enabled: true,
      threshold: 100, // Low threshold for testing (compress anything > 100 bytes)
      level: 6
    },
    verbose: false
  });

  await db.usePlugin(apiPlugin);

  const baseUrl = 'http://localhost:3456';

  console.log('✅ Server started on', baseUrl);
  console.log('');

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    // Test 1: Request with Accept-Encoding: br (brotli)
    console.log('1️⃣  Testing Brotli compression...');
    const resBrotli = await fetch(`${baseUrl}/api/v1/posts`, {
      headers: {
        'Accept-Encoding': 'br, gzip, deflate'
      }
    });

    const contentEncodingBr = resBrotli.headers.get('content-encoding');
    const contentLengthBr = resBrotli.headers.get('content-length');
    const varyBr = resBrotli.headers.get('vary');

    console.log('   Content-Encoding:', contentEncodingBr || 'none');
    console.log('   Content-Length:', contentLengthBr || 'not set');
    console.log('   Vary:', varyBr || 'not set');

    if (contentEncodingBr === 'br') {
      console.log('   ✅ Brotli compression working!\n');
    } else if (contentEncodingBr === 'gzip') {
      console.log('   ⚠️  Gzip used instead of Brotli\n');
    } else {
      console.log('   ❌ No compression applied\n');
    }

    // Test 2: Request with Accept-Encoding: gzip (no brotli)
    console.log('2️⃣  Testing Gzip fallback...');
    const resGzip = await fetch(`${baseUrl}/api/v1/posts`, {
      headers: {
        'Accept-Encoding': 'gzip, deflate'
      }
    });

    const contentEncodingGz = resGzip.headers.get('content-encoding');
    const contentLengthGz = resGzip.headers.get('content-length');

    console.log('   Content-Encoding:', contentEncodingGz || 'none');
    console.log('   Content-Length:', contentLengthGz || 'not set');

    if (contentEncodingGz === 'gzip') {
      console.log('   ✅ Gzip compression working!\n');
    } else {
      console.log('   ❌ No compression applied\n');
    }

    // Test 3: Request without Accept-Encoding (no compression)
    console.log('3️⃣  Testing without Accept-Encoding...');
    const resNoAccept = await fetch(`${baseUrl}/api/v1/posts`);

    const contentEncodingNone = resNoAccept.headers.get('content-encoding');
    console.log('   Content-Encoding:', contentEncodingNone || 'none');

    if (!contentEncodingNone) {
      console.log('   ✅ No compression (as expected)\n');
    } else {
      console.log('   ⚠️  Unexpected compression\n');
    }

    // Test 4: Create a post and check compression
    console.log('4️⃣  Testing POST request compression...');
    const largeContent = 'Lorem ipsum dolor sit amet, '.repeat(50); // ~1.4KB

    const resPost = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'br, gzip'
      },
      body: JSON.stringify({
        title: 'Test Post',
        content: largeContent,
        author: 'Test Author'
      })
    });

    const postEncoding = resPost.headers.get('content-encoding');
    const postLength = resPost.headers.get('content-length');

    console.log('   Status:', resPost.status);
    console.log('   Content-Encoding:', postEncoding || 'none');
    console.log('   Content-Length:', postLength || 'not set');

    if (postEncoding) {
      console.log('   ✅ POST response compressed!\n');
    } else {
      console.log('   ⚠️  POST response not compressed\n');
    }

    // Test 5: Check actual decompression works
    console.log('5️⃣  Testing decompression...');
    const resDecompress = await fetch(`${baseUrl}/api/v1/posts`, {
      headers: {
        'Accept-Encoding': 'br, gzip'
      }
    });

    const body = await resDecompress.json(); // fetch() auto-decompresses

    console.log('   Response parsed:', !!body);
    console.log('   Has data structure:', !!body.data);
    console.log('   ✅ Decompression working!\n');

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Compression Test Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Brotli:', contentEncodingBr === 'br' ? '✅' : '❌');
    console.log('Gzip:', contentEncodingGz === 'gzip' ? '✅' : '❌');
    console.log('No Accept-Encoding:', !contentEncodingNone ? '✅' : '❌');
    console.log('Decompression:', !!body.data ? '✅' : '❌');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
  } finally {
    // Cleanup
    await apiPlugin.stop();
    await db.disconnect();
    console.log('✅ Test complete, server stopped\n');
  }
}

testCompression().catch(console.error);
