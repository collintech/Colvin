import process from 'node:process';
import { parseArgs } from 'node:util';

import { checkStagingRuntime, RuntimeCheckError, stagingIdentity } from './lib/staging-runtime.js';

try {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'expect-deployment': { type: 'string' },
      'expect-commit': { type: 'string' },
    },
    allowPositionals: false,
  });
  const expected = { deployment: values['expect-deployment'], commit: values['expect-commit'] };
  // Refuse the wrong environment or stale container before loading app config.
  stagingIdentity(process.env, expected);
  const { env } = await import('../src/config/env.js');
  const report = await checkStagingRuntime({ runtime: process.env, config: env, expected });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Staging runtime check ${report.passed ? 'passed' : 'failed'}.\n`);
  process.exitCode = report.passed ? 0 : 1;
} catch (error) {
  const reason =
    error instanceof RuntimeCheckError
      ? error.message
      : 'Runtime check could not complete; verify the command and deployed configuration.';
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
}
