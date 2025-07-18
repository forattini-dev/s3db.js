import { config } from 'dotenv';

config({ 
  quiet: true, 
  debug: false,
});

process.env.NODE_ENV = 'test';

process.on('exit', () => jest.clearAllTimers());
