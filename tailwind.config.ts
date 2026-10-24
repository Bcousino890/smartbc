import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import {
  BRAND,
  DEFAULT_BORDER,
  FIXED,
  SHELL,
  darkDeclarations,
  family,
} from "./lib/theme/crm-palette.mjs";

// Apariencia del CRM (docs/changes/2026-10-23-crm-apariencia): las utilidades
// de color se resuelven por papel (fondo, contenido, línea). Fuera de
// html[data-crm-theme="dark"] cada una da exactamente el color de siempre; ver
// lib/theme/crm-palette.mjs.
const bg = family("bg");
const fg = family("fg");
const ln = family("ln");

const darkVars = darkDeclarations();
const shellVars = (s: typeof SHELL.dark) => ({
  "--crm-shell-wash-from": s.washFrom,
  "--crm-shell-wash-to": s.washTo,
  "--crm-shell-glow-a": s.glowA,
  "--crm-shell-glow-b": s.glowB,
});

const crmAppearance = plugin(({ addBase }) => {
  addBase({
    // Solo en pantalla: imprimir una página del CRM sale en claro.
    "@media screen": {
      'html[data-crm-theme="dark"]': {
        colorScheme: "dark",
        ...darkVars,
        ...shellVars(SHELL.dark),
      },
    },
    // Frontera clara: lo protegido incrustado en el CRM (portadas de catálogo,
    // vistas previas) vuelve a los colores de siempre aunque el CRM esté en
    // oscuro. `initial` deja la variable sin valor → cada utilidad usa su
    // color de respaldo.
    ".crm-theme-light": {
      colorScheme: "light",
      ...Object.fromEntries([...Object.keys(darkVars), ...Object.keys(shellVars(SHELL.dark))].map((k) => [k, "initial"])),
    },
  });
});

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    backgroundColor: bg,
    gradientColorStops: bg,
    textColor: fg,
    fill: { none: "none", ...fg },
    stroke: { none: "none", ...fg },
    placeholderColor: fg,
    caretColor: fg,
    textDecorationColor: fg,
    accentColor: { ...fg, auto: "auto" },
    borderColor: { ...ln, DEFAULT: DEFAULT_BORDER },
    divideColor: { ...ln, DEFAULT: DEFAULT_BORDER },
    outlineColor: ln,
    ringColor: { ...ln, DEFAULT: "#3b82f6" },
    ringOffsetColor: ln,
    extend: {
      colors: {
        ...BRAND,
        fixed: FIXED,
      },
      keyframes: {
        zfIn: {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
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
  plugins: [crmAppearance],
};

export default config;
