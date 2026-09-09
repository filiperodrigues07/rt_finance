import type { Config } from "tailwindcss";

/** Tokens via CSS variables (src/index.css). Dark é o padrão. Estilo: luxo minimalista. */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
        },
        // alias legado — muitos componentes ainda usam `brand`; aponta para o acento
        brand: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          fg: "rgb(var(--accent-fg) / <alpha-value>)",
        },
        positive: "rgb(var(--positive) / <alpha-value>)",
        negative: "rgb(var(--negative) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Playfair Display"', "Georgia", "Times New Roman", "serif"],
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        sm: "0 1px 2px rgb(0 0 0 / 0.14)",
        card: "0 1px 2px rgb(0 0 0 / 0.12), 0 6px 20px -12px rgb(0 0 0 / 0.4)",
        pop: "0 1px 2px rgb(0 0 0 / 0.2), 0 12px 40px -12px rgb(0 0 0 / 0.5)",
      },
      keyframes: {
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 0.24s cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
