import { setupDatabase } from './database.js';

async function testErrorDetail(fn, label) {
  try {
    await fn();
    console.error(`[FAIL] ${label}: No error thrown`);
  } catch (err) {
    const json = typeof err.toJson === 'function' ? err.toJson() : err;
    const requiredFields = [
      'name', 'code', 'statusCode', 'requestId', 'awsMessage',
      'commandName', 'commandInput', 'suggestion', 'stack', 'original', 'thrownAt'
    ];
    const missing = requiredFields.filter(f => !(f in json));
    if (missing.length === 0) {
      console.log(`[PASS] ${label}:`, {
        name: json.name,
        code: json.code,
        statusCode: json.statusCode,
        requestId: json.requestId,
        awsMessage: json.awsMessage,
        commandName: json.commandName,
        suggestion: json.suggestion,
      });
    } else {
      console.error(`[FAIL] ${label}: Missing fields:`, missing, json);
    }
  }
}

(async () => {
  const db = await setupDatabase();
  const client = db.client;
  await testErrorDetail(
    () => client.getObject('key-that-does-not-exist'),
    'getObject (NoSuchKey)'
  );
  await testErrorDetail(
    () => client.headObject('key-that-does-not-exist'),
    'headObject (NoSuchKey)'
  );
  // Para bucket inexistente, criamos um client manualmente
  const S3db = (await import('../src/index.js')).default;
  const db2 = new S3db({
    verbose: true,
    connectionString: 's3://fake-access:fake-secret@localhost:9000/bucket-that-does-not-exist',
  });
  await db2.connect().catch(() => {}); // ignora erro de connect
  const client2 = db2.client;
  await testErrorDetail(
    () => client2.putObject({ key: 'any-key', body: Buffer.from('test') }),
    'putObject (NoSuchBucket/PermissionError)'
  );
  await testErrorDetail(
    () => client2.headObject('any-key'),
    'headObject (NoSuchBucket/PermissionError)'
  );
})(); 