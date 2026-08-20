import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0a0a0a",
          soft: "#1a1a1a",
        },
        navy: {
          DEFAULT: "#1b2a4a",
          soft: "#2a3d5a",
        },
        cream: {
          DEFAULT: "#f7f3ed",
          50: "#fbf8f3",
          100: "#f5f0e8",
          200: "#ede5d5",
          300: "#e1d5bd",
          deep: "#ece5d5",
        },
        gold: {
          DEFAULT: "#c9a96e",
          light: "#d9bf8a",
          soft: "#d9bf8a",
          dark: "#a88a52",
        },
      },
      fontFamily: {
        // Cinzel/Playfair/Inter siguen siendo los tokens de las superficies
        // públicas protegidas (/web, /v, /s, /compartir, /c). NO redefinirlos:
        // el CRM interno usa los tokens crm-* de abajo (sistema EMAAR).
        display: ["var(--font-cinzel)", "serif"],
        serif: ["var(--font-playfair)", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        // Sistema EMAAR del CRM interno. Los stacks viven como variables CSS en
        // app/globals.css para que el swap de Optima licenciada sea un cambio
        // de una línea (ver OPTIMA_LICENSE_REQUIRED en app/layout.tsx).
        "crm-sans": ["var(--crm-font-sans)"],
        "crm-display": ["var(--crm-font-display)"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      backgroundImage: {
        "luxury-gradient":
          "linear-gradient(135deg, #f5f0e8 0%, #ede5d5 50%, #e1d5bd 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
