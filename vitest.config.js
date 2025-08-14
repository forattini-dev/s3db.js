import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    // Enable Jest compatibility mode
    globals: true,
    environment: 'node',
    
    // Set default connection string for tests
    env: {
      BUCKET_CONNECTION_STRING: 's3://test:test@test-bucket?endpoint=http://localhost:4566&forcePathStyle=true'
    },
    
    // Test configuration
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Make afterEach available globally
    setupFiles: ['./vitest.setup.js'],
    
    // Include test patterns
    include: [
      'tests/**/*.test.js'
      // TypeScript tests are for type checking only, not runtime tests
    ],
    
    // Pool configuration - use forks for better isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        minForks: 1,
        maxForks: 4
      }
    },
    
    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: false,
    mockReset: false,
    
    // Don't fail on console errors
    onConsoleLog: () => true
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '#src': join(__dirname, 'src'),
      '#tests': join(__dirname, 'tests'),
      '#dist': join(__dirname, 'dist'),
      '#examples': join(__dirname, 'examples'),
      '#mcp': join(__dirname, 'mcp')
    }
  }
});