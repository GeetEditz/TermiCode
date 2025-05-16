/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1E293B",
        secondary: "#334155",
        accent: "#3B82F6",
        background: {
          light: "#F8FAFC",
          dark: "#0F172A",
        },
        text: {
          light: "#1E293B",
          dark: "#F8FAFC",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [],
} 