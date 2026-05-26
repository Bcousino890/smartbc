import type { CheerioAPI } from "cheerio";
import type { RawPhoto } from "../types";
import {
  PhotoCollector,
  collectUrlStrings,
  extractJsonLd,
  extractNextData,
  pickBestImgVariant,
  resolveUrl,
} from "./image-utils";

// Reglas de imagen para Idealista (idealista.com / idealista.pt / idealista.it).
// El CDN sirve fotos desde img*.idealista.com con plantillas de tamaño tipo
// `WEB_DETAIL-XL-L`, `WEB_LISTING`, etc. Normalizamos siempre a
// `WEB_DETAIL_TOP-XL-L` que es la versión grande de detalle.

// Acepta cualquier subdominio: img.idealista.com, img1.idealista.com,
// img2.idealista.it, etc. Excluye explícitamente `logo` y `blur/static`.
const IDEALISTA_HOST_RE = /(?:^|\/\/)img\d*\.idealista\.[a-z]{2,3}/i;

// Tamaños conocidos del CDN. El orden NO importa para detección, solo
// los usamos como objetivos de reemplazo.
const IDEALISTA_SIZE_TOKENS = [
  "WEB_DETAIL_TOP-XL-L",
  "WEB_DETAIL-XL-L",
  "WEB_DETAIL-L-L",
  "WEB_DETAIL-L-S",
  "WEB_DETAIL-M-L",
  "WEB_LISTING",
  "WEB_DETAIL",
  "WEB_THUMB",
  "WEB_LIST",
] as const;

const TARGET_SIZE = "WEB_DETAIL_TOP-XL-L";

export function isIdealistaImageUrl(url: string): boolean {
  if (!url) return false;
  if (!IDEALISTA_HOST_RE.test(url)) return false;
  // Tiene que parecer una foto real, no un asset estático.
  if (/\/static\//i.test(url)) return false;
  if (/\/maps?\//i.test(url)) return false;
  return /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(url);
}

/**
 * Sustituye el token de tamaño del CDN por `WEB_DETAIL_TOP-XL-L` cuando es
 * distinto. Si la URL no expone token reconocible, se devuelve sin tocar.
 */
export function toIdealistaHighQuality(url: string): string {
  if (url.includes(TARGET_SIZE)) return url;
  for (const token of IDEALISTA_SIZE_TOKENS) {
    if (token === TARGET_SIZE) continue;
    if (url.includes(token)) {
      return url.replace(token, TARGET_SIZE);
    }
  }
  return url;
}

/**
 * Recolecta fotos del HTML de una ficha de Idealista. Combina varias fuentes
 * porque el CDN viene a veces inline en <img> y a veces dentro del JSON
 * embebido (multimediaCarrousel / propertyMultimedia).
 */
export function extractIdealistaPhotos(
  $: CheerioAPI,
  baseUrl?: string,
): RawPhoto[] {
  const collector = new PhotoCollector();

  const consider = (raw: string | null | undefined, alt?: string) => {
    const resolved = resolveUrl(raw ?? undefined, baseUrl);
    if (!resolved) return;
    if (!isIdealistaImageUrl(resolved)) return;
    collector.add(toIdealistaHighQuality(resolved), alt);
  };

  // 1) <img> (lazy o no) en el árbol DOM.
  $("img").each((_, el) => {
    const $el = $(el);
    const best = pickBestImgVariant($el);
    consider(best, $el.attr("alt") ?? undefined);
  });

  // 2) <source> dentro de <picture>: Idealista usa <picture> en la galería.
  $("source").each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset");
    if (!srcset) return;
    // Toma todas las URLs del srcset; el dedupKey filtra duplicados de tamaño.
    for (const part of srcset.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      consider(url);
    }
  });

  // 3) JSON-LD (schema.org/RealEstateListing suele incluir `image`).
  for (const obj of extractJsonLd($)) {
    for (const url of collectUrlStrings(obj)) consider(url);
  }

  // 4) __NEXT_DATA__ (Idealista lo usa en algunas vistas).
  const nextData = extractNextData($);
  if (nextData) {
    for (const url of collectUrlStrings(nextData)) consider(url);
  }

  // 5) Cualquier otro <script> con JSON inline que contenga URLs del CDN.
  // No parseamos: hacemos un match laxo en bruto y luego validamos.
  $('script:not([src])').each((_, el) => {
    const txt = $(el).contents().text();
    if (!txt || !txt.includes("idealista.")) return;
    const re = /https?:\/\/img\d*\.idealista\.[a-z]{2,3}\/[^\s"'<>)]+/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null) {
      consider(m[0]);
    }
  });

  return collector.toArray();
}
