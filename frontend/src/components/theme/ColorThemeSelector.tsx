'use client';

import { Check, Palette, X } from 'lucide-react';
import { useColorTheme } from '@/theme/theme-provider';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

interface ColorThemeSelectorProps {
  onClose: () => void;
}

export function ColorThemeSelector({ onClose }: ColorThemeSelectorProps) {
  const { theme, themes, setTheme } = useColorTheme();

  function handleSelect(id: string) {
    setTheme(id);
    toast.success('Thème appliqué');
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-label="Sélecteur de thème de couleur"
      className="w-[min(300px,calc(100vw-24px))] rounded-lg border border-border bg-white p-3 shadow-card-hover"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-text-muted" aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Couleur du thème</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le sélecteur de thème"
          className="app-action-button"
        >
          <X size={12} />
        </button>
      </div>

      {/* Theme grid */}
      <div
        role="listbox"
        aria-label="Thèmes disponibles"
        className="grid grid-cols-2 gap-2"
      >
        {themes.map((t) => {
          const isActive = t.id === theme.id;
          return (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={isActive}
              aria-label={`${isActive ? 'Thème actif : ' : 'Appliquer le thème '}${t.name}`}
              onClick={() => handleSelect(t.id)}
              title={t.description}
              className={cn(
                'group relative flex flex-col gap-1.5 rounded-md border p-2.5 text-left',
                'outline-none transition-all',
                'focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-1',
                isActive
                  ? 'border-app-primary/50 bg-app-primary-soft ring-1 ring-app-primary/20'
                  : 'border-border hover:border-app-primary/30 hover:bg-muted',
              )}
            >
              {/* Color swatches */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <span
                    aria-hidden
                    className="h-4 w-4 rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: t.primary }}
                  />
                  <span
                    aria-hidden
                    className="h-4 w-4 rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: t.secondary }}
                  />
                  <span
                    aria-hidden
                    className="h-4 w-4 rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: t.accent }}
                  />
                </div>
                {isActive && (
                  <Check
                    size={12}
                    className="text-app-primary"
                    aria-hidden
                  />
                )}
              </div>

              {/* Name */}
              <span className="truncate text-[11px] font-semibold text-text-primary">
                {t.name}
              </span>

              {/* Description / active badge */}
              {isActive ? (
                <span className="text-[10px] font-bold text-app-primary">Actif</span>
              ) : (
                <span className="text-[10px] text-text-muted">{t.description}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
