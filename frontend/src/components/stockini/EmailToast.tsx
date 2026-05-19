'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, FileText, Loader2, Mail, Paperclip, Send, X } from 'lucide-react';
import type { EmailPreview } from '@/lib/stockini/types';
import { cn } from '@/lib/utils';

interface EmailToastProps {
  preview: EmailPreview;
  isSending: boolean;
  onSend: (payload: { to: string; cc?: string; bcc?: string; subject: string; body: string }) => void;
  onCancel: () => void;
}

export function EmailToast({ preview, isSending, onSend, onCancel }: EmailToastProps) {
  const noEmail = !preview.to;
  const multiClient = preview.subject === '__multi_client__';

  const [to, setTo] = useState(preview.to);
  const [subject, setSubject] = useState(multiClient ? '' : preview.subject);
  const [body, setBody] = useState(multiClient ? '' : preview.body);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSending, onCancel]);

  const canSend = !multiClient && !!to.trim() && !!subject.trim() && !isSending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-6 pointer-events-none"
      aria-label="Fenêtre d'envoi email"
    >
      <div
        className={cn(
          'pointer-events-auto w-full max-w-[480px]',
          'flex flex-col rounded-2xl',
          'border border-slate-200 bg-white',
          'shadow-2xl shadow-slate-300/40',
          'overflow-hidden',
          'animate-in slide-in-from-bottom-4 fade-in duration-200',
        )}
        style={{ maxHeight: 'calc(100vh - 96px)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Envoyer par email"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
              <Mail size={14} className="text-blue-600" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Envoyer par email</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {multiClient ? (
            <div className="p-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  Veuillez sélectionner des documents du <strong>même client</strong> pour l&apos;envoi par email.
                </span>
              </div>
            </div>
          ) : (
            <div className="px-4 pb-2 pt-3">
              {noEmail && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>Aucune adresse email enregistrée. Saisissez-en une manuellement.</span>
                </div>
              )}

              {/* À */}
              <div className="flex items-center gap-3 border-b border-slate-100 py-1.5">
                <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">À</span>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="email@exemple.com"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={noEmail}
                  className="flex-1 bg-transparent py-1 text-sm text-slate-800 outline-none placeholder:text-slate-300"
                />
              </div>

              {/* Objet */}
              <div className="flex items-center gap-3 border-b border-slate-100 py-1.5">
                <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Objet</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Objet du message…"
                  className="flex-1 bg-transparent py-1 text-sm text-slate-800 outline-none placeholder:text-slate-300"
                />
              </div>

              {/* Body */}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Corps du message…"
                className="w-full resize-y bg-transparent py-3 text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-300"
                style={{ minHeight: 180 }}
              />

              {/* Attachments */}
              {preview.attachments.length > 0 && (
                <div className="border-t border-slate-100 pb-1 pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <Paperclip size={10} />
                    Pièces jointes ({preview.attachments.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.attachments.map((a) => (
                      <div
                        key={a.documentId}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
                      >
                        <FileText size={11} className="shrink-0 text-red-400" />
                        <span className="max-w-[160px] truncate">{a.fileName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm font-medium',
              'text-slate-500 transition-all duration-150',
              'hover:bg-slate-100 hover:text-slate-700',
              'disabled:opacity-50',
            )}
          >
            Annuler
          </button>
          {!multiClient && (
            <button
              type="button"
              onClick={() => canSend && onSend({ to, subject, body })}
              disabled={!canSend}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-medium',
                'bg-orange-500 text-white',
                'transition-all duration-150',
                'hover:-translate-y-px hover:bg-orange-600 hover:shadow-md hover:shadow-orange-200',
                'focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1',
                'disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
              )}
            >
              {isSending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {isSending ? 'Envoi…' : 'Envoyer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
