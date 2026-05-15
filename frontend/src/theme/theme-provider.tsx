'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  COLOR_THEMES,
  DEFAULT_THEME_ID,
  hexToRgbChannels,
  type ColorTheme,
} from './color-themes';

const THEME_STORAGE_KEY = 'stockini.color-theme';

interface ColorThemeContextValue {
  theme: ColorTheme;
  themes: ColorTheme[];
  setTheme: (id: string) => void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);

function applyTheme(theme: ColorTheme): void {
  const root = document.documentElement;

  // ─── RGB channels (enable Tailwind opacity modifiers like bg-app-primary/10) ───
  root.style.setProperty('--color-primary-rgb',           hexToRgbChannels(theme.primary));
  root.style.setProperty('--color-primary-hover-rgb',     hexToRgbChannels(theme.primaryHover));
  root.style.setProperty('--color-secondary-rgb',         hexToRgbChannels(theme.secondary));
  root.style.setProperty('--color-secondary-hover-rgb',   hexToRgbChannels(theme.secondaryHover));
  root.style.setProperty('--color-accent-rgb',            hexToRgbChannels(theme.accent));
  root.style.setProperty('--color-accent-hover-rgb',      hexToRgbChannels(theme.accentHover));
  root.style.setProperty('--color-success-rgb',           hexToRgbChannels(theme.success));
  root.style.setProperty('--color-warning-rgb',           hexToRgbChannels(theme.warning));
  root.style.setProperty('--color-danger-rgb',            hexToRgbChannels(theme.danger));
  root.style.setProperty('--color-ring-rgb',              hexToRgbChannels(theme.primary));

  // ─── Solid hex values (backgrounds, text, borders) ───
  root.style.setProperty('--color-primary-soft',          theme.primarySoft);
  root.style.setProperty('--color-secondary-soft',        theme.secondarySoft);
  root.style.setProperty('--color-accent-soft',           theme.accentSoft);
  root.style.setProperty('--color-bg-app',                theme.bgApp);
  root.style.setProperty('--color-bg-card',               theme.bgCard);
  root.style.setProperty('--color-bg-sidebar',            theme.bgSidebar);
  root.style.setProperty('--color-bg-navbar',             theme.bgNavbar);
  root.style.setProperty('--color-sidebar-hover',         theme.sidebarHover);
  root.style.setProperty('--color-sidebar-active',        theme.sidebarActive);
  root.style.setProperty('--color-sidebar-text',          theme.sidebarText);
  root.style.setProperty('--color-text-primary',          theme.textPrimary);
  root.style.setProperty('--color-text-secondary',        theme.textSecondary);
  root.style.setProperty('--color-text-muted',            theme.textMuted);
  root.style.setProperty('--color-border',                theme.border);
  root.style.setProperty('--color-success-soft',          theme.successSoft);
  root.style.setProperty('--color-warning-soft',          theme.warningSoft);
  root.style.setProperty('--color-danger-soft',           theme.dangerSoft);
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ColorTheme>(
    () => COLOR_THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? COLOR_THEMES[0],
  );

  useEffect(() => {
    const savedId = typeof window !== 'undefined'
      ? localStorage.getItem(THEME_STORAGE_KEY)
      : null;
    const found = savedId ? COLOR_THEMES.find((t) => t.id === savedId) : null;
    const initial = found ?? COLOR_THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? COLOR_THEMES[0];
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((id: string) => {
    const found = COLOR_THEMES.find((t) => t.id === id);
    if (!found) return;
    setThemeState(found);
    applyTheme(found);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    }
    // TODO: PATCH /users/me/theme when backend endpoint is ready
  }, []);

  return (
    <ColorThemeContext.Provider value={{ theme, themes: COLOR_THEMES, setTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme(): ColorThemeContextValue {
  const ctx = useContext(ColorThemeContext);
  if (!ctx) throw new Error('useColorTheme must be used inside <ColorThemeProvider>');
  return ctx;
}
