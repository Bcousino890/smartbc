import type { CheerioAPI } from "cheerio";
import type { RawPhoto } from "../types";
import {
  PhotoCollector,
  collectUrlStrings,
  extractJsonLd,
  extractNextData,
  isLikelyNonPhoto,
  pickBestImgVariant,
  resolveUrl,
} from "./image-utils";

// Reglas de imagen para Fotocasa (fotocasa.es). El CDN principal es
// `static.fotocasa.es` y vecinos `image.fotocasa.es`, `images.fotocasa.es`.
// Las fotos de galería suelen venir en <source srcset> dentro de <picture>
// y también dentro del bloque __NEXT_DATA__.

const FOTOCASA_HOST_RE = /(?:^|\/\/)(?:static|image|images|cdn|media)\.fotocasa\.[a-z.]+/i;

// Tokens de tamaño/calidad que aparecen en la URL de Fotocasa.
// Buscamos cambiar a la versión grande conocida cuando sea posible.
const FOTOCASA_SIZE_TOKENS: { from: RegExp; to: string }[] = [
  // /380x270/ → /1280x720/
  { from: /\/\d{2,4}x\d{2,4}\//, to: "/1280x720/" },
];

export function isFotocasaImageUrl(url: string): boolean {
  if (!url) return false;
  if (!FOTOCASA_HOST_RE.test(url)) return false;
  if (isLikelyNonPhoto(url)) return false;
  // Tiene que parecer una foto real, no un asset estático ni mapa.
  if (/\/static\//i.test(url) && !/\/static\//i.test(url.split("?")[0])) {
    // unreachable; mantener guard simple
  }
  if (/\/assets\//i.test(url)) return false;
  if (/\/maps?\//i.test(url)) return false;
  return /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(url);
}

/**
 * Intenta forzar la versión grande conocida cambiando el segmento
 * `/<ancho>x<alto>/` por `/1280x720/`. Si la URL no encaja, se devuelve igual.
 */
export function toFotocasaHighQuality(url: string): string {
  let out = url;
  for (const rule of FOTOCASA_SIZE_TOKENS) {
    if (rule.from.test(out) && !out.includes(rule.to)) {
      out = out.replace(rule.from, rule.to);
    }
  }
  return out;
}

export function extractFotocasaPhotos(
  $: CheerioAPI,
  baseUrl?: string,
): RawPhoto[] {
  const collector = new PhotoCollector();

  const consider = (raw: string | null | undefined, alt?: string) => {
    const resolved = resolveUrl(raw ?? undefined, baseUrl);
    if (!resolved) return;
    if (!isFotocasaImageUrl(resolved)) return;
    collector.add(toFotocasaHighQuality(resolved), alt);
  };

  // 1) <img> (incluye lazy data-src/data-original).
  $("img").each((_, el) => {
    const $el = $(el);
    const best = pickBestImgVariant($el);
    consider(best, $el.attr("alt") ?? undefined);
  });

  // 2) <source> dentro de <picture> — galería principal usa este patrón.
  $("source").each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset") ?? $el.attr("data-srcset");
    if (!srcset) return;
    for (const part of srcset.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      consider(url);
    }
  });

  // 3) __NEXT_DATA__: Fotocasa expone `realEstate.multimedias[].url`.
  const nextData = extractNextData($);
  if (nextData) {
    for (const url of collectUrlStrings(nextData)) consider(url);
  }

  // 4) JSON-LD por si la ficha tiene RealEstateListing.
  for (const obj of extractJsonLd($)) {
    for (const url of collectUrlStrings(obj)) consider(url);
  }

  // 5) Otros <script> inline con bloques JSON que referencien el CDN.
  $('script:not([src])').each((_, el) => {
    const txt = $(el).contents().text();
    if (!txt || !txt.includes("fotocasa")) return;
    const re = /https?:\/\/(?:static|image|images|cdn|media)\.fotocasa\.[a-z.]+\/[^\s"'<>)]+/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null) {
      consider(m[0]);
    }
  });

  return collector.toArray();
}
