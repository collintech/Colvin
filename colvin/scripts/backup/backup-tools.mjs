import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
export const source = Object.freeze({
  project: 'a0803155-bc22-4311-ac90-43ab3582550e',
  environment: 'ce8f6930-5c13-46f6-955c-8f62018223af',
  service: 'ce3b1090-d6cc-4943-95a6-7c88e839ec3e',
});
const tables = [
  'account_action_tokens',
  'auth_audit_events',
  'history_provider_checks',
  'lookup_logs',
  'provider_runtime_state',
  'provider_usage_daily',
  'refresh_tokens',
  'schema_migrations',
  'users',
  'vehicle_history_records',
  'vehicles',
];
const read = (filename) =>
  fs.readFileSync(path.join(directory, filename), 'utf8').replace(/\r\n/g, '\n');
const sql = () => read('manifest.sql');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function migrations() {
  const folder = path.join(root, 'database/migrations');
  return fs
    .readdirSync(folder)
    .filter((name) => /^\d+[A-Za-z0-9_]*\.sql$/.test(name))
    .sort()
    .map((filename) => {
      // Git for Windows may materialize LF repository files as CRLF.
      const text = fs.readFileSync(path.join(folder, filename), 'utf8').replace(/\r\n/g, '\n');
      return { filename, checksum: sha256(text), sql: text };
    });
}

export function checkManifest(value) {
  assert.equal(value.formatVersion, 1, 'Unsupported manifest format');
  assert.match(value.postgresVersionNumber, /^18\d{4}$/, 'PostgreSQL 18 required');
  for (const key of ['projectId', 'environmentId', 'serviceId']) {
    assert.match(value.origin[key], /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  }
  assert.match(value.dumpClient, /^pg_dump \(PostgreSQL\) 18\./);
  assert.deepEqual(
    value.migrations,
    migrations().map(({ filename, checksum }) => ({ filename, checksum })),
    'Migration ledger differs from this checkout',
  );
  assert.deepEqual(value.schema.tables, tables, 'Unexpected public tables');
  assert.deepEqual(Object.keys(value.counts).sort(), tables, 'Incomplete row counts');
  for (const count of Object.values(value.counts)) assert.match(count, /^(0|[1-9]\d*)$/);
  assert.equal(value.counts.schema_migrations, String(migrations().length));
  assert.ok(value.schema.extensions.some((item) => item.name === 'pgcrypto'));
  assert.ok(
    value.schema.indexes.length > 0 &&
      value.schema.indexes.every((item) => item.valid && item.ready),
  );
  assert.ok(
    value.schema.constraints.length > 0 && value.schema.constraints.every((item) => item.validated),
  );
}

export function checkLocalEndpoint(endpoint) {
  assert.match(
    endpoint,
    /^(unix:\/\/\/|npipe:\/\/\/)/,
    'Use a local Docker socket, not a remote Docker daemon',
  );
}

export function checkOutsideRepository(folder) {
  const actual = fs.realpathSync(folder);
  const repository = fs.realpathSync(path.resolve(root, '..'));
  const relative = path.relative(repository, actual);
  assert.ok(
    relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    'Choose a backup folder outside the repository',
  );
}

function docker(args, input) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.status, 0, 'Local Docker operation failed');
  return result.stdout.trim();
}

function checkContainer(container, token) {
  assert.match(container, /^[a-f0-9]{64}$/);
  assert.match(token, /^[a-f0-9-]{36}$/);
  const [info] = JSON.parse(docker(['inspect', container]));
  assert.equal(info.Config.Labels['colvin.restore-drill'], token);
  assert.equal(info.HostConfig.NetworkMode, 'none');
  assert.equal(info.HostConfig.Privileged, false);
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  assert.ok(info.Mounts.every((mount) => mount.Type === 'volume'));
  return info;
}

function parseManifest(text) {
  assert.ok(Buffer.byteLength(text) <= 1024 * 1024, 'Oversized manifest');
  const value = JSON.parse(text);
  checkManifest(value);
  return value;
}

function main(command, args) {
  switch (command) {
    case 'source-ids':
      console.log(Object.values(source).join(' '));
      break;
    case 'uuid':
      console.log(randomUUID());
      break;
    case 'render-source':
      process.stdout.write(read('export-source.sh').replace('__COLVIN_MANIFEST_SQL__', sql()));
      break;
    case 'outside-repository':
      checkOutsideRepository(args[0]);
      break;
    case 'docker-check': {
      const contextEndpoint = JSON.parse(docker(['context', 'inspect']))[0].Endpoints.docker.Host;
      const endpoint = process.env.DOCKER_CONTEXT
        ? contextEndpoint
        : process.env.DOCKER_HOST || contextEndpoint;
      checkLocalEndpoint(endpoint);
      assert.equal(
        docker(['info', '--format', '{{.OSType}}']),
        'linux',
        'Linux Docker containers required',
      );
      console.log(endpoint);
      break;
    }
    case 'verify': {
      const [container, token] = args;
      const info = checkContainer(container, token);
      const exported = parseManifest(
        docker(['exec', container, 'cat', '/tmp/colvin-import/manifest.json']),
      );
      const restored = parseManifest(
        docker(
          [
            'exec',
            '-i',
            container,
            'psql',
            '-XqAt',
            '-v',
            'ON_ERROR_STOP=1',
            '-v',
            `project=${exported.origin.projectId}`,
            '-v',
            `environment=${exported.origin.environmentId}`,
            '-v',
            `service=${exported.origin.serviceId}`,
            '-v',
            `dump_client=${exported.dumpClient}`,
            '-U',
            'colvin_restore',
            '-d',
            'colvin_restore',
          ],
          `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${sql()}\nCOMMIT;\n`,
        ),
      );
      assert.deepEqual(
        restored.counts,
        exported.counts,
        'Restored counts differ from the export snapshot',
      );
      assert.deepEqual(
        restored.schema,
        exported.schema,
        'Restored schema differs from the export snapshot',
      );
      console.log(
        JSON.stringify(
          {
            passed: true,
            checks: [
              'migration checksums',
              'public tables and columns',
              'constraints and indexes',
              'extensions',
              'snapshot row counts',
            ],
            postgresMajor: 18,
            migrationCount: restored.migrations.length,
            tableCount: tables.length,
            sourceVersion: exported.postgresVersionNumber,
            targetVersion: restored.postgresVersionNumber,
            origin: exported.origin,
            dumpClient: exported.dumpClient,
            targetImage: info.Image,
            verifiedAt: new Date().toISOString(),
            network: 'none',
          },
          null,
          2,
        ),
      );
      break;
    }
    case 'digest': {
      const filename = path.join(args[0], 'backup.tar.gpg');
      fs.writeFileSync(
        path.join(args[0], 'SHA256SUMS'),
        `${sha256(fs.readFileSync(filename))}  backup.tar.gpg\n`,
        { flag: 'wx', mode: 0o600 },
      );
      break;
    }
    case 'check-digest': {
      const expected = fs.readFileSync(path.join(args[0], 'SHA256SUMS'), 'utf8');
      assert.equal(
        expected,
        `${sha256(fs.readFileSync(path.join(args[0], 'backup.tar.gpg')))}  backup.tar.gpg\n`,
        'Encrypted archive digest mismatch',
      );
      break;
    }
    case 'fixture-sql':
      process.stdout.write(
        'CREATE TABLE schema_migrations (filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());\n',
      );
      for (const entry of migrations())
        process.stdout.write(
          `BEGIN;\n${entry.sql}\nINSERT INTO schema_migrations(filename,checksum) VALUES ('${entry.filename}','${entry.checksum}');\nCOMMIT;\n`,
        );
      process.stdout.write(read('fixture.sql'));
      break;
    default:
      throw new Error('Unsupported backup operation');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main(process.argv[2], process.argv.slice(3));
  } catch {
    // Assertions can include compared database/schema values; never log them.
    console.error(
      `Backup verification failed (${['docker-check', 'outside-repository', 'verify', 'digest', 'check-digest'].includes(process.argv[2]) ? process.argv[2] : 'operation'}). Check the documented prerequisites and use the matching release checkout.`,
    );
    process.exitCode = 1;
  }
}
