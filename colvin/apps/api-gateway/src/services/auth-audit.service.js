import crypto from 'node:crypto';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { insertAuthAuditEvent } from '../repositories/auth-audit.repository.js';

function pseudonymousHash(value) {
  if (!value) return null;
  return crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

export function buildAuthAuditEvent({ req, eventType, outcome, userId, subject, metadata }) {
  return {
    userId: userId ?? null,
    eventType,
    outcome,
    subjectHash: pseudonymousHash(subject),
    ipHash: pseudonymousHash(req?.ip),
    requestId: req?.id ? String(req.id).slice(0, 128) : null,
    userAgent: req?.get?.('user-agent')?.slice(0, 512) ?? null,
    metadata: metadata ?? {},
  };
}

export async function recordAuthAudit(input) {
  const event = buildAuthAuditEvent(input);
  try {
    await insertAuthAuditEvent(event);
    return true;
  } catch (error) {
    logger.error(
      { error, eventType: event.eventType, outcome: event.outcome, requestId: event.requestId },
      'Authentication audit write failed',
    );
    return false;
  }
}
