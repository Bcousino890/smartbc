import type { CheerioAPI } from "cheerio";
import type { RawPhoto } from "../types";

// Reglas de imagen para sitios construidos sobre Inmovilla (CRM inmobiliario
// español usado por miles de agencias, cada una con su propio dominio propio
// — deurbanitas.com, etc. — así que NO se detecta por host fijo, ver
// `isInmovillaSite` en import-by-link/detect-portal.ts).
//
// La galería de la ficha vive en `#fotosNormales` y cada foto está en un
// atributo `cargafoto` (no `src`/`data-src`): el elemento "principal" trae la
// foto grande (`31-1.jpg`), el resto de la tira de miniaturas trae la versión
// pequeña con sufijo `s` (`31-2s.jpg`, `31-3s.jpg`...). Quitando esa `s` se
// obtiene la MISMA foto a tamaño completo (mismo host `apinmo.com`, mismo
// nombre de fichero). A diferencia de Mobilia, esta versión grande SIGUE
// llevando la marca de agua horneada en los píxeles — no hay atajo de URL
// limpia — así que el borrado real lo hace el motor dinámico
// (`lib/sync/watermark-dynamic.ts`) sobre las fotos ya importadas.

const INMOVILLA_HOST_RE = /(?:^|\.)apinmo\.com$/i;

export function isInmovillaImageUrl(url: string): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (!INMOVILLA_HOST_RE.test(host)) return false;
  return /\.jpg(?:$|[?#])/i.test(url);
}

export function toInmovillaFullSize(url: string): string {
  // "...31-2s.jpg" → "...31-2.jpg". Solo quita la "s" pegada justo antes de
  // la extensión (miniatura de la tira de fotos); dejamos igual cualquier
  // otra cosa para no inventar URLs que no vimos en el HTML.
  return url.replace(/s\.jpg(?:$|(?=[?#]))/i, ".jpg");
}

/**
 * Extrae las fotos de la ficha a partir de los atributos `cargafoto` dentro
 * de `#fotosNormales` (la galería principal). Ese scope es importante: la
 * ficha también trae un bloque de "propiedades similares" con su propio
 * `cargafoto` apuntando a OTRA vivienda — quedaría fuera del scope y no se
 * cuela en el resultado.
 */
export function extractInmovillaPhotos($: CheerioAPI): RawPhoto[] {
  const seen = new Set<string>();
  const photos: RawPhoto[] = [];

  $("#fotosNormales [cargafoto]").each((_, el) => {
    const raw = $(el).attr("cargafoto");
    if (!raw || !isInmovillaImageUrl(raw)) return;
    const full = toInmovillaFullSize(raw);
    if (seen.has(full)) return;
    seen.add(full);
    photos.push({ url: full });
  });

  return photos;
}

/**
 * Sniff de contenido: como Inmovilla es multi-tenant con dominio propio por
 * agencia, no hay host fijo que detectar antes de descargar el HTML (a
 * diferencia de Mobilia/Inmoweb). Se llama DESPUÉS de hacer fetch, con la
 * página ya parseada, y decide si esta ficha viene de una web Inmovilla.
 * Varias señales independientes (basta con una) para ser tolerante a temas
 * distintos entre agencias:
 *  - meta author "www.inmovilla.com..." (todas las plantillas lo llevan)
 *  - pie de página "Diseñado por ... CRM Inmovilla"
 *  - script/API apiweb.inmovilla.com embebido en la página
 *  - al menos una foto real en `#fotosNormales [cargafoto]` de apinmo.com
 */
export function isInmovillaSite($: CheerioAPI, html: string): boolean {
  const author = $('meta[name="author"]').attr("content") ?? "";
  if (/inmovilla/i.test(author)) return true;
  if (/crm\s*inmovilla/i.test(html)) return true;
  if (/apiweb\.inmovilla\.com/i.test(html)) return true;
  if (extractInmovillaPhotos($).length > 0) return true;
  return false;
}
