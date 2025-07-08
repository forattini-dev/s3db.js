import dotenv from 'dotenv';

dotenv.config({ 
  quiet: true,
  debug: false, 
});

console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.error = () => {};
