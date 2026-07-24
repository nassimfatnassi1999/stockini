'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { remove, subscribeToasts, type ToastItem } from '@/lib/toast';

const CONFIG = {
  success: { icon: CheckCircle2, color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7', bar: '#4CAF50' },
  error:   { icon: XCircle,       color: '#C62828', bg: '#FFEBEE', border: '#EF9A9A', bar: '#EF5350' },
  warning: { icon: AlertTriangle, color: '#E65100', bg: '#FFF3E0', border: '#FFCC80', bar: '#FFA726' },
  info:    { icon: Info,          color: '#64748B', bg: '#F8FAFC', border: '#CBD5E1', bar: '#94A3B8' },
} as const;

function ToastCard({ t }: { t: ToastItem }) {
  const { icon: Icon, color, bg, border, bar } = CONFIG[t.type];
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const frameRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = t.createdAt;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 1 - elapsed / t.duration);
      setProgress(remaining * 100);
      if (remaining > 0) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [t.createdAt, t.duration]);

  return (
    <div
      className="pointer-events-auto flex flex-col rounded-lg border shadow-[0_4px_16px_rgba(13,43,62,0.12)] overflow-hidden"
      style={{ background: bg, borderColor: border }}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
        <div className="flex-1 min-w-0">
          <span className="block text-[13px] leading-5 text-text-primary whitespace-pre-line">{t.message}</span>
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
          className="mt-0.5 flex-shrink-0 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          style={{ color }}
          onClick={() => remove(t.id)}
        />
      </div>
      {/* Progress bar */}
      <div className="h-[3px] w-full" style={{ background: border }}>
        <div
          className="h-full transition-none"
          style={{ width: `${progress}%`, background: bar }}
        />
      </div>
    </div>
  );
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[9999] flex max-w-[400px] flex-col gap-2 sm:left-auto sm:right-5 sm:top-5 sm:w-full">
      {toasts.map((t) => (
        <ToastCard key={t.id} t={t} />
      ))}
    </div>
  );
}
