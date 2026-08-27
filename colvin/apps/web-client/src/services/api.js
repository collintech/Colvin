import axios from 'axios';

import { clearSession, getSession, setSession } from './tokenStore.js';

const baseURL = import.meta.env.VITE_API_BASE_URL;

const api = axios.create({
  baseURL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getSession()?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status !== 401 ||
      original?._retry ||
      original?.skipAuthRefresh ||
      original?.url?.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    original._retry = true;
    refreshPromise ??= axios
      .post(`${baseURL}/auth/refresh`, undefined, { withCredentials: true })
      .then((response) => {
        setSession(response.data.data);
        return response.data.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });

    try {
      const token = await refreshPromise;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      clearSession();
      window.location.assign('/login');
      return Promise.reject(refreshError);
    }
  },
);

export default api;
