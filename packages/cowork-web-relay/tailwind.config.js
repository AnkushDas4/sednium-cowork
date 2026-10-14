/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        // Phones are not one size: 360px needs different choices than 420px.
        xs: '400px',
      },
      colors: {
        // rgb(...) + <alpha-value> so bg-panel/40 and border-grid/60 behave like real tints.
        canvas: 'rgb(var(--rgb-canvas) / <alpha-value>)',
        panel: 'rgb(var(--rgb-panel) / <alpha-value>)',
        hover: 'rgb(var(--rgb-hover) / <alpha-value>)',
        grid: 'rgb(var(--rgb-grid) / <alpha-value>)',
        'grid-strong': 'rgb(var(--rgb-grid-strong) / <alpha-value>)',
        primary: 'rgb(var(--rgb-primary) / <alpha-value>)',
        secondary: 'rgb(var(--rgb-secondary) / <alpha-value>)',
        muted: 'rgb(var(--rgb-muted) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--rgb-accent) / <alpha-value>)',
          strong: 'var(--accent-strong)',
          soft: 'var(--accent-soft)',
          ink: 'var(--accent-ink)',
        },
        ok: { DEFAULT: 'var(--ok)', soft: 'var(--ok-soft)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      // The old scale was 2px everywhere, which reads as "stuck in 2019".
      borderRadius: {
        DEFAULT: '10px',
        none: '0',
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
