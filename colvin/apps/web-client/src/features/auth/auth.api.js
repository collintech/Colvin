import api from '../../services/api.js';
export const registerRequest = (payload) =>
  api.post('/auth/register', payload).then((r) => r.data.data);
export const loginRequest = (payload) => api.post('/auth/login', payload).then((r) => r.data.data);
export const logoutRequest = (refreshToken) => api.post('/auth/logout', { refreshToken });
