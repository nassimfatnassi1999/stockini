'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CheckCheck, Trash2 } from 'lucide-react';
import {
  deleteAllNotifications,
  deleteNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/lib/notifications';

const NOTIFICATIONS_QUERY_KEY = ['notifications'];
const UNREAD_COUNT_QUERY_KEY = ['notifications-unread-count'];

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'À l’instant';
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function NotificationsDropdown() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
  };

  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: getNotifications,
    refetchInterval: 60_000,
  });

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: getUnreadNotificationCount,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidateNotifications,
  });

  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidateNotifications,
  });

  const deleteOne = useMutation({
    mutationFn: deleteNotification,
    onSuccess: invalidateNotifications,
  });

  const deleteAll = useMutation({
    mutationFn: deleteAllNotifications,
    onSuccess: invalidateNotifications,
  });

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const unreadCount = unread?.count ?? 0;

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      await markRead.mutateAsync(notification.id);
    }
    setOpen(false);
    router.push(notification.targetUrl);
  };

  const handleDelete = (event: MouseEvent, id: string) => {
    event.stopPropagation();
    deleteOne.mutate(id);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <h2 className="text-sm font-semibold text-text-primary">Notifications</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Tout marquer comme lu"
                title="Tout marquer comme lu"
                onClick={() => markAllRead.mutate()}
                disabled={unreadCount === 0 || markAllRead.isPending}
                className="app-action-button app-action-edit disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck size={14} />
              </button>
              <button
                type="button"
                aria-label="Tout supprimer"
                title="Tout supprimer"
                onClick={() => deleteAll.mutate()}
                disabled={notifications.length === 0 || deleteAll.isPending}
                className="app-action-button app-action-delete disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-8 text-center text-xs text-text-muted">Chargement...</div>
            ) : notifications.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-text-muted">Aucune notification</div>
            ) : (
              notifications.map((notification) => {
                const unreadItem = !notification.readAt;
                const hasStockDetails =
                  notification.designation ||
                  notification.reference ||
                  notification.currentStock != null ||
                  notification.minimumStock != null;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`group flex w-full items-start gap-2 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 ${
                      unreadItem ? 'bg-orange-50 hover:bg-orange-100' : 'bg-white hover:bg-muted'
                    }`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-50 text-red-600">
                      <AlertTriangle size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text-primary">
                        {notification.title}
                      </span>
                      {hasStockDetails ? (
                        <span className="mt-1 grid gap-0.5 text-xs leading-5 text-text-secondary">
                          {notification.designation && <span>Produit : {notification.designation}</span>}
                          {notification.reference && <span>Référence : {notification.reference}</span>}
                          {notification.currentStock !== null && notification.currentStock !== undefined && (
                            <span className={notification.currentStock <= 0 ? 'font-semibold text-red-700' : 'font-semibold text-orange-700'}>
                              Stock actuel : {notification.currentStock}
                            </span>
                          )}
                          {notification.minimumStock !== null && notification.minimumStock !== undefined && (
                            <span>Seuil minimum : {notification.minimumStock}</span>
                          )}
                          <span>Alerte : le stock est inférieur au seuil minimum.</span>
                        </span>
                      ) : (
                        <span className="mt-1 block whitespace-pre-line text-xs leading-5 text-text-secondary">
                          {notification.message}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] font-medium text-text-muted">
                        {formatNotificationDate(notification.createdAt)}
                      </span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Supprimer la notification"
                      title="Supprimer"
                      onClick={(event) => handleDelete(event, notification.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteOne.mutate(notification.id);
                        }
                      }}
                      className="app-action-button app-action-delete flex-none opacity-80 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
