import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0d0f14',
          2: '#13161e',
          3: '#1a1e28',
          4: '#22273a',
        },
        sidebar: '#0b0d12',
        accent: {
          DEFAULT: '#3b82f6',
          2: '#60a5fa',
          dim: 'rgba(59,130,246,0.15)',
        },
        green: {
          DEFAULT: '#22c55e',
          dim: 'rgba(34,197,94,0.12)',
        },
        red: {
          DEFAULT: '#ef4444',
          dim: 'rgba(239,68,68,0.12)',
        },
        amber: {
          DEFAULT: '#f59e0b',
          dim: 'rgba(245,158,11,0.12)',
        },
        purple: {
          DEFAULT: '#a78bfa',
          dim: 'rgba(167,139,250,0.12)',
        },
        teal: {
          DEFAULT: '#14b8a6',
          dim: 'rgba(20,184,166,0.12)',
        },
        text: {
          1: '#f0f2f8',
          2: '#8b92a9',
          3: '#555e77',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          2: 'rgba(255,255,255,0.1)',
        },
      },
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '10': '10px',
        '11': '11px',
        '12': '12px',
        '12.5': '12.5px',
        '13': '13px',
        '14': '14px',
        '15': '15px',
      },
      borderRadius: {
        r: '8px',
        r2: '12px',
        r3: '16px',
      },
      spacing: {
        sidebar: '240px',
        topbar: '56px',
      },
    },
  },
  plugins: [],
}

export default config
