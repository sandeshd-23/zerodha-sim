/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        kite: {
          blue: '#387ed1',
          blueHover: '#2b6cb8',
          orange: '#ff5722',
          orangeHover: '#e64a19',
          green: '#4caf50',
          red: '#df514c',
          bg: '#f9f9f9',
          surface: '#ffffff',
          border: '#ebebeb',
          text: '#444444',
          muted: '#9b9b9b',
          darkBg: '#121418',
          darkSurface: '#1b1e24',
          darkBorder: '#2a2e37',
          darkText: '#e2e5ec',
          darkMuted: '#858d9d',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
