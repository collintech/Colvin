import axios from 'axios';

import { clearSession, getSession, setSession } from './tokenStore.js';

const baseURL = import.meta.env.VITE_API_BASE_URL;

const api = axios.create({
  baseURL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const refreshClient = axios.create({
  baseURL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function isRefreshRace(error) {
  return (
    error.response?.status === 409 &&
    error.response?.data?.error?.code === 'REFRESH_ALREADY_ROTATED'
  );
}

export async function refreshSession() {
  let attempt = 0;

  while (attempt < 2) {
    try {
      const response = await refreshClient.post('/auth/refresh');
      const value = response.data.data;
      setSession(value);
      return value;
    } catch (error) {
      attempt += 1;
      if (!isRefreshRace(error) || attempt >= 2) throw error;
      await wait(125);
    }
  }

  throw new Error('Refresh retry exhausted');
}

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
    refreshPromise ??= refreshSession()
      .then((value) => value.accessToken)
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
