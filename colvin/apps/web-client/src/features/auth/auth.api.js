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
