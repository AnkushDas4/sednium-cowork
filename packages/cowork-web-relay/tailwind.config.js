/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#09090b',
          card: '#121215',
          border: '#27272a',
          emerald: '#10b981',
          amber: '#f59e0b',
          cyan: '#06b6d4',
          violet: '#8b5cf6',
          muted: '#71717a',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
