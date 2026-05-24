'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical } from 'lucide-react';

export interface KebabMenuItem {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  hidden?: boolean;
  divider?: boolean;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
  triggerClassName?: string;
}

export function KebabMenu({ items, triggerClassName }: KebabMenuProps) {
  const visibleItems = items.filter((i) => !i.hidden);
  if (visibleItems.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Actions"
          className={
            triggerClassName ??
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-muted data-[state=open]:text-text-primary'
          }
        >
          <MoreVertical size={15} />
        </button>
      </DropdownMenu.Trigger>

      {/* Portal: renders in document.body → escapes overflow:hidden, z-index stacking, scroll containers */}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className={[
            // Layout
            'min-w-[220px] rounded-lg border border-border bg-white py-1 shadow-lg',
            // Radix animation hooks
            'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            // Side-aware slide
            'data-[side=bottom]:slide-in-from-top-2',
            'data-[side=top]:slide-in-from-bottom-2',
            // z-index safe (above modals and slideovers)
            'z-[9999]',
          ].join(' ')}
        >
          {visibleItems.map((item, i) =>
            item.divider ? (
              <DropdownMenu.Separator
                key={`sep-${i}`}
                className="mx-2 my-1 h-px bg-slate-100"
              />
            ) : (
              <DropdownMenu.Item
                key={i}
                disabled={item.disabled}
                onSelect={item.onClick}
                className={[
                  'flex w-full cursor-default select-none items-center gap-2.5 px-4 py-2 text-sm outline-none',
                  'transition-colors',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40',
                  item.variant === 'destructive'
                    ? 'text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700'
                    : 'text-text-primary data-[highlighted]:bg-muted/60',
                ].join(' ')}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                  {item.icon}
                </span>
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
