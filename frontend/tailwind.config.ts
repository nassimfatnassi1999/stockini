import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // ─── Existing semantic tokens — now CSS-variable-backed ───

        primary: {
          DEFAULT: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
          light:   'var(--color-primary-soft)',
          dark:    'rgb(var(--color-primary-hover-rgb) / <alpha-value>)',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
          light:   'var(--color-accent-soft)',
          dark:    'rgb(var(--color-accent-hover-rgb) / <alpha-value>)',
          foreground: '#FFFFFF',
        },

        surface:    'var(--color-bg-app)',
        background: 'var(--color-bg-app)',
        foreground: 'var(--color-text-primary)',

        card: {
          DEFAULT:    'var(--color-bg-card)',
          foreground: 'var(--color-text-primary)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong:  '#9EB0C8',
        },
        input: 'var(--color-border)',
        ring:  'rgb(var(--color-ring-rgb) / <alpha-value>)',

        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted':     'var(--color-text-muted)',
        'text-inverse':   '#FFFFFF',

        // Status colours
        status: {
          new:      '#64748B',
          progress: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
          done:     'rgb(var(--color-success-rgb) / <alpha-value>)',
          blocked:  'rgb(var(--color-danger-rgb) / <alpha-value>)',
          draft:    '#94A3B8',
          planned:  '#64748B',
        },

        // Sidebar tokens
        sidebar: {
          bg:           'var(--color-bg-sidebar)',
          hover:        'var(--color-sidebar-hover)',
          active:       'var(--color-sidebar-active)',
          text:         'var(--color-sidebar-text)',
          'text-active': '#FFFFFF',
          border:       'var(--color-sidebar-active)',
        },

        // shadcn/ui aliases
        muted: {
          DEFAULT:    '#F0F4F8',
          foreground: 'var(--color-text-secondary)',
        },
        popover: {
          DEFAULT:    'var(--color-bg-card)',
          foreground: 'var(--color-text-primary)',
        },
        destructive: {
          DEFAULT:    'rgb(var(--color-danger-rgb) / <alpha-value>)',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT:    '#F0F4F8',
          foreground: 'var(--color-text-primary)',
        },

        // ─── app.* namespace — new design token API ───
        app: {
          // Primary
          primary:         'rgb(var(--color-primary-rgb) / <alpha-value>)',
          'primary-hover': 'rgb(var(--color-primary-hover-rgb) / <alpha-value>)',
          'primary-soft':  'var(--color-primary-soft)',

          // Secondary
          secondary:         'rgb(var(--color-secondary-rgb) / <alpha-value>)',
          'secondary-hover': 'rgb(var(--color-secondary-hover-rgb) / <alpha-value>)',
          'secondary-soft':  'var(--color-secondary-soft)',

          // Accent
          accent:         'rgb(var(--color-accent-rgb) / <alpha-value>)',
          'accent-hover': 'rgb(var(--color-accent-hover-rgb) / <alpha-value>)',
          'accent-soft':  'var(--color-accent-soft)',

          // Backgrounds
          bg:      'var(--color-bg-app)',
          card:    'var(--color-bg-card)',
          sidebar: 'var(--color-bg-sidebar)',
          navbar:  'var(--color-bg-navbar)',

          // Sidebar internals
          'sidebar-hover':   'var(--color-sidebar-hover)',
          'sidebar-active':  'var(--color-sidebar-active)',
          'sidebar-text':    'var(--color-sidebar-text)',

          // Text
          text:           'var(--color-text-primary)',
          'text-secondary': 'var(--color-text-secondary)',
          muted:          'var(--color-text-muted)',

          // Border / Ring
          border: 'var(--color-border)',
          ring:   'rgb(var(--color-ring-rgb) / <alpha-value>)',

          // Success
          success:       'rgb(var(--color-success-rgb) / <alpha-value>)',
          'success-soft': 'var(--color-success-soft)',

          // Warning
          warning:       'rgb(var(--color-warning-rgb) / <alpha-value>)',
          'warning-soft': 'var(--color-warning-soft)',

          // Danger
          danger:       'rgb(var(--color-danger-rgb) / <alpha-value>)',
          'danger-soft': 'var(--color-danger-soft)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'DM Sans', 'sans-serif'],
        mono: ['var(--font-mono)', 'Space Mono', 'monospace'],
      },
      borderRadius: {
        card: '8px',
        chip: '20px',
        lg:   '8px',
        md:   '8px',
        sm:   '6px',
      },
      boxShadow: {
        card:        '0 2px 8px rgba(13,43,62,0.06)',
        'card-hover': '0 8px 24px rgba(13,43,62,0.12)',
        topbar:      '0 1px 3px rgba(0,0,0,0.08)',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.3s ease both',
        shimmer:  'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
