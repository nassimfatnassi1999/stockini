'use client';

import { ModalWindow } from './ModalWindow';

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

const SIZE_W = { sm: 420, md: 600, lg: 780 };
const SIZE_H = { sm: 400, md: 520, lg: 620 };

export function Modal({
  open, onClose, title, reference, children,
  onSave, saveLabel = 'Enregistrer', saving = false, size = 'md',
}: ModalProps) {
  const footer = onSave ? (
    <div className="flex justify-end gap-2">
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
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave(); }}
        disabled={saving}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary-light disabled:opacity-80"
      >
        {saving ? 'Enregistrement…' : saveLabel}
      </button>
    </div>
  ) : undefined;

  return (
    <ModalWindow
      title={title}
      reference={reference}
      isOpen={open}
      onClose={onClose}
      defaultWidth={SIZE_W[size]}
      defaultHeight={SIZE_H[size]}
      footer={footer}
    >
      <div className="px-6 py-5">
        {children}
      </div>
    </ModalWindow>
  );
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
