import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '@/lib/auth';

interface DraftEnvelope<T> {
  data: T;
  savedAt: number;
}

interface UseDraftSaveOptions<T> {
  /** Unique key for this form type, e.g. 'sales:vente' or 'purchases:achat' */
  key: string;
  /** Current form data to auto-save */
  data: T;
  /** Set to false to pause auto-saving (e.g. during FROM_COMMANDE mode) */
  enabled?: boolean;
  /** Debounce delay in ms (default 1500) */
  debounceMs?: number;
}

export function useDraftSave<T>({
  key,
  data,
  enabled = true,
  debounceMs = 1500,
}: UseDraftSaveOptions<T>) {
  const [storageKey, setStorageKey] = useState(`draft:${key}:anonymous`);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const userId = getCurrentUser()?.id ?? 'anonymous';
    setStorageKey(`draft:${key}:${userId}`);
  }, [key]);

  const saveDraft = useCallback(
    (value: T) => {
      if (typeof window === 'undefined') return;
      try {
        const envelope: DraftEnvelope<T> = { data: value, savedAt: Date.now() };
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
      } catch {
        // localStorage quota exceeded — silently ignore
      }
    },
    [storageKey],
  );

  const getDraft = useCallback((): T | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const envelope = JSON.parse(raw) as DraftEnvelope<T>;
      return envelope.data;
    } catch {
      return null;
    }
  }, [storageKey]);

  const hasDraft = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(storageKey) !== null;
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  // Auto-save with debounce whenever data changes
  useEffect(() => {
    if (!enabled) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(data);
    }, debounceMs);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data, enabled, debounceMs, saveDraft]);

  return { getDraft, hasDraft, clearDraft, storageKey };
}
