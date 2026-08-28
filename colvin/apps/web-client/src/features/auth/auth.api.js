import api from '../../services/api.js';

export const registerRequest = (payload) =>
  api.post('/auth/register', payload).then((response) => response.data.data);

export const loginRequest = (payload) =>
  api.post('/auth/login', payload).then((response) => response.data.data);

export const refreshRequest = () =>
  api
    .post('/auth/refresh', undefined, { skipAuthRefresh: true })
    .then((response) => response.data.data);

export const logoutRequest = () => api.post('/auth/logout', undefined, { skipAuthRefresh: true });

export const logoutAllRequest = () => api.post('/auth/logout-all');

export const changePasswordRequest = (payload) => api.post('/auth/password/change', payload);

export const requestPasswordReset = (email) =>
  api
    .post('/auth/password/reset/request', { email }, { skipAuthRefresh: true })
    .then((response) => response.data.data);

export const confirmPasswordReset = (payload) =>
  api.post('/auth/password/reset/confirm', payload, { skipAuthRefresh: true });

export const requestEmailVerification = () =>
  api.post('/auth/email/verification/request').then((response) => response.data.data);

export const confirmEmailVerification = (token) =>
  api.post('/auth/email/verification/confirm', { token }, { skipAuthRefresh: true });
