/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          950: '#07070b',
          900: '#0e0e14',
          800: '#16161f',
          700: '#1e1e2a',
          600: '#2a2a38',
          500: '#3a3a4a',
          400: '#5c5c6e',
          300: '#8a8aa0',
          200: '#c4c4d2',
          100: '#e8e8ef',
        },
        brand: {
          DEFAULT: '#00d9ff',
          glow: '#00e5ff',
          soft: '#00a5c7',
        },
        good: '#10b981',
        bad: '#ef4444',
        warn: '#f59e0b',
      },
      boxShadow: {
        'glow': '0 0 0 1px rgba(0,217,255,0.15), 0 8px 32px -8px rgba(0,217,255,0.25)',
        'soft': '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'grid-fade': 'radial-gradient(ellipse at top, rgba(0,217,255,0.08), transparent 50%)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'pulse-dot': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
        'shimmer': { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.3s ease-out',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [],
};
