import { Router } from 'express';

import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { loginLimiter, refreshLimiter, registerLimiter } from '../middleware/authRateLimit.js';
import { requireTrustedOrigin } from '../middleware/trustedOrigin.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginSchema, registerSchema } from '../validators/auth.schemas.js';

const router = Router();

router.post(
  '/register',
  requireTrustedOrigin,
  registerLimiter,
  validate(registerSchema),
  asyncHandler(controller.register),
);
router.post(
  '/login',
  requireTrustedOrigin,
  loginLimiter,
  validate(loginSchema),
  asyncHandler(controller.login),
);
router.post('/refresh', requireTrustedOrigin, refreshLimiter, asyncHandler(controller.refresh));
router.post('/logout', requireTrustedOrigin, asyncHandler(controller.logout));
router.post('/logout-all', requireTrustedOrigin, authenticate, asyncHandler(controller.logoutAll));
router.get('/me', authenticate, asyncHandler(controller.me));

export default router;
