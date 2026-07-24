'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { KPI_DEFINITIONS, type KpiDefinitionKey } from '@/lib/kpi-definitions';
import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom' | 'left' | 'right';

export interface MetricTriggerProps {
  ref: React.RefObject<HTMLDivElement>;
  tabIndex: number;
  'aria-describedby'?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
}

interface Props {
  metric: KpiDefinitionKey;
  period: string;
  filtersActive?: boolean;
  children: (props: MetricTriggerProps, infoButton: React.ReactNode) => React.ReactNode;
}

const OPEN_DELAY = 200;
const GAP = 12;
const VIEWPORT_PADDING = 12;

export function MetricInfoTooltip({ metric, period, filtersActive = false, children }: Props) {
  const definition = KPI_DEFINITIONS[metric];
  const id = `kpi-tooltip-${useId().replaceAll(':', '')}`;
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number>();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [side, setSide] = useState<Side>('top');
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);
  const openDelayed = useCallback(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), OPEN_DELAY);
  }, [clearTimer]);
  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  useEffect(() => {
    setMounted(true);
    return clearTimer;
  }, [clearTimer]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const target = trigger.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const spaces: Record<Side, number> = {
      top: target.top,
      bottom: window.innerHeight - target.bottom,
      left: target.left,
      right: window.innerWidth - target.right,
    };
    const preferred: Side[] = ['top', 'right', 'left', 'bottom'];
    const nextSide = preferred.find((candidate) =>
      spaces[candidate] >= (candidate === 'top' || candidate === 'bottom' ? tip.height : tip.width) + GAP,
    ) ?? preferred.sort((a, b) => spaces[b] - spaces[a])[0];
    let top = target.top + target.height / 2 - tip.height / 2;
    let left = target.left + target.width / 2 - tip.width / 2;
    if (nextSide === 'top') top = target.top - tip.height - GAP;
    if (nextSide === 'bottom') top = target.bottom + GAP;
    if (nextSide === 'left') left = target.left - tip.width - GAP;
    if (nextSide === 'right') left = target.right + GAP;
    top = Math.max(VIEWPORT_PADDING, Math.min(top, window.innerHeight - tip.height - VIEWPORT_PADDING));
    left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - tip.width - VIEWPORT_PADDING));
    setSide(nextSide);
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !tooltipRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  const triggerProps: MetricTriggerProps = {
    ref: triggerRef,
    tabIndex: 0,
    'aria-describedby': open ? id : undefined,
    onMouseEnter: openDelayed,
    onMouseLeave: close,
    onFocus: () => setOpen(true),
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
    },
  };

  const infoButton = (
    <button
      type="button"
      aria-label={`Comprendre le KPI ${definition.title}`}
      aria-expanded={open}
      aria-describedby={open ? id : undefined}
      onClick={(event) => {
        event.stopPropagation();
        clearTimer();
        setOpen((current) => !current);
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) setOpen(true);
      }}
      className="flex h-9 w-9 shrink-0 cursor-help items-center justify-center rounded-full text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring sm:h-8 sm:w-8"
    >
      <Info aria-hidden="true" className="h-4 w-4" />
    </button>
  );

  const arrowClass: Record<Side, string> = {
    top: '-bottom-1.5 left-1/2 -translate-x-1/2 border-b border-r',
    bottom: '-top-1.5 left-1/2 -translate-x-1/2 border-l border-t',
    left: '-right-1.5 top-1/2 -translate-y-1/2 border-r border-t',
    right: '-left-1.5 top-1/2 -translate-y-1/2 border-b border-l',
  };

  return (
    <>
      {children(triggerProps, infoButton)}
      {mounted && open && createPortal(
        <div
          ref={tooltipRef}
          id={id}
          role="tooltip"
          style={{ top: position.top, left: position.left }}
          className="fixed z-[1000] w-[min(22.5rem,calc(100vw-1.5rem))] animate-in fade-in-0 zoom-in-95 rounded-xl border border-border bg-card p-4 text-left shadow-xl motion-reduce:animate-none"
        >
          <span aria-hidden="true" className={cn('absolute h-3 w-3 rotate-45 border-border bg-card', arrowClass[side])} />
          <p className="pr-6 text-sm font-bold text-text-primary">{definition.title}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{definition.description}</p>
          {definition.formula && <section className="mt-3 rounded-lg border border-border/70 bg-muted/60 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Calcul</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-text-primary">{definition.formula}</p>
          </section>}
          {(definition.included?.length || definition.excluded?.length) && <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {definition.included?.length && <section><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Inclus</p><div className="mt-1 flex flex-wrap gap-1">{definition.included.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] leading-tight text-emerald-800">{item}</span>)}</div></section>}
            {definition.excluded?.length && <section><p className="text-[10px] font-bold uppercase tracking-wide text-red-700">Exclus</p><div className="mt-1 flex flex-wrap gap-1">{definition.excluded.map((item) => <span key={item} className="rounded-full bg-red-50 px-2 py-1 text-[10px] leading-tight text-red-800">{item}</span>)}</div></section>}
          </div>}
          <div className="mt-3 border-t border-border/70 pt-2.5 text-xs">
            <p><span className="font-semibold text-text-primary">Période : </span><span className="text-text-secondary">{period}</span></p>
            {filtersActive && <p className="mt-1 font-medium text-app-primary">Valeur calculée avec les filtres actifs.</p>}
          </div>
          {definition.interpretation && <section className="mt-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Interprétation</p><p className="mt-1 text-xs leading-relaxed text-text-secondary">{definition.interpretation}</p></section>}
          {definition.warning && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{definition.warning}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
