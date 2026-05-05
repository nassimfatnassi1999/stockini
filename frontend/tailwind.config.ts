import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // === Stockini — Industrial Precision ===
        primary: {
          DEFAULT: '#1B4F72',
          light: '#2E86C1',
          dark: '#0D2B3E',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#E67E22',
          light: '#FAD7A0',
          dark: '#A04000',
          foreground: '#FFFFFF',
        },
        surface: '#F7F9FC',
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A2332',
        },
        border: {
          DEFAULT: '#D5DCE8',
          strong: '#9EB0C8',
        },
        'text-primary': '#1A2332',
        'text-secondary': '#5A6A7E',
        'text-muted': '#9AAFC5',
        'text-inverse': '#FFFFFF',

        // Statuts métier
        status: {
          new: '#2196F3',
          progress: '#FF9800',
          done: '#4CAF50',
          blocked: '#F44336',
          draft: '#9E9E9E',
          planned: '#9C27B0',
        },

        // Sidebar
        sidebar: {
          bg: '#0D2B3E',
          hover: '#1B4F72',
          active: '#2E86C1',
          text: '#B8CCE0',
          'text-active': '#FFFFFF',
          border: '#1B4F72',
        },

        // Aliases shadcn (pour compat composants existants)
        background: '#F7F9FC',
        foreground: '#1A2332',
        input: '#D5DCE8',
        ring: '#1B4F72',
        muted: {
          DEFAULT: '#F0F4F8',
          foreground: '#5A6A7E',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A2332',
        },
        destructive: {
          DEFAULT: '#F44336',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#F0F4F8',
          foreground: '#1A2332',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'DM Sans', 'sans-serif'],
        mono: ['var(--font-mono)', 'Space Mono', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        chip: '20px',
        lg: '10px',
        md: '8px',
        sm: '6px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(13,43,62,0.06)',
        'card-hover': '0 8px 24px rgba(13,43,62,0.12)',
        topbar: '0 1px 3px rgba(0,0,0,0.08)',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.3s ease both',
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
