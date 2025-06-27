#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const requiredFiles = [
  'dist/s3db.cjs.js',
  'dist/s3db.cjs.min.js',
  'dist/s3db.es.js',
  'dist/s3db.es.min.js',
  'dist/s3db.iife.js',
  'dist/s3db.iife.min.js',
  'dist/s3db.d.ts'
];

const requiredSizes = {
  'dist/s3db.cjs.js': { min: 100000, max: 1000000 }, // 100KB - 1MB
  'dist/s3db.cjs.min.js': { min: 50000, max: 500000 }, // 50KB - 500KB
  'dist/s3db.es.js': { min: 100000, max: 1000000 },
  'dist/s3db.es.min.js': { min: 50000, max: 500000 },
  'dist/s3db.iife.js': { min: 100000, max: 1000000 },
  'dist/s3db.iife.min.js': { min: 50000, max: 500000 },
  'dist/s3db.d.ts': { min: 1000, max: 50000 } // 1KB - 50KB
};

console.log('🔍 Verificando estrutura do build...\n');

let allGood = true;

// Verificar se todos os arquivos existem
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    const size = stats.size;
    const sizeKB = (size / 1024).toFixed(2);
    
    console.log(`✅ ${file} (${sizeKB} KB)`);
    
    // Verificar tamanho
    if (requiredSizes[file]) {
      const { min, max } = requiredSizes[file];
      if (size < min || size > max) {
        console.log(`   ⚠️  Tamanho fora do esperado: ${size} bytes (esperado: ${min}-${max})`);
        allGood = false;
      }
    }
  } else {
    console.log(`❌ ${file} - ARQUIVO AUSENTE`);
    allGood = false;
  }
}

// Verificar package.json
console.log('\n📦 Verificando package.json...');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const requiredFields = ['main', 'module', 'browser', 'types', 'unpkg', 'jsdelivr', 'exports'];
for (const field of requiredFields) {
  if (packageJson[field]) {
    console.log(`✅ ${field}: ${JSON.stringify(packageJson[field])}`);
  } else {
    console.log(`❌ ${field} - CAMPO AUSENTE`);
    allGood = false;
  }
}

// Verificar exports
if (packageJson.exports && packageJson.exports['.']) {
  console.log('✅ exports configurado corretamente');
} else {
  console.log('❌ exports mal configurado');
  allGood = false;
}

// Verificar .npmignore
console.log('\n📋 Verificando .npmignore...');
if (fs.existsSync('.npmignore')) {
  const npmignore = fs.readFileSync('.npmignore', 'utf8');
  const requiredIgnores = ['src/', 'tests/', 'examples/', 'coverage/'];
  
  for (const ignore of requiredIgnores) {
    if (npmignore.includes(ignore)) {
      console.log(`✅ ${ignore} está sendo ignorado`);
    } else {
      console.log(`❌ ${ignore} não está sendo ignorado`);
      allGood = false;
    }
  }
} else {
  console.log('❌ .npmignore não encontrado');
  allGood = false;
}

console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('🎉 Build verificado com sucesso! Pronto para publicação.');
  process.exit(0);
} else {
  console.log('❌ Problemas encontrados no build. Corrija antes de publicar.');
  process.exit(1);
} 