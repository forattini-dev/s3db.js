import { Database } from '../src/index.js';

// Example 1: Using optimized default HTTP client configuration
console.log('Example 1: Default HTTP client configuration (Fast Creation)');
console.log('const client1 = new Database({');
console.log('  connectionString: "s3://your-bucket",');
console.log('  // Uses fast creation settings (keep-alive disabled by default):');
console.log('  // - keepAlive: false (for maximum creation speed)');
console.log('  // - maxSockets: 10 (minimal for fast creation)');
console.log('  // - maxFreeSockets: 2 (minimal pool)');
console.log('  // - timeout: 15000 (short timeout)');
console.log('  // Note: Enable keep-alive manually for better S3 operation performance');
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
console.log('• Default configuration prioritizes fast client creation');
console.log('• Keep-alive should be enabled for better S3 operation performance');
console.log('• Client creation speed ≠ S3 operation speed');
console.log('• Choose based on your actual usage patterns');
console.log('\nNote: These are example configurations. In a real application,');
console.log('you would need to provide a valid S3 connection string.'); 