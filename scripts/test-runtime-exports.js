#!/usr/bin/env node

await import('s3db.js');
await import('s3db.js/lite');
await import('s3db.js/plugins/state-machine.plugin');
await import('s3db.js/concerns/guards-helpers');

console.log('Runtime export smoke passed');
