/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090c",
          900: "#0b0d10",
          800: "#11151a",
          700: "#1a1f26",
          600: "#262d36",
          500: "#3a4452",
          300: "#9aa4b2",
          100: "#e7ecf2",
        },
        brand: {
          DEFAULT: "#7c5cff",
          400: "#9c83ff",
          600: "#5a3dff",
        },
        mint: "#00d3a7",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
