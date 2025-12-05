#!/usr/bin/env node
/**
 * Migration script: Jest → Vitest
 *
 * Usage:
 *   node scripts/migrate-jest-to-vitest.js [directory]
 *   node scripts/migrate-jest-to-vitest.js tests/libs/
 *   node scripts/migrate-jest-to-vitest.js --all
 *   node scripts/migrate-jest-to-vitest.js --dry-run tests/classes/
 */

import { glob } from 'glob';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const transforms = [
  // Remove @jest/globals imports (Vitest injects globals)
  {
    name: 'Remove @jest/globals import',
    pattern: /import \{[^}]+\} from ['"]@jest\/globals['"];?\n?/g,
    replacement: ''
  },
  // jest.fn() → vi.fn()
  {
    name: 'jest.fn → vi.fn',
    pattern: /\bjest\.fn\(/g,
    replacement: 'vi.fn('
  },
  // jest.mock() → vi.mock()
  {
    name: 'jest.mock → vi.mock',
    pattern: /\bjest\.mock\(/g,
    replacement: 'vi.mock('
  },
  // jest.unmock() → vi.unmock()
  {
    name: 'jest.unmock → vi.unmock',
    pattern: /\bjest\.unmock\(/g,
    replacement: 'vi.unmock('
  },
  // jest.doMock() → vi.doMock()
  {
    name: 'jest.doMock → vi.doMock',
    pattern: /\bjest\.doMock\(/g,
    replacement: 'vi.doMock('
  },
  // jest.spyOn() → vi.spyOn()
  {
    name: 'jest.spyOn → vi.spyOn',
    pattern: /\bjest\.spyOn\(/g,
    replacement: 'vi.spyOn('
  },
  // jest.useFakeTimers() → vi.useFakeTimers()
  {
    name: 'jest.useFakeTimers → vi.useFakeTimers',
    pattern: /\bjest\.useFakeTimers\(/g,
    replacement: 'vi.useFakeTimers('
  },
  // jest.useRealTimers() → vi.useRealTimers()
  {
    name: 'jest.useRealTimers → vi.useRealTimers',
    pattern: /\bjest\.useRealTimers\(/g,
    replacement: 'vi.useRealTimers('
  },
  // jest.clearAllMocks() → vi.clearAllMocks()
  {
    name: 'jest.clearAllMocks → vi.clearAllMocks',
    pattern: /\bjest\.clearAllMocks\(/g,
    replacement: 'vi.clearAllMocks('
  },
  // jest.resetAllMocks() → vi.resetAllMocks()
  {
    name: 'jest.resetAllMocks → vi.resetAllMocks',
    pattern: /\bjest\.resetAllMocks\(/g,
    replacement: 'vi.resetAllMocks('
  },
  // jest.restoreAllMocks() → vi.restoreAllMocks()
  {
    name: 'jest.restoreAllMocks → vi.restoreAllMocks',
    pattern: /\bjest\.restoreAllMocks\(/g,
    replacement: 'vi.restoreAllMocks('
  },
  // jest.clearAllTimers() → vi.clearAllTimers()
  {
    name: 'jest.clearAllTimers → vi.clearAllTimers',
    pattern: /\bjest\.clearAllTimers\(/g,
    replacement: 'vi.clearAllTimers('
  },
  // jest.advanceTimersByTime() → vi.advanceTimersByTime()
  {
    name: 'jest.advanceTimersByTime → vi.advanceTimersByTime',
    pattern: /\bjest\.advanceTimersByTime\(/g,
    replacement: 'vi.advanceTimersByTime('
  },
  // jest.runAllTimers() → vi.runAllTimers()
  {
    name: 'jest.runAllTimers → vi.runAllTimers',
    pattern: /\bjest\.runAllTimers\(/g,
    replacement: 'vi.runAllTimers('
  },
  // jest.runOnlyPendingTimers() → vi.runOnlyPendingTimers()
  {
    name: 'jest.runOnlyPendingTimers → vi.runOnlyPendingTimers',
    pattern: /\bjest\.runOnlyPendingTimers\(/g,
    replacement: 'vi.runOnlyPendingTimers('
  },
  // jest.setSystemTime() → vi.setSystemTime()
  {
    name: 'jest.setSystemTime → vi.setSystemTime',
    pattern: /\bjest\.setSystemTime\(/g,
    replacement: 'vi.setSystemTime('
  },
  // jest.getRealSystemTime() → vi.getRealSystemTime()
  {
    name: 'jest.getRealSystemTime → vi.getRealSystemTime',
    pattern: /\bjest\.getRealSystemTime\(/g,
    replacement: 'vi.getRealSystemTime('
  },
  // jest.setTimeout() → vi.setConfig({ testTimeout: ... })
  // This one needs manual review
  {
    name: 'jest.setTimeout (needs manual review)',
    pattern: /\bjest\.setTimeout\((\d+)\)/g,
    replacement: '/* TODO: Use vi.setConfig({ testTimeout: $1 }) or test options */ vi.setConfig({ testTimeout: $1 })'
  },
];

const stats = {
  filesScanned: 0,
  filesModified: 0,
  transformsApplied: {},
  errors: []
};

async function migrateFile(filePath, dryRun = false) {
  try {
    let content = await readFile(filePath, 'utf-8');
    const originalContent = content;
    const appliedTransforms = [];

    for (const { name, pattern, replacement } of transforms) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      if (pattern.test(content)) {
        pattern.lastIndex = 0;
        content = content.replace(pattern, replacement);
        appliedTransforms.push(name);
        stats.transformsApplied[name] = (stats.transformsApplied[name] || 0) + 1;
      }
    }

    if (content !== originalContent) {
      if (!dryRun) {
        await writeFile(filePath, content);
      }
      console.log(`${dryRun ? '🔍 Would migrate' : '✅ Migrated'}: ${filePath}`);
      appliedTransforms.forEach(t => console.log(`   - ${t}`));
      return true;
    }
    return false;
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const migrateAll = args.includes('--all');

  // Filter out flags
  const targetArgs = args.filter(a => !a.startsWith('--'));

  let pattern;
  if (migrateAll) {
    pattern = 'tests/**/*.test.js';
  } else if (targetArgs.length > 0) {
    const target = targetArgs[0];
    if (target.endsWith('.js')) {
      pattern = target;
    } else {
      pattern = path.join(target, '**/*.test.js');
    }
  } else {
    console.log(`
Jest → Vitest Migration Script

Usage:
  node scripts/migrate-jest-to-vitest.js [options] [directory|file]

Options:
  --dry-run    Show what would be changed without modifying files
  --all        Migrate all test files

Examples:
  node scripts/migrate-jest-to-vitest.js tests/libs/
  node scripts/migrate-jest-to-vitest.js --dry-run tests/classes/
  node scripts/migrate-jest-to-vitest.js --all
  node scripts/migrate-jest-to-vitest.js tests/clients/memory-client.test.js
`);
    process.exit(0);
  }

  console.log(`\n🔄 ${dryRun ? '[DRY RUN] ' : ''}Migrating Jest → Vitest`);
  console.log(`📁 Pattern: ${pattern}\n`);

  const files = await glob(pattern, { ignore: 'node_modules/**' });
  stats.filesScanned = files.length;

  console.log(`Found ${files.length} test files\n`);

  for (const file of files) {
    if (await migrateFile(file, dryRun)) {
      stats.filesModified++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary');
  console.log('='.repeat(50));
  console.log(`Files scanned:  ${stats.filesScanned}`);
  console.log(`Files modified: ${stats.filesModified}`);

  if (Object.keys(stats.transformsApplied).length > 0) {
    console.log('\nTransforms applied:');
    for (const [transform, count] of Object.entries(stats.transformsApplied)) {
      console.log(`  - ${transform}: ${count}`);
    }
  }

  if (stats.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    stats.errors.forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`);
    });
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
  } else if (stats.filesModified > 0) {
    console.log('\n✅ Migration complete! Run tests with: npx vitest run');
  }
}

main().catch(console.error);
