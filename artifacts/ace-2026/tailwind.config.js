/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface-color)',
        surface2: 'var(--surface2-color)',
        surface3: 'var(--surface3-color)',
        surface4: 'var(--surface4-color)',
        accent: 'var(--accent-color)',
        accent2: 'var(--accent2-color)',
        'text-primary': 'var(--text-color)',
        'text-muted': 'var(--text-muted-color)',
        'text-dim': 'var(--text-dim-color)',
        'border-theme': 'var(--border-color)',
        'border-accent': 'var(--border-accent-color)',
        'glow': 'var(--glow-color)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
        cjk: ['var(--font-cjk)', 'sans-serif'],
      },
      letterSpacing: {
        base: 'var(--letter-spacing-base)',
        hero: 'var(--letter-spacing-hero)',
      },
      lineHeight: {
        base: 'var(--line-height-base)',
        cjk: 'var(--line-height-cjk)',
      },
      transitionTimingFunction: {
        'cinematic': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
};
