"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isExactConfirmation } from "@/lib/bulk-delete";

interface BulkDeleteDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmationText?: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BulkDeleteDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmationText,
  pending,
  onCancel,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  if (!open) return null;
  const confirmed = isExactConfirmation(typed, confirmationText);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-delete-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/50"
        aria-label="Fermer"
        disabled={pending}
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-danger-soft text-app-danger">
            <AlertTriangle size={20} />
          </span>
          <h2
            id="bulk-delete-title"
            className="text-base font-semibold text-text-primary"
          >
            {title}
          </h2>
        </div>
        <p className="text-sm leading-6 text-text-secondary">{message}</p>

        {confirmationText && (
          <label className="mt-5 block text-sm font-medium text-text-primary">
            Saisissez exactement{" "}
            <span className="font-mono font-bold text-app-danger">
              {confirmationText}
            </span>{" "}
            pour confirmer
            <Input
              className="mt-2 font-mono"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoFocus
              disabled={pending}
              aria-label={`Saisissez ${confirmationText} pour confirmer`}
            />
          </label>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!confirmed || pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {pending ? "Suppression…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
