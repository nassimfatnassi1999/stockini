'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearAuthSession } from '@/lib/auth';
import { toast } from '@/lib/toast';

interface UserDropdownProps {
  initials: string;
  identity: string;
}

export function UserDropdown({ initials, identity }: UserDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-white outline-none transition-colors hover:bg-primary-dark focus-visible:ring-2 focus-visible:ring-primary"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu utilisateur"
          className="animate-in fade-in slide-in-from-top-2 duration-150 absolute right-0 top-[calc(100%+8px)] z-50 min-w-[176px] rounded-xl border border-border bg-white py-1 shadow-card-hover"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); router.push('/profil'); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted"
          >
            <User size={14} strokeWidth={2.2} />
            Profil
          </button>

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:bg-red-50"
          >
            <LogOut size={14} strokeWidth={2.2} />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
