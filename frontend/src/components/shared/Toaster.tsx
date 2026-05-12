'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { subscribeToasts, type ToastItem } from '@/lib/toast';

const CONFIG = {
  success: { icon: CheckCircle2, color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
  error:   { icon: XCircle,       color: '#C62828', bg: '#FFEBEE', border: '#EF9A9A' },
  warning: { icon: AlertTriangle, color: '#E65100', bg: '#FFF3E0', border: '#FFCC80' },
  info:    { icon: Info,          color: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
} as const;

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[9999] flex w-full max-w-[400px] flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, color, bg, border } = CONFIG[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-[0_4px_16px_rgba(13,43,62,0.12)]"
            style={{ background: bg, borderColor: border }}
          >
            <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <div className="flex-1 min-w-0">
              <span className="block text-[13px] leading-5 text-text-primary">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => { t.action!.onClick(); }}
                  className="mt-1.5 text-[12px] font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                  style={{ color }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <X
              size={14}
              className="mt-0.5 flex-shrink-0 cursor-pointer"
              style={{ color }}
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            />
          </div>
        );
      })}
    </div>
  );
}
