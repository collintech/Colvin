import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';

import { assertStagingTarget } from '../scripts/lib/staging-recovery.js';
import { createRecoveryPrompt, runRecoveryCommand } from '../scripts/recover-staging-account.mjs';

const target = { projectId: 'project', environmentId: 'environment', serviceId: 'service' };
const runtime = {
  RAILWAY_PROJECT_ID: target.projectId,
  RAILWAY_ENVIRONMENT_ID: target.environmentId,
  RAILWAY_SERVICE_ID: target.serviceId,
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  RAILWAY_SERVICE_NAME: 'api-gateway',
  RAILWAY_DEPLOYMENT_ID: 'deployment',
};

test('recovery rejects production, missing deployment identity and every mismatched target ID', () => {
  assert.doesNotThrow(() => assertStagingTarget(runtime, target));
  for (const changed of [
    { RAILWAY_ENVIRONMENT_NAME: 'production' },
    { RAILWAY_SERVICE_NAME: 'history-service' },
    { RAILWAY_DEPLOYMENT_ID: '' },
    { RAILWAY_PROJECT_ID: 'another-project' },
    { RAILWAY_ENVIRONMENT_ID: 'another-environment' },
    { RAILWAY_SERVICE_ID: 'another-service' },
  ]) {
    assert.throws(
      () => assertStagingTarget({ ...runtime, ...changed }, target),
      /matching project/,
    );
  }
  assert.throws(() => assertStagingTarget(runtime, {}), /matching project/);
});

function terminalStreams(onOutput = () => {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = (enabled) => {
    input.isRaw = enabled;
  };
  let rendered = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      rendered += chunk.toString();
      onOutput(rendered);
      callback();
    },
  });
  output.isTTY = true;
  return { input, output, rendered: () => rendered };
}

test('password input is hidden, cannot be recalled into a visible prompt and restores terminal mode', async () => {
  const io = terminalStreams();
  const prompt = createRecoveryPrompt(io.input, io.output);
  try {
    const answer = prompt.ask('New password: ', true);
    io.input.write('PrivatePassword67890\r');
    assert.equal(await answer, 'PrivatePassword67890');
    const confirmation = prompt.ask('Confirm: ');
    io.input.write('\u001b[Aconfirmed\r');
    assert.equal(await confirmation, 'confirmed');
    assert.equal(io.rendered().includes('PrivatePassword67890'), false);
    assert.match(io.rendered(), /confirmed/);
  } finally {
    prompt.close();
  }
  assert.equal(io.input.isRaw, false);
});

test('Ctrl+C cancels a hidden password prompt without displaying its input', async () => {
  const io = terminalStreams();
  const prompt = createRecoveryPrompt(io.input, io.output);
  const answer = prompt.ask('Password: ', true);
  io.input.write('PartialSecret\u0003');
  await assert.rejects(answer, { name: 'AbortError' });
  prompt.close();
  assert.equal(io.rendered().includes('PartialSecret'), false);
  assert.equal(io.input.isRaw, false);
});

test('noninteractive invocation and password command-line arguments never open the database', async () => {
  const previous = Object.fromEntries(Object.keys(runtime).map((key) => [key, process.env[key]]));
  Object.assign(process.env, runtime);
  let opened = false;
  const args = [
    '--project-id',
    'project',
    '--environment-id',
    'environment',
    '--service-id',
    'service',
  ];
  try {
    await assert.rejects(
      runRecoveryCommand({
        args,
        input: new PassThrough(),
        output: new PassThrough(),
        openRecovery: () => {
          opened = true;
        },
      }),
      /interactive SSH terminal/,
    );
    await assert.rejects(
      runRecoveryCommand({ args: [...args, '--password', 'never-accepted'] }),
      /Unknown option/,
    );
    assert.equal(opened, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('mismatched password confirmation or account confirmation never invokes recovery', async () => {
  const previous = Object.fromEntries(Object.keys(runtime).map((key) => [key, process.env[key]]));
  Object.assign(process.env, runtime);
  const args = [
    '--project-id',
    'project',
    '--environment-id',
    'environment',
    '--service-id',
    'service',
  ];
  try {
    for (const mismatch of ['password', 'account']) {
      let step = 0;
      let resets = 0;
      let closed = false;
      const replies = [
        ['Account email: ', 'owner@example.test'],
        ['New password (hidden): ', 'PrivateReplacement12345'],
        [
          'Repeat new password (hidden): ',
          mismatch === 'password' ? 'OtherReplacement67890' : 'PrivateReplacement12345',
        ],
        ['Type RESET owner@example.test to commit: ', 'cancel'],
      ];
      const io = terminalStreams((rendered) => {
        if (step < replies.length && rendered.includes(replies[step][0])) {
          const reply = replies[step++][1];
          globalThis.queueMicrotask(() => io.input.write(`${reply}\r`));
        }
      });
      await assert.rejects(
        runRecoveryCommand({
          args,
          input: io.input,
          output: io.output,
          openRecovery: async () => ({
            findAccount: async () => ({
              id: 'owner-id',
              email: 'owner@example.test',
              authVersion: 1,
            }),
            resetPassword: async () => {
              resets += 1;
            },
            close: async () => {
              closed = true;
            },
          }),
        }),
        /did not match/,
      );
      assert.equal(resets, 0);
      assert.equal(closed, true);
      assert.equal(io.input.isRaw, false);
      assert.equal(io.rendered().includes('PrivateReplacement12345'), false);
      assert.equal(io.rendered().includes('OtherReplacement67890'), false);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
