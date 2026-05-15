export interface ColorTheme {
  id: string;
  name: string;
  description: string;

  /* Main brand colors */
  primary: string;
  primaryHover: string;
  primarySoft: string;

  secondary: string;
  secondaryHover: string;
  secondarySoft: string;

  accent: string;
  accentHover: string;
  accentSoft: string;

  /* Backgrounds */
  bgApp: string;
  bgCard: string;
  bgSidebar: string;
  bgNavbar: string;

  /* Sidebar internals */
  sidebarHover: string;
  sidebarActive: string;
  sidebarText: string;

  /* Typography */
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  /* Border */
  border: string;

  /* Status */
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
}

/** Converts a #RRGGBB hex to "R G B" channel string for CSS. */
export function hexToRgbChannels(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export const COLOR_THEMES: ColorTheme[] = [
  // ── 1. Stockini Classic ───────────────────────────────────────────────
  {
    id: 'stockini-classic',
    name: 'Stockini Classic',
    description: 'Orange / Navy / Blue',
    primary:       '#F97316',
    primaryHover:  '#EA580C',
    primarySoft:   '#FFF7ED',
    secondary:     '#0B2239',
    secondaryHover:'#173B54',
    secondarySoft: '#EBF2F8',
    accent:        '#2563EB',
    accentHover:   '#1D4ED8',
    accentSoft:    '#EFF6FF',
    bgApp:         '#F7F9FC',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#0B2239',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#173B54',
    sidebarActive: '#1B4F72',
    sidebarText:   '#B8CCE0',
    textPrimary:   '#1A2332',
    textSecondary: '#5A6A7E',
    textMuted:     '#9AAFC5',
    border:        '#D5DCE8',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 2. Ocean Pro ──────────────────────────────────────────────────────
  {
    id: 'ocean-pro',
    name: 'Ocean Pro',
    description: 'Blue / Navy / Cyan',
    primary:       '#0EA5E9',
    primaryHover:  '#0284C7',
    primarySoft:   '#F0F9FF',
    secondary:     '#0C1A2E',
    secondaryHover:'#162845',
    secondarySoft: '#EBF2FB',
    accent:        '#06B6D4',
    accentHover:   '#0891B2',
    accentSoft:    '#ECFEFF',
    bgApp:         '#F5F9FD',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#0C1A2E',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#162845',
    sidebarActive: '#1E3A5F',
    sidebarText:   '#7BAACC',
    textPrimary:   '#0F2342',
    textSecondary: '#456080',
    textMuted:     '#8AA6C0',
    border:        '#CBE0EF',
    success:       '#059669',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 3. Emerald Business ───────────────────────────────────────────────
  {
    id: 'emerald-business',
    name: 'Emerald Business',
    description: 'Green / Slate / Emerald',
    primary:       '#059669',
    primaryHover:  '#047857',
    primarySoft:   '#ECFDF5',
    secondary:     '#1E293B',
    secondaryHover:'#334155',
    secondarySoft: '#F1F5F9',
    accent:        '#10B981',
    accentHover:   '#059669',
    accentSoft:    '#D1FAE5',
    bgApp:         '#F6FAF8',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#1E293B',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#334155',
    sidebarActive: '#0F766E',
    sidebarText:   '#94A3B8',
    textPrimary:   '#0F1F2E',
    textSecondary: '#475569',
    textMuted:     '#94A3B8',
    border:        '#CBD5E1',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 4. Royal ERP ─────────────────────────────────────────────────────
  {
    id: 'royal-erp',
    name: 'Royal ERP',
    description: 'Indigo / Navy / Violet',
    primary:       '#4F46E5',
    primaryHover:  '#4338CA',
    primarySoft:   '#EEF2FF',
    secondary:     '#1E1B4B',
    secondaryHover:'#312E81',
    secondarySoft: '#EDE9FE',
    accent:        '#7C3AED',
    accentHover:   '#6D28D9',
    accentSoft:    '#F5F3FF',
    bgApp:         '#F6F6FC',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#1E1B4B',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#312E81',
    sidebarActive: '#3730A3',
    sidebarText:   '#A5B4FC',
    textPrimary:   '#1E1B4B',
    textSecondary: '#4B5563',
    textMuted:     '#9CA3AF',
    border:        '#E0E7FF',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 5. Amber Finance ─────────────────────────────────────────────────
  {
    id: 'amber-finance',
    name: 'Amber Finance',
    description: 'Amber / Slate / Orange',
    primary:       '#D97706',
    primaryHover:  '#B45309',
    primarySoft:   '#FFFBEB',
    secondary:     '#1C2B3A',
    secondaryHover:'#2D3F50',
    secondarySoft: '#F1F5F9',
    accent:        '#F59E0B',
    accentHover:   '#D97706',
    accentSoft:    '#FEF3C7',
    bgApp:         '#FAFAF5',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#1C2B3A',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#2D3F50',
    sidebarActive: '#3B5068',
    sidebarText:   '#CBD5E1',
    textPrimary:   '#1C2B3A',
    textSecondary: '#4B5563',
    textMuted:     '#9CA3AF',
    border:        '#E5E7EB',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 6. Crimson Admin ─────────────────────────────────────────────────
  {
    id: 'crimson-admin',
    name: 'Crimson Admin',
    description: 'Red / Zinc / Rose',
    primary:       '#E11D48',
    primaryHover:  '#BE123C',
    primarySoft:   '#FFF1F2',
    secondary:     '#18181B',
    secondaryHover:'#27272A',
    secondarySoft: '#F4F4F5',
    accent:        '#F43F5E',
    accentHover:   '#E11D48',
    accentSoft:    '#FFE4E6',
    bgApp:         '#F9F9FA',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#18181B',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#27272A',
    sidebarActive: '#3F1212',
    sidebarText:   '#A1A1AA',
    textPrimary:   '#09090B',
    textSecondary: '#52525B',
    textMuted:     '#A1A1AA',
    border:        '#E4E4E7',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 7. Purple SaaS ───────────────────────────────────────────────────
  {
    id: 'purple-saas',
    name: 'Purple SaaS',
    description: 'Purple / Slate / Indigo',
    primary:       '#9333EA',
    primaryHover:  '#7E22CE',
    primarySoft:   '#FAF5FF',
    secondary:     '#1E1B4B',
    secondaryHover:'#2E2A60',
    secondarySoft: '#EDE9FE',
    accent:        '#6366F1',
    accentHover:   '#4F46E5',
    accentSoft:    '#EEF2FF',
    bgApp:         '#F8F5FD',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#1E1B4B',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#2E2A60',
    sidebarActive: '#4C1D95',
    sidebarText:   '#C4B5FD',
    textPrimary:   '#1E1B4B',
    textSecondary: '#4B5563',
    textMuted:     '#9CA3AF',
    border:        '#E9D5FF',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 8. Teal Commerce ─────────────────────────────────────────────────
  {
    id: 'teal-commerce',
    name: 'Teal Commerce',
    description: 'Teal / Navy / Cyan',
    primary:       '#0D9488',
    primaryHover:  '#0F766E',
    primarySoft:   '#F0FDFA',
    secondary:     '#0C2340',
    secondaryHover:'#163652',
    secondarySoft: '#E7F5F8',
    accent:        '#06B6D4',
    accentHover:   '#0891B2',
    accentSoft:    '#ECFEFF',
    bgApp:         '#F2FBFA',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#0C2340',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#163652',
    sidebarActive: '#0F4F4A',
    sidebarText:   '#99D6D3',
    textPrimary:   '#0C2340',
    textSecondary: '#3D6B78',
    textMuted:     '#77A8AE',
    border:        '#CCECEB',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 9. Graphite Minimal ───────────────────────────────────────────────
  {
    id: 'graphite-minimal',
    name: 'Graphite Minimal',
    description: 'Slate / Zinc / Blue',
    primary:       '#475569',
    primaryHover:  '#334155',
    primarySoft:   '#F8FAFC',
    secondary:     '#18181B',
    secondaryHover:'#27272A',
    secondarySoft: '#F4F4F5',
    accent:        '#3B82F6',
    accentHover:   '#2563EB',
    accentSoft:    '#EFF6FF',
    bgApp:         '#F8FAFC',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#18181B',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#27272A',
    sidebarActive: '#334155',
    sidebarText:   '#94A3B8',
    textPrimary:   '#0F172A',
    textSecondary: '#475569',
    textMuted:     '#94A3B8',
    border:        '#E2E8F0',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },

  // ── 10. Sky Clean ─────────────────────────────────────────────────────
  {
    id: 'sky-clean',
    name: 'Sky Clean',
    description: 'Sky / Slate / Cyan',
    primary:       '#0369A1',
    primaryHover:  '#075985',
    primarySoft:   '#F0F9FF',
    secondary:     '#0F2D44',
    secondaryHover:'#1A4260',
    secondarySoft: '#E7F3FB',
    accent:        '#06B6D4',
    accentHover:   '#0891B2',
    accentSoft:    '#ECFEFF',
    bgApp:         '#F0F8FF',
    bgCard:        '#FFFFFF',
    bgSidebar:     '#0F2D44',
    bgNavbar:      '#FFFFFF',
    sidebarHover:  '#1A4260',
    sidebarActive: '#1E5A8A',
    sidebarText:   '#7DC4E4',
    textPrimary:   '#0C1F30',
    textSecondary: '#2E5F80',
    textMuted:     '#7AAEC8',
    border:        '#BAD9EC',
    success:       '#16A34A',
    successSoft:   '#F0FDF4',
    warning:       '#D97706',
    warningSoft:   '#FFFBEB',
    danger:        '#DC2626',
    dangerSoft:    '#FEF2F2',
  },
];

export const DEFAULT_THEME_ID = 'stockini-classic';
