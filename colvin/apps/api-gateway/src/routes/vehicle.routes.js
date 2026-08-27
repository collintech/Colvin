import { Router } from 'express';

import * as controller from '../controllers/vehicle.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermission, PERMISSIONS } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { decodeVinSchema, vinParamsSchema } from '../validators/vehicle.schemas.js';

const router = Router();
router.use(authenticate);
router.post(
  '/decode',
  authorizePermission(PERMISSIONS.VEHICLE_LOOKUP),
  validate(decodeVinSchema),
  asyncHandler(controller.decode),
);
router.get(
  '/:vin/report',
  authorizePermission(PERMISSIONS.HISTORY_READ),
  validate(vinParamsSchema),
  asyncHandler(controller.report),
);

export default router;
