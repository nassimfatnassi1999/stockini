'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DRAFT_VERSION = 1;

export type FormDraftStatus = 'idle' | 'saved' | 'restored';

export interface FormDraftEnvelope<T> {
  version: number;
  updatedAt: string;
  data: T;
}

interface UseFormDraftOptions<T> {
  key: string;
  data: T;
  isEmpty: (data: T) => boolean;
  onRestore: (data: T) => void;
  debounceMs?: number;
  enabled?: boolean;
}

export function useFormDraft<T>({
  key,
  data,
  isEmpty,
  onRestore,
  debounceMs = 400,
  enabled = true,
}: UseFormDraftOptions<T>) {
  const [status, setStatus] = useState<FormDraftStatus>('idle');
  const restoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  const isEmptyRef = useRef(isEmpty);
  const onRestoreRef = useRef(onRestore);

  dataRef.current = data;
  isEmptyRef.current = isEmpty;
  onRestoreRef.current = onRestore;

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // localStorage can be unavailable (private mode/security policy).
      }
    }
    setStatus('idle');
  }, [key]);

  useEffect(() => {
    if (restoredRef.current || typeof window === 'undefined') return;
    restoredRef.current = true;

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;

      const draft = JSON.parse(raw) as Partial<FormDraftEnvelope<T>>;
      if (draft.version !== DRAFT_VERSION || !draft.data || !draft.updatedAt) {
        window.localStorage.removeItem(key);
        return;
      }

      onRestoreRef.current(draft.data);
      setStatus('restored');
    } catch {
      // A corrupt draft must never prevent the form from opening.
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore storage access failures as well.
      }
    }
  }, [key]);

  useEffect(() => {
    if (!restoredRef.current || typeof window === 'undefined' || !enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isEmptyRef.current(data)) {
      timerRef.current = null;
      return;
    }

    timerRef.current = setTimeout(() => {
      const envelope: FormDraftEnvelope<T> = {
        version: DRAFT_VERSION,
        updatedAt: new Date().toISOString(),
        data: dataRef.current,
      };
      try {
        window.localStorage.setItem(key, JSON.stringify(envelope));
        setStatus('saved');
      } catch {
        // Quota/security failures are non-blocking; the form remains usable.
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, debounceMs, enabled, key]);

  return { clearDraft, status };
}
