'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react';

let _zTop = 1200;
function nextZ() { return ++_zTop; }

interface ModalWindowProps {
  title: string;
  reference?: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  darkHeader?: boolean;
  storageKey?: string;
}

function viewCenter(w: number, h: number) {
  if (typeof window === 'undefined') return { x: 120, y: 80 };
  return {
    x: Math.max(8, Math.floor((window.innerWidth - w) / 2)),
    y: Math.max(8, Math.floor((window.innerHeight - h) / 4)),
  };
}

export function ModalWindow({
  title,
  reference,
  isOpen,
  onClose,
  children,
  footer,
  defaultWidth = 600,
  defaultHeight = 520,
  minWidth = 320,
  minHeight = 160,
  darkHeader = false,
  storageKey,
}: ModalWindowProps) {
  const [mounted, setMounted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const [pos, setPos] = useState({ x: 120, y: 80 });
  const [zIdx, setZIdx] = useState(1201);
  const savedRef = useRef({ size: { width: defaultWidth, height: defaultHeight }, pos: { x: 120, y: 80 } });

  useEffect(() => {
    setMounted(true);
    if (storageKey) {
      try {
        const raw = localStorage.getItem(`mw:${storageKey}`);
        if (raw) {
          const { pos: sp, size: ss } = JSON.parse(raw) as { pos?: { x: number; y: number }; size?: { width: number; height: number } };
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          if (sp && sp.x >= 0 && sp.y >= 0 && sp.x < vw && sp.y < vh) {
            setPos(sp);
            savedRef.current.pos = sp;
          } else {
            const p = viewCenter(defaultWidth, defaultHeight);
            setPos(p);
            savedRef.current.pos = p;
          }
          if (ss && ss.width >= 100 && ss.height >= 50) {
            setSize(ss);
            savedRef.current.size = ss;
          }
          setZIdx(nextZ());
          return;
        }
      } catch { /* ignore */ }
    }
    const p = viewCenter(defaultWidth, defaultHeight);
    setPos(p);
    savedRef.current.pos = p;
    setZIdx(nextZ());
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMinimized(false);
      setMaximized(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const bringToFront = useCallback(() => setZIdx(nextZ()), []);

  const saveToStorage = useCallback((p: { x: number; y: number }, s: { width: number; height: number }) => {
    if (storageKey) {
      try { localStorage.setItem(`mw:${storageKey}`, JSON.stringify({ pos: p, size: s })); } catch { /* ignore */ }
    }
  }, [storageKey]);

  const handleMaximize = useCallback(() => {
    if (maximized) {
      setSize(savedRef.current.size);
      setPos(savedRef.current.pos);
      setMaximized(false);
    } else {
      savedRef.current = { size, pos };
      setMaximized(true);
      setMinimized(false);
    }
  }, [maximized, size, pos]);

  const handleMinimize = useCallback(() => {
    if (maximized) setMaximized(false);
    setMinimized((v) => !v);
  }, [maximized]);

  if (!isOpen || !mounted) return null;

  const HEADER_H = 48;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const rndSize = maximized
    ? { width: vw, height: vh }
    : { width: size.width, height: minimized ? HEADER_H : size.height };

  const rndPos = maximized ? { x: 0, y: 0 } : pos;

  const headerBg = darkHeader
    ? 'bg-[#0d2236] border-b border-white/10'
    : 'bg-gradient-to-r from-orange-500 to-orange-600';

  const ctrlBtn = `flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
    darkHeader
      ? 'text-white/60 hover:bg-white/10 hover:text-white'
      : 'text-white/80 hover:bg-white/25 hover:text-white'
  }`;

  return createPortal(
    <Rnd
      size={rndSize}
      position={rndPos}
      onDragStop={(_, d) => { if (!maximized) { const p = { x: d.x, y: d.y }; setPos(p); saveToStorage(p, size); } }}
      onResizeStop={(_, __, ref, ___, position) => {
        const s = { width: ref.offsetWidth, height: ref.offsetHeight };
        setSize(s);
        setPos(position);
        saveToStorage(position, s);
      }}
      minWidth={minWidth}
      minHeight={minimized ? HEADER_H : minHeight}
      maxWidth={maximized ? vw : vw * 0.96}
      maxHeight={maximized ? vh : vh * 0.92}
      bounds="window"
      dragHandleClassName="mw-titlebar"
      enableResizing={!minimized && !maximized}
      disableDragging={maximized}
      style={{ zIndex: zIdx }}
      className={`flex flex-col overflow-hidden border border-border/80 bg-white shadow-[0_20px_64px_rgba(0,0,0,0.22)] ${maximized ? '' : 'rounded-xl'}`}
      onMouseDown={bringToFront}
    >
      {/* ── Title bar (drag zone) ─────────────────────────────────────────── */}
      <div
        className={`mw-titlebar flex h-[48px] flex-shrink-0 cursor-grab select-none items-center justify-between px-4 active:cursor-grabbing ${headerBg} ${maximized ? '' : 'rounded-t-xl'}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="truncate text-[14px] font-semibold text-white">{title}</span>
          {reference && (
            <span className="flex-shrink-0 rounded bg-white/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
              {reference}
            </span>
          )}
        </div>

        <div className="ml-2 flex flex-shrink-0 items-center gap-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); handleMinimize(); }} className={ctrlBtn} title={minimized ? 'Restaurer' : 'Minimiser'}>
            <Minus size={13} />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); handleMaximize(); }} className={ctrlBtn} title={maximized ? 'Restaurer' : 'Agrandir'}>
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-red-500 hover:text-white"
            title="Fermer"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Body + footer ─────────────────────────────────────────────────── */}
      {!minimized && (
        <div className={`flex flex-1 flex-col overflow-hidden ${maximized ? '' : 'rounded-b-xl'}`}>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {children}
          </div>
          {footer && (
            <div className="flex-shrink-0 border-t border-border bg-white px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      )}
    </Rnd>,
    document.body,
  );
}
