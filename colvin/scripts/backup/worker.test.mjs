import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  configuration,
  parseDriveConfig,
  privateFolder,
  publish,
} from '../../apps/backup-worker/worker.mjs';
import { source } from './backup-tools.mjs';
import { retentionPlan, snapshotTime } from './retention.mjs';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const name = (day) => `colvin-auto-202601${String(day).padStart(2, '0')}T001500Z-${id}`;
const profile = `[colvin_backup]\ntype = drive\nscope = drive.file\nclient_id = fixture.apps.googleusercontent.com\nclient_secret = fixture\nroot_folder_id = fixturefolder1234\ntoken = {"token_type":"Bearer","access_token":"fixture-access","refresh_token":"fixture-refresh"}\n`;
const b64 = (text) => Buffer.from(text).toString('base64');
const validEnv = () => ({
  BACKUP_WORKER_ENABLED: 'true',
  RAILWAY_PROJECT_ID: source.project,
  RAILWAY_ENVIRONMENT_ID: source.environment,
  RAILWAY_SERVICE_ID: id,
  BACKUP_WORKER_SERVICE_ID: id,
  BACKUP_DATABASE_HOST: 'postgres.railway.internal',
  BACKUP_DATABASE_PORT: '5432',
  BACKUP_DATABASE_NAME: 'railway',
  BACKUP_DATABASE_USER: 'colvin_backup_reader',
  BACKUP_DATABASE_PASSWORD: 'synthetic-fixture-password-0123456789',
  BACKUP_DB_SSL_CA_BASE64: b64('-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----'),
  BACKUP_GPG_PUBLIC_KEY_BASE64: b64(
    '-----BEGIN PGP PUBLIC KEY BLOCK-----\nfixture\n-----END PGP PUBLIC KEY BLOCK-----',
  ),
  BACKUP_GPG_FINGERPRINT: 'A'.repeat(40),
  BACKUP_DRIVE_CONFIG_BASE64: b64(profile),
  BACKUP_DRIVE_FOLDER_ID: 'fixturefolder1234',
  BACKUP_HEARTBEAT_URL: 'https://incidents.betterstack.com/api/v1/heartbeat/fixture',
});

test('cloud worker refuses wrong environment, privileged login, public database and unsafe heartbeat', () => {
  configuration(validEnv());
  for (const [key, value] of [
    ['RAILWAY_ENVIRONMENT_ID', id],
    ['RAILWAY_SERVICE_ID', source.service],
    ['BACKUP_DATABASE_USER', 'postgres'],
    ['BACKUP_DATABASE_HOST', 'public.example.com'],
    ['BACKUP_HEARTBEAT_URL', 'https://attacker.invalid/api/v1/heartbeat/fixture'],
    ['BACKUP_GPG_PUBLIC_KEY_BASE64', b64('-----BEGIN PGP PRIVATE KEY BLOCK-----')],
  ])
    assert.throws(() => configuration({ ...validEnv(), [key]: value }));
});

test('Drive config refuses full-account scopes, alternate endpoints and another profile', () => {
  parseDriveConfig(profile);
  for (const text of [
    profile.replace('drive.file', 'drive'),
    profile + 'token_url = https://attacker.invalid\n',
    profile + '[another]\ntype = drive\n',
    profile + 'scope = drive.file\n',
  ])
    assert.throws(() => parseDriveConfig(text));
});

test('Drive destination must be an unshared folder owned by the authenticated user', () => {
  const meta = {
    id: 'fixturefolder1234',
    mimeType: 'application/vnd.google-apps.folder',
    trashed: false,
    ownedByMe: true,
    permissions: [{ type: 'user', role: 'owner' }],
  };
  privateFolder(meta, meta.id);
  for (const change of [
    { ownedByMe: false },
    { trashed: true },
    { permissions: [...meta.permissions, { type: 'anyone', role: 'reader' }] },
  ])
    assert.throws(() => privateFolder({ ...meta, ...change }, meta.id));
});

test('retention preserves current, weekly/monthly samples and every unmanaged/future path', () => {
  const names = Array.from({ length: 31 }, (_, i) => name(i + 1));
  const unknown = [
    '../manual',
    'colvin-staging-20261104T131728Z-o0rZfPp6',
    name(32),
    `colvin-auto-20500101T001500Z-${id}`,
  ];
  const plan = retentionPlan([...names, ...unknown], name(31), new Date('2026-02-01T00:00:00Z'));
  assert.equal(plan.ignored, unknown.length);
  assert.ok(plan.keep.includes(name(31)) && plan.keep.length >= 14 && plan.keep.length <= 21);
  assert.ok(plan.remove.length > 0 && plan.remove.every((item) => names.includes(item)));
  assert.equal(snapshotTime(name(32)), null);
  assert.throws(() => retentionPlan([name(1), name(1)], name(1)));
});

test('failed upload/readback never deletes old backups or sends a success heartbeat', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'colvin-publish-test-'));
  try {
    for (const phase of ['privacy', 'upload', 'readback']) {
      const calls = [];
      const store = {
        checkPrivate: async () => {
          calls.push('privacy');
          if (phase === 'privacy') throw Error();
        },
        put: async () => {
          calls.push('upload');
          if (phase === 'upload') throw Error();
        },
        checkFile: async () => {
          calls.push('readback');
          throw Error();
        },
        purge: async () => calls.push('delete'),
      };
      await assert.rejects(() =>
        publish({
          store,
          artifact: { filename: 'fixture', bytes: 1, sha256: 'a'.repeat(64) },
          name: name(31),
          work,
          applyRetention: true,
          heartbeat: async () => calls.push('heartbeat'),
        }),
      );
      assert.ok(!calls.includes('delete') && !calls.includes('heartbeat'));
    }
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
});

test('retention dry-run is the default and incomplete old folders are never deleted', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'colvin-publish-test-'));
  try {
    const docs = new Map();
    let deleted = 0,
      beats = 0;
    const store = {
      checkPrivate: async () => {},
      put: async () => {},
      checkFile: async () => {},
      json: async (k, v) => docs.set(k, v),
      readJson: async (k) => {
        if (!docs.has(k)) throw Error('incomplete');
        return docs.get(k);
      },
      names: async () => Array.from({ length: 31 }, (_, i) => name(i + 1)),
      purge: async () => deleted++,
    };
    const result = await publish({
      store,
      artifact: { filename: 'fixture', bytes: 1, sha256: 'a'.repeat(64) },
      name: name(31),
      work,
      applyRetention: false,
      heartbeat: async () => beats++,
    });
    assert.equal(deleted, 0);
    assert.equal(beats, 1);
    assert.ok(result.unverifiedFolders > 0);
    assert.equal(result.retentionApplied, false);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
});

test('incomplete newer folders cannot evict the last fourteen completed backups', async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'colvin-retention-test-'));
  try {
    const docs = new Map();
    const removed = [];
    for (let day = 1; day <= 15; day++)
      docs.set(`${name(day)}/receipt.json`, {
        formatVersion: 1,
        state: 'complete',
        name: name(day),
        origin: source,
        sha256: 'a'.repeat(64),
        bytes: 1,
      });
    const store = {
      checkPrivate: async () => {},
      put: async () => {},
      checkFile: async () => {},
      json: async (k, v) => docs.set(k, v),
      readJson: async (k) => {
        if (!docs.has(k)) throw Error('incomplete');
        return docs.get(k);
      },
      names: async () => Array.from({ length: 31 }, (_, i) => name(i + 1)),
      purge: async (n) => removed.push(n),
    };
    await publish({
      store,
      artifact: { filename: 'fixture', bytes: 1, sha256: 'a'.repeat(64) },
      name: name(31),
      work,
      applyRetention: true,
      heartbeat: async () => {},
    });
    assert.ok(16 - removed.length >= 14);
    assert.ok(
      removed.every((item) => Array.from({ length: 15 }, (_, i) => name(i + 1)).includes(item)),
    );
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
});
