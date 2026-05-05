'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  reference?: string;
  children: React.ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({
  open, onClose, title, reference, children,
  onSave, saveLabel = 'Enregistrer', saving = false, size = 'md',
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const widths = { sm: 420, md: 600, lg: 780 };

  const content = (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(13,43,62,0.55)',
        zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          width: widths[size],
          maxWidth: '95vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(13,43,62,0.28)',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '22px 24px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
            borderBottom: '1px solid #D5DCE8',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1A2332' }}>{title}</span>
            {reference && (
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11, color: '#1B4F72',
                  background: '#EBF5FB', padding: '3px 10px', borderRadius: 5,
                }}
              >
                {reference}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            style={{
              width: 28, height: 28, borderRadius: 6,
              border: '1px solid #D5DCE8',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5A6A7E', transition: 'all 0.13s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#F7F9FC')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {children}
        </div>

        {/* Footer */}
        {onSave && (
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #D5DCE8',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              position: 'sticky', bottom: 0, background: '#fff',
            }}
          >
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
              disabled={saving}
              style={{
                padding: '6px 12px', borderRadius: 6,
                background: 'transparent', color: '#5A6A7E',
                border: '1px solid #D5DCE8',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave?.(); }}
              disabled={saving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6,
                background: saving ? '#FAD7A0' : '#E67E22',
                color: '#fff', border: 'none',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.13s',
              }}
            >
              {saving ? 'Enregistrement…' : saveLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

interface ModalSectionProps {
  title: string;
  children: React.ReactNode;
}

export function ModalSection({ title, children }: ModalSectionProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: '#9AAFC5',
          marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        {title}
        <div style={{ flex: 1, height: 1, background: '#D5DCE8' }} />
      </div>
      {children}
    </div>
  );
}
