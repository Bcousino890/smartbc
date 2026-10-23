// Paleta del CRM con apariencia clara u oscura (expediente
// docs/changes/2026-10-23-crm-apariencia). Lo usan tailwind.config.ts y la
// prueba scripts/test-crm-appearance.mts.
//
// Cómo funciona, en una línea: cada utilidad de color se compila como
// `rgb(var(--crm-<familia>-<color>, <color de siempre>) / α)`. Las variables
// SOLO existen dentro de html[data-crm-theme="dark"] (que solo pone la cáscara
// del CRM); en cualquier otro sitio la utilidad cae al color de siempre. No
// hay selectores sobre nombres de clase ni filtros.
//
// Familias por papel, porque un mismo color significa cosas distintas según
// dónde se use (la barra lateral es `bg-ink` y el texto es `text-ink`):
//   bg → fondos y degradados · fg → texto, iconos, cursor · ln → bordes, anillos.
import tw from "tailwindcss/colors.js";

// Colores de marca de hoy (tailwind.config.ts). Fuente única: el config los
// importa de aquí.
export const BRAND = {
  ink: { DEFAULT: "#0a0a0a", soft: "#1a1a1a" },
  navy: { DEFAULT: "#1b2a4a", soft: "#2a3d5a" },
  cream: { DEFAULT: "#f7f3ed", 50: "#fbf8f3", 100: "#f5f0e8", 200: "#ede5d5", 300: "#e1d5bd", deep: "#ece5d5" },
  gold: { DEFAULT: "#c9a96e", light: "#d9bf8a", soft: "#d9bf8a", dark: "#a88a52" },
};

// Colores que no cambian nunca con el tema (excepciones puntuales: texto
// tinta sobre dorado sólido, texto sobre foto).
export const FIXED = { ink: "#0a0a0a", white: "#ffffff" };

// Tokens semánticos del oscuro: carbón cálido, superficies distinguibles,
// blanco roto y dorado contenido.
export const DARK = {
  deep: "#0f0e0c", // bg-ink: barra lateral, botones principales, tooltips
  deepSoft: "#2a2622", // bg-ink-soft: hover de esos botones
  canvas: "#1a1815", // cream-50: lienzo
  canvas2: "#1e1c19", // cream (DEFAULT)
  surface: "#24211d", // white: tarjetas, campos, diálogos
  surface2: "#2b2824", // cream-100
  surface3: "#332f2a", // cream-200, cream-deep
  surface4: "#3e3933", // cream-300
  fg: "#ece6dc", // text-ink
  fgSoft: "#d9d2c6", // text-ink-soft
  accent: "#c9a96e", // gold
  accentText: "#d6b87f", // gold-dark como texto (más claro para leerse sobre carbón)
  navyText: "#a9bad8",
  navySoftText: "#bccae2",
  navyLine: "#3d5079",
};

const STATUS_HUES = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"];
const GRAY_HUES = ["slate", "gray", "zinc", "neutral", "stone"];
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

// Rampa cálida para los grises en oscuro.
const WARM = {
  bg: { 50: "#2b2824", 100: "#312d28", 200: "#3a352f", 300: "#4a443d", 400: "#6b645b", 500: "#7d766c", 600: "#57514a", 700: "#3f3a34", 800: "#2e2a25", 900: "#1f1c19", 950: "#141210" },
  fg: { 400: "#8f877c", 500: "#a39b8f", 600: "#b9b1a5", 700: "#cfc8bd", 800: "#e0d9ce", 900: "#ece6dc", 950: "#f3eee6" },
  ln: { 50: "#2c2924", 100: "#34302a", 200: "#3d3832", 300: "#4d473f", 400: "#6b645b", 500: "#8a8277" },
};

// ---------------------------------------------------------------------------
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16));
}
export const channels = (hex) => hexToRgb(hex).join(" ");
export function mix(a, b, t) {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function luminance(hex) {
  return hexToRgb(hex)
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
// Color resultante de pintar `top` con opacidad α sobre `bottom`.
export const over = (top, alpha, bottom) => mix(bottom, top, alpha);

// ---------------------------------------------------------------------------
// Valores oscuros de cada (familia, color, tono). null = sin variable (el color
// de siempre también en oscuro).
function darkStatus(fam, hue, shade) {
  const H = tw[hue];
  const s = DARK.surface;
  if (fam === "bg") {
    return { 50: mix(s, H[900], 0.22), 100: mix(s, H[900], 0.34), 200: mix(s, H[800], 0.45), 300: mix(s, H[700], 0.6) }[shade] ?? null;
  }
  if (fam === "fg") {
    return { 400: H[400], 500: H[400], 600: H[300], 700: H[300], 800: H[200], 900: H[200], 950: H[100] }[shade] ?? null;
  }
  return { 50: mix(s, H[900], 0.35), 100: mix(s, H[800], 0.45), 200: mix(s, H[700], 0.55), 300: mix(s, H[600], 0.65), 400: H[500], 600: H[500], 700: H[400], 800: H[300], 900: H[200], 950: H[100] }[shade] ?? null;
}
function darkGray(fam, shade) {
  return WARM[fam][shade] ?? null;
}
function darkBrand(fam, name, shade) {
  const D = DARK;
  const table = {
    bg: {
      ink: { DEFAULT: D.deep, soft: D.deepSoft },
      white: { DEFAULT: D.surface },
      cream: { DEFAULT: D.canvas2, 50: D.canvas, 100: D.surface2, 200: D.surface3, deep: D.surface3, 300: D.surface4 },
    },
    fg: {
      ink: { DEFAULT: D.fg, soft: D.fgSoft },
      gold: { dark: D.accentText },
      navy: { DEFAULT: D.navyText, soft: D.navySoftText },
    },
    ln: {
      ink: { DEFAULT: D.fg, soft: D.fgSoft },
      white: { DEFAULT: D.surface },
      cream: { DEFAULT: "#35312b", 50: "#2f2b26", 100: "#35312b", 200: "#3d3832", deep: "#3d3832", 300: "#4a443c" },
      navy: { DEFAULT: D.navyLine, soft: D.navyLine },
    },
  };
  return table[fam]?.[name]?.[shade] ?? null;
}

/** Valor oscuro (hex) o null. */
export function darkValue(fam, name, shade = "DEFAULT") {
  if (STATUS_HUES.includes(name)) return darkStatus(fam, name, shade);
  if (GRAY_HUES.includes(name)) return darkGray(fam, shade);
  return darkBrand(fam, name, shade);
}

export const varName = (fam, name, shade = "DEFAULT") => `--crm-${fam}-${name}${shade === "DEFAULT" ? "" : `-${shade}`}`;

// Opacidad baja = velo. En los neutros de «papel» (white, cream) un velo es
// claro sobre un fondo oscuro (barra lateral, fotos) y se queda como está; en
// la «tinta» (ink) un velo de fondo es el hover suave y en oscuro debe ser
// claro (lee la variable de texto).
export const VEIL_MAX = 0.35;
export function isVeil(opacityValue) {
  if (opacityValue === undefined || opacityValue === null) return false;
  const n = Number(opacityValue);
  return Number.isFinite(n) && n < VEIL_MAX;
}

// ---------------------------------------------------------------------------
const lightPalette = () => {
  const out = { ...BRAND, white: "#ffffff", black: "#000000" };
  for (const h of [...STATUS_HUES, ...GRAY_HUES]) out[h] = tw[h];
  return out;
};

function shadesOf(value) {
  return typeof value === "string" ? { DEFAULT: value } : value;
}

function colorFn(fam, name, shade, lightHex) {
  const ch = channels(lightHex);
  const dark = darkValue(fam, name, shade);
  const paperVeil = (name === "white" || name === "cream") && fam !== "fg";
  const inkVeil = name === "ink" && fam === "bg";
  return ({ opacityValue } = {}) => {
    const a = opacityValue ?? 1;
    if (paperVeil && isVeil(a)) return `rgb(${ch} / ${a})`;
    if (inkVeil && isVeil(a)) return `rgb(var(${varName("fg", "ink", shade)}, ${ch}) / ${a})`;
    if (!dark) return `rgb(${ch} / ${a})`;
    return `rgb(var(${varName(fam, name, shade)}, ${ch}) / ${a})`;
  };
}

/** Colores de una familia, en el formato de `theme.colors` de Tailwind. */
export function family(fam) {
  const out = { inherit: "inherit", current: "currentColor", transparent: "transparent", fixed: FIXED };
  for (const [name, value] of Object.entries(lightPalette())) {
    const shades = shadesOf(value);
    const fns = {};
    for (const [shade, hex] of Object.entries(shades)) fns[shade] = colorFn(fam, name, shade, hex);
    out[name] = typeof value === "string" ? fns.DEFAULT : fns;
  }
  return out;
}

/** Declaraciones del oscuro: { "--crm-bg-ink": "15 14 12", … }. */
export function darkDeclarations() {
  const decl = {};
  for (const fam of ["bg", "fg", "ln"]) {
    for (const [name, value] of Object.entries(lightPalette())) {
      for (const shade of Object.keys(shadesOf(value))) {
        const v = darkValue(fam, name, shade);
        if (v) decl[varName(fam, name, shade)] = channels(v);
      }
    }
  }
  return decl;
}

// Fondo de la cáscara (degradado y halos). Claro = lo de hoy.
export const SHELL = {
  light: { washFrom: "#fbf8f3", washTo: "#f1e9d6", glowA: "rgba(255,235,190,0.45)", glowB: "rgba(201,169,110,0.20)" },
  dark: { washFrom: "#1c1a17", washTo: "#151311", glowA: "rgba(201,169,110,0.07)", glowB: "rgba(201,169,110,0.05)" },
};

// Borde por defecto (`border` sin color) y la regla general de Tailwind.
export const DEFAULT_BORDER = `rgb(var(${varName("ln", "gray", "200")}, ${channels(tw.gray[200])}) / 1)`;
