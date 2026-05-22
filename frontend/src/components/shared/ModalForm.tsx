'use client';

import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from 'react';

function useContainerCols() {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = (w: number) => setCols(w < 500 ? 1 : w < 700 ? 2 : 3);
    compute(el.getBoundingClientRect().width || 600);
    const ro = new ResizeObserver(([entry]) => compute(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, cols };
}

interface ModalFormGridProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Responsive grid for form fields inside a ModalWindow body.
 * Automatically switches between 1 / 2 / 3 columns based on the container width
 * (<500 px → 1 col, 500-699 px → 2 cols, ≥700 px → 3 cols).
 *
 * Wrap individual full-width fields with `gridColumn: '1 / -1'` inline style
 * or use the `fullSpan` helper below.
 */
export function ModalFormGrid({ children, className = '', style }: ModalFormGridProps) {
  const { ref, cols } = useContainerCols();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '16px',
        alignContent: 'start',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Inline style that forces a grid child to span all columns. */
export const fullSpan: CSSProperties = { gridColumn: '1 / -1' };
