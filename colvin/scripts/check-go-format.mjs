import { spawnSync } from 'node:child_process';

const result = spawnSync('gofmt', ['-l', 'apps/services-go'], {
  encoding: 'utf8',
  shell: false,
});

if (result.error) {
  console.error('Unable to run gofmt. Ensure Go is installed and available on PATH.');
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || 'gofmt failed.\n');
  process.exit(result.status ?? 1);
}

const unformattedFiles = result.stdout.trim();

if (unformattedFiles) {
  console.error('The following Go files are not formatted with gofmt:');
  console.error(unformattedFiles);
  process.exit(1);
}

console.log('Go formatting check passed.');
