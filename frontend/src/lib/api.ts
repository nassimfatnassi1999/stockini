import axios from 'axios';
import { toast } from './toast';
import { clearAuthSession, setAuthSession } from './auth';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: false,
});

// Queue of requests waiting for token refresh to complete
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

// Deduplicate 403 toasts — only fire once per 3-second window
let toast403Timer: ReturnType<typeof setTimeout> | null = null;
function show403Toast() {
  if (toast403Timer) return;
  toast.error('Accès refusé — permissions insuffisantes');
  toast403Timer = setTimeout(() => { toast403Timer = null; }, 3000);
}

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

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
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };
    const status = error.response?.status;
    const url: string = originalRequest?.url ?? '';

    // Handle 401: attempt silent refresh before logging out
    if (
      status === 401 &&
      typeof window !== 'undefined' &&
      !originalRequest._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh')
    ) {
      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = window.localStorage.getItem('refresh_token');
      if (!refreshToken) {
        clearAuthSession();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Use plain axios to avoid interceptor loop
        const { data } = await axios.post<{ accessToken: string; user: Parameters<typeof setAuthSession>[0]['user'] }>(
          '/api/auth/refresh',
          { refreshToken },
        );

        setAuthSession({ accessToken: data.accessToken, user: data.user });
        processQueue(null, data.accessToken);

        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthSession();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 403) {
      // Only show toast for mutations — GET 403s are silently ignored (widget queries)
      const method = (originalRequest?.method ?? 'get').toUpperCase();
      if (method !== 'GET') {
        show403Toast();
      }
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
