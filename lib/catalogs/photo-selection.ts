// ============================================================================
// Fotos de una vivienda en UN catálogo (BCP-01 E3; D-QA13 y D-QA19). Pura y
// sin dependencias de servidor: la usan la proyección pública (lector,
// galería, apertura, recorrido, mosaico, portada del catálogo, tarjeta de la
// HOME y diagnósticos de material), la gestión (miniaturas, selector de
// portada, bloque «Fotos en este catálogo») y la vista previa del editor de
// textos. NADIE más decide qué fotos se ven en un catálogo.
//
//   · Identidad: la clave opaca `f` de cada foto (catalog_photo_key en SQL;
//     estable al reordenar y realojar, nueva al reimportar). Nunca el id, la
//     URL ni la posición.
//   · Dos filas con la misma URL (mismo `u`) son la MISMA foto: cuenta la
//     primera en el orden de la instantánea (position, id). Si se excluye
//     cualquiera de sus filas, se excluye la foto.
//   · Apertura (E3-3): la elegida en uso → la portada del CRM en uso → la
//     primera en uso → ninguna.
//   · `src` = /p/{slug}/{idx}.webp?f={clave}&v={versión}: el proxy sirve por
//     la clave (N1), no por el índice; `v` (8 hex del md5 de la URL) cambia
//     al realojar y evita la caché vieja. No detecta un archivo sustituido en
//     la MISMA URL (límite documentado, corrección 5 de D-QA19).
//   · PR7b · Acabado fotográfico: si el catálogo lo tiene activo y la foto no
//     está marcada «sin acabado» (prefs.n), su ruta lleva `t=<versión de la
//     receta>` y el proxy sirve la variante tratada. Apagado, la ruta es
//     EXACTAMENTE la de antes.
// ============================================================================

import { TONE_RECIPE_VERSION } from "./photo-tone";

export interface PhotoInput {
  /** md5 de la URL (instantánea interna). */
  u: string;
  /** Clave opaca de la foto (0202). Sin ella, el `src` es el de antes. */
  f?: string | null;
  w: number | null;
  h: number | null;
  /** Portada en el CRM. */
  c: boolean | null;
  /** Clase de la foto (0197), si se conoce. */
  k?: string | null;
}

/** Ajustes de fotos del catálogo para una vivienda, por clave. */
export interface PhotoPrefs {
  x: string[];
  o: string | null;
  /** PR7b (0227): fotos «sin acabado en esta foto». Solo llega en la
   *  instantánea cuando el catálogo tiene el acabado activo. */
  n?: string[];
}

export interface EffectivePhoto {
  /** Clave opaca de la foto (null en una instantánea anterior a 0202). */
  key: string | null;
  /** Todas las claves de sus filas (duplicados por URL). Solo gestión. */
  keys: string[];
  u: string;
  /** Versión del archivo para la caché: 8 hex del md5 de la URL. */
  v: string;
  /** Índice en la lista ENTERA del proxy (sin duplicados), para la ruta. */
  proxyIdx: number;
  w: number | null;
  h: number | null;
  k: string | null;
  crmCover: boolean;
  /** PR7b: la foto está marcada «sin acabado en esta foto» (cualquiera de sus filas). */
  noFinish: boolean;
}

export type OpeningSource = "chosen" | "crm-cover" | "first" | "none";

export interface EffectivePhotos {
  /** En uso en este catálogo, en el orden del CRM. */
  photos: EffectivePhoto[];
  /** Todas, con su estado (solo gestión). */
  all: Array<EffectivePhoto & { excluded: boolean; opening: boolean }>;
  /** Índice de la apertura en `photos` (0 si no hay ninguna). */
  openingIndex: number;
  openingSource: OpeningSource;
  /** Ajustes que ya no aplican: fotos borradas o reimportadas (E3-5). */
  stale: { excluded: number; opening: boolean };
}

export function effectivePhotos(input: PhotoInput[] | null | undefined, prefs?: PhotoPrefs | null): EffectivePhotos {
  // 1. Una foto por URL (la primera fila), con todas sus claves.
  const groups: Array<{ first: PhotoInput; keys: string[] }> = [];
  const byU = new Map<string, number>();
  for (const ph of input ?? []) {
    if (!ph || typeof ph.u !== "string") continue;
    const at = byU.get(ph.u);
    if (at === undefined) {
      byU.set(ph.u, groups.length);
      groups.push({ first: ph, keys: ph.f ? [ph.f] : [] });
    } else if (ph.f) {
      groups[at].keys.push(ph.f);
    }
  }
  const excludedKeys = new Set(prefs?.x ?? []);
  const noFinishKeys = new Set(prefs?.n ?? []);
  const known = new Set(groups.flatMap((g) => g.keys));
  const opening = prefs?.o ?? null;

  const all = groups.map((g, proxyIdx) => {
    const excluded = g.keys.some((k) => excludedKeys.has(k));
    return {
      key: g.first.f ?? null,
      keys: g.keys,
      u: g.first.u,
      v: g.first.u.slice(0, 8),
      proxyIdx,
      w: g.first.w ?? null,
      h: g.first.h ?? null,
      k: typeof g.first.k === "string" ? g.first.k : null,
      crmCover: g.first.c === true,
      noFinish: g.keys.some((k) => noFinishKeys.has(k)),
      excluded,
      opening: !excluded && opening !== null && g.keys.includes(opening),
    };
  });
  const photos: EffectivePhoto[] = all
    .filter((p) => !p.excluded)
    .map(({ excluded: _e, opening: _o, ...p }) => p);

  let openingIndex = 0;
  let openingSource: OpeningSource = "none";
  if (photos.length > 0) {
    const chosen = opening === null ? -1 : photos.findIndex((p) => p.keys.includes(opening));
    const cover = photos.findIndex((p) => p.crmCover);
    if (chosen >= 0) [openingIndex, openingSource] = [chosen, "chosen"];
    else if (cover >= 0) [openingIndex, openingSource] = [cover, "crm-cover"];
    else [openingIndex, openingSource] = [0, "first"];
  }
  return {
    photos,
    all,
    openingIndex,
    openingSource,
    stale: {
      excluded: [...excludedKeys].filter((k) => !known.has(k)).length,
      opening: opening !== null && !known.has(opening),
    },
  };
}

/** Parámetro del acabado en la ruta de una foto (PR7b). */
export const FINISH_PARAM = "t";

/** Ruta pública de una foto: por clave si la hay (N1); si no, la de antes.
 *  Con `finish` (PR7b: catálogo con acabado y foto no excluida del acabado),
 *  la variante tratada: `&t=<versión de la receta>`. */
export function photoSrc(slug: string, p: Pick<EffectivePhoto, "proxyIdx" | "key" | "v">, finish = false): string {
  const base = `/p/${encodeURIComponent(slug)}/${p.proxyIdx}.webp`;
  const src = p.key ? `${base}?f=${p.key}&v=${p.v}` : base;
  return finish ? `${src}${src.includes("?") ? "&" : "?"}${FINISH_PARAM}=${TONE_RECIPE_VERSION}` : src;
}

/** ¿Lleva esta ruta de foto el acabado? (lector y PDF: el filete acompaña a
 *  la foto tratada). */
export function isFinishedSrc(src: string | null | undefined): boolean {
  return typeof src === "string" && /[?&]t=[1-9][0-9]{0,2}(?:&|$)/.test(src);
}

/** Lo que pide el proxy en `t`: una versión de receta (1–999). Con cualquier
 *  versión válida se aplica la receta VIGENTE. Al subir la versión, las rutas
 *  nuevas llevan el número nuevo, así que la caché nunca les sirve bytes de la
 *  receta anterior; una ruta vieja (un lector abierto antes) recibe la vigente.
 *  Cualquier otro valor = sin acabado. */
export function parseFinishParam(raw: string | null | undefined): boolean {
  return typeof raw === "string" && /^[1-9][0-9]{0,2}$/.test(raw);
}

/** Añade el ancho a una ruta de foto, lleve ya parámetros o no. */
export function withWidth(src: string, width: number): string {
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}

/** Clave válida de la ruta (?f=): 16 hex. */
export function isPhotoKey(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{16}$/.test(v);
}

/**
 * Qué foto sirve el proxy /p/{slug}/{idx} (N1). Pura, para la ruta real y la
 * de fotos sintéticas.
 *  · Con `f`: la foto cuya clave coincide, sin mirar el índice ni el orden;
 *    si ninguna coincide, NINGUNA (404 sin caché). Nunca otra foto.
 *  · Sin `f`: exactamente lo de siempre (orden solo por posición, sin URLs
 *    repetidas, la del índice).
 */
export function pickProxyPhoto<T extends { url: string; position: number }>(
  rows: T[],
  idx: number,
  f: string | null,
  keyOf: (row: T) => string,
): T | null {
  if (f !== null) return rows.find((r) => keyOf(r) === f) ?? null;
  const seen = new Set<string>();
  const list = rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((p) => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  return list[idx] ?? null;
}
