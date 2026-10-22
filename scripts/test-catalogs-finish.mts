/**
 * Tests del acabado fotográfico (BCP-01 ampliación, PR7b): tono adaptativo
 * por foto (recetas y medidas sobre las dos fotografías reales del repositorio,
 * un recorte real de tono medio y una foto oscura SIMULADA), determinismo,
 * original intacto, variante tratada del proxy, peso por foto, rutas con y sin
 * acabado, instantánea → contrato público, fotos del PDF, contraste del título
 * de portada y las piezas de CSS y del PDF (filete). Puros: sin base de datos,
 * red ni IA; `sharp` sobre `public/portal-hero.jpg` y `public/login-bg.jpg`.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-finish.mts
 * Con FINISH_REPORT=<carpeta> guarda además las fotos antes/después y las
 * medidas (para las capturas del expediente).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import {
  applyTone,
  classifyTone,
  CLIPPED_LUMA,
  measureTone,
  TONE_RECIPE_VERSION,
  TONE_SAMPLE_MAX,
  toneCurve,
  toneRecipeFor,
  type ToneStats,
} from "../lib/catalogs/photo-tone.ts";
import { photoToneRecipe, renderPhotoVariant } from "../lib/catalogs/photo-variant.ts";
import { effectivePhotos, FINISH_PARAM, isFinishedSrc, parseFinishParam, photoSrc, withWidth } from "../lib/catalogs/photo-selection.ts";
import { photoKeyOf } from "../lib/catalogs/photo-data.ts";
import { coverPhotoOf, toPublicCatalog, type InternalSnapshot } from "../lib/catalogs/to-public.ts";
import { photoNeeds } from "../lib/catalogs/export/generate.ts";
import { codedPhotoSvg } from "../lib/catalogs/export/fixture-photo.ts";

let failures = 0;
let passes = 0;
function check(name: string, cond: unknown, detail?: string) {
  if (cond) passes++;
  else {
    failures++;
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`· ${t}`);
}
const md5 = (b: Buffer | Uint8Array) => createHash("md5").update(b).digest("hex");
const f3 = (x: number) => x.toFixed(3);
const pct = (x: number) => `${(x * 100).toFixed(2)} %`;
const REPORT = process.env.FINISH_REPORT || null;
if (REPORT) mkdirSync(REPORT, { recursive: true });

/** Medidas de una imagen codificada, con el MISMO método que la receta
 *  (muestra de TONE_SAMPLE_MAX px de lado mayor). */
async function measure(buf: Buffer): Promise<ToneStats> {
  const { data, info } = await sharp(buf, { failOn: "none" })
    .resize({ width: TONE_SAMPLE_MAX, height: TONE_SAMPLE_MAX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return measureTone(new Uint8Array(data.buffer, data.byteOffset, data.length), info.channels);
}

// ── 0 · Fotos de prueba ─────────────────────────────────────────────────────
// Como se guardan (lib/sync/watermark.ts): WebP 86, ≤ 2.560 px.
const stored = async (input: sharp.Sharp) => input.resize({ width: 2560, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
const PHOTOS: Array<{ id: string; label: string; real: boolean; expect: "luminosa" | "media" | "oscura"; buf: Buffer }> = [
  { id: "exterior", label: "portal-hero.jpg · exterior luminosa (real)", real: true, expect: "luminosa", buf: await stored(sharp("public/portal-hero.jpg")) },
  { id: "salon", label: "login-bg.jpg · salón luminoso (real)", real: true, expect: "luminosa", buf: await stored(sharp("public/login-bg.jpg")) },
  {
    id: "medio",
    label: "login-bg.jpg · recorte del sofá, tono medio (real, recortada)",
    real: true,
    expect: "media",
    buf: await stored(sharp("public/login-bg.jpg").extract({ left: 1200, top: 900, width: 1200, height: 900 })),
  },
  {
    id: "oscura",
    label: "login-bg.jpg oscurecida −1,7 EV · SIMULADA (no hay fotos oscuras reales en el repositorio)",
    real: false,
    expect: "oscura",
    buf: await stored(sharp("public/login-bg.jpg").linear(0.55, 0)),
  },
];

// ── 1 · Recetas y medidas antes / después ──────────────────────────────────
section("recetas y medidas (fotos reales y la oscura simulada)");
const report: Array<Record<string, unknown>> = [];
for (const ph of PHOTOS) {
  const srcHash = md5(ph.buf);
  const before = await measure(ph.buf);
  const recipe = await photoToneRecipe(ph.buf);
  const v = await renderPhotoVariant(ph.buf, null, "image/webp", { tone: true });
  const after = await measure(v.data);
  const tag = `${ph.id}`;
  check(`${tag}: receta «${ph.expect}»`, recipe.name === ph.expect && classifyTone(before) === ph.expect, `${recipe.name} (media ${f3(before.mean)}, P98 ${f3(before.p98)}, quemados ${pct(before.clipped)})`);
  check(`${tag}: cabecera X-Bcp-Tone v${TONE_RECIPE_VERSION}/${ph.expect}`, v.tone === `v${TONE_RECIPE_VERSION}/${ph.expect}`, String(v.tone));
  check(`${tag}: los píxeles quemados no aumentan`, after.clipped <= before.clipped, `${pct(before.clipped)} → ${pct(after.clipped)}`);
  check(`${tag}: saturación como mucho +5 % y dominante como mucho ±3 %`, recipe.saturation <= 1.05 && recipe.gains.every((g) => g >= 0.96 && g <= 1.04), `${recipe.saturation} ${recipe.gains.map(f3).join("/")}`);
  if (ph.expect === "luminosa") {
    check(`${tag}: luminosa → NO sube el brillo (media)`, after.mean <= before.mean, `${f3(before.mean)} → ${f3(after.mean)}`);
    check(`${tag}: luminosa → recupera altas luces (P98 no sube)`, after.p98 <= before.p98, `${f3(before.p98)} → ${f3(after.p98)}`);
    check(`${tag}: luminosa → oscurece poco (media −3 % como mucho)`, after.mean >= before.mean * 0.97, `${f3(before.mean)} → ${f3(after.mean)}`);
  } else if (ph.expect === "media") {
    check(`${tag}: media → corrección mínima (media ±2 %)`, Math.abs(after.mean - before.mean) / before.mean <= 0.02, `${f3(before.mean)} → ${f3(after.mean)}`);
  } else {
    check(`${tag}: oscura → abre las sombras (la media sube)`, after.mean > before.mean + 0.03, `${f3(before.mean)} → ${f3(after.mean)}`);
    check(`${tag}: oscura → sin quemar (P98 ≤ 0,95)`, after.p98 <= 0.95, f3(after.p98));
    check(`${tag}: oscura → ajuste moderado (media +0,08 como mucho)`, after.mean <= before.mean + 0.09, `${f3(before.mean)} → ${f3(after.mean)}`);
  }
  // Determinismo: misma foto → mismos bytes; la receta no depende del ancho.
  const v2 = await renderPhotoVariant(ph.buf, null, "image/webp", { tone: true });
  check(`${tag}: determinista (misma foto → mismos bytes)`, v2.data.equals(v.data));
  const w1 = await renderPhotoVariant(ph.buf, 1600, "image/webp", { tone: true });
  const w2 = await renderPhotoVariant(ph.buf, 1600, "image/webp", { tone: true });
  const w640 = await renderPhotoVariant(ph.buf, 640, "image/webp", { tone: true });
  const srcW = (await sharp(ph.buf).metadata()).width ?? 0;
  check(`${tag}: con ?w= también determinista y con la MISMA receta en todos los anchos`, w1.data.equals(w2.data) && w1.tone === v.tone && w640.tone === v.tone && w1.variant === (srcW > 1600 ? "w1600" : "original") && w640.variant === "w640", `${w1.variant} ${w640.variant}`);
  check(`${tag}: el original no se toca (mismos bytes antes y después)`, md5(ph.buf) === srcHash);
  // Peso por foto, antes (variante sin tratar) y después (tratada), por ancho.
  const weights: Record<string, [number, number]> = {};
  for (const w of [640, 1080, 1600, null] as const) {
    const plain = await renderPhotoVariant(ph.buf, w, "image/webp");
    const toned = w === 1600 ? w1 : w === 640 ? w640 : w === null ? v : await renderPhotoVariant(ph.buf, w, "image/webp", { tone: true });
    weights[w === null ? "original" : `w${w}`] = [plain.data.length, toned.data.length];
  }
  const worst = Math.max(...Object.values(weights).map(([a, b]) => b / a));
  check(`${tag}: peso de la variante tratada ≤ +12 % del de la variante sin tratar`, worst <= 1.12, Object.entries(weights).map(([k, [a, b]]) => `${k} ${Math.round(a / 1024)}→${Math.round(b / 1024)} KB`).join(", "));
  report.push({ id: ph.id, label: ph.label, real: ph.real, recipe: recipe.name, gains: recipe.gains, lift: recipe.lift, contrast: recipe.contrast, top: recipe.top, saturation: recipe.saturation, before, after, weights });
  if (REPORT) {
    writeFileSync(`${REPORT}/${ph.id}-antes.webp`, ph.buf);
    writeFileSync(`${REPORT}/${ph.id}-despues.webp`, v.data);
  }
  console.log(
    `  ${ph.id.padEnd(9)} ${recipe.name.padEnd(9)} media ${f3(before.mean)} → ${f3(after.mean)} · P98 ${f3(before.p98)} → ${f3(after.p98)} · quemados ${pct(before.clipped)} → ${pct(after.clipped)} · ${Object.entries(weights).map(([k, [a, b]]) => `${k} ${Math.round(a / 1024)}→${Math.round(b / 1024)} KB`).join(", ")}`,
  );
}

// ── 2 · Receta pura: curva, límites y autocomprobación ─────────────────────
section("receta pura");
{
  const flat = (v: number, n = 64 * 64) => {
    const px = new Uint8Array(n * 3);
    px.fill(v);
    return px;
  };
  // Todo quemado: no hay forma de cumplir «no sube»… salvo bajar; nunca sube.
  const white = toneRecipeFor(flat(255), 3);
  check("foto blanca: luminosa y sin píxeles quemados después", white.recipe.name === "luminosa" && white.predicted.clipped < white.before.clipped);
  const black = toneRecipeFor(flat(2), 3);
  check("foto negra: el negro sigue negro (f(0) = 0, nada de velo gris)", toneCurve(black.recipe, 0) === 0 && black.predicted.mean < 0.03, black.recipe.name);
  for (const name of ["luminosa", "media", "oscura"] as const) {
    const r = { ...white.recipe, name, knee: 0.6, top: name === "oscura" ? 0.95 : 0.97, lift: name === "oscura" ? 0.6 : 0, contrast: name === "media" ? 0.12 : 0, pivot: 0.45 };
    let mono = true;
    let prev = -1;
    for (let i = 0; i <= 255; i++) {
      const y = toneCurve(r, i / 255);
      if (y < prev - 1e-12) mono = false;
      prev = y;
    }
    check(`curva «${name}» monótona, con f(0) = 0 y techo < 250/255`, mono && toneCurve(r, 0) === 0 && toneCurve(r, 1) < CLIPPED_LUMA);
  }
  const src = flat(120);
  const copy = new Uint8Array(src);
  applyTone(src, 3, toneRecipeFor(src, 3).recipe);
  check("applyTone no modifica la entrada", Buffer.from(src).equals(Buffer.from(copy)));
  const rgba = new Uint8Array([10, 20, 30, 77, 200, 210, 220, 128]);
  const outA = applyTone(rgba, 4, toneRecipeFor(rgba, 4).recipe);
  check("con alfa: el canal alfa se copia tal cual", outA[3] === 77 && outA[7] === 128);
}
{
  // Bytes ilegibles: la variante sin tratar (aquí, el original) y `fallback`.
  const v = await renderPhotoVariant(Buffer.from("no es una imagen"), 1080, "image/webp", { tone: true });
  check("tratamiento imposible → `X-Bcp-Tone: fallback` y la foto sin tratar, nunca un hueco", v.tone === "fallback" && v.data.toString() === "no es una imagen");
  const svg = Buffer.from(codedPhotoSvg("u-fin", 1600, 1067, "fin"));
  const t = await renderPhotoVariant(svg, 1080, "image/svg+xml", { tone: true });
  const m = await sharp(t.data).metadata();
  check("las fotos sintéticas (SVG de las fixtures) también se tratan: WebP de 1080 px", t.variant === "w1080" && m.format === "webp" && m.width === 1080 && /^v1\//.test(t.tone ?? ""), `${t.variant} ${m.format} ${m.width} ${t.tone}`);
  const plain = await renderPhotoVariant(svg, 1080, "image/svg+xml");
  check("sin acabado, la variante de siempre (sin cabecera de tono)", plain.tone === undefined && plain.variant === "w1080");
}

// ── 3 · Rutas con y sin acabado ─────────────────────────────────────────────
section("rutas");
{
  const p = { proxyIdx: 2, key: "0123456789abcdef", v: "a1b2c3d4" };
  check("sin acabado: la ruta de siempre", photoSrc("piso-x", p) === "/p/piso-x/2.webp?f=0123456789abcdef&v=a1b2c3d4" && photoSrc("piso-x", p, false) === photoSrc("piso-x", p));
  check("con acabado: &t=<versión de la receta>", photoSrc("piso-x", p, true) === `/p/piso-x/2.webp?f=0123456789abcdef&v=a1b2c3d4&t=${TONE_RECIPE_VERSION}` && FINISH_PARAM === "t");
  check("sin clave: ?t=", photoSrc("piso-x", { proxyIdx: 0, key: null, v: "x" }, true) === `/p/piso-x/0.webp?t=${TONE_RECIPE_VERSION}`);
  check("combinable con ?w= (el lector añade el ancho)", withWidth(photoSrc("piso-x", p, true), 1600).endsWith(`&t=${TONE_RECIPE_VERSION}&w=1600`));
  check("isFinishedSrc reconoce la ruta tratada y no la de siempre", isFinishedSrc(photoSrc("piso-x", p, true)) && isFinishedSrc(withWidth(photoSrc("piso-x", p, true), 640)) && !isFinishedSrc(photoSrc("piso-x", p)) && !isFinishedSrc(null) && !isFinishedSrc("/p/x/0.webp?f=t=1"));
  check("parseFinishParam: solo una versión válida (1–999)", parseFinishParam("1") && parseFinishParam("12") && !parseFinishParam(null) && !parseFinishParam("0") && !parseFinishParam("") && !parseFinishParam("1a") && !parseFinishParam("-1") && !parseFinishParam("1000"));
}

// ── 4 · Instantánea → contrato público ──────────────────────────────────────
section("instantánea → contrato público");
const K = (s: string) => photoKeyOf(`00000000-0000-4000-8000-${s.padStart(12, "0")}`);
const base = {
  zone: "Madrid", subzone: "Chamberí", operation: "sale", operations: null, price: 500000, rent_price: null, currency: "eur", status: "available",
  bedrooms: 2, bathrooms: 1, square_meters: 80, description: null, features: null, features_manual: null, floor_override: null, clean: null,
};
const items = [
  { ...base, key: "kA000000000001", slug: "piso-a", title: "Piso A", pp: { x: [K("a3")], o: K("a1") }, photos: [
    { u: "a0", f: K("a0"), w: 2560, h: 1707, c: true },
    { u: "a1", f: K("a1"), w: 1600, h: 1067, c: false },
    { u: "a2", f: K("a2"), w: 1600, h: 1067, c: false },
    { u: "a3", f: K("a3"), w: 1600, h: 1067, c: false },
    { u: "a2", f: K("a2dup"), w: 1600, h: 1067, c: false },
  ] },
  { ...base, key: "kB000000000002", slug: "piso-b", title: "Piso B", photos: [{ u: "b0", f: K("b0"), w: 1000, h: 1500, c: true }] },
];
const off = { title: "Prueba", intro: null, created_at: "2026-10-01T09:00:00Z", status: "active", owner_name: "Prueba", contact: null, lang: "es", items } as unknown as InternalSnapshot;
// Lo que da 0227 con el acabado activo y la foto a2 (por su duplicado) marcada «sin acabado».
const on = { ...off, fin: true, items: [{ ...items[0], pp: { ...items[0].pp, n: [K("a2dup")] } }, items[1]] } as unknown as InternalSnapshot;
// Lo que había ANTES de 0227 (sin la clave «fin» ni «n»): el contrato debe ser idéntico al de «apagado».
{
  const pubOff = toPublicCatalog(off);
  const pubOffMarked = toPublicCatalog({ ...off, items: [{ ...items[0], pp: { ...items[0].pp, n: [K("a2")] } }, items[1]] } as unknown as InternalSnapshot);
  check("apagado: ninguna ruta lleva el acabado", !JSON.stringify(pubOff).includes("t=1"));
  check("apagado: aunque lleguen marcas, el contrato es el mismo (no las mira)", JSON.stringify(pubOffMarked) === JSON.stringify(pubOff));
  const pubOn = toPublicCatalog(on);
  const a = pubOn.items[0];
  check("activado: las fotos en uso van tratadas salvo la marcada (por cualquiera de sus filas)", a.photos.map((p) => isFinishedSrc(p.src)).join(",") === "true,true,false", a.photos.map((p) => p.src).join(" "));
  check("activado: la foto excluida sigue fuera; mismas claves, mismo orden, misma apertura", a.photos.map((p) => p.key).join() === pubOff.items[0].photos.map((p) => p.key).join() && a.coverIndex === pubOff.items[0].coverIndex);
  check("activado: el contrato no gana campos (solo cambian las rutas)", JSON.stringify(Object.keys(pubOn).sort()) === JSON.stringify(Object.keys(pubOff).sort()) && JSON.stringify(Object.keys(a.photos[0]).sort()) === JSON.stringify(Object.keys(pubOff.items[0].photos[0]).sort()));
  const strip = (s: string) => s.replace(/&t=1/g, "");
  check("activado: quitando `&t=1` el contrato es exactamente el de apagado", strip(JSON.stringify(pubOn)) === JSON.stringify(pubOff));
  check("activado: la portada (apertura de la primera vivienda) va tratada", isFinishedSrc(pubOn.coverPhoto) && strip(pubOn.coverPhoto ?? "") === pubOff.coverPhoto);
  check("coverPhotoOf desde la instantánea (HOME y Diseño) también", coverPhotoOf(on) === pubOn.coverPhoto && coverPhotoOf(off) === pubOff.coverPhoto);
  const eff = effectivePhotos(items[0].photos, { x: [], o: null, n: [K("a2")] });
  check("effectivePhotos: noFinish por URL (la marca de una fila vale para la foto)", eff.all.find((p) => p.u === "a2")?.noFinish === true && eff.all.find((p) => p.u === "a0")?.noFinish === false);
}

// ── 5 · Fotos del PDF ───────────────────────────────────────────────────────
section("fotos del PDF");
{
  const nOff = photoNeeds(off, "any");
  const nOn = photoNeeds(on, "any");
  check("apagado: ninguna foto del PDF se pide tratada", [...nOff.values()].every((n) => n.tone === undefined));
  check("activado: las MISMAS fotos y anchos que sin acabado", JSON.stringify([...nOn].map(([k, n]) => [k, n.key, n.width])) === JSON.stringify([...nOff].map(([k, n]) => [k, n.key, n.width])));
  const pubOn = toPublicCatalog(on);
  const ok = [...nOn].every(([id, n]) => {
    if (id === "cover") return n.tone === true;
    const [key, idx] = id.split("#");
    const it = pubOn.items.find((x) => x.key === key)!;
    return (n.tone === true) === isFinishedSrc(it.photos[Number(idx)].src);
  });
  check("activado: cada foto del PDF tratada si y solo si el lector la trata (y la portada)", ok);
}

// ── 6 · Contraste del título de portada (peor 5 % del fondo) ───────────────
section("contraste del título de portada");
// Modelo de la portada del lector: la foto a sangre (object-fit: cover), el
// velo vertical (0,85 → 0,65 → 0,92) y el plano (0,25), compuestos en sRGB
// como el navegador. El título ocupa la banda central (38–62 % del alto,
// 10–90 % del ancho). Contraste WCAG del crema #fbf8f3 sobre el percentil 95
// de la luminancia del fondo en esa banda.
function lin(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const CREAM_L = lum(0xfb, 0xf8, 0xf3);
async function titleContrast(buf: Buffer, w: number, h: number): Promise<number> {
  const { data, info } = await sharp(buf).resize({ width: w, height: h, fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ink = 10;
  const ls: number[] = [];
  for (let y = Math.floor(h * 0.38); y < Math.ceil(h * 0.62); y++) {
    const t = y / (h - 1);
    const a1 = t <= 0.5 ? 0.85 + (0.65 - 0.85) * (t / 0.5) : 0.65 + (0.92 - 0.65) * ((t - 0.5) / 0.5);
    for (let x = Math.floor(w * 0.1); x < Math.ceil(w * 0.9); x++) {
      const i = (y * info.width + x) * info.channels;
      const c = [0, 1, 2].map((k) => {
        const v1 = data[i + k] * (1 - a1) + ink * a1;
        return v1 * 0.75 + ink * 0.25;
      });
      ls.push(lum(c[0], c[1], c[2]));
    }
  }
  ls.sort((p, q) => p - q);
  const l95 = ls[Math.floor(ls.length * 0.95)];
  return (CREAM_L + 0.05) / (l95 + 0.05);
}
const contrast: Record<string, Record<string, [number, number]>> = {};
for (const ph of PHOTOS) {
  const toned = (await renderPhotoVariant(ph.buf, null, "image/webp", { tone: true })).data;
  contrast[ph.id] = {};
  for (const [vw, vh] of [[1440, 900], [390, 844]] as const) {
    const before = await titleContrast(ph.buf, vw, vh);
    const after = await titleContrast(toned, vw, vh);
    contrast[ph.id][`${vw}x${vh}`] = [before, after];
    check(`${ph.id} ${vw}×${vh}: contraste del título ≥ 4,5:1 con el acabado`, after >= 4.5, after.toFixed(2));
    if (ph.expect === "luminosa") check(`${ph.id} ${vw}×${vh}: con foto clara el contraste no baja`, after >= before - 1e-9, `${before.toFixed(2)} → ${after.toFixed(2)}`);
    else if (ph.expect === "media") check(`${ph.id} ${vw}×${vh}: el contraste apenas cambia (±5 %)`, Math.abs(after - before) / before <= 0.05, `${before.toFixed(2)} → ${after.toFixed(2)}`);
    // Oscura: abrir las sombras aclara el fondo, así que el contraste baja algo,
    // pero parte de muy arriba (el velo no cambia): sigue el doble de AA.
    else check(`${ph.id} ${vw}×${vh}: foto oscura: el contraste baja poco y sigue ≥ 9:1`, after >= 9 && after >= before * 0.9, `${before.toFixed(2)} → ${after.toFixed(2)}`);
  }
  console.log(`  ${ph.id.padEnd(9)} contraste del título ${Object.entries(contrast[ph.id]).map(([k, [a, b]]) => `${k} ${a.toFixed(2)} → ${b.toFixed(2)}`).join(" · ")}`);
}

// ── 7 · Fuente: proxy, fixtures, CSS del filete, lector y PDF ──────────────
section("fuente");
{
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const proxy = read("../app/p/[slug]/[idx]/route.ts");
  check("/p: `t` con parseFinishParam, combinable con w, y X-Bcp-Tone", proxy.includes('parseFinishParam(search.get("t"))') && proxy.includes("renderPhotoVariant(source, width, contentType, { tone })") && proxy.includes('"X-Bcp-Tone"'));
  check("/p: sin w ni t sigue sirviendo el original en streaming (y el Range de siempre)", proxy.includes("if (!width && !tone)") && proxy.includes("rangeHeader && !width && !tone"));
  check("/p: la variante tratada se cachea igual (24 h en CDN)", (proxy.match(/public, max-age=86400, s-maxage=86400/g) ?? []).length >= 2);
  const fx = read("../app/dev-fixtures/foto/[slug]/[idx]/route.ts");
  check("fixtures: la ruta de fotos sintéticas honra `t` con la misma regla", fx.includes('parseFinishParam(search.get("t"))') && fx.includes("{ tone }") && fx.includes("X-Bcp-Tone"));
  const coverCss = read("../components/catalogs/catalog-cover.module.css");
  const rule = /\.finishRule\s*\{([^}]*)\}/.exec(coverCss)?.[1] ?? "";
  check("portada: filete de 1 px, blanco translúcido de baja opacidad, inset uniforme, sin eventos", /border:\s*1px solid rgba\(251, 248, 243, 0\.(1|2|3)\d*\)/.test(rule) && /inset:\s*[\d.]+em;/.test(rule) && rule.includes("pointer-events: none"), rule);
  check("portada: el velo NO cambia (vertical 0,85/0,65/0,92 y plano 0,25)", coverCss.includes("background: linear-gradient(to bottom, rgba(10, 10, 10, 0.85), rgba(10, 10, 10, 0.65) 50%, rgba(10, 10, 10, 0.92));") && /\.veil2\s*\{[^}]*rgba\(10, 10, 10, 0\.25\)/.test(coverCss));
  check("sin esquinas ni dorados en el acabado", !/finish[\s\S]{0,400}(gold|#c9a96e|corner|esquina)/i.test(coverCss.slice(coverCss.indexOf(".finishRule"))));
  const readerCss = read("../components/catalogs/reader/reader.module.css");
  const rr = /\.finishRule\s*\{([^}]*)\}/.exec(readerCss)?.[1] ?? "";
  check("apertura: filete de 1 px, blanco translúcido, inset uniforme, sin eventos", /border:\s*1px solid rgba\(255, 255, 255, 0\.[1-4]\d*\)/.test(rr) && /inset:\s*\d+px;/.test(rr) && rr.includes("pointer-events: none") && rr.includes("position: absolute"), rr);
  const cover = read("../components/catalogs/catalog-cover.tsx");
  const pages = read("../components/catalogs/reader/pages.tsx");
  check("el filete solo acompaña a una foto tratada (portada y apertura)", cover.includes("isFinishedSrc(data.photoUrl) ? <div className={styles.finishRule}") && pages.includes("isFinishedSrc(p.src) ? <span aria-hidden=\"true\" className={styles.finishRule}"));
  check("miniaturas y galería: solo el tono (sin filete)", (pages.match(/finishRule/g) ?? []).length === 1);
  const doc = read("../lib/pdf/catalog/document.ts");
  check("PDF: filete vectorial en la portada y en la apertura, solo con la foto tratada (el dato viaja con la foto, no con su ruta)", doc.includes("if (photo.finish) layers.push(finishRule(") && doc.includes("PRINT_BOXES.opening.h, 0.66, true)") && doc.includes("if (!rule || !photo.finish)") && (doc.match(/finishRule\(/g) ?? []).length === 3);
  const gen = read("../lib/catalogs/export/generate.ts");
  const wp = read("../lib/pdf/catalog/worker-protocol.ts");
  check("PDF: la marca de foto tratada llega al hilo de maquetación (sin rutas ni claves)", gen.includes("r.toned ? { finish: true as const }") && wp.includes("finish?: true") && wp.includes('photos: it.photos.map((ph) => ({ key: "", src: ""'));
  const photos = read("../lib/catalogs/export/photos.ts");
  check("PDF: las fotos tratadas con la MISMA receta que el proxy (photo-variant)", photos.includes('from "../photo-variant"') && photos.includes("toneRaw(base(), await photoToneRecipe(source))") && photos.includes("quality: 76"));
}

if (REPORT) writeFileSync(`${REPORT}/medidas.json`, JSON.stringify({ version: TONE_RECIPE_VERSION, photos: report, contrast }, null, 2));
console.log(failures ? `\n❌ ${failures} fallos, ${passes} en verde` : `\n✅ ${passes} comprobaciones en verde, 0 fallos`);
process.exit(failures ? 1 : 0);
