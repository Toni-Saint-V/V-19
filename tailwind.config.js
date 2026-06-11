/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        base: "var(--bg-base)",
        elevated: "var(--bg-elevated)",
        card: "var(--bg-card)",
        cardSoft: "var(--bg-card-soft)",
        textMain: "var(--text)",
        textSoft: "var(--text-soft)",
        textMuted: "var(--text-muted)",
        role: "var(--role)",
      },
      boxShadow: {
        panel: "var(--shadow-md)",
        float: "var(--shadow-lg)",
      },
      borderRadius: {
        xl: "var(--radius-xl)",
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
      },
    },
  },
  plugins: [],
};
