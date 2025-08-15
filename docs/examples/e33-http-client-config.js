import { Database } from '../src/index.js';

// Example 1: Using optimized default HTTP client configuration
console.log('Example 1: Default HTTP client configuration (Optimized Performance)');
console.log('const client1 = new Database({');
console.log('  connectionString: "s3://your-bucket",');
console.log('  // Uses optimized performance settings by default:');
console.log('  // - keepAlive: true (enabled for better performance)');
console.log('  // - keepAliveMsecs: 1000 (1 second keep-alive)');
console.log('  // - maxSockets: 50 (balanced for most applications)');
console.log('  // - maxFreeSockets: 10 (good connection reuse)');
console.log('  // - timeout: 60000 (60 second timeout)');
console.log('  // These settings provide excellent performance for most use cases');
console.log('});');

// Example 2: Custom HTTP client configuration
console.log('\nExample 2: Custom HTTP client configuration');
console.log('const client2 = new Database({');
console.log('  connectionString: "s3://your-bucket",');
console.log('  httpClientOptions: {');
console.log('    keepAlive: true,');
console.log('    keepAliveMsecs: 2000,        // Keep connections alive for 2 seconds');
console.log('    maxSockets: 100,             // Maximum 100 concurrent connections');
console.log('    maxFreeSockets: 20,          // Keep 20 free sockets in the pool');
console.log('    timeout: 30000,              // 30 second timeout');
console.log('  },');
console.log('});');

// Example 3: Aggressive keep-alive for high-throughput scenarios
console.log('\nExample 3: Aggressive keep-alive configuration');
console.log('const client3 = new Database({');
console.log('  connectionString: "s3://your-bucket",');
console.log('  httpClientOptions: {');
console.log('    keepAlive: true,');
console.log('    keepAliveMsecs: 5000,        // Keep connections alive for 5 seconds');
console.log('    maxSockets: 200,             // High concurrency');
console.log('    maxFreeSockets: 50,          // Large free socket pool');
console.log('    timeout: 120000,             // 2 minute timeout');
console.log('  },');
console.log('});');

// Example 4: Conservative settings for resource-constrained environments
console.log('\nExample 4: Conservative HTTP client configuration');
console.log('const client4 = new Database({');
console.log('  connectionString: "s3://your-bucket",');
console.log('  httpClientOptions: {');
console.log('    keepAlive: true,');
console.log('    keepAliveMsecs: 500,         // Shorter keep-alive');
console.log('    maxSockets: 10,              // Lower concurrency');
console.log('    maxFreeSockets: 2,           // Smaller free socket pool');
console.log('    timeout: 15000,              // 15 second timeout');
console.log('  },');
console.log('});');

console.log('\n📊 PERFORMANCE CONSIDERATIONS:');
console.log('• Default configuration is optimized for S3 operation performance');
console.log('• Keep-alive is enabled by default for better connection reuse');
console.log('• Balanced settings work well for most applications');
console.log('• Customize based on your specific performance requirements');
console.log('\nNote: These are example configurations. In a real application,');
console.log('you would need to provide a valid S3 connection string.'); 