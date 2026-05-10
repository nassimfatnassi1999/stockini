interface AuthUser {
  id: string;
  fullName?: string;
  email: string;
  role: string;
  permissions?: string[];
}

function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('auth_user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.localStorage.getItem('access_token'));
}

export function getCurrentUserRole(): string | null {
  return getStoredUser()?.role ?? null;
}

export function getCurrentUserEmail(): string | null {
  return getStoredUser()?.email ?? null;
}

export function getCurrentUserDisplayName(): string | null {
  const u = getStoredUser();
  if (!u) return null;
  return u.fullName || u.email || null;
}

export function getCurrentUser(): AuthUser | null {
  return getStoredUser();
}

const SUPER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'];

/**
 * Returns true when the current session has the given permission.
 * Super/Admin roles bypass all permission checks.
 * Supports wildcards: '*' (all) and 'module.*' (all within a module).
 */
export function hasPermission(permissionKey: string): boolean {
  const user = getStoredUser();
  if (!user) return false;
  if (SUPER_ROLES.includes(user.role)) return true;
  const perms = user.permissions ?? [];
  if (perms.includes('*')) return true;
  if (perms.includes(permissionKey)) return true;
  const module = permissionKey.split('.')[0];
  return perms.includes(`${module}.*`);
}

export function isAdminRole(): boolean {
  const user = getStoredUser();
  return user ? SUPER_ROLES.includes(user.role) : false;
}

export function canAccess(permissionKey: string): boolean {
  return hasPermission(permissionKey);
}

export function setAuthSession(payload: { accessToken: string; refreshToken?: string; user: AuthUser }) {
  window.localStorage.setItem('access_token', payload.accessToken);
  if (payload.refreshToken) window.localStorage.setItem('refresh_token', payload.refreshToken);
  window.localStorage.setItem('auth_user', JSON.stringify(payload.user));
}

export function clearAuthSession() {
  window.localStorage.removeItem('access_token');
  window.localStorage.removeItem('refresh_token');
  window.localStorage.removeItem('auth_user');
}

// ── Last route tracking (for post-login redirect) ──────────────────────────

const LAST_ROUTE_KEY = 'app_last_route';
const IGNORED_ROUTES = ['/login', '/', '/dashboard'];

export function setLastRoute(pathname: string) {
  if (typeof window === 'undefined') return;
  if (IGNORED_ROUTES.includes(pathname)) return;
  window.localStorage.setItem(LAST_ROUTE_KEY, pathname);
}

export function getLastRoute(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_ROUTE_KEY);
}

export function clearLastRoute() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LAST_ROUTE_KEY);
}
