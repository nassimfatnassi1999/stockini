import axios from 'axios';
import { toast } from './toast';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  if (typeof window === 'undefined') return config;
  const token = window.localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;

    if (status === 401 && typeof window !== 'undefined' && !error.config?.url?.includes('/auth/login')) {
      window.localStorage.removeItem('access_token');
      window.localStorage.removeItem('refresh_token');
      window.localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }

    if (status === 403) {
      toast.error('Accès refusé — permissions insuffisantes');
      return Promise.reject(error);
    }

    if (status === 404) {
      const msg = error.response?.data?.message;
      if (msg) toast.error(msg);
      return Promise.reject(error);
    }

    if (status === 422 || status === 400) {
      const msg = error.response?.data?.message;
      if (msg) {
        const text = Array.isArray(msg) ? msg[0] : msg;
        toast.error(text);
      }
      return Promise.reject(error);
    }

    if (status >= 500) {
      toast.error('Erreur serveur — veuillez réessayer');
    }

    return Promise.reject(error);
  },
);
