import api from '../../services/api.js';
export const decodeVinRequest = (vin) =>
  api.post('/vehicles/decode', { vin }).then((r) => r.data.data);
export const reportRequest = (vin) =>
  api.get(`/vehicles/${encodeURIComponent(vin)}/report`).then((r) => r.data.data);
