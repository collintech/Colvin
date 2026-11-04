// CI-only PostgreSQL parser regression; no user rows are read or printed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { canonicalChecks } from './backup-tools.mjs';

const container = process.argv[2];
assert.match(container, /^[a-f0-9]{64}$/);
const query = (input) => {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-XqAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'colvin_fixture',
      '-d',
      'colvin_fixture',
    ],
    { input, encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(result.status, 0);
  return result.stdout.trim();
};
const check = (definition) => [
  {
    table: 'account_action_tokens',
    name: 'account_action_tokens_purpose_check',
    definition,
    validated: true,
  },
];
const original = check(
  "CHECK (((purpose)::text = ANY ((ARRAY['password_reset'::character varying, 'email_verify'::character varying])::text[])))",
);
const restored = check(
  "CHECK (((purpose)::text = ANY (ARRAY[('password_reset'::character varying)::text, ('email_verify'::character varying)::text])))",
);
const changed = check("CHECK (purpose = 'password_reset')");
assert.deepEqual(canonicalChecks(original, query), canonicalChecks(restored, query));
assert.notDeepEqual(canonicalChecks(original, query), canonicalChecks(changed, query));
console.log(
  'PostgreSQL CHECK comparison accepts equivalent coercions and rejects a changed predicate.',
);
