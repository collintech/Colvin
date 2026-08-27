import { Router } from 'express';

import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { loginLimiter, refreshLimiter, registerLimiter } from '../middleware/authRateLimit.js';
import { authorizePermission, PERMISSIONS } from '../middleware/authorize.js';
import { requireTrustedOrigin } from '../middleware/trustedOrigin.js';
import { validate } from '../middleware/validate.js';
import {
  distributedLoginGuard,
  distributedRefreshGuard,
  distributedRegisterGuard,
} from '../security/auth-abuse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginSchema, registerSchema } from '../validators/auth.schemas.js';

const router = Router();

router.post(
  '/register',
  requireTrustedOrigin,
  registerLimiter,
  validate(registerSchema),
  distributedRegisterGuard,
  asyncHandler(controller.register),
);
router.post(
  '/login',
  requireTrustedOrigin,
  loginLimiter,
  validate(loginSchema),
  distributedLoginGuard,
  asyncHandler(controller.login),
);
router.post(
  '/refresh',
  requireTrustedOrigin,
  refreshLimiter,
  distributedRefreshGuard,
  asyncHandler(controller.refresh),
);
router.post('/logout', requireTrustedOrigin, asyncHandler(controller.logout));
router.post(
  '/logout-all',
  requireTrustedOrigin,
  authenticate,
  authorizePermission(PERMISSIONS.SESSION_REVOKE_SELF),
  asyncHandler(controller.logoutAll),
);
router.get(
  '/me',
  authenticate,
  authorizePermission(PERMISSIONS.ACCOUNT_READ_SELF),
  asyncHandler(controller.me),
);

export default router;
