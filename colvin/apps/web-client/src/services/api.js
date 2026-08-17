import axios from 'axios';
import { clearSession, getSession, setSession } from './tokenStore.js';
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});
api.interceptors.request.use((config) => {
  const token = getSession()?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
let refreshPromise = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original?._retry) return Promise.reject(error);
    const session = getSession();
    if (!session?.refreshToken) {
      clearSession();
      return Promise.reject(error);
    }
    original._retry = true;
    refreshPromise ??= axios
      .post(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh`, {
        refreshToken: session.refreshToken,
      })
      .then((r) => {
        setSession(r.data.data);
        return r.data.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
    try {
      const token = await refreshPromise;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (e) {
      clearSession();
      window.location.assign('/login');
      return Promise.reject(e);
    }
  },
);
export default api;
