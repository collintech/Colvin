import console from 'node:console';
import { createHash, randomBytes } from 'node:crypto';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

import { registerSchema } from '../src/validators/auth.schemas.js';

const count = Number(process.argv[2] ?? 3);
if (!Number.isInteger(count) || count < 1 || count > 50 || !process.stdin.isTTY) {
  console.error('Run interactively and supply an invite count from 1 to 50.');
  process.exit(1);
}

const terminal = createInterface({ input: process.stdin, output: process.stdout });
const seen = new Set();
const invites = [];
try {
  while (invites.length < count) {
    const raw = await terminal.question(`Tester ${invites.length + 1} email: `);
    const parsed = registerSchema.shape.body.shape.email.safeParse(raw.trim());
    if (!parsed.success || seen.has(parsed.data)) {
      console.error('Enter a valid email address you have not entered already.');
      continue;
    }
    const email = parsed.data;
    seen.add(email);
    const code = randomBytes(24).toString('base64url');
    const digest = createHash('sha256')
      .update(email + '\n' + code)
      .digest('hex');
    invites.push({ code, digest });
  }
} finally {
  terminal.close();
}

for (const [i, { code }] of invites.entries()) console.log(`Tester ${i + 1} code: ${code}`);
console.log(`BETA_REGISTRATION_INVITE_DIGESTS=${invites.map(({ digest }) => digest).join(',')}`);
