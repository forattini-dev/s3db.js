import { config } from 'dotenv';

config({ 
  quiet: true, 
  debug: false,
});

process.env.NODE_ENV = 'test';

if (process.env.QUIET === 'true') {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
}

// Extra safety: clear timers and log on process exit
process.on('exit', (code) => {
  jest.clearAllTimers();
  if (process.env.DEBUG) {
    console.log('[JEST] Process exiting, timers cleared. Exit code:', code);
  }
});
