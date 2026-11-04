import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { renderExport, source } from '../../scripts/backup/backup-tools.mjs';
import { retentionPlan, snapshotTime } from '../../scripts/backup/retention.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const driveId = /^[A-Za-z0-9_-]{10,150}$/;
let stage = 'configuration';
const childEnv = (work) => ({ PATH: process.env.PATH, HOME: work, LANG: 'C.UTF-8', TZ: 'UTC' });
const digest = async (filename) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
};

function decode(value, limit) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[A-Za-z0-9+/]+={0,2}$/);
  const bytes = Buffer.from(value, 'base64');
  assert.ok(bytes.length > 0 && bytes.length <= limit);
  assert.equal(bytes.toString('base64'), value);
  return bytes.toString('utf8');
}

export function parseDriveConfig(text) {
  const values = {};
  let section = false;
  for (const line of text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((x) => x.trim())) {
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line === '[colvin_backup]' && !section) {
      section = true;
      continue;
    }
    assert.ok(section && !line.startsWith('['));
    const match = /^([a-z_]+)\s*=\s*(.+)$/.exec(line);
    assert.ok(match);
    const [, key, value] = match;
    assert.ok(
      ['type', 'scope', 'client_id', 'client_secret', 'token', 'root_folder_id'].includes(key),
    );
    assert.ok(!Object.hasOwn(values, key));
    values[key] = value;
  }
  assert.equal(values.type, 'drive');
  assert.equal(values.scope, 'drive.file');
  assert.match(values.client_id, /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/);
  assert.ok(values.client_secret?.length > 0 && values.client_secret.length < 1024);
  assert.match(values.root_folder_id, driveId);
  const token = JSON.parse(values.token);
  assert.equal(token.token_type, 'Bearer');
  assert.ok(typeof token.refresh_token === 'string' && token.refresh_token.length > 0);
  assert.ok(typeof token.access_token === 'string' && token.access_token.length > 0);
  return values;
}

export function configuration(env) {
  assert.equal(env.BACKUP_WORKER_ENABLED, 'true');
  assert.equal(env.RAILWAY_PROJECT_ID, source.project);
  assert.equal(env.RAILWAY_ENVIRONMENT_ID, source.environment);
  assert.match(env.BACKUP_WORKER_SERVICE_ID, uuid);
  assert.equal(env.RAILWAY_SERVICE_ID, env.BACKUP_WORKER_SERVICE_ID);
  assert.notEqual(env.RAILWAY_SERVICE_ID, source.service);
  assert.match(env.BACKUP_DATABASE_HOST, /^[a-z0-9-]+\.railway\.internal$/);
  assert.match(env.BACKUP_DATABASE_PORT, /^\d{1,5}$/);
  assert.ok(Number(env.BACKUP_DATABASE_PORT) > 0 && Number(env.BACKUP_DATABASE_PORT) <= 65535);
  assert.match(env.BACKUP_DATABASE_NAME, /^[A-Za-z0-9_-]{1,63}$/);
  assert.equal(env.BACKUP_DATABASE_USER, 'colvin_backup_reader');
  assert.ok(
    typeof env.BACKUP_DATABASE_PASSWORD === 'string' && env.BACKUP_DATABASE_PASSWORD.length >= 24,
  );
  const ca = decode(env.BACKUP_DB_SSL_CA_BASE64, 65536);
  assert.ok(
    ca.includes('-----BEGIN CERTIFICATE-----') &&
      ca.includes('-----END CERTIFICATE-----') &&
      !ca.includes('PRIVATE KEY'),
  );
  const publicKey = decode(env.BACKUP_GPG_PUBLIC_KEY_BASE64, 32768);
  assert.ok(
    publicKey.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----') &&
      !publicKey.includes('PRIVATE KEY'),
  );
  assert.match(env.BACKUP_GPG_FINGERPRINT, /^(?:[A-F0-9]{40}|[A-F0-9]{64})$/);
  const driveConfig = decode(env.BACKUP_DRIVE_CONFIG_BASE64, 16384);
  const drive = parseDriveConfig(driveConfig);
  assert.match(env.BACKUP_DRIVE_FOLDER_ID, driveId);
  assert.equal(drive.root_folder_id, env.BACKUP_DRIVE_FOLDER_ID);
  // The existing manually uploaded archive is never a worker destination.
  assert.ok(
    ![
      '1wPypsf8eeW4Cw42XJh-VGyv-f1Y4B7d4',
      '1viVdfVSXhmR_0j2fPbV0_kGG39UtJTzi',
      '1AIr6Vv1_ZxawEfuLH3tX9i9fMfY7wk2G',
    ].includes(drive.root_folder_id),
  );
  const heartbeat = new URL(env.BACKUP_HEARTBEAT_URL);
  assert.equal(heartbeat.protocol, 'https:');
  assert.ok(['incidents.betterstack.com', 'uptime.betterstack.com'].includes(heartbeat.hostname));
  assert.ok(
    !heartbeat.port &&
      !heartbeat.username &&
      !heartbeat.password &&
      !heartbeat.search &&
      !heartbeat.hash,
  );
  assert.match(heartbeat.pathname, /^\/api\/v1\/heartbeat\/[A-Za-z0-9_-]+$/);
  assert.ok(['false', 'true'].includes(env.BACKUP_RETENTION_APPLY ?? 'false'));
  return {
    ca,
    publicKey,
    driveConfig,
    drive,
    fingerprint: env.BACKUP_GPG_FINGERPRINT,
    heartbeat: heartbeat.href,
    applyRetention: env.BACKUP_RETENTION_APPLY === 'true',
  };
}

export function privateFolder(metadata, expectedId) {
  assert.equal(metadata.id, expectedId);
  assert.equal(metadata.mimeType, 'application/vnd.google-apps.folder');
  assert.equal(metadata.trashed, false);
  assert.equal(metadata.ownedByMe, true);
  assert.equal(metadata.permissions?.length, 1);
  assert.equal(metadata.permissions[0].type, 'user');
  assert.equal(metadata.permissions[0].role, 'owner');
}

function command(binary, args, env, input, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      args,
      { env, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024, killSignal: 'SIGTERM' },
      (error, stdout) =>
        error ? reject(new Error('Backup subprocess failed')) : resolve(stdout.trim()),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function boundedJson(url, options) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  let text = '';
  for await (const chunk of response.body) {
    text += Buffer.from(chunk).toString('utf8');
    assert.ok(Buffer.byteLength(text) <= 65536);
  }
  return JSON.parse(text);
}

export async function prepareKey(config, work) {
  const env = childEnv(work);
  const home = path.join(work, 'gpg');
  await fs.mkdir(home, { mode: 0o700 });
  const publicFile = path.join(work, 'recipient.asc');
  await fs.writeFile(publicFile, config.publicKey, { mode: 0o600 });
  const packets = await command(
    'gpg',
    ['--homedir', home, '--batch', '--list-packets', publicFile],
    env,
  );
  assert.ok(!/secret (?:sub )?key packet/i.test(packets));
  await command('gpg', ['--homedir', home, '--batch', '--import', publicFile], env);
  const keys = (
    await command('gpg', ['--homedir', home, '--batch', '--with-colons', '--list-keys'], env)
  )
    .split('\n')
    .map((line) => line.split(':'));
  assert.equal(keys.filter((row) => row[0] === 'pub').length, 1);
  const primary = keys.findIndex((row) => row[0] === 'pub');
  assert.equal(keys[primary + 1]?.[0], 'fpr');
  assert.equal(keys[primary + 1]?.[9], config.fingerprint);
  assert.ok(
    !(await command(
      'gpg',
      ['--homedir', home, '--batch', '--with-colons', '--list-secret-keys'],
      env,
    )),
  );
  return home;
}

export async function encryptedExport({ work, pgEnv, fingerprint, gpgHome }) {
  const filename = path.join(work, 'backup.tar.gpg');
  const plain = spawn('bash', ['-s', '--', source.project, source.environment, source.service], {
    env: pgEnv,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const encrypt = spawn(
    'gpg',
    [
      '--homedir',
      gpgHome,
      '--batch',
      '--no-armor',
      '--trust-model',
      'always',
      '--compress-algo',
      'none',
      '--recipient',
      fingerprint,
      '--encrypt',
      '--output',
      filename,
    ],
    { env: childEnv(work), stdio: ['pipe', 'ignore', 'ignore'] },
  );
  const done = (child) =>
    new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('Backup process failed')));
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('Backup process failed')),
      );
    });
  plain.stdin.on('error', () => {});
  plain.stdin.end(renderExport(true));
  try {
    await Promise.all([done(plain), done(encrypt), pipeline(plain.stdout, encrypt.stdin)]);
  } catch {
    plain.kill('SIGTERM');
    encrypt.kill('SIGTERM');
    throw new Error('Encrypted export failed');
  }
  const info = await fs.stat(filename);
  assert.ok(info.size > 0);
  return { filename, bytes: info.size, sha256: await digest(filename) };
}

export class DriveStore {
  constructor(work, config, folderId) {
    this.work = work;
    this.config = config;
    this.folderId = folderId;
    this.flags = [
      '--config',
      config,
      '--retries',
      '2',
      '--low-level-retries',
      '2',
      '--contimeout',
      '15s',
      '--timeout',
      '60s',
      '--checkers',
      '1',
      '--transfers',
      '1',
    ];
  }
  exec(args) {
    return command('rclone', [...this.flags, ...args], childEnv(this.work));
  }
  async checkPrivate() {
    await this.exec(['lsjson', 'colvin_backup:', '--max-depth', '1']); // Refresh OAuth before reading its access token.
    const profiles = JSON.parse(await this.exec(['config', 'dump']));
    assert.equal(Object.keys(profiles).length, 1);
    const token = JSON.parse(profiles.colvin_backup.token);
    const metadata = await boundedJson(
      `https://www.googleapis.com/drive/v3/files/${this.folderId}?fields=id,mimeType,trashed,ownedByMe,permissions(type,role)`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    privateFolder(metadata, this.folderId);
  }
  async put(name, filename) {
    await this.exec(['copyto', filename, `colvin_backup:${name}`]);
  }
  async json(name, value) {
    const filename = path.join(this.work, `json-${randomUUID()}`);
    await fs.writeFile(filename, JSON.stringify(value) + '\n', { mode: 0o600 });
    try {
      await this.put(name, filename);
    } finally {
      await fs.unlink(filename);
    }
  }
  async readJson(name) {
    const output = await this.exec(['cat', `colvin_backup:${name}`]);
    assert.ok(Buffer.byteLength(output) <= 16384);
    return JSON.parse(output);
  }
  async checkFile(name, expected) {
    const hash = createHash('sha256');
    let bytes = 0;
    const child = spawn('rclone', [...this.flags, 'cat', `colvin_backup:${name}`], {
      env: childEnv(this.work),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const done = new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('Drive readback failed')));
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('Drive readback failed')),
      );
    });
    try {
      await Promise.all([
        done,
        (async () => {
          for await (const chunk of child.stdout) {
            bytes += chunk.length;
            assert.ok(bytes <= expected.bytes);
            hash.update(chunk);
          }
        })(),
      ]);
      assert.equal(bytes, expected.bytes);
      assert.equal(hash.digest('hex'), expected.sha256);
    } catch {
      child.kill('SIGTERM');
      throw new Error('Drive readback verification failed');
    }
  }
  async names() {
    const entries = JSON.parse(
      await this.exec(['lsjson', 'colvin_backup:', '--dirs-only', '--max-depth', '1']),
    );
    assert.ok(Array.isArray(entries) && entries.length <= 10000);
    assert.ok(
      entries.every(
        (item) => item.IsDir && typeof item.Name === 'string' && item.Path === item.Name,
      ),
    );
    return entries.map((item) => item.Name);
  }
  async purge(name) {
    assert.ok(snapshotTime(name));
    await this.exec(['purge', `colvin_backup:${name}`]);
  }
}

export function checkedReceipt(value, name) {
  assert.equal(value.formatVersion, 1);
  assert.equal(value.state, 'complete');
  assert.equal(value.name, name);
  assert.deepEqual(value.origin, source);
  assert.match(value.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(value.bytes) && value.bytes > 0);
}

export async function publish({ store, artifact, name, work, applyRetention, heartbeat }) {
  assert.ok(snapshotTime(name));
  await store.checkPrivate();
  await store.put(`${name}/backup.tar.gpg`, artifact.filename);
  await store.checkFile(`${name}/backup.tar.gpg`, artifact);
  const sums = path.join(work, 'SHA256SUMS');
  await fs.writeFile(sums, `${artifact.sha256}  backup.tar.gpg\n`, { mode: 0o600 });
  await store.put(`${name}/SHA256SUMS`, sums);
  const receipt = {
    formatVersion: 1,
    state: 'complete',
    name,
    origin: source,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    verifiedAt: new Date().toISOString(),
    verification: 'encrypted Google Drive readback SHA256; no automated restore',
  };
  await store.json(`${name}/receipt.json`, receipt);
  assert.deepEqual(await store.readJson(`${name}/receipt.json`), receipt);
  const names = await store.names();
  assert.equal(new Set(names).size, names.length);
  let unverified = 0;
  stage = 'retention';
  const complete = [];
  const now = new Date();
  for (const candidate of names) {
    const time = snapshotTime(candidate);
    if (!time || time > now) continue;
    try {
      checkedReceipt(await store.readJson(`${candidate}/receipt.json`), candidate);
      complete.push(candidate);
    } catch {
      unverified++;
    }
  }
  const plan = retentionPlan(complete, name, now);
  for (const old of plan.remove) {
    try {
      checkedReceipt(await store.readJson(`${old}/receipt.json`), old);
    } catch {
      unverified++;
      continue;
    }
    if (applyRetention) {
      await store.checkPrivate();
      await store.purge(old);
    }
  }
  stage = 'heartbeat';
  await heartbeat();
  return {
    passed: true,
    readbackSha256: true,
    retentionApplied: applyRetention,
    retentionCandidates: plan.remove.length - unverified,
    unverifiedFolders: unverified,
    unmanagedFolders: names.length - complete.length - unverified,
    run: name,
    bytes: artifact.bytes,
  };
}

export async function run(env = process.env) {
  const config = configuration(env);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'colvin-worker-'));
  await fs.chmod(work, 0o700);
  try {
    stage = 'public encryption key';
    const gpgHome = await prepareKey(config, work);
    const caFile = path.join(work, 'postgres-ca.pem');
    await fs.writeFile(caFile, config.ca, { mode: 0o600 });
    const profile = path.join(work, 'rclone.conf');
    await fs.writeFile(profile, config.driveConfig, { mode: 0o600 });
    const store = new DriveStore(work, profile, config.drive.root_folder_id);
    stage = 'private Drive folder/authentication';
    await store.checkPrivate();
    stage = 'verified TLS read-only export/encryption';
    const artifact = await encryptedExport({
      work,
      gpgHome,
      fingerprint: config.fingerprint,
      pgEnv: {
        ...childEnv(work),
        PGHOST: env.BACKUP_DATABASE_HOST,
        PGPORT: env.BACKUP_DATABASE_PORT,
        PGDATABASE: env.BACKUP_DATABASE_NAME,
        PGUSER: env.BACKUP_DATABASE_USER,
        PGPASSWORD: env.BACKUP_DATABASE_PASSWORD,
        PGSSLMODE: 'verify-full',
        PGSSLROOTCERT: caFile,
      },
    });
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    const name = `colvin-auto-${stamp}-${randomUUID()}`;
    const heartbeat = async () => {
      const response = await fetch(config.heartbeat, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      assert.ok(response.ok);
      await response.body?.cancel();
    };
    stage = 'Drive upload/readback';
    return await publish({
      store,
      artifact,
      name,
      work,
      applyRetention: config.applyRetention,
      heartbeat,
    });
  } finally {
    await command(
      'gpgconf',
      ['--homedir', path.join(work, 'gpg'), '--kill', 'all'],
      childEnv(work),
    ).catch(() => {});
    await fs.rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await run()));
  } catch {
    console.error(JSON.stringify({ passed: false, code: 'BACKUP_WORKER_FAILED', stage }));
    process.exitCode = 1;
  }
}
