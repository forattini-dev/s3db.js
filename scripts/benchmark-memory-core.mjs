import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const RESOURCE_COUNT = Number.parseInt(process.env.S3DB_MEMORY_RESOURCE_COUNT || '20', 10);
const SCENARIO = process.argv.includes('--scenario')
  ? process.argv[process.argv.indexOf('--scenario') + 1]
  : null;
const SHOULD_ASSERT = process.argv.includes('--assert') || process.env.S3DB_MEMORY_ASSERT === 'true';
const SCENARIOS = [
  'import-database-class',
  'database-lifecycle',
  'resources-same-eager',
  'resources-same-lazy',
  'resources-different-eager'
];
const DEFAULT_BUDGETS = {
  'import-database-class': {
    heapUsedMB: 4,
    rssMB: 28
  },
  'database-lifecycle': {
    heapUsedMB: 10,
    rssMB: 48
  },
  'resources-same-eager': {
    heapUsedMB: 12,
    rssMB: 36
  },
  'resources-same-lazy': {
    heapUsedMB: 10,
    rssMB: 34
  },
  'resources-different-eager': {
    heapUsedMB: 12,
    rssMB: 36
  }
};

function toMB(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function snapshot() {
  global.gc?.();
  const usage = process.memoryUsage();
  return {
    heapUsedMB: toMB(usage.heapUsed),
    heapTotalMB: toMB(usage.heapTotal),
    rssMB: toMB(usage.rss),
    externalMB: toMB(usage.external),
    arrayBuffersMB: toMB(usage.arrayBuffers || 0)
  };
}

function diff(before, after) {
  return {
    heapUsedMB: Number((after.heapUsedMB - before.heapUsedMB).toFixed(2)),
    heapTotalMB: Number((after.heapTotalMB - before.heapTotalMB).toFixed(2)),
    rssMB: Number((after.rssMB - before.rssMB).toFixed(2)),
    externalMB: Number((after.externalMB - before.externalMB).toFixed(2)),
    arrayBuffersMB: Number((after.arrayBuffersMB - before.arrayBuffersMB).toFixed(2))
  };
}

function makeSchema(index, variant) {
  if (variant === 'different') {
    return {
      id: 'string|required',
      [`field_${index}`]: 'string|required',
      [`email_${index}`]: 'email',
      meta: {
        $$type: 'object',
        [`score_${index}`]: 'number|optional'
      }
    };
  }

  return {
    id: 'string|required',
    name: 'string|required',
    email: 'email',
    meta: {
      $$type: 'object',
      score: 'number|optional'
    }
  };
}

async function runImportScenario() {
  const before = snapshot();
  await import('../dist/database.class.js');
  const after = snapshot();

  return {
    scenario: 'import-database-class',
    before,
    after,
    delta: diff(before, after)
  };
}

async function runLifecycleScenario() {
  const { Database } = await import('../dist/database.class.js');

  const before = snapshot();
  const db = new Database({
    connectionString: 'memory://benchmark-core/prefix',
    logLevel: 'silent',
    deferMetadataWrites: true
  });
  const afterConstructor = snapshot();

  await db.connect();
  const afterConnect = snapshot();

  await db.disconnect();
  const afterDisconnect = snapshot();

  return {
    scenario: 'database-lifecycle',
    before,
    afterConstructor,
    afterConnect,
    afterDisconnect,
    constructorDelta: diff(before, afterConstructor),
    connectDelta: diff(afterConstructor, afterConnect),
    retainedAfterDisconnect: diff(before, afterDisconnect)
  };
}

async function runResourcesScenario(lazySchema, variant) {
  const [{ Database }, SchemaModule, validatorCacheModule] = await Promise.all([
    import('../dist/database.class.js'),
    import('../dist/schema.class.js'),
    import('../dist/concerns/validator-cache.js')
  ]);

  const Schema = SchemaModule.default;
  const { clearValidatorCache } = validatorCacheModule;

  clearValidatorCache();

  const db = new Database({
    connectionString: `memory://benchmark-resources/${variant}/${lazySchema ? 'lazy' : 'eager'}`,
    logLevel: 'silent',
    deferMetadataWrites: true
  });

  await db.connect();
  const before = snapshot();

  for (let i = 0; i < RESOURCE_COUNT; i++) {
    await db.createResource({
      name: `resource_${variant}_${lazySchema ? 'lazy' : 'eager'}_${i}`,
      attributes: makeSchema(i, variant),
      lazySchema
    });
  }

  const afterCreate = snapshot();
  const statsAfterCreate = Schema.getValidatorCacheStats();

  await db.disconnect();
  const afterDisconnect = snapshot();
  const statsAfterDisconnect = Schema.getValidatorCacheStats();

  return {
    scenario: `resources-${variant}-${lazySchema ? 'lazy' : 'eager'}`,
    resourceCount: RESOURCE_COUNT,
    before,
    afterCreate,
    afterDisconnect,
    createDelta: diff(before, afterCreate),
    retainedAfterDisconnect: diff(before, afterDisconnect),
    validatorStatsAfterCreate: statsAfterCreate,
    validatorStatsAfterDisconnect: statsAfterDisconnect
  };
}

async function runScenario(name) {
  switch (name) {
    case 'import-database-class':
      return runImportScenario();
    case 'database-lifecycle':
      return runLifecycleScenario();
    case 'resources-same-eager':
      return runResourcesScenario(false, 'same');
    case 'resources-same-lazy':
      return runResourcesScenario(true, 'same');
    case 'resources-different-eager':
      return runResourcesScenario(false, 'different');
    default:
      throw new Error(`Unknown scenario: ${name}`);
  }
}

async function runInFreshProcess(name) {
  const { stdout } = await execFileAsync(process.execPath, [
    '--expose-gc',
    new URL(import.meta.url).pathname,
    '--scenario',
    name
  ], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });

  const lines = stdout.trim().split('\n').filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function getMeasurement(result) {
  if (result.delta) {
    return result.delta;
  }

  if (result.createDelta) {
    return result.createDelta;
  }

  return result.connectDelta;
}

function getBudget(name) {
  const defaults = DEFAULT_BUDGETS[name];

  return {
    heapUsedMB: Number.parseFloat(process.env[`S3DB_MEMORY_BUDGET_${name.toUpperCase().replaceAll('-', '_')}_HEAP_MB`] || `${defaults.heapUsedMB}`),
    rssMB: Number.parseFloat(process.env[`S3DB_MEMORY_BUDGET_${name.toUpperCase().replaceAll('-', '_')}_RSS_MB`] || `${defaults.rssMB}`)
  };
}

function assertResults(results) {
  const failures = [];

  for (const result of results) {
    const measurement = getMeasurement(result);
    const budget = getBudget(result.scenario);

    if (measurement.heapUsedMB > budget.heapUsedMB) {
      failures.push(
        `${result.scenario}: heapUsedMB ${measurement.heapUsedMB} > budget ${budget.heapUsedMB}`
      );
    }

    if (measurement.rssMB > budget.rssMB) {
      failures.push(
        `${result.scenario}: rssMB ${measurement.rssMB} > budget ${budget.rssMB}`
      );
    }

    if (result.validatorStatsAfterDisconnect && result.validatorStatsAfterDisconnect.totalReferences !== 0) {
      failures.push(
        `${result.scenario}: validator cache retained ${result.validatorStatsAfterDisconnect.totalReferences} references after disconnect`
      );
    }
  }

  if (failures.length > 0) {
    console.error('Memory budget regression detected:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

function printSummary(results) {
  const rows = results.map((result) => {
    const measurement = getMeasurement(result);
    const row = {
      scenario: result.scenario,
      heapUsedMB: measurement.heapUsedMB,
      rssMB: measurement.rssMB
    };

    if (SHOULD_ASSERT) {
      const budget = getBudget(result.scenario);
      row.heapBudgetMB = budget.heapUsedMB;
      row.rssBudgetMB = budget.rssMB;
    }

    return row;
  });

  console.table(rows);
}

function printAssertionStatus(results) {
  if (!SHOULD_ASSERT) {
    return;
  }

  const rows = results.map((result) => {
    const measurement = getMeasurement(result);
    const budget = getBudget(result.scenario);

    return {
      scenario: result.scenario,
      heapUsedMB: measurement.heapUsedMB,
      heapBudgetMB: budget.heapUsedMB,
      rssMB: measurement.rssMB,
      rssBudgetMB: budget.rssMB,
      validatorRefsAfterDisconnect: result.validatorStatsAfterDisconnect?.totalReferences ?? 'n/a'
    };
  });

  console.table(rows);
}

if (SCENARIO) {
  const result = await runScenario(SCENARIO);
  console.log(JSON.stringify(result));
} else {
  const results = [];
  for (const scenario of SCENARIOS) {
    results.push(await runInFreshProcess(scenario));
  }

  printSummary(results);
  printAssertionStatus(results);
  assertResults(results);
  console.log(JSON.stringify({ resourceCount: RESOURCE_COUNT, results }, null, 2));
}
