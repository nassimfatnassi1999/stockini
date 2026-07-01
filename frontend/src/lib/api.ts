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
let loginRedirectStarted = false;

function redirectToLogin() {
  if (typeof window === 'undefined' || loginRedirectStarted) return;
  loginRedirectStarted = true;
  processQueue(new Error('Session expirée'), null);
  clearAuthSession();
  window.location.href = '/login';
}

// Deduplicate 403 toasts — only fire once per 3-second window
let toast403Timer: ReturnType<typeof setTimeout> | null = null;
function show403Toast() {
  if (toast403Timer) return;
  toast.error('Accès refusé — permissions insuffisantes');
  toast403Timer = setTimeout(() => { toast403Timer = null; }, 3000);
}

const errorToastKeys = new Set<string>();
function showEndpointErrorToast(url: string, message: string) {
  const key = `${url}:${message}`;
  if (errorToastKeys.has(key)) return;
  errorToastKeys.add(key);
  toast.error(message);
  setTimeout(() => { errorToastKeys.delete(key); }, 6000);
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

    // During a destructive restore, background dashboard requests may become 401
    // before the restore response returns. Keep the overlay mounted and let the
    // restore request perform the final logout after confirmed success.
    if (
      status === 401 &&
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem('stockini_restore_in_progress') === '1'
    ) {
      return Promise.reject(error);
    }

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
        redirectToLogin();
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
        redirectToLogin();
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
      if (msg) showEndpointErrorToast(url, Array.isArray(msg) ? msg[0] : msg);
      return Promise.reject(error);
    }

    if (status === 422 || status === 400) {
      const msg = error.response?.data?.message;
      if (msg) {
        const text = Array.isArray(msg) ? msg[0] : msg;
        showEndpointErrorToast(url, text);
      }
      return Promise.reject(error);
    }

    if (status >= 500) {
      showEndpointErrorToast(url, 'Erreur serveur — veuillez réessayer');
    }

    return Promise.reject(error);
  },
);
