/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#c91a2b',
          600: '#b8172a',
          700: '#991424',
          800: '#7f1d1d',
          900: '#65191f',
        },
        gold: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#f7dcaf',
          500: '#d28d30',
          600: '#ca8a21',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
        },
        tan: '#d0ab85',
      },
    },
  },
  plugins: [],
}
