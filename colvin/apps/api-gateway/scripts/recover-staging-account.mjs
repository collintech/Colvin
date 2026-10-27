import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { assertStagingTarget, openStagingRecovery, RecoveryError } from './lib/staging-recovery.js';

export function createRecoveryPrompt(input, output) {
  let hidden = false;
  const controller = new globalThis.AbortController();
  const terminalOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) output.write(chunk, encoding);
      callback();
    },
  });
  const terminal = createInterface({
    input,
    output: terminalOutput,
    terminal: true,
    historySize: 0,
  });
  terminal.on('SIGINT', () => controller.abort());
  terminal.on('close', () => controller.abort());

  return {
    async ask(label, secret = false) {
      if (controller.signal.aborted) throw new RecoveryError('Recovery cancelled.');
      hidden = secret;
      if (secret) output.write(label);
      try {
        return await terminal.question(secret ? '' : label, { signal: controller.signal });
      } finally {
        hidden = false;
        if (secret) output.write('\n');
      }
    },
    close: () => terminal.close(),
  };
}

export async function runRecoveryCommand({
  args = process.argv.slice(2),
  input = process.stdin,
  output = process.stdout,
  openRecovery = openStagingRecovery,
} = {}) {
  const { values } = parseArgs({
    args,
    options: {
      'project-id': { type: 'string' },
      'environment-id': { type: 'string' },
      'service-id': { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    output.write(
      'Usage: node scripts/recover-staging-account.mjs --project-id ID --environment-id ID --service-id ID\n',
    );
    return;
  }
  const target = {
    projectId: values['project-id'],
    environmentId: values['environment-id'],
    serviceId: values['service-id'],
  };
  assertStagingTarget(process.env, target);
  if (!input.isTTY || !output.isTTY) {
    throw new RecoveryError('An interactive SSH terminal is required; do not pipe credentials.');
  }

  const recovery = await openRecovery(target);
  let prompt;
  try {
    prompt = createRecoveryPrompt(input, output);
    output.write(
      `Staging account recovery\nEnvironment: ${target.environmentId}\nService: ${target.serviceId}\n`,
    );
    const email = (await prompt.ask('Account email: ')).trim();
    const account = await recovery.findAccount(email);
    output.write(
      `Account: ${account.email}\nUser ID: ${account.id}\nAuth version: ${account.authVersion}\n`,
    );
    const newPassword = await prompt.ask('New password (hidden): ', true);
    const repeated = await prompt.ask('Repeat new password (hidden): ', true);
    if (newPassword !== repeated)
      throw new RecoveryError('Passwords did not match. No recovery performed.');
    output.write('Passwords match. Type the confirmation below to start recovery.\n');
    const confirmation = await prompt.ask(`Type RESET ${account.email} to commit: `);
    if (confirmation !== `RESET ${account.email}`) {
      throw new RecoveryError('Confirmation did not match. No recovery performed.');
    }
    // Restore terminal echo before database work; secrets never enter shell arguments or history.
    prompt.close();
    output.write('Applying staging recovery...\n');
    const result = await recovery.resetPassword({
      userId: account.id,
      email: account.email,
      newPassword,
    });
    output.write(
      `Recovery complete. Auth version: ${result.authVersion}. Existing sessions and password-reset links revoked.\nSign in through the staging website with the new password.\n`,
    );
  } finally {
    prompt?.close();
    await recovery.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runRecoveryCommand();
  } catch (error) {
    const safeCodes = ['COMPROMISED_PASSWORD', 'PASSWORD_SCREENING_UNAVAILABLE'];
    const message =
      error instanceof RecoveryError || safeCodes.includes(error.code)
        ? error.message
        : error.name === 'AbortError'
          ? 'Recovery cancelled.'
          : 'Recovery was not confirmed. Check the target and database connection before retrying; verify sign-in if the connection was interrupted.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
