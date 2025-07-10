import dotenv from 'dotenv';

dotenv.config({ 
  quiet: true,
  debug: false, 
});

if (process.env.QUIET === 'true') {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
}

console.warn = () => {};

