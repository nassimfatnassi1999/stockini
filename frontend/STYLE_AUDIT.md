# STYLE_AUDIT.md — Stockini Frontend Design System Audit

> Audited: 2026-05-15 | Auditor: Design System Engineer
> Stack: Next.js · React · TypeScript · TailwindCSS · shadcn/ui

---

## SUMMARY

| Category           | Issues Found | HIGH | MEDIUM | LOW |
|--------------------|-------------|------|--------|-----|
| Hardcoded hex      | 8           | 3    | 3      | 2   |
| Hardcoded Tailwind | 22          | 8    | 9      | 5   |
| Button variants    | 3           | 2    | 1      | 0   |
| Badge variants     | 6           | 4    | 2      | 0   |
| Sidebar tokens     | 4           | 2    | 2      | 0   |
| Globals/utilities  | 5           | 3    | 2      | 0   |

---

## 1. HARDCODED HEX COLORS

| File | Line | Style Found | Problem | Solution | Priority |
|------|------|-------------|---------|----------|----------|
| `src/components/shared/AppSidebar.tsx` | 227 | `bg-[#132f43]` | Tooltip bg bypasses theme system | `bg-app-secondary` | HIGH |
| `src/components/shared/AppSidebar.tsx` | 249 | `text-[#7BA7CC]` | Section label color hardcoded | CSS var `--color-sidebar-section-ops` | LOW |
| `src/components/shared/AppSidebar.tsx` | 250 | `text-[#6FB98F]` | Section label color hardcoded | CSS var `--color-sidebar-section-pilotage` | LOW |
| `src/components/shared/AppSidebar.tsx` | 251 | `text-[#E07B54]` | Section label color hardcoded | CSS var `--color-sidebar-section-admin` | MEDIUM |
| `src/components/shared/AppSidebar.tsx` | 263 | `text-[#8BA4BC]` | Section fallback color | `text-app-sidebar-text` | MEDIUM |
| `src/components/shared/AppSidebar.tsx` | 295 | `bg-[#0D2B3E]/65` | Mobile overlay hardcoded navy | `bg-black/50` | HIGH |
| `tailwind.config.ts` | 11–77 | All hex values direct | All colors are static, no CSS var | Replace with `var(--color-*)` | HIGH |
| `src/app/globals.css` | 8–31 | `--p`, `--pl`, `--pd` etc. | Short-named vars, not semantic | Rename to `--color-primary` etc. | MEDIUM |

---

## 2. HARDCODED TAILWIND COLOR CLASSES

### Button variants (`src/components/ui/button.tsx`)

| Line | Style Found | Problem | Solution | Priority |
|------|-------------|---------|----------|----------|
| 19 | `hover:border-orange-200 hover:bg-orange-50 hover:text-primary` | Hardcoded orange, not theme-aware | `hover:border-app-primary/20 hover:bg-app-primary-soft hover:text-app-primary` | HIGH |
| 20 | `hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700` | Hardcoded slate, breaks on dark themes | `hover:border-app-border hover:bg-muted hover:text-app-text` | MEDIUM |
| 21 | `hover:border-red-200 hover:bg-red-50 hover:text-red-700` | Hardcoded red, not using danger token | `hover:border-app-danger/20 hover:bg-app-danger-soft hover:text-app-danger` | HIGH |

### Badge variants (`src/components/ui/badge.tsx`)

| Line | Style Found | Problem | Solution | Priority |
|------|-------------|---------|----------|----------|
| 11 | `border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100` | Hardcoded orange | `border-app-primary/30 bg-app-primary-soft text-app-primary` | HIGH |
| 12 | `border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100` | Hardcoded slate | `border-app-border bg-muted text-app-text` | MEDIUM |
| — | Missing: success, warning, danger, admin, stock, seller, purchase, active, inactive | Missing semantic variants | Add full variant set | HIGH |

### Status component (`src/components/stockini/shared/Status.tsx`)

| Line | Style Found | Problem | Solution | Priority |
|------|-------------|---------|----------|----------|
| 7 | `border-red-200 bg-red-50 text-red-700` | Hardcoded danger colors | `border-app-danger/30 bg-app-danger-soft text-app-danger` | HIGH |
| 9 | `border-emerald-200 bg-emerald-50 text-emerald-700` | Hardcoded success colors | `border-app-success/30 bg-app-success-soft text-app-success` | HIGH |
| 10 | `border-amber-200 bg-amber-50 text-amber-700` | Hardcoded warning colors | `border-app-warning/30 bg-app-warning-soft text-app-warning` | HIGH |

### UserBadges (`src/components/stockini/users/UserBadges.tsx`)

| Line | Style Found | Problem | Solution | Priority |
|------|-------------|---------|----------|----------|
| 12 | `bg-emerald-500/15 text-emerald-400 border-emerald-500/30` | Hardcoded emerald for active | `bg-app-success/10 text-app-success border-app-success/30` | HIGH |
| 13 | `bg-slate-500/15 text-slate-400 border-slate-500/30` | Hardcoded slate for inactive | `bg-muted text-app-muted border-app-border` | MEDIUM |
| 24 | `bg-orange-500/15 text-orange-400 border-orange-500/30` | Hardcoded orange for ADMIN role | `bg-app-primary/15 text-app-primary border-app-primary/30` | HIGH |
| 25 | `bg-blue-500/15 text-blue-400 border-blue-500/30` | Hardcoded blue for STOCK role | `bg-app-accent/15 text-app-accent border-app-accent/30` | HIGH |
| 26 | `bg-violet-500/15 text-violet-400 border-violet-500/30` | Hardcoded violet for SELLER role | `bg-app-accent/10 text-app-accent border-app-accent/20` | MEDIUM |
| 27 | `bg-cyan-500/15 text-cyan-400 border-cyan-500/30` | Hardcoded cyan for PURCHASE role | `bg-app-secondary/10 text-app-secondary border-app-secondary/20` | MEDIUM |

### Globals utility classes (`src/app/globals.css`)

| Line | Style Found | Problem | Solution | Priority |
|------|-------------|---------|----------|----------|
| 93 | `hover:border-orange-200 hover:bg-orange-50 hover:text-primary` (.app-action-edit) | Hardcoded orange | `hover:border-app-primary/20 hover:bg-app-primary-soft hover:text-app-primary` | HIGH |
| 96 | `hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700` (.app-action-view) | Hardcoded slate | `hover:border-app-border hover:bg-muted hover:text-app-text` | MEDIUM |
| 99 | `hover:border-red-200 hover:bg-red-50 hover:text-red-700` (.app-action-delete) | Hardcoded red | `hover:border-app-danger/20 hover:bg-app-danger-soft hover:text-app-danger` | HIGH |
| 119 | `background: linear-gradient(90deg, #f0f4f8 25%, #e0e8f0 50%, ...)` (skeleton) | Hardcoded grey gradient | Use `var(--color-bg-app)` + `var(--color-border)` | MEDIUM |

### Miscellaneous

| File | Line | Style Found | Problem | Solution | Priority |
|------|------|-------------|---------|----------|----------|
| `UserDropdown.tsx` | 72 | `text-red-600 hover:bg-red-50 hover:text-red-700` | Hardcoded red for logout | `text-app-danger hover:bg-app-danger-soft hover:text-app-danger` | MEDIUM |
| `AppTopbar.tsx` | 111 | `bg-white` | Static white navbar, not tokenized | `bg-app-navbar` | MEDIUM |

---

## 3. MISSING VARIANTS

### Buttons — Missing
- `success` variant
- `warning` variant
- `danger` variant (alias for destructive, using app token)

### Badges — Missing
- `success`, `warning`, `danger`
- `admin`, `stock`, `seller`, `purchase`
- `active`, `inactive`

---

## 4. ARCHITECTURAL ISSUES

| Issue | Impact | Fix |
|-------|--------|-----|
| No CSS custom properties system | Theme switching impossible | Add `:root { --color-* }` tokens | 
| Tailwind colors hardcoded hex | Static, can't change at runtime | Wire to CSS vars |
| No ThemeProvider | Can't switch themes | Create `ColorThemeProvider` |
| No color theme catalogue | No user personalization | Create `COLOR_THEMES` array |
| No user theme persistence | State lost on refresh | localStorage + optional backend |

---

## 5. SOLUTIONS IMPLEMENTED

After this audit, the following was created/modified:

### Created
- `src/theme/color-themes.ts` — 10 color themes catalogue
- `src/theme/theme-provider.tsx` — ThemeProvider + `useColorTheme()` hook
- `src/components/theme/ColorThemeSelector.tsx` — Grid UI for picking themes

### Modified
- `src/app/globals.css` — Full CSS custom properties system
- `tailwind.config.ts` — All colors wired to CSS vars + new `app.*` namespace
- `src/components/shared/UserDropdown.tsx` — "Customize color" menu item
- `src/app/providers.tsx` — Wrapped with `ColorThemeProvider`
- `src/components/ui/button.tsx` — success/warning/danger variants + token classes
- `src/components/ui/badge.tsx` — Full semantic variant set
- `src/components/stockini/shared/Status.tsx` — Token-based classes
- `src/components/stockini/users/UserBadges.tsx` — Token-based classes
- `src/components/shared/AppSidebar.tsx` — Removed all `bg-[#hex]` hardcodes

---

## 6. QA CHECKLIST

- [ ] Theme changes from navbar dropdown
- [ ] Theme persists after browser refresh
- [ ] Sidebar background follows theme
- [ ] All buttons render correctly in all themes
- [ ] Badge contrast readable in all themes
- [ ] Profile dropdown stays legible
- [ ] Users page harmonized
- [ ] Tables remain readable
- [ ] Dark navy sidebar keeps contrast (WCAG AA ≥ 4.5:1)
- [ ] No white text invisible on any theme
- [ ] Keyboard navigation on ColorThemeSelector
- [ ] `aria-label` on all theme buttons
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
