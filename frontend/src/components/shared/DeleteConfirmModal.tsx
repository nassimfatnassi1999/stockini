'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  open: boolean;
  entityType: string;
  reference: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  open,
  entityType,
  reference,
  loading = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  const content = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(13,43,62,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          background: '#fff', borderRadius: 14, boxShadow: '0 8px 40px rgba(13,43,62,0.18)',
          padding: '28px 28px 24px', maxWidth: 420, width: '100%',
          animation: 'modal-in 0.18s ease-out',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 8,
              background: '#FFEBEE', flexShrink: 0,
            }}>
              <AlertTriangle size={18} style={{ color: '#C62828' }} />
            </span>
            <h2 id="delete-modal-title" style={{ fontSize: 15, fontWeight: 700, color: '#1A2332', margin: 0 }}>
              Confirmer la suppression
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
            disabled={loading}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9AAFC5', padding: 4, display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{
          background: '#FFF8F8', border: '1px solid #FFCDD2', borderRadius: 8,
          padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#1A2332', lineHeight: 1.6,
        }}>
          <p style={{ margin: 0 }}>
            Voulez-vous supprimer cet élément ?
          </p>
          <p style={{ margin: '6px 0 0', color: '#5A6A7E' }}>
            <strong>Type :</strong> {entityType}
          </p>
          <p style={{ margin: '2px 0 0', color: '#5A6A7E' }}>
            <strong>Référence :</strong>{' '}
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1A2332' }}>
              {reference}
            </span>
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#C62828', fontWeight: 600 }}>
            Cette action est irréversible.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
            disabled={loading}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              border: '1.5px solid #D5DCE8', borderRadius: 8,
              background: '#fff', color: '#5A6A7E', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfirm(); }}
            disabled={loading}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 8,
              background: loading ? '#EF9A9A' : '#C62828',
              color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'background 0.15s',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  display: 'inline-block', animation: 'spin 0.7s linear infinite',
                }} />
                Suppression…
              </>
            ) : (
              'Supprimer'
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  return createPortal(content, document.body);
}
