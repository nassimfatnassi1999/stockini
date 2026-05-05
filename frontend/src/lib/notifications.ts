import { api } from '@/lib/api';

export type NotificationItem = {
  id: string;
  userId: string | null;
  type: 'INTERVENTION_TOMORROW' | string;
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  entityRef: string | null;
  targetUrl: string;
  notificationDate: string;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getNotifications() {
  const response = await api.get<Array<{ id: string; type: string; title: string; message: string; isRead: boolean; productId?: string | null; createdAt: string }>>('/alerts');
  return response.data.map((alert) => ({
    id: alert.id,
    userId: null,
    type: alert.type,
    title: alert.title,
    message: alert.message,
    entityType: 'alert',
    entityId: alert.productId ?? null,
    entityRef: null,
    targetUrl: '/alertes',
    notificationDate: alert.createdAt,
    readAt: alert.isRead ? alert.createdAt : null,
    deletedAt: null,
    createdAt: alert.createdAt,
    updatedAt: alert.createdAt,
  }));
}

export async function getUnreadNotificationCount() {
  const response = await api.get<Array<{ isRead: boolean }>>('/alerts');
  return { count: response.data.filter((alert) => !alert.isRead).length };
}

export async function markNotificationRead(id: string) {
  const response = await api.patch(`/alerts/${id}/read`);
  return response.data;
}

export async function markAllNotificationsRead() {
  const alerts = await getNotifications();
  await Promise.all(alerts.filter((alert) => !alert.readAt).map((alert) => api.patch(`/alerts/${alert.id}/read`)));
  return { count: alerts.length };
}

export async function deleteNotification(id: string) {
  return { deleted: false, id };
}

export async function deleteAllNotifications() {
  return { count: 0 };
}
