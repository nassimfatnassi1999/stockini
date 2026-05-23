type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
  duration: number;
  createdAt: number;
}

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 3000,
};

const MAX_TOASTS = 3;

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners: Listener[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

export function remove(id: string) {
  timers.get(id) && clearTimeout(timers.get(id)!);
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

function add(type: ToastType, message: string, action?: ToastAction) {
  if (toasts.some((t) => t.type === type && t.message === message)) return;

  // Drop oldest if already at max
  if (toasts.length >= MAX_TOASTS) {
    remove(toasts[0].id);
  }

  const duration = DURATIONS[type];
  const id = `${Date.now()}-${Math.random()}`;
  toasts = [...toasts, { id, type, message, action, duration, createdAt: Date.now() }];
  notify();
  const timer = setTimeout(() => remove(id), duration);
  timers.set(id, timer);
}

export const toast = {
  success: (message: string, action?: ToastAction) => add('success', message, action),
  error: (message: string, action?: ToastAction) => add('error', message, action),
  warning: (message: string, action?: ToastAction) => add('warning', message, action),
  info: (message: string, action?: ToastAction) => add('info', message, action),
};

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener);
  listener([...toasts]);
  return () => {
    const i = listeners.indexOf(listener);
    if (i > -1) listeners.splice(i, 1);
  };
}
