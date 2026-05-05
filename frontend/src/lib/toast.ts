type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners: Listener[] = [];

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

function add(type: ToastType, message: string) {
  const id = `${Date.now()}-${Math.random()}`;
  toasts = [...toasts, { id, type, message }];
  notify();
  setTimeout(() => remove(id), 4000);
}

function remove(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export const toast = {
  success: (message: string) => add('success', message),
  error: (message: string) => add('error', message),
  warning: (message: string) => add('warning', message),
  info: (message: string) => add('info', message),
};

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener);
  listener([...toasts]);
  return () => {
    const i = listeners.indexOf(listener);
    if (i > -1) listeners.splice(i, 1);
  };
}
