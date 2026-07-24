'use client';

import { MoveHorizontal } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { getHorizontalScrollState } from '@/lib/responsive-scroll';

interface ResponsiveTableContainerProps {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  'aria-label'?: string;
}

/**
 * Scrollable table viewport with a hint that is only displayed while more
 * horizontal content is available. Each instance owns and cleans up its
 * ResizeObserver and scroll listener.
 */
export function ResponsiveTableContainer({
  children,
  className,
  viewportClassName,
  'aria-label': ariaLabel = 'Tableau défilable horizontalement',
}: ResponsiveTableContainerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isAtEnd, setIsAtEnd] = useState(true);

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const { hasOverflow: overflows, isAtEnd: atEnd } =
      getHorizontalScrollState(viewport);

    setHasOverflow(overflows);
    setIsAtEnd(atEnd);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateScrollState();
    viewport.addEventListener('scroll', updateScrollState, { passive: true });

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(viewport);
    if (viewport.firstElementChild) {
      observer.observe(viewport.firstElementChild);
    }

    window.addEventListener('resize', updateScrollState);
    return () => {
      viewport.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      observer.disconnect();
    };
  }, [children, updateScrollState]);

  const showHint = hasOverflow && !isAtEnd;

  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        ref={viewportRef}
        className={cn(
          'responsive-table-viewport w-full min-w-0 overflow-x-auto overscroll-x-contain',
          viewportClassName,
        )}
        aria-label={ariaLabel}
        tabIndex={hasOverflow ? 0 : undefined}
      >
        {children}
      </div>

      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white/95 to-transparent transition-opacity',
          showHint ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-border bg-white/95 px-2 py-1 text-[10px] font-medium text-text-secondary shadow-sm transition-opacity md:hidden',
          showHint ? 'opacity-100' : 'opacity-0',
        )}
      >
        <MoveHorizontal size={12} />
        Faites glisser
      </div>
    </div>
  );
}
