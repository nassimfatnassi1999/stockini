export type UserRole =
  | 'ADMIN'
  | 'STOCK_MANAGER'
  | 'SELLER'
  | 'PURCHASE_MANAGER'
  | 'CASHIER';

export const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'STOCK_MANAGER', label: 'Responsable stock' },
  { value: 'SELLER', label: 'Vendeur' },
  { value: 'PURCHASE_MANAGER', label: 'Responsable achats' },
  { value: 'CASHIER', label: 'Caissier' },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  STOCK_MANAGER: 'Responsable stock',
  SELLER: 'Vendeur',
  PURCHASE_MANAGER: 'Responsable achats',
  CASHIER: 'Caissier',
};

export interface UserRoleInfo {
  id: string;
  name: UserRole;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: UserRoleInfo;
}

export interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UsersQueryParams {
  search?: string;
  role?: string;
  status?: 'active' | 'inactive' | '';
  page?: number;
  limit?: number;
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  roleName: UserRole;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  fullName?: string;
  phone?: string;
  roleName?: UserRole;
  isActive?: boolean;
}

export interface ResetPasswordPayload {
  password: string;
}

export interface UpdateUserStatusPayload {
  isActive: boolean;
}
