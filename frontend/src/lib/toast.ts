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
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners: Listener[] = [];

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

function add(type: ToastType, message: string, action?: ToastAction) {
  const id = `${Date.now()}-${Math.random()}`;
  toasts = [...toasts, { id, type, message, action }];
  notify();
  setTimeout(() => remove(id), 6000);
}

function remove(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
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
