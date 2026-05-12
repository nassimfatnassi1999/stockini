'use client';

import { useState } from 'react';
import { Mail, Paperclip, Send, X, AlertCircle, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EmailPreview } from '@/lib/stockini/types';

interface EmailToastProps {
  preview: EmailPreview;
  isSending: boolean;
  onSend: (payload: { to: string; cc?: string; bcc?: string; subject: string; body: string }) => void;
  onCancel: () => void;
}

export function EmailToast({ preview, isSending, onSend, onCancel }: EmailToastProps) {
  const noEmail = !preview.to;
  const multiClient = preview.subject === '__multi_client__';

  // Start in edit mode when no email so the user can enter one manually
  const [editing, setEditing] = useState(noEmail);
  const [to, setTo] = useState(preview.to);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(multiClient ? '' : preview.subject);
  const [body, setBody] = useState(multiClient ? '' : preview.body);

  const handleSend = () => {
    onSend({ to, cc: cc || undefined, bcc: bcc || undefined, subject, body });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border border-border/70 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-blue-600 shrink-0" />
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Envoyer par email
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary transition-colors"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Multi-client warning — blocks sending */}
        {multiClient && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>
              Veuillez sélectionner des documents du même client pour l&apos;envoi par email.
            </span>
          </div>
        )}

        {!multiClient && (
          <>
            {/* No-email warning — allows manual entry */}
            {noEmail && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>
                  Certains clients n&apos;ont pas d&apos;adresse email enregistrée. Vous pouvez en saisir une manuellement.
                </span>
              </div>
            )}

            {editing ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">À</label>
                  <input
                    type="email"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="email@exemple.com"
                    className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">CC</label>
                  <input
                    type="email"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@exemple.com"
                    className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">BCC</label>
                  <input
                    type="email"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@exemple.com"
                    className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">Objet</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">Message</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex gap-2">
                  <span className="font-medium text-text-muted w-14 shrink-0">À :</span>
                  <span className="text-text-primary">{to}</span>
                </div>
                {cc && (
                  <div className="flex gap-2">
                    <span className="font-medium text-text-muted w-14 shrink-0">CC :</span>
                    <span className="text-text-primary">{cc}</span>
                  </div>
                )}
                {bcc && (
                  <div className="flex gap-2">
                    <span className="font-medium text-text-muted w-14 shrink-0">BCC :</span>
                    <span className="text-text-primary">{bcc}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="font-medium text-text-muted w-14 shrink-0">Objet :</span>
                  <span className="text-text-primary line-clamp-1">{subject}</span>
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2 text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {body}
                </div>
              </div>
            )}

            {/* Attachments */}
            {preview.attachments.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-text-muted flex items-center gap-1">
                  <Paperclip size={11} /> Pièces jointes ({preview.attachments.length})
                </p>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {preview.attachments.map((a) => (
                    <div
                      key={a.documentId}
                      className="flex items-center gap-1.5 rounded bg-muted/40 px-2 py-1 text-xs text-text-secondary"
                    >
                      <Paperclip size={10} className="shrink-0 text-primary/60" />
                      {a.fileName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-border/60 px-4 py-3 flex items-center gap-2 justify-end">
        {!multiClient && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-muted hover:text-text-primary hover:bg-muted transition-colors"
          >
            <Edit2 size={12} />
            {editing ? 'Aperçu' : 'Modifier'}
          </button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        {!multiClient && (
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={isSending || !to}
            className="flex items-center gap-1.5"
          >
            <Send size={13} />
            {isSending ? 'Envoi…' : 'Envoyer'}
          </Button>
        )}
      </div>
    </div>
  );
}
