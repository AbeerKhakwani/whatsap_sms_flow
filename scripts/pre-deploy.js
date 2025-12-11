#!/usr/bin/env node
// scripts/pre-deploy.js
// Run all tests before deploying
// Usage: node scripts/pre-deploy.js

import { spawn } from 'child_process';
import { existsSync } from 'fs';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { 
      stdio: 'inherit',
      shell: true 
    });
    
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
    
    proc.on('error', reject);
  });
}

async function main() {
  console.log('\n' + '═'.repeat(50));
  log(COLORS.cyan, '🚀 PRE-DEPLOY CHECKS');
  console.log('═'.repeat(50) + '\n');
  
  const checks = [];
  
  // Check 1: Unit tests
  log(COLORS.yellow, '📋 Running unit tests...');
  try {
    await runCommand('npm', ['test']);
    log(COLORS.green, '✅ Unit tests passed\n');
    checks.push({ name: 'Unit Tests', passed: true });
  } catch (err) {
    log(COLORS.red, '❌ Unit tests failed\n');
    checks.push({ name: 'Unit Tests', passed: false });
  }
  
  // Check 2: Lint (if eslint exists)
  if (existsSync('node_modules/.bin/eslint') || existsSync('.eslintrc.js') || existsSync('.eslintrc.json')) {
    log(COLORS.yellow, '📋 Running linter...');
    try {
      await runCommand('npm', ['run', 'lint']);
      log(COLORS.green, '✅ Linting passed\n');
      checks.push({ name: 'Linting', passed: true });
    } catch (err) {
      log(COLORS.red, '❌ Linting failed\n');
      checks.push({ name: 'Linting', passed: false });
    }
  }
  
  // Check 3: TypeScript (if tsconfig exists)
  if (existsSync('tsconfig.json')) {
    log(COLORS.yellow, '📋 Running TypeScript check...');
    try {
      await runCommand('npx', ['tsc', '--noEmit']);
      log(COLORS.green, '✅ TypeScript check passed\n');
      checks.push({ name: 'TypeScript', passed: true });
    } catch (err) {
      log(COLORS.red, '❌ TypeScript check failed\n');
      checks.push({ name: 'TypeScript', passed: false });
    }
  }
  
  // Check 4: Build test
  log(COLORS.yellow, '📋 Testing build...');
  try {
    await runCommand('npm', ['run', 'build']);
    log(COLORS.green, '✅ Build successful\n');
    checks.push({ name: 'Build', passed: true });
  } catch (err) {
    log(COLORS.red, '❌ Build failed\n');
    checks.push({ name: 'Build', passed: false });
  }
  
  // Summary
  console.log('═'.repeat(50));
  log(COLORS.cyan, '📊 PRE-DEPLOY SUMMARY');
  console.log('═'.repeat(50));
  
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;
  
  checks.forEach(c => {
    const icon = c.passed ? '✅' : '❌';
    const color = c.passed ? COLORS.green : COLORS.red;
    log(color, `${icon} ${c.name}`);
  });
  
  console.log('═'.repeat(50));
  
  if (failed > 0) {
    log(COLORS.red, `\n❌ ${failed} check(s) failed. Fix issues before deploying.\n`);
    process.exit(1);
  } else {
    log(COLORS.green, `\n✅ All ${passed} checks passed! Safe to deploy.\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
