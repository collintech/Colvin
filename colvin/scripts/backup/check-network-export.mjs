// CI fixture entry point, never the worker's deployed start command.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { encryptedExport, prepareKey } from '../../apps/backup-worker/worker.mjs';
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'colvin-network-fixture-'));
try {
  const fingerprint = (await fs.readFile('/fixture/fingerprint', 'utf8')).trim();
  const publicKey = await fs.readFile('/fixture/public.asc', 'utf8');
  const gpgHome = await prepareKey({ fingerprint, publicKey }, work);
  const artifact = await encryptedExport({
    work,
    gpgHome,
    fingerprint,
    pgEnv: {
      PATH: process.env.PATH,
      PGHOST: process.env.PGHOST,
      PGPORT: '5432',
      PGDATABASE: 'colvin_fixture',
      PGUSER: 'colvin_backup_reader',
      PGPASSWORD: process.env.PGPASSWORD,
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: process.env.PGSSLROOTCERT,
    },
  });
  await fs.copyFile(artifact.filename, '/result/backup.tar.gpg');
} catch {
  console.error('Synthetic TLS/read-only export failed.');
  process.exitCode = 1;
} finally {
  try {
    execFileSync('gpgconf', ['--homedir', path.join(work, 'gpg'), '--kill', 'all'], {
      stdio: 'ignore',
    });
  } catch {}
  await fs.rm(work, { recursive: true, force: true });
}
