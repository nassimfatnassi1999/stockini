'use client';

import { SlideOver } from '@/components/ui/SlideOver';

const SIZE_W = { sm: 420, md: 520, lg: 620 };

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
  const subtitle = reference;
  const footer = onSave ? (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-80"
      >
        {saving ? 'Enregistrement…' : saveLabel}
      </button>
    </>
  ) : undefined;

  return (
    <SlideOver
      title={title}
      subtitle={subtitle}
      open={open}
      onClose={onClose}
      width={SIZE_W[size]}
      footer={footer}
    >
      {children}
    </SlideOver>
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
