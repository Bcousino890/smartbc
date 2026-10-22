import "server-only";
import { photoVariantQuality } from "./photo-widths";

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
// ============================================================================

export type PhotoVariantName = "original" | "fallback" | `w${number}`;

export interface PhotoVariant {
  data: Buffer;
  contentType: string;
  variant: PhotoVariantName;
}

/**
 * La variante de `width` px de `source` (cualquier formato que lea sharp,
 * incluido SVG). Si el original no es más ancho que lo pedido, vuelve intacto
 * con su tipo («original»): ampliar solo añadiría peso y ni un detalle real.
 * Si el reencode falla, también el original («fallback»): una foto grande de
 * más es infinitamente mejor que un hueco roto.
 */
export async function renderPhotoVariant(source: Buffer, width: number, contentType: string): Promise<PhotoVariant> {
  try {
    const sharp = (await import("sharp")).default;
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
