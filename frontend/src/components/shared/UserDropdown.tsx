'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, Palette, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearAuthSession } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { ColorThemeSelector } from '@/components/theme/ColorThemeSelector';

interface UserDropdownProps {
  initials: string;
  identity: string;
}

export function UserDropdown({ initials, identity }: UserDropdownProps) {
  const [open, setOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) {
      setThemeOpen(false);
      return;
    }
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    clearAuthSession();
    toast.success('Déconnecté avec succès');
    router.push('/login');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${identity} — ouvrir le menu utilisateur`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-app-primary font-mono text-[11px] font-bold text-white outline-none transition-colors hover:bg-app-primary-hover focus-visible:ring-2 focus-visible:ring-app-primary"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu utilisateur"
          className="animate-in fade-in slide-in-from-top-2 duration-150 absolute right-0 top-[calc(100%+8px)] z-50 min-w-[188px] rounded-lg border border-border bg-white py-1 shadow-card-hover"
        >
          {/* Profil */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); router.push('/profil'); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted"
          >
            <User size={14} strokeWidth={2.2} aria-hidden />
            Profil
          </button>

          {/* Customize color */}
          <button
            type="button"
            role="menuitem"
            aria-expanded={themeOpen}
            onClick={() => setThemeOpen((v) => !v)}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted"
          >
            <Palette size={14} strokeWidth={2.2} aria-hidden />
            Customize color
          </button>

          {/* Theme picker panel */}
          {themeOpen && (
            <div className="px-2 pb-2 pt-1">
              <ColorThemeSelector onClose={() => { setThemeOpen(false); setOpen(false); }} />
            </div>
          )}

          <div className="my-1 border-t border-border" />

          {/* Déconnexion */}
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-app-danger transition-colors hover:bg-app-danger-soft focus-visible:outline-none focus-visible:bg-app-danger-soft"
          >
            <LogOut size={14} strokeWidth={2.2} aria-hidden />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
