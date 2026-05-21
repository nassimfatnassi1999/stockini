'use client';

import { MoreVertical } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface KebabMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  hidden?: boolean;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
  triggerClassName?: string;
}

export function KebabMenu({ items, triggerClassName }: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter((i) => !i.hidden);

  const openMenu = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const ITEM_HEIGHT = 36;
    const PADDING = 8;
    const MENU_HEIGHT = visibleItems.length * ITEM_HEIGHT + PADDING * 2;
    const MENU_WIDTH = 190;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < MENU_HEIGHT ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4;
    const left = Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8);
    setPos({ top, left: Math.max(8, left) });
    setOpen(true);
  };

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handleMouse = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) close();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleMouse);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouse);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const first = menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
  }, [open]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!menuRef.current) return;
    const menuItems = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
    );
    const focused = document.activeElement as HTMLButtonElement;
    const index = menuItems.indexOf(focused);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      menuItems[(index + 1) % menuItems.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      menuItems[(index - 1 + menuItems.length) % menuItems.length]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  if (visibleItems.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={openMenu}
        className={triggerClassName ?? 'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'}
      >
        <MoreVertical size={15} />
      </button>

      {open && typeof window !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Actions"
          onKeyDown={handleMenuKeyDown}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: 190, zIndex: 9999 }}
          className="rounded-lg border border-border bg-white py-1 shadow-lg"
        >
          {visibleItems.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { item.onClick(); close(); }}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
                item.variant === 'destructive'
                  ? 'text-red-600 hover:bg-red-50 hover:text-red-700 focus:bg-red-50'
                  : 'text-text-primary hover:bg-muted/60 focus:bg-muted/60'
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
