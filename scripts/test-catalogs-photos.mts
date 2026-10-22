/**
 * Tests de la resolución de entrega de las fotos (BCP-01 ampliación, PR7a):
 * variantes por ancho del proxy (la misma regla en /p y en las fixtures),
 * `srcset` de la portada del lector acotado al ancho real y anchos de las
 * fotos del PDF según su caja impresa (300 ppi, portada al máximo guardado).
 * Puros: sin base de datos, red ni IA; `sharp` sobre fotos sintéticas.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-photos.mts
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { codedPhotoSvg } from "../lib/catalogs/export/fixture-photo.ts";
import { exportPhotoWidth, PHOTO_WIDTHS, photoNeeds, pxForPrint } from "../lib/catalogs/export/generate.ts";
import { COVER_FALLBACK_WIDTH, COVER_SIZES, COVER_WIDTHS, coverPhotoWidth, coverSrcSet } from "../lib/catalogs/cover-srcset.ts";
import { renderPhotoVariant } from "../lib/catalogs/photo-variant.ts";
import { PHOTO_STORED_MAX_WIDTH, PHOTO_VARIANT_WIDTHS, photoVariantQuality, snapPhotoWidth } from "../lib/catalogs/photo-widths.ts";
import { photoKeyOf } from "../lib/catalogs/photo-data.ts";
import { PRINT_BOXES } from "../lib/pdf/catalog/document.ts";
import { toPublicCatalog, type InternalSnapshot } from "../lib/catalogs/to-public.ts";

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

// ── 1 · Escala de anchos del proxy ──────────────────────────────────────────
section("escala de anchos (?w=)");
check("sin w → null", snapPhotoWidth(null) === null && snapPhotoWidth("") === null && snapPhotoWidth("abc") === null);
check("w=0 o negativo → null", snapPhotoWidth("0") === null && snapPhotoWidth("-5") === null);
check("w=1 → el escalón más pequeño (640)", snapPhotoWidth("1") === 640);
check("w=700 → 828 (el escalón igual o superior)", snapPhotoWidth("700") === 828);
check("w=1600 → 1600 (exacto)", snapPhotoWidth("1600") === 1600);
check("w=1601 → 1920", snapPhotoWidth("1601") === 1920);
check("w=2880 (1440 a 2×) → 3200", snapPhotoWidth("2880") === 3200);
check("w=99999 → 3200 (tope de la escala)", snapPhotoWidth("99999") === 3200);
check("la escala es la de siempre (misma caché)", PHOTO_VARIANT_WIDTHS.join(",") === "640,828,1080,1200,1280,1600,1920,2560,3200");
check("calidad 86 hasta 2048 y 78 por encima", photoVariantQuality(1920) === 86 && photoVariantQuality(2048) === 86 && photoVariantQuality(2560) === 78);
check("máximo guardado 2.560 px, en la escala", PHOTO_STORED_MAX_WIDTH === 2560 && PHOTO_VARIANT_WIDTHS.includes(2560));

// ── 2 · La variante que se sirve, con sharp sobre fotos sintéticas ─────────
section("variante servida (sharp, fotos sintéticas)");
const SVG_TYPE = "image/svg+xml; charset=utf-8";
const big = Buffer.from(codedPhotoSvg("u-prueba-grande", 2560, 1707, "prueba · 2560"));
{
  const v = await renderPhotoVariant(big, 1280, SVG_TYPE);
  const m = await sharp(v.data).metadata();
  check("2560 → w=1280: WebP de 1280 px y cabecera w1280", v.variant === "w1280" && v.contentType === "image/webp" && m.format === "webp" && m.width === 1280, `${v.variant} ${m.format} ${m.width}`);
  check("conserva la proporción (1280 × 854)", m.height === 854, String(m.height));
}
{
  const v = await renderPhotoVariant(big, 2560, SVG_TYPE);
  check("2560 → w=2560: el original intacto (mismo tipo, mismos bytes, «original»)", v.variant === "original" && v.contentType === SVG_TYPE && v.data.equals(big));
}
{
  const v = await renderPhotoVariant(big, 3200, SVG_TYPE);
  check("2560 → w=3200: nunca se amplía («original»)", v.variant === "original" && v.data.equals(big));
}
{
  // Una foto de píxeles de verdad (WebP), como las re-alojadas.
  const raster = await sharp(Buffer.from(codedPhotoSvg("u-raster", 2000, 1333, "raster"))).webp({ quality: 86 }).toBuffer();
  const v1 = await renderPhotoVariant(raster, 1600, "image/webp");
  const m1 = await sharp(v1.data).metadata();
  check("WebP de 2000 → w=1600: 1600 px reales", v1.variant === "w1600" && m1.width === 1600 && m1.height === 1066, `${v1.variant} ${m1.width}×${m1.height}`);
  const v2 = await renderPhotoVariant(raster, 1920, "image/webp");
  const m2 = await sharp(v2.data).metadata();
  check("WebP de 2000 → w=1920: variante de 1920 (el original es más ancho)", v2.variant === "w1920" && m2.width === 1920, `${v2.variant} ${m2.width}`);
  const v2b = await renderPhotoVariant(raster, 2560, "image/webp");
  check("WebP de 2000 → w=2560: original (no se amplía a 2560)", v2b.variant === "original" && v2b.data.equals(raster));
  const v3 = await renderPhotoVariant(raster, 640, "image/webp");
  check("la variante pequeña pesa menos que el original", v3.variant === "w640" && v3.data.length < raster.length, `${v3.data.length} < ${raster.length}`);
}
{
  const v = await renderPhotoVariant(Buffer.from("esto no es una imagen"), 1080, "image/webp");
  check("bytes ilegibles → el original tal cual («fallback»), nunca un hueco roto", v.variant === "fallback" && v.data.toString() === "esto no es una imagen");
}

// ── 3 · srcset de la portada del lector ────────────────────────────────────
section("srcset de la portada");
const url = (src: string, w: number) => `${src}${src.includes("?") ? "&" : "?"}w=${w}`;
check("sin dato de ancho NO se declara srcset (sin dato no hay promesa)", coverSrcSet(url, "/p/x/0.webp?f=a&v=b", null) === undefined);
check("una foto más estrecha que el escalón mínimo tampoco", coverSrcSet(url, "/p/x/0.webp?f=a&v=b", 500) === undefined);
{
  const ss = coverSrcSet(url, "/p/x/0.webp?f=a&v=b", 1600) ?? "";
  check("foto de 1.600: nunca promete más píxeles de los que hay", ss.length > 0 && !/\b(1920|2560|3200)w/.test(ss), ss);
  check("el último candidato es el ancho real", ss.endsWith("w=1600 1600w"), ss.slice(-30));
  check("los anchos van con & cuando la url ya trae query", ss.startsWith("/p/x/0.webp?f=a&v=b&w=640 640w"), ss.slice(0, 40));
}
{
  const ss = coverSrcSet(url, "/p/x/0.webp?f=a&v=b", 2560) ?? "";
  check("foto de 2.560: llega hasta 2560w (lo que pide 1440 a 2×)", ss.endsWith("w=2560 2560w") && /\b1920w/.test(ss), ss.slice(-40));
  check("nunca 3200w (no hay fotos guardadas tan grandes)", !/\b3200w/.test(ss));
}
{
  const ss = coverSrcSet(url, "/p/x/0.webp", 4000) ?? "";
  check("una foto mayor que el máximo guardado se acota a 2560w", ss.endsWith("w=2560 2560w") && !/\b4000w/.test(ss), ss.slice(-40));
  const ss2 = coverSrcSet(url, "/p/x/0.webp", 2400) ?? "";
  check("un ancho fuera de la escala se declara tal cual (2400w) tras 1920w", ss2.endsWith("w=1920 1920w, /p/x/0.webp?w=2400 2400w"), ss2.slice(-50));
}
check("COVER_WIDTHS: la escala del proxy hasta el máximo guardado", COVER_WIDTHS.join(",") === "640,828,1080,1200,1280,1600,1920,2560");
check("src de respaldo: la variante única de siempre (1.600)", COVER_FALLBACK_WIDTH === 1600);
check("sizes: a sangre, todo el ancho de la ventana", COVER_SIZES === "100vw");

// ── 4 · Ancho real de la portada y anchos del PDF, desde una instantánea ───
section("ancho de la portada y anchos del PDF (instantánea sintética)");
const K = (s: string) => photoKeyOf(`00000000-0000-4000-8000-${s.padStart(12, "0")}`);
const base = {
  zone: "Madrid", subzone: "Chamberí", operation: "sale", operations: null, price: 500000, rent_price: null, currency: "eur", status: "available",
  bedrooms: 2, bathrooms: 1, square_meters: 80, description: null, features: null, features_manual: null, floor_override: null, clean: null,
};
const snapshot = {
  title: "Prueba", intro: null, created_at: "2026-10-01T09:00:00Z", status: "active", owner_name: "Prueba", contact: null,
  items: [
    { ...base, key: "kA000000000001", slug: "piso-a", title: "Piso A", photos: [
      { u: "a0", f: K("a0"), w: 2560, h: 1707, c: true },
      { u: "a1", f: K("a1"), w: 1000, h: 1500, c: false },
      { u: "a2", f: K("a2"), w: 1600, h: 1067, c: false },
      { u: "a3", f: K("a3"), w: null, h: null, c: false },
    ] },
    { ...base, key: "kB000000000002", slug: "piso-b", title: "Piso B", photos: [{ u: "b0", f: K("b0"), w: 1000, h: 1500, c: true }] },
  ],
} as unknown as InternalSnapshot;
{
  const pub = toPublicCatalog(snapshot, "any");
  check("coverPhotoWidth: el ancho real de la foto de portada (2.560)", coverPhotoWidth(pub) === 2560, String(coverPhotoWidth(pub)));
  check("sin portada → null", coverPhotoWidth({ coverPhoto: null, items: pub.items }) === null);
  const needs = photoNeeds(snapshot, "any");
  const w = (id: string) => needs.get(id)?.width;
  check("PDF · portada apaisada 3:2: el máximo guardado (2.560; unos 146 ppi en el A4)", w("cover") === 2560, String(w("cover")));
  check("PDF · apertura apaisada 3:2: limitada por los 300 pt de alto → 450 pt → 1.875 px (300 ppi)", w("kA000000000001#0") === 1875, String(w("kA000000000001#0")));
  check("PDF · «Más fotos» vertical 2:3: limitada por los 175 pt de alto → 487 px", w("kA000000000001#1") === 487, String(w("kA000000000001#1")));
  check("PDF · «Más fotos» apaisada 3:2: todo el ancho de la celda → 1.003 px", w("kA000000000001#2") === 1003, String(w("kA000000000001#2")));
  check("PDF · sin medidas conocidas: el tope de la caja (1.003)", w("kA000000000001#3") === 1003, String(w("kA000000000001#3")));
  check("PDF · apertura vertical 2:3: 200 pt → 834 px (menos que los 1.400 de antes)", w("kB000000000002#0") === 834, String(w("kB000000000002#0")));
}
{
  const ppi = (px: number, pt: number) => px / (pt / 72);
  check("topes: apertura y «Más fotos» a 300 ppi del ancho de su caja", PHOTO_WIDTHS.opening === pxForPrint(PRINT_BOXES.opening.w) && PHOTO_WIDTHS.more === pxForPrint(PRINT_BOXES.more.w) && ppi(PHOTO_WIDTHS.opening, PRINT_BOXES.opening.w) >= 300 && ppi(PHOTO_WIDTHS.more, PRINT_BOXES.more.w) >= 300, JSON.stringify(PHOTO_WIDTHS));
  check("tope de la portada: el máximo guardado, nunca más", PHOTO_WIDTHS.cover === PHOTO_STORED_MAX_WIDTH);
  check("portada vertical 2:3: el ancho del A4 a 300 ppi (2.481)", exportPhotoWidth("cover", 1000, 1500) === pxForPrint(PRINT_BOXES.page.w) && exportPhotoWidth("cover", 1000, 1500) === 2481);
  check("portada panorámica: nunca por encima del máximo guardado", exportPhotoWidth("cover", 6000, 1000) === 2560);
  check("apertura 4:3: 400 pt → 1.667 px", exportPhotoWidth("opening", 1600, 1200) === 1667);
  check("las cajas impresas no han cambiado (A4, 18 mm de margen, 300/175 pt de alto)", Math.abs(PRINT_BOXES.page.w - 595.28) < 0.01 && Math.abs(PRINT_BOXES.page.h - 841.89) < 0.01 && Math.abs(PRINT_BOXES.opening.w - 493.28) < 0.01 && PRINT_BOXES.opening.h === 300 && Math.abs(PRINT_BOXES.more.w - 240.64) < 0.01 && PRINT_BOXES.more.h === 175);
}

// ── 5 · Fuente: el proxy y las fixtures usan la misma regla; la caché sigue ─
section("fuente");
{
  const proxy = readFileSync(new URL("../app/p/[slug]/[idx]/route.ts", import.meta.url), "utf8");
  check("/p usa los módulos compartidos (escala y reencode)", proxy.includes('from "@/lib/catalogs/photo-variant"') && proxy.includes('from "@/lib/catalogs/photo-widths"') && proxy.includes("renderPhotoVariant(") && proxy.includes("snapPhotoWidth("));
  const srcset = readFileSync(new URL("../lib/catalogs/cover-srcset.ts", import.meta.url), "utf8");
  const variant = readFileSync(new URL("../lib/catalogs/photo-variant.ts", import.meta.url), "utf8");
  check("el srcset de la portada (cliente) no arrastra sharp: importa photo-widths, nunca photo-variant", srcset.includes('from "./photo-widths"') && !srcset.includes("photo-variant") && variant.startsWith('import "server-only";'));
  check("/p sigue cacheando 24 h en CDN las variantes y el original", (proxy.match(/public, max-age=86400, s-maxage=86400/g) ?? []).length >= 2);
  check("/p ya no tiene su propia escala de anchos", !/const WIDTHS\s*=/.test(proxy));
  const fx = readFileSync(new URL("../app/dev-fixtures/foto/[slug]/[idx]/route.ts", import.meta.url), "utf8");
  check("la ruta de fotos de las fixtures sirve ?w= con la misma regla y la cabecera X-Bcp-Variant", fx.includes("renderPhotoVariant(") && fx.includes("snapPhotoWidth(") && fx.includes("X-Bcp-Variant"));
  const pages = readFileSync(new URL("../components/catalogs/reader/pages.tsx", import.meta.url), "utf8");
  check("la portada del lector declara srcset acotado y sizes", pages.includes("coverSrcSet(url, cover, coverPhotoWidth(catalog))") && pages.includes("photoSizes: COVER_SIZES"));
  const cover = readFileSync(new URL("../components/catalogs/catalog-cover.tsx", import.meta.url), "utf8");
  check("CatalogCover solo pone sizes si hay srcset (la HOME y la vista previa siguen igual)", cover.includes("srcSet={data.photoSrcSet ?? undefined}") && cover.includes("sizes={data.photoSrcSet ? (data.photoSizes ?? undefined) : undefined}"));
  const css = readFileSync(new URL("../components/catalogs/catalog-cover.module.css", import.meta.url), "utf8");
  check("la caja de la foto de portada no cambia (a sangre, object-fit: cover)", /\.photo\s*\{\s*position:\s*absolute;\s*inset:\s*0;\s*\}/.test(css) && /\.photo img\s*\{[^}]*object-fit:\s*cover/.test(css));
  const photos = readFileSync(new URL("../lib/catalogs/export/photos.ts", import.meta.url), "utf8");
  check("el PDF sigue sin ampliar nunca (withoutEnlargement) y con la calidad aprobada (JPEG 76)", photos.includes("withoutEnlargement: true") && photos.includes("quality: 76"));
}

console.log(`\n${failures === 0 ? "✅" : "❌"} ${passes} comprobaciones en verde, ${failures} fallos`);
process.exit(failures ? 1 : 0);
