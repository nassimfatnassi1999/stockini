'use client';

import { useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  darkHeader?: boolean;
}

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  width = 480,
  children,
  footer,
  darkHeader = false,
}: SlideOverProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const headerBg = darkHeader
    ? 'bg-[#0d2236] border-b border-white/10'
    : 'bg-gradient-to-r from-orange-500 to-orange-600';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            style={{ width: `min(${width}px, 100vw)` }}
            className="fixed right-0 top-0 z-50 flex h-dvh max-w-full flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
          >
            {/* Header */}
            <div className={`flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-4 ${headerBg}`}>
              <div className="min-w-0">
                <h2 id={titleId} className="break-words text-[15px] font-semibold text-white">{title}</h2>
                {subtitle && <p className="mt-0.5 truncate text-xs text-white/70">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-6 sm:py-5">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex shrink-0 flex-col-reverse items-stretch justify-end gap-2 border-t bg-white px-3 py-3 sm:flex-row sm:items-center sm:px-6 sm:py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
