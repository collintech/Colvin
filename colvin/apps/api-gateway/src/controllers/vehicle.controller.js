import * as vehicleService from '../services/vehicle.service.js';
export async function decode(req, res) {
  const data = await vehicleService.decodeAndStoreVin({
    vin: req.body.vin,
    user: req.user,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data });
}
export async function report(req, res) {
  res.json({ success: true, data: await vehicleService.getVehicleReport(req.params.vin) });
}
