// Prueba de la apariencia del CRM (expediente docs/changes/2026-10-23-crm-apariencia).
// Offline: solo lógica pura (preferencia por usuario, guion previo a la
// pintura) y la paleta (claro idéntico al de siempre, contraste del oscuro).
import assert from "node:assert/strict";
import vm from "node:vm";
import tw from "tailwindcss/colors.js";
import {
  CRM_THEME_ATTRIBUTE, appearanceStorageKey, parseAppearance, prePaintScript, readAppearance, resolveTheme, writeAppearance,
  type CrmAppearance,
} from "../lib/theme/crm-appearance.ts";
import {
  BRAND, DARK, FIXED, channels, contrast, darkDeclarations, darkValue, family, over, varName,
} from "../lib/theme/crm-palette.mjs";

// ── Preferencia ────────────────────────────────────────────────────────────
assert.equal(parseAppearance(null), "light");
assert.equal(parseAppearance("dark"), "dark");
assert.equal(parseAppearance("system"), "system");
assert.equal(parseAppearance("DARK"), "light");
assert.equal(parseAppearance("auto"), "light");
assert.equal(resolveTheme("light", true), "light");
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const ana = "00000000-0000-4000-8000-0000000000a1";
const bruno = "00000000-0000-4000-8000-0000000000b2";
const store = memory();
assert.equal(readAppearance(store, ana), "light", "sin preferencia guardada: claro");
assert.equal(writeAppearance(store, ana, "dark"), true);
assert.equal(readAppearance(store, ana), "dark");
assert.equal(readAppearance(store, bruno), "light", "otro usuario no hereda la preferencia");
writeAppearance(store, bruno, "system");
assert.equal(readAppearance(store, ana), "dark", "guardar la de Bruno no toca la de Ana");
assert.notEqual(appearanceStorageKey(ana), appearanceStorageKey(bruno));

const broken = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
assert.equal(readAppearance(broken, ana), "light", "almacenamiento roto: claro");
assert.equal(writeAppearance(broken, ana, "dark"), false, "almacenamiento roto: no lanza");
assert.equal(readAppearance(null, ana), "light");
assert.equal(writeAppearance(undefined, ana, "dark"), false);

// ── Guion previo: mismas reglas que resolveTheme(readAppearance(...)) ──────
function runScript(userId: string, stored: string | null | "throw", systemDark: boolean | "throw") {
  const attrs = new Map<string, string>();
  const window = {
    localStorage: { getItem: (k: string) => { if (stored === "throw") throw new Error("blocked"); return k === appearanceStorageKey(userId) ? stored : null; } },
    matchMedia: (q: string) => { if (systemDark === "throw") throw new Error("no matchMedia"); assert.equal(q, "(prefers-color-scheme: dark)"); return { matches: systemDark }; },
  };
  const document = { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } };
  vm.runInNewContext(prePaintScript(userId), { window, document });
  return attrs.get(CRM_THEME_ATTRIBUTE) === "dark" ? "dark" : "light";
}
for (const stored of [null, "light", "dark", "system", "basura"]) {
  for (const sys of [true, false]) {
    const expected = resolveTheme(parseAppearance(stored) as CrmAppearance, sys);
    assert.equal(runScript(ana, stored, sys), expected, `guion: ${stored}/${sys}`);
  }
}
assert.equal(runScript(ana, "throw", true), "light", "guion con almacenamiento bloqueado: claro");
assert.equal(runScript(ana, "system", "throw"), "light", "guion sin matchMedia: claro");
assert.ok(!prePaintScript('x</script><script>alert(1)//').includes("</script>"), "el guion escapa '<'");

// ── Paleta: en claro, cada utilidad da el color de siempre ─────────────────
const light: Record<string, string | Record<string, string>> = { ...BRAND, white: "#ffffff", black: "#000000" };
for (const h of ["red", "amber", "emerald", "rose", "blue", "sky", "green", "gray", "slate", "stone", "violet", "purple", "orange", "yellow", "indigo", "teal"]) light[h] = (tw as Record<string, Record<string, string>>)[h];
const parse = (css: string) => {
  // rgb(var(--x, R G B) / a) | rgb(R G B / a) → { varName?, fallback, alpha }
  const m = /^rgb\((?:var\((--[a-z0-9-]+), ([0-9 ]+)\)|([0-9 ]+)) \/ (.+)\)$/.exec(css);
  assert.ok(m, `formato inesperado: ${css}`);
  return { v: m[1] ?? null, fallback: m[2] ?? m[3], alpha: m[4] };
};
let checked = 0;
for (const fam of ["bg", "fg", "ln"] as const) {
  const colors = family(fam) as Record<string, unknown>;
  for (const [name, value] of Object.entries(light)) {
    const shades = typeof value === "string" ? { DEFAULT: value } : value;
    for (const [shade, hex] of Object.entries(shades)) {
      const entry = colors[name] as ((o: { opacityValue?: string }) => string) | Record<string, (o: { opacityValue?: string }) => string>;
      const fn = typeof entry === "function" ? entry : entry[shade];
      for (const a of ["var(--tw-bg-opacity, 1)", "1", "0.85", "0.5", "0.35", "0.1", "0.05", "0"]) {
        const out = parse(fn({ opacityValue: a }));
        assert.equal(out.fallback, channels(hex), `${fam} ${name}-${shade}/${a}: respaldo = color de siempre`);
        assert.equal(out.alpha, a);
        checked++;
      }
    }
  }
  assert.equal((colors.fixed as typeof FIXED).ink, "#0a0a0a");
}
assert.ok(checked > 1500, `pocas combinaciones comprobadas (${checked})`);

// Las variables del oscuro y las que leen las utilidades son las mismas.
const decl = darkDeclarations();
const used = new Set<string>();
for (const fam of ["bg", "fg", "ln"] as const) {
  const colors = family(fam) as Record<string, unknown>;
  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === "string" || name === "fixed") continue;
    const fns = typeof value === "function" ? { DEFAULT: value } : (value as Record<string, (o: { opacityValue?: string }) => string>);
    for (const fn of Object.values(fns)) for (const a of ["1", "0.1"]) { const v = parse(fn({ opacityValue: a })).v; if (v) used.add(v); }
  }
}
for (const v of used) assert.ok(v in decl, `variable sin valor oscuro: ${v}`);

// Pares clave de la regla general en oscuro.
const bg = (n: string, s = "DEFAULT") => darkValue("bg", n, s) ?? "";
const fg = (n: string, s = "DEFAULT") => darkValue("fg", n, s) ?? "";
assert.equal(bg("ink"), DARK.deep, "bg-ink (barra lateral, botones) sigue oscuro");
assert.equal(fg("ink"), DARK.fg, "text-ink pasa a blanco roto");
assert.equal(darkValue("fg", "cream", "50"), null, "text-cream-* (sobre fondos oscuros) no cambia");
assert.equal(darkValue("fg", "white"), null, "text-white no cambia");
assert.equal(darkValue("bg", "gold"), null, "el dorado de fondo no cambia");
assert.equal(parse((family("bg") as any).white({ opacityValue: "0.1" })).v, null, "bg-white/10 (velo) no cambia");
assert.equal(parse((family("bg") as any).cream["50"]({ opacityValue: "0.08" })).v, null, "bg-cream-50/8 (velo en la barra lateral) no cambia");
assert.equal(parse((family("bg") as any).cream["100"]({ opacityValue: "0.3" })).v, varName("bg", "cream", "100"), "bg-cream-100/30 (panel) pasa a superficie oscura");
assert.equal(parse((family("bg") as any).ink.DEFAULT({ opacityValue: "0.05" })).v, varName("fg", "ink"), "bg-ink/5 (hover) = velo claro en oscuro");
assert.equal(parse((family("bg") as any).ink.DEFAULT({ opacityValue: "0.8" })).v, varName("bg", "ink"), "bg-ink/80 = fondo profundo");

// Contraste del oscuro (WCAG): texto operativo ≥ 4,5:1.
const surfaces = [DARK.canvas, DARK.surface, DARK.surface2];
const min = (color: string) => Math.min(...surfaces.map((s) => contrast(color, s)));
const minAlpha = (alpha: number) => Math.min(...surfaces.map((s) => contrast(over(DARK.fg, alpha, s), s)));
assert.ok(min(DARK.fg) >= 11, "texto principal");
assert.ok(minAlpha(0.6) >= 4.5, "text-ink/60 (secundario) ≥ 4,5");
assert.ok(minAlpha(0.55) >= 4.2, "text-ink/55 ≥ 4,2 (en claro: 4,4 sobre blanco)");
assert.ok(minAlpha(0.4) >= 2.7, "text-ink/40 (terciario) ≥ 2,7 (en claro: 2,7 sobre blanco)");
assert.ok(min(DARK.accent) >= 4.5, "text-gold");
assert.ok(min(DARK.accentText) >= 4.5, "text-gold-dark");
assert.ok(contrast(BRAND.cream[50], DARK.deep) >= 12, "text-cream-50 sobre bg-ink");
assert.ok(contrast(FIXED.ink, BRAND.gold.DEFAULT) >= 4.5, "text-fixed-ink sobre bg-gold");
for (const g of ["gray", "slate", "stone"]) assert.ok(min(fg(g, "500")) >= 4.5, `text-${g}-500`);
for (const h of ["red", "rose", "amber", "orange", "emerald", "green", "blue", "sky", "violet", "purple", "yellow", "indigo", "teal"]) {
  for (const [t, b] of [["700", "50"], ["800", "100"], ["600", "50"], ["900", "100"]]) {
    assert.ok(contrast(fg(h, t), bg(h, b)) >= 4.5, `text-${h}-${t} sobre bg-${h}-${b}: ${contrast(fg(h, t), bg(h, b)).toFixed(2)}`);
  }
  assert.ok(min(fg(h, "600")) >= 4.5, `text-${h}-600 sobre superficies`);
  // Los avisos se distinguen de la superficie (fondo de estado ≠ tarjeta).
  assert.ok(bg(h, "50") !== DARK.surface && contrast(bg(h, "50"), DARK.surface) > 1.04, `bg-${h}-50 se distingue de la tarjeta`);
}
// Superficies distinguibles entre sí.
assert.ok(contrast(DARK.surface, DARK.canvas) > 1.1, "tarjeta ≠ lienzo");
assert.ok(contrast(DARK.surface3, DARK.surface) > 1.1, "cream-200 ≠ tarjeta");

console.log(`crm-appearance OK (${checked} utilidades en claro, ${Object.keys(decl).length} variables del oscuro)`);
