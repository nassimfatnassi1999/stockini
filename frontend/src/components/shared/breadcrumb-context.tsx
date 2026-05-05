'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type BreadcrumbLabels = Record<string, string>;

interface BreadcrumbContextValue {
  labels: BreadcrumbLabels;
  setLabel: (href: string, label: string) => void;
  removeLabel: (href: string) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<BreadcrumbLabels>({});

  const setLabel = useCallback((href: string, label: string) => {
    setLabels((current) => {
      if (current[href] === label) return current;
      return { ...current, [href]: label };
    });
  }, []);

  const removeLabel = useCallback((href: string) => {
    setLabels((current) => {
      if (!(href in current)) return current;
      const next = { ...current };
      delete next[href];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ labels, setLabel, removeLabel }), [labels, removeLabel, setLabel]);

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbLabels() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumbLabels must be used inside BreadcrumbProvider');
  }
  return context;
}
