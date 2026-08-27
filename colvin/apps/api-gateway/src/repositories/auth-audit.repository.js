import { query } from '../database/postgres.js';

export async function insertAuthAuditEvent(event, executor) {
  const runner = executor?.query ? executor : { query };
  await runner.query(
    `INSERT INTO auth_audit_events
       (user_id, event_type, outcome, subject_hash, ip_hash, request_id, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      event.userId ?? null,
      event.eventType,
      event.outcome,
      event.subjectHash ?? null,
      event.ipHash ?? null,
      event.requestId ?? null,
      event.userAgent ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}
