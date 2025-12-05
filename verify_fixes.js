import { S3Client } from './src/clients/s3-client.class.js';
import { MemoryClient } from './src/clients/memory-client.class.js';
import { AdaptiveTuning } from './src/concerns/adaptive-tuning.js';

const mockAwsClient = { destroy: () => {} };

// Mock environment
process.env.S3DB_CONCURRENCY = '8';

// 1. Verify S3Client defaults
const s3Client = new S3Client({ 
    connectionString: 'memory://bucket',
    AwsS3Client: mockAwsClient,
    executorPool: { enabled: true }
});

if (s3Client.httpClientOptions.maxSockets !== 50) {
    console.error(`❌ S3Client maxSockets is ${s3Client.httpClientOptions.maxSockets}, expected 50`);
    process.exit(1);
} else {
    console.log('✅ S3Client maxSockets is clamped to 50');
}

if (s3Client.taskExecutor.concurrency !== 8) {
     console.error(`❌ S3Client default concurrency is ${s3Client.taskExecutor.concurrency}, expected 8 (from env)`);
     process.exit(1);
} else {
    console.log('✅ S3Client concurrency respects env var (8)');
}

// 2. Verify MemoryClient defaults
const memoryClient = new MemoryClient({ 
    bucket: 'test-bucket',
});

// MemoryClient doesn't expose concurrency directly on instance, but check taskManager
const memoryConcurrency = memoryClient.taskExecutorConfig.concurrency;

if (memoryConcurrency !== 8) {
    console.error(`❌ MemoryClient concurrency is ${memoryConcurrency}, expected 8 (from env)`);
    process.exit(1);
} else {
    console.log('✅ MemoryClient concurrency respects env var (8)');
}


// 3. Verify AdaptiveTuning clamping
const tuner = new AdaptiveTuning({
    minConcurrency: 1,
    maxConcurrency: 100
});

const initial = tuner.suggestInitial();
console.log(`AdaptiveTuning initial suggestion: ${initial}`);
if (initial > 20) {
    console.error(`❌ AdaptiveTuning suggested ${initial}, which is > 20`);
    process.exit(1);
} else {
    console.log('✅ AdaptiveTuning initial suggestion is safe (<= 20)');
}

console.log('--- All checks passed ---');
