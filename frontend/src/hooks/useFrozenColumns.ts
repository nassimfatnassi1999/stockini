import { useState } from 'react';

const DEFAULT_STORAGE_KEY = 'geocrm-workflow-frozen-columns';

export interface UseFrozenColumnsReturn {
  frozenColumnIds: Set<string>;
  toggleColumnFrozen: (id: string) => void;
  isColumnFrozen: (id: string) => boolean;
}

export function useFrozenColumns(
  defaultFrozenColumnIds: string[],
  storageKey?: string
): UseFrozenColumnsReturn {
  const key = storageKey ?? DEFAULT_STORAGE_KEY;
  const [frozenColumnIds, setFrozenColumnIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) return new Set(parsed as string[]);
      }
    } catch {
      // localStorage unavailable (SSR or restricted context)
    }
    return new Set(defaultFrozenColumnIds);
  });

  const toggleColumnFrozen = (id: string) => {
    setFrozenColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // ignore write errors
      }
      return next;
    });
  };

  const isColumnFrozen = (id: string) => frozenColumnIds.has(id);

  return { frozenColumnIds, toggleColumnFrozen, isColumnFrozen };
}
