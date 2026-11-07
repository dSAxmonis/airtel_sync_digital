/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff2f2',
          100: '#ffe1e1',
          200: '#ffc7c7',
          300: '#ff9d9d',
          400: '#f86464',
          500: '#ee2b2b',
          600: '#e40000', // brand red
          700: '#c10000',
          800: '#9c0505',
          900: '#7a0a0a',
        },
        ink: {
          DEFAULT: '#1f1f23',
          soft: '#3d3d45',
          muted: '#6b6b76',
          faint: '#a3a3ad',
        },
        night: '#1b1b1f', // dark hero band
        paper: '#f6f6f8', // app canvas
        line: '#ececf0', // hairline borders
        ok: { 50: '#ecfdf3', 100: '#d1fadf', 600: '#16a34a', 700: '#15803d' },
        warn: { 50: '#fff8eb', 100: '#feefc7', 600: '#f59e0b', 700: '#b45309' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 20, 30, 0.04), 0 4px 16px rgba(20, 20, 30, 0.04)',
        soft: '0 8px 30px rgba(20, 20, 30, 0.07)',
        pop: '0 16px 40px -8px rgba(20, 20, 30, 0.16)',
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem' },
    },
  },
  plugins: [],
};
