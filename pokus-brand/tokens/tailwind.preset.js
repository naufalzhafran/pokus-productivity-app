// Pokus Tailwind preset. Requires tokens.css to be imported (semantic colors are CSS vars,
// so light/dark switch automatically — do NOT use `dark:` variants for semantic colors).
// tailwind.config.js:  module.exports = { presets: [require('./brand/tokens/tailwind.preset.js')], ... }
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        night: '#14143C',
        paper: '#F1F0FF',
        indigo: {
          50: '#F1F0FF', 100: '#E3E0FF', 200: '#C8C2FF', 300: '#A69CFF', 400: '#8B7DFF',
          500: '#4B3BFF', 600: '#3A2AE6', 700: '#2E20B8', 800: '#231A8A', 900: '#1A155C', 950: '#14143C',
          DEFAULT: '#4B3BFF',
        },
        lime: {
          200: '#F0FFC2', 300: '#E7FF8A', 400: '#D7FF3E', 500: '#BDE620', 600: '#93B50F', 700: '#6B840A',
          DEFAULT: '#D7FF3E',
        },
        neutral: {
          0: '#FFFFFF', 50: '#F7F7FB', 100: '#EEEEF5', 200: '#DEDEEA', 300: '#C4C4D6', 400: '#9A9AB3',
          500: '#6E6E8A', 600: '#50506B', 700: '#383852', 800: '#24243D', 900: '#191930', 950: '#0E0E22',
        },
        // Semantic (theme-aware via CSS vars)
        background: 'var(--pk-background)',
        surface: {
          DEFAULT: 'var(--pk-surface)',
          raised: 'var(--pk-surface-raised)',
          sunken: 'var(--pk-surface-sunken)',
        },
        border: 'var(--pk-border)',
        fg: {
          DEFAULT: 'var(--pk-text-primary)',
          muted: 'var(--pk-text-secondary)',
        },
        primary: {
          DEFAULT: 'var(--pk-primary)',
          pressed: 'var(--pk-primary-pressed)',
          fg: 'var(--pk-on-primary)',
        },
        accent: {
          DEFAULT: 'var(--pk-accent)',
          fg: 'var(--pk-on-accent)',
        },
        session: {
          focus: 'var(--pk-session-focus)',
          break: 'var(--pk-session-break)',
          paused: 'var(--pk-session-paused)',
        },
        success: 'var(--pk-success)',
        warning: 'var(--pk-warning)',
        danger: 'var(--pk-danger)',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        timer: ['72px', { lineHeight: '72px', letterSpacing: '-0.02em', fontWeight: '500' }],
        'display-l': ['40px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-m': ['28px', { lineHeight: '34px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-s': ['22px', { lineHeight: '28px', fontWeight: '600' }],
        title: ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '700' }],
        headline: ['17px', { lineHeight: '24px', fontWeight: '700' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '500' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '500' }],
        label: ['13px', { lineHeight: '18px', letterSpacing: '0.01em', fontWeight: '700' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '600' }],
      },
      borderRadius: {
        xs: '6px', sm: '10px', md: '14px', lg: '20px', xl: '28px',
      },
      boxShadow: {
        sm: 'var(--pk-shadow-sm)',
        md: 'var(--pk-shadow-md)',
        lg: 'var(--pk-shadow-lg)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,.8,.2,1)',
        exit: 'cubic-bezier(.4,0,1,1)',
      },
      transitionDuration: { fast: '150ms', base: '250ms', slow: '400ms' },
      maxWidth: { content: '1200px' },
      width: { sidebar: '264px' },
    },
  },
};
