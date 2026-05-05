'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { subscribeToasts, type ToastItem } from '@/lib/toast';

const CONFIG = {
  success: { icon: CheckCircle2, color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
  error:   { icon: XCircle,       color: '#C62828', bg: '#FFEBEE', border: '#EF9A9A' },
  warning: { icon: AlertTriangle, color: '#E65100', bg: '#FFF3E0', border: '#FFCC80' },
  info:    { icon: Info,          color: '#1B4F72', bg: '#E3F2FD', border: '#90CAF9' },
} as const;

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380, width: '100%',
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => {
        const { icon: Icon, color, bg, border } = CONFIG[t.type];
        return (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: bg, border: `1px solid ${border}`, borderRadius: 10,
              padding: '12px 14px', boxShadow: '0 4px 16px rgba(13,43,62,0.12)',
              animation: 'toast-in 0.2s ease-out',
              pointerEvents: 'all',
            }}
          >
            <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: '#1A2332', lineHeight: 1.5, flex: 1 }}>
              {t.message}
            </span>
            <X
              size={14}
              style={{ color, cursor: 'pointer', flexShrink: 0, marginTop: 1 }}
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            />
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
