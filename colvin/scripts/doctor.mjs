import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function pass(message) {
  console.log(`✓ ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`✗ ${message}`);
}

function version(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const pkgPath = path.join(root, 'package.json');
if (!existsSync(pkgPath)) {
  fail('Run this command from the Colvin repository root.');
} else {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name === 'colvin'
    ? pass('Repository root detected: Colvin')
    : fail('Unexpected root package name');
}

const nodeVersion = version('node');
nodeVersion ? pass(`Node available: ${nodeVersion}`) : fail('Node is not available');
const npmVersion = version('npm');
npmVersion ? pass(`npm available: ${npmVersion}`) : fail('npm is not available');
const goVersion = version('go', ['version']);
goVersion ? pass(`Go available: ${goVersion}`) : fail('Go is not available');

existsSync(path.join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs'))
  ? pass('Local Prettier installation found')
  : fail('Local Prettier is missing; run npm install from the repository root');

existsSync(path.join(root, 'package-lock.json'))
  ? pass('package-lock.json found')
  : fail('package-lock.json missing; run npm install from the repository root and commit it');

existsSync(path.join(root, 'apps/services-go/history-service/go.sum'))
  ? pass('history-service/go.sum found')
  : fail(
      'history-service/go.sum missing; run go mod tidy inside apps/services-go/history-service and commit it',
    );

if (failures.length > 0) {
  console.error(`\nColvin doctor found ${failures.length} blocking issue(s).`);
  process.exitCode = 1;
} else {
  console.log('\nColvin dependency baseline is reproducible.');
}
