/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Палитра приведена к корп-дизайн-системе ДКБИ «Engineered» v2.0
      // (источник значений: dkbi-design.css). Значения — HEX (НЕ var), чтобы
      // Tailwind-модификаторы прозрачности (bg-*/50, /60) продолжали работать.
      // Тема одна — светлая (PWA для водителей на солнце). Шкалы построены вокруг
      // dk-якорей: brand-600=--dk-primary, ink-900=--dk-ink, red≈danger,
      // amber≈warning, emerald≈success. Вёрстка не менялась — классы прежние.
      colors: {
        // бренд — электрический кобальт (--dk-primary #2B50E6 / -h #1F3FC4 / tint #EAEEFE)
        brand: {
          50: '#eaeefe',
          100: '#d6dffd',
          200: '#b3c3fb',
          300: '#8aa0f7',
          400: '#5b78f0',
          500: '#3d5cea',
          600: '#2b50e6',
          700: '#1f3fc4',
          800: '#1b34a0',
          900: '#1a2e80',
          950: '#121e52',
        },
        // нейтраль — прохладный slate дизайн-системы
        // (--dk-page #FBFCFE, surface-2 #F3F5F9, line #E6E9F0, line-2 #D5DAE3,
        //  ink-3 #8C95A3, ink-2 #565E6C, ink #0E1116)
        ink: {
          50: '#fbfcfe',
          100: '#f3f5f9',
          200: '#e6e9f0',
          300: '#d5dae3',
          400: '#8c95a3',
          500: '#6e7787',
          600: '#565e6c',
          700: '#3c434f',
          800: '#262c36',
          900: '#0e1116',
          950: '#070a0e',
        },
        // успех — --dk-success #12A150 / tint #E4F6EC / ink #0B6B36
        emerald: {
          50: '#e4f6ec',
          100: '#c6ecd5',
          200: '#97dbb2',
          300: '#5fc78c',
          400: '#2fb56c',
          500: '#12a150',
          600: '#109049',
          700: '#0d7a3e',
          800: '#0b6b36',
          900: '#08512a',
          950: '#032815',
        },
        // предупреждение — --dk-warning #D98A00 / tint #FBF0DA / ink #8A5700
        amber: {
          50: '#fbf0da',
          100: '#f7e4bc',
          200: '#f0ce88',
          300: '#e8b24a',
          400: '#e29a1f',
          500: '#d98a00',
          600: '#be7800',
          700: '#9e6400',
          800: '#8a5700',
          900: '#6e4600',
          950: '#3d2700',
        },
        // опасность — --dk-danger #E5484D / tint #FCEAEB / ink #B0272C
        red: {
          50: '#fceaeb',
          100: '#f9d5d7',
          200: '#f3b0b3',
          300: '#ec888c',
          400: '#e86a6e',
          500: '#e5484d',
          600: '#d93a3f',
          700: '#c22e33',
          800: '#b0272c',
          900: '#8f1f23',
          950: '#4e1012',
        },
        // статусы вахты — те же dk-семантические тона
        status: {
          free: '#565e6c', // dk-ink-2
          pending: '#d98a00', // dk-warning
          active: '#12a150', // dk-success
          issue: '#e5484d', // dk-danger
          review: '#2b50e6', // dk-primary
          verified: '#0d7a3e', // насыщенный success
        },
      },
      fontFamily: {
        // Шрифт — Inter (self-host, woff2 в бандле: src/styles/fonts.css).
        // Причина замены Hanken: у Google-версии Hanken нет русской кириллицы.
        // Inter — тот же инженерный гротеск + полная кириллица. Заголовки — тот же
        // Inter плотнее. mono оставлен для будущего (цифры пока не моно).
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        base: ['1rem', { lineHeight: '1.5rem' }],
      },
      minHeight: {
        tap: '48px',
        cta: '56px',
      },
      minWidth: {
        tap: '48px',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(14 17 22 / 0.04), 0 4px 16px -2px rgb(14 17 22 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(14 17 22 / 0.10), 0 0 0 1px rgb(14 17 22 / 0.06)',
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
