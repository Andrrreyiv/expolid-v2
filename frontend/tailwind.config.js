/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0f1d3a",
          50: "#eef1f7",
          100: "#d6dde8",
          500: "#1e3261",
          600: "#162848",
          700: "#0f1d3a",
          800: "#0a1428",
        },
        accent: {
          DEFAULT: "#fbbf24",
          warm: "#f59e0b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
