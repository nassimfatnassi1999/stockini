import { api } from '@/lib/api';
import type {
  CreateUserPayload,
  PaginatedUsers,
  ResetPasswordPayload,
  UpdateUserPayload,
  UpdateUserStatusPayload,
  User,
  UsersQueryParams,
} from './types';

export const usersApi = {
  list(params?: UsersQueryParams) {
    return api
      .get<PaginatedUsers>('/users', { params })
      .then((r) => r.data);
  },

  getById(id: string) {
    return api.get<User>(`/users/${id}`).then((r) => r.data);
  },

  create(payload: CreateUserPayload) {
    return api.post<User>('/users', payload).then((r) => r.data);
  },

  update(id: string, payload: UpdateUserPayload) {
    return api.patch<User>(`/users/${id}`, payload).then((r) => r.data);
  },

  updateStatus(id: string, payload: UpdateUserStatusPayload) {
    return api.patch<User>(`/users/${id}/status`, payload).then((r) => r.data);
  },

  resetPassword(id: string, payload: ResetPasswordPayload) {
    return api
      .patch<{ ok: boolean }>(`/users/${id}/reset-password`, payload)
      .then((r) => r.data);
  },

  remove(id: string) {
    return api.delete<User>(`/users/${id}`).then((r) => r.data);
  },
};
