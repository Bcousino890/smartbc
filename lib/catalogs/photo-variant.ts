import "server-only";
import type { Sharp } from "sharp";
import { photoVariantQuality } from "./photo-widths";
import { applyTone, TONE_SAMPLE_MAX, toneHeader, toneRecipeFor, type ToneRecipe } from "./photo-tone";

// ============================================================================
// Reencode de una foto a una variante por ancho (`?w=`), compartido por el
// proxy real /p/[slug]/[idx] y por la ruta de fotos sintéticas de las fixtures
// (/dev-fixtures/foto/…), para que la QA y las pruebas ejerciten EXACTAMENTE
// la misma regla que producción (BCP-01 ampliación, PR7a). Solo servidor:
// carga `sharp` al vuelo. La escala y la calidad están en photo-widths.ts.
//
//   · NUNCA se amplía: si el original no es más ancho que lo pedido, se
//     devuelve intacto («original»).
//   · La cabecera `X-Bcp-Variant` dice qué se sirvió: `w1600`, `original` o
//     `fallback` (el reencode falló y se mandó el original).
//
// PR7b · Acabado fotográfico (`t=<versión de la receta>`): la MISMA foto con
// el tono adaptativo de photo-tone.ts, sobre una copia (el original del
// almacén nunca se reescribe). La receta se decide con una muestra del
// ORIGINAL (no de la variante), así que todas las anchuras de una foto llevan
// la misma receta. Siempre se reencoda (WebP, misma calidad que la escala);
// el tamaño sigue la regla de siempre: `w1600` si se redujo, `original` si se
// sirve a su tamaño. `X-Bcp-Tone` dice la receta («v1/luminosa») o
// `fallback` si el tratamiento falló (entonces va la variante sin tratar).
// ============================================================================

export type PhotoVariantName = "original" | "fallback" | `w${number}`;

export interface PhotoVariant {
  data: Buffer;
  contentType: string;
  variant: PhotoVariantName;
  /** Solo con acabado: «v1/luminosa», … o «fallback». */
  tone?: string;
}

async function loadSharp() {
  return (await import("sharp")).default;
}

/** Receta de tono de una foto: se mide una muestra del original reducida a
 *  TONE_SAMPLE_MAX px de lado mayor (determinista). */
export async function photoToneRecipe(source: Buffer): Promise<ToneRecipe> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(source, { failOn: "none" })
    .resize({ width: TONE_SAMPLE_MAX, height: TONE_SAMPLE_MAX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return toneRecipeFor(new Uint8Array(data.buffer, data.byteOffset, data.length), info.channels).recipe;
}

/** Píxeles RGB de una tubería de `sharp` con la receta aplicada, listos para
 *  codificar con `sharp(raw, { raw })`. */
export async function toneRaw(pipeline: Sharp, recipe: ToneRecipe): Promise<{ data: Buffer; width: number; height: number; channels: 3 }> {
  const { data, info } = await pipeline.flatten({ background: "#ffffff" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = applyTone(new Uint8Array(data.buffer, data.byteOffset, data.length), info.channels, recipe);
  return { data: Buffer.from(out.buffer, out.byteOffset, out.length), width: info.width, height: info.height, channels: 3 };
}

/**
 * La variante de `width` px de `source` (cualquier formato que lea sharp,
 * incluido SVG). Si el original no es más ancho que lo pedido, vuelve intacto
 * con su tipo («original»): ampliar solo añadiría peso y ni un detalle real.
 * Si el reencode falla, también el original («fallback»): una foto grande de
 * más es infinitamente mejor que un hueco roto.
 *
 * Con `opts.tone` (PR7b): la variante tratada. `width` null = a su tamaño.
 */
export async function renderPhotoVariant(
  source: Buffer,
  width: number | null,
  contentType: string,
  opts: { tone?: boolean } = {},
): Promise<PhotoVariant> {
  if (opts.tone) {
    try {
      return await renderTonedVariant(source, width);
    } catch {
      const plain = width ? await renderPhotoVariant(source, width, contentType) : { data: source, contentType, variant: "original" as const };
      return { ...plain, tone: "fallback" };
    }
  }
  if (!width) return { data: source, contentType, variant: "original" };
  try {
    const sharp = await loadSharp();
    const image = sharp(source, { failOn: "none" });
    const meta = await image.metadata();
    if (!meta.width || meta.width <= width) return { data: source, contentType, variant: "original" };
    const data = await image
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: photoVariantQuality(width) })
      .toBuffer();
    return { data, contentType: "image/webp", variant: `w${width}` };
  } catch {
    return { data: source, contentType, variant: "fallback" };
  }
}

async function renderTonedVariant(source: Buffer, width: number | null): Promise<PhotoVariant> {
  const sharp = await loadSharp();
  const recipe = await photoToneRecipe(source);
  const meta = await sharp(source, { failOn: "none" }).metadata();
  if (!meta.width) throw new Error("no_width");
  const resized = !!width && meta.width > width;
  let pipeline = sharp(source, { failOn: "none" });
  if (resized) pipeline = pipeline.resize({ width: width!, withoutEnlargement: true, fit: "inside" });
  const raw = await toneRaw(pipeline, recipe);
  const data = await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } })
    .webp({ quality: photoVariantQuality(raw.width) })
    .toBuffer();
  return { data, contentType: "image/webp", variant: resized ? `w${width}` : "original", tone: toneHeader(recipe) };
}
