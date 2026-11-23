import { createHash } from 'node:crypto';

import { AppError } from '../errors/AppError.js';

export function requireBetaInvite(digests) {
  const allowed = new Set(digests ?? []);
  return (req, _res, next) => {
    if (digests === undefined) return next();

    const { email, inviteCode } = req.body;
    if (inviteCode) {
      const digest = createHash('sha256')
        .update(email + '\n' + inviteCode)
        .digest('hex');
      if (allowed.has(digest)) return next();
    }

    return next(
      new AppError(403, 'INVITE_REQUIRED', 'Enter the invite code for your email address.'),
    );
  };
}
