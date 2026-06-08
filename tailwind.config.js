/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: "#090b12",
          panel: "#121622",
          panelSoft: "#191f2e",
          line: "#283146",
          mint: "#38e4a9",
          gold: "#f7c948",
          blue: "#5ea7ff",
          coral: "#ff7a7a"
        }
      },
      boxShadow: {
        glow: "0 0 30px rgba(56, 228, 169, 0.18)"
      }
    }
  },
  plugins: []
};
