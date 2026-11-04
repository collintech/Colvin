import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkLocalEndpoint,
  checkManifest,
  checkOutsideRepository,
  migrations,
} from './backup-tools.mjs';

test('restore refuses remote Docker endpoints', () => {
  for (const endpoint of [
    'tcp://localhost:2375',
    'ssh://production',
    'https://docker.example.com',
    '',
  ]) {
    assert.throws(() => checkLocalEndpoint(endpoint));
  }
  checkLocalEndpoint('unix:///var/run/docker.sock');
  checkLocalEndpoint('npipe:////./pipe/dockerDesktopLinuxEngine');
});

test('backup folder cannot be the repository, a descendant or a symlink to one', () => {
  assert.throws(() => checkOutsideRepository(process.cwd()));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'colvin-backup-guard-'));
  try {
    checkOutsideRepository(folder);
    fs.symlinkSync(process.cwd(), path.join(folder, 'checkout'), 'dir');
    assert.throws(() => checkOutsideRepository(path.join(folder, 'checkout')));
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test('manifest refuses the wrong database version or migration checksum', () => {
  const manifest = {
    formatVersion: 1,
    postgresVersionNumber: '160004',
    migrations: [],
    origin: {
      projectId: '11111111-1111-4111-8111-111111111111',
      environmentId: '22222222-2222-4222-8222-222222222222',
      serviceId: '33333333-3333-4333-8333-333333333333',
    },
    dumpClient: 'pg_dump (PostgreSQL) 18.1',
  };
  assert.throws(() => checkManifest(manifest));
  manifest.postgresVersionNumber = '180006';
  manifest.migrations = migrations().map(({ filename, checksum }) => ({ filename, checksum }));
  manifest.migrations[0].checksum = '0'.repeat(64);
  assert.throws(() => checkManifest(manifest));
});
