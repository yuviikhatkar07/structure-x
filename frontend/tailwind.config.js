const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: c('bg'),
        panel: c('surface'),
        panel2: c('surface2'),
        line: c('line'),
        fg: c('text'),
        mute: c('muted'),
        accent: c('accent'),
        ok: c('ok'),
        warn: c('warn'),
        bad: c('bad'),
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { DEFAULT: '2px', sm: '2px', md: '3px', lg: '4px' },
      boxShadow: {
        glowOk: '0 0 8px 1px rgb(var(--ok) / 0.55)',
        glowWarn: '0 0 8px 1px rgb(var(--warn) / 0.55)',
        glowBad: '0 0 10px 2px rgb(var(--bad) / 0.6)',
        glowAccent: '0 0 14px 1px rgb(var(--accent) / 0.35)',
      },
      keyframes: {
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        flash: { '0%': { opacity: '0.85' }, '100%': { opacity: '0' } },
      },
      animation: { pulseSoft: 'pulseSoft 1.6s ease-in-out infinite', scan: 'scan 3.2s linear infinite', flash: 'flash 0.35s ease-out forwards' },
    },
  },
  plugins: [],
};
