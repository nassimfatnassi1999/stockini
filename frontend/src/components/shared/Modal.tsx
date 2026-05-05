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

  const widths = { sm: 'max-w-[420px]', md: 'max-w-[600px]', lg: 'max-w-[780px]' };

  const content = (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-[#0D2B3E]/55 p-4 backdrop-blur-[2px]"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={`max-h-[85vh] w-full ${widths[size]} overflow-y-auto rounded-lg bg-white shadow-[0_24px_64px_rgba(13,43,62,0.28)]`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-border bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-text-primary">{title}</span>
            {reference && (
              <span className="rounded-md bg-orange-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-primary">
                {reference}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="app-action-button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          {children}
        </div>

        {onSave && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-white px-6 py-4">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-text-secondary hover:bg-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave?.(); }}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary-light disabled:opacity-80"
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
    <div className="mb-5">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
        {title}
        <div className="h-px flex-1 bg-border" />
      </div>
      {children}
    </div>
  );
}
