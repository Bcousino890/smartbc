import { deriveEditorial } from "./editorial";
import { createHash } from "node:crypto";
import { ATICO_FLOOR, resolveFloor } from "@/lib/floor";
import { editionLabel, floorLabel, floorShortLabel } from "./format";
import { catalogDictionary, snapshotLang, type CatalogLanguage } from "./i18n";
import { priceDisplay, type CatalogOperation } from "./operation-price";
import { effectivePhotos, photoSrc } from "./photo-selection";
import { contactPhoneHref, formatContactPhone, isContactRole } from "./contact-format";
import { applyItemTranslation, esUnitFrom, type EsUnit, type ItemTranslation, type MetaTranslation } from "./translations";
import {
  type PhotoOrientation,
  type PublicCatalog,
  type PublicItem,
  type PublicPhoto,
} from "./public-contract";

// ============================================================================
// Instantánea INTERNA (catalog_internal_snapshot, 0193) → contrato PÚBLICO
// (public-contract.ts). Puro y probado en scripts/test-catalogs.mts.
//
// · Lista cerrada: se construye cada campo público a mano; nada se copia "tal
//   cual" de la fila interna.
// · Descripción y características: SOLO la versión limpiada para clientes
//   (property_client_descriptions, 'es') y solo si sigue correspondiendo al
//   texto actual de la ficha (mismo hash que lib/services/properties/
//   client-description.ts). Si no, se omiten: el texto del portal puede traer
//   teléfonos o el nombre de otra inmobiliaria.
// · Fotos: las EN USO en este catálogo (photo-selection.ts, E3), por el proxy
//   /p/{slug}/{idx}.webp?f={clave}&v={versión}: el proxy sirve por la clave
//   opaca, no por el índice (N1). Ni ids ni URLs de storage.
// · PR7b (0227) · Acabado fotográfico: con `fin` en la instantánea, la ruta de
//   cada foto no marcada «sin acabado» (pp.n) lleva `&t=<versión>`. Es lo
//   ÚNICO que cambia: el contrato público no gana campos (el lector y el PDF
//   saben si una foto va tratada por su ruta, isFinishedSrc).
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface InternalSnapshot {
  /** 0223: idioma del enlace que abrió la instantánea (get_public_catalog);
   *  ausente o desconocido = español. */
  lang?: string | null;
  title: string;
  intro: string | null;
  created_at: string;
  status: string;
  /** Se conserva por compatibilidad con 0193; el lector ya no la usa. */
  owner_name: string | null;
  /** 0194: contacto público guardado en el catálogo. */
  contact?: { name: string | null; phone: string | null; role: string | null } | null;
  items: InternalItem[];
  /** 0226 (PR6): título e introducción del catálogo traducidos al idioma del
   *  enlace (solo fuera del español y solo si están aprobados). */
  trm?: MetaTranslation | null;
  /** 0196 (C1): portada elegida. Solo existe si hay elección: la clave
   *  pública de la vivienda (null si ya no está en la lista) y el
   *  identificador opaco de la foto (el mismo `u` de photos; null si no hay). */
  cover?: { key: string | null; photo: string | null } | null;
  /** 0227 (PR7b): el catálogo tiene el acabado fotográfico activo. Solo
   *  existe entonces (apagado, la instantánea es la de siempre). */
  fin?: boolean | null;
}

export interface InternalItem {
  key: string;
  slug: string;
  title: string;
  zone: string | null;
  subzone: string | null;
  operation: string | null;
  operations: string[] | null;
  price: number | string | null;
  rent_price: number | string | null;
  currency: string | null;
  status: string;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | string | null;
  description: string | null;
  features: string[] | null;
  features_manual: string[] | null;
  floor_override: string | null;
  clean: { src: string | null; description: string | null; features: string[] | null } | null;
  /** 0197: clase de la foto (`k`) solo si se conoce. 0202 (E3): clave
   *  opaca y estable de la foto (`f`). */
  photos: Array<{ u: string; f?: string | null; w: number | null; h: number | null; c: boolean | null; k?: string | null }>;
  /** 0202 (E3): ajustes de fotos de este catálogo, por clave (solo si hay).
   *  0227 (PR7b): `n` = fotos «sin acabado», solo con el acabado activo. */
  pp?: { x: string[]; o: string | null; n?: string[] } | null;
  /** 0197 (C2): texto publicado del catálogo, solo si es vigente. */
  text?: { b: string | null; l: string | null; h: string[] | null } | null;
  /** 0220: zona confirmada por el dueño y vigente (solo si la hay). */
  area?: { name: string | null; level: string | null } | null;
  /** 0222: plantilla «Vivir en…» de este catálogo (solo con zona vigente). */
  at?: string | null;
  /** 0197 (C2): historia aprobada (huella, entrada, capítulos aprobados). */
  story?: { h: string | null; p: string | null; ph?: string | null; b: Array<{ c: string; t: string }> | null } | null;
  /** 0226 (PR6): copia de la traducción aprobada de ESTE catálogo en el
   *  idioma del enlace (solo fuera del español). Vale solo si su huella es la
   *  del español que se ve hoy (translations.ts). */
  tr?: ItemTranslation | null;
}

/** Mismo hash que client-description.ts: descripción recortada + NUL +
 *  características no vacías unidas por \u0001. */
export function clientDescriptionSrc(description: string | null, features: string[] | null): string {
  const d = (description ?? "").trim();
  const f = (features ?? []).filter((x) => typeof x === "string" && x.trim());
  return createHash("md5").update(d + "\u0000" + f.join("\u0001")).digest("hex");
}

function orientation(w: number | null, h: number | null): PhotoOrientation {
  if (!w || !h || w <= 0 || h <= 0) return "unknown";
  const r = w / h;
  if (r > 1.1) return "landscape";
  if (r < 0.9) return "portrait";
  return "square";
}

function positiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function nonNegativeInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function cleanStrings(list: unknown): string[] {
  return Array.isArray(list)
    ? list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];
}


function toPublicPhotos(it: InternalItem, finish = false): { photos: PublicPhoto[]; coverIndex: number; classes: Array<string | null> } {
  // E3: una sola regla (photo-selection.ts). Los índices (apertura, secciones,
  // mosaico, galería) son de la lista YA filtrada; la ruta lleva la clave.
  // PR7b: con el acabado, la ruta de las fotos no excluidas lleva `t`; la
  // clave pública (identidad en la galería) sigue siendo la misma.
  const eff = effectivePhotos(it.photos, it.pp);
  const photos: PublicPhoto[] = eff.photos.map((p) => ({
    key: p.key ?? photoSrc(it.slug, p),
    src: photoSrc(it.slug, p, finish && !p.noFinish),
    width: positiveInt(p.w),
    height: positiveInt(p.h),
    orientation: orientation(positiveInt(p.w), positiveInt(p.h)),
  }));
  return { photos, coverIndex: eff.openingIndex, classes: eff.photos.map((p) => p.k) };
}

/** Índice (en la lista de fotos EN USO) de la foto `u` de una vivienda, o -1. */
function photoIndexOf(it: InternalItem, u: string): number {
  return effectivePhotos(it.photos, it.pp).photos.findIndex((p) => p.u === u);
}

/**
 * Portada del catálogo (C1; respaldos de E3-3). Independiente del orden:
 *   1. la foto elegida, si sigue existiendo y está EN USO en el catálogo;
 *   2. si no, la apertura efectiva de esa vivienda en este catálogo;
 *   3. si la vivienda ya no está o no tiene fotos en uso, la apertura
 *      efectiva de la primera vivienda con fotos;
 *   4. catálogo vacío (o sin fotos): sin foto.
 */
export function coverPhotoOf(snap: Pick<InternalSnapshot, "items" | "cover" | "fin">, items?: PublicItem[]): string | null {
  const internal = (snap.items ?? []).filter((it) => it && it.status !== "sold" && it.status !== "archived");
  const pubs = items ?? internal.map((it) => toPublicItem(it, "any", "es", snap.fin === true));
  const key = snap.cover?.key;
  if (typeof key === "string") {
    const i = internal.findIndex((it) => String(it.key) === key);
    if (i >= 0 && pubs[i] && pubs[i].photos.length > 0) {
      const idx = typeof snap.cover?.photo === "string" ? photoIndexOf(internal[i], snap.cover.photo) : -1;
      return pubs[i].photos[idx >= 0 ? idx : pubs[i].coverIndex].src;
    }
  }
  const first = pubs.find((it) => it.photos.length > 0);
  return first ? first.photos[first.coverIndex].src : null;
}

/** El recorrido editorial en ESPAÑOL de una vivienda (lo que el lector
 *  pinta en español) y sus fotos. Una sola definición para el lector, el PDF
 *  y la unidad que se traduce (PR6). */
function editorialOf(it: InternalItem, finish = false) {
  const clean = it.clean;
  const cleanValid =
    !!clean && typeof clean.src === "string" && clean.src === clientDescriptionSrc(it.description, it.features);
  const floorN = resolveFloor(
    it.floor_override,
    [...(it.features ?? []), ...(it.features_manual ?? [])],
    it.title,
    it.description,
  );
  const { photos, coverIndex, classes } = toPublicPhotos(it, finish);
  const ed = deriveEditorial({
    description: it.description,
    features: it.features,
    features_manual: it.features_manual,
    bedrooms: it.bedrooms,
    bathrooms: it.bathrooms,
    square_meters: it.square_meters,
    zone: it.zone,
    subzone: it.subzone,
    area: it.area ?? null,
    areaText: typeof it.at === "string" ? it.at : null,
    cleanDescription: cleanValid ? (clean!.description ?? "").trim() || null : null,
    cleanFeatures: cleanValid ? cleanStrings(clean!.features) : [],
    text: it.text ?? null,
    story: it.story ?? null,
    photos: classes.map((k, i) => ({ u: String(i), k })),
    coverIndex: coverIndex < 0 ? 0 : coverIndex,
  });
  return { ed, floorN, photos, coverIndex };
}

/** Título de la vivienda en español en este catálogo (el propio o el de la ficha). */
function spanishTitle(it: InternalItem): string {
  return String(it.title ?? "").trim();
}

/** PR6 · Lo que el catálogo enseña hoy en español de esta vivienda (la unidad
 *  que se traduce y contra la que se comprueba la vigencia). */
export function esUnitOfItem(it: InternalItem): EsUnit {
  return esUnitFrom(spanishTitle(it) || catalogDictionary("es").untitled, editorialOf(it).ed);
}

/** `op`: la operación guardada del catálogo (K1, DS-1/DS-2). En venta o
 *  alquiler, la operación y el importe del catálogo; una inclusión de otra
 *  operación, lo suyo real; en «venta y alquiler», como siempre. Sin la otra
 *  operación de las duales: eso es solo de la gestión. */
export function toPublicItem(it: InternalItem, op: CatalogOperation = "any", lang: CatalogLanguage = "es", finish = false): PublicItem {
  const { ed, floorN, photos, coverIndex } = editorialOf(it, finish);
  const place = [it.subzone, it.zone].filter((x) => typeof x === "string" && x.trim()).join(", ") || null;
  // PR6 · Fuera del español, el contenido sale SOLO de la traducción aprobada
  // y vigente de este catálogo; si no la hay, el caso N5. Los datos
  // operativos de abajo salen siempre de la instantánea actual (DA34).
  const tr = lang === "es" ? null : applyItemTranslation(esUnitFrom(spanishTitle(it) || catalogDictionary("es").untitled, ed), it.tr ?? null, catalogDictionary(lang), place);
  const shown = priceDisplay(
    { operation: it.operation, operations: it.operations, price: it.price, rent_price: it.rent_price, currency: it.currency },
    op,
    lang,
  );
  const atico = floorN === ATICO_FLOOR;
  return {
    key: String(it.key),
    title: tr ? tr.title : String(it.title ?? "").trim() || catalogDictionary(lang).untitled,
    place,
    operation: shown.operation,
    price: shown.price,
    reserved: it.status === "reserved",
    bedrooms: nonNegativeInt(it.bedrooms),
    bathrooms: nonNegativeInt(it.bathrooms),
    squareMeters: positiveInt(it.square_meters),
    floor: atico ? floorLabel(null, true, lang) : floorLabel(floorN, false, lang),
    floorShort: atico ? floorShortLabel(null, true, lang) : floorShortLabel(floorN, false, lang),
    copy: tr ? tr.copy : ed.copy.map((b) => ({ heading: b.heading, text: b.text })),
    features: tr ? tr.features : ed.features,
    photos,
    coverIndex,
    ...(tr?.pending ? { copyPending: true } : {}),
  };
}

/** PR6 · Título e introducción del catálogo en el idioma del enlace: la
 *  última traducción aprobada (el gestor avisa si el español cambió después).
 *  Sin ninguna, el título del catálogo (su nombre) y sin introducción: nunca
 *  la introducción en español fuera del español. */
function catalogMeta(snap: InternalSnapshot, lang: CatalogLanguage): { title: string; intro: string | null } {
  const title = String(snap.title ?? "").trim();
  const intro = typeof snap.intro === "string" && snap.intro.trim() ? snap.intro.trim() : null;
  if (lang === "es") return { title, intro };
  const m = snap.trm;
  const t = typeof m?.t === "string" && m.t.trim() ? m.t.trim() : null;
  const i = typeof m?.i === "string" && m.i.trim() ? m.i.trim() : null;
  return { title: t ?? title, intro: m ? i : null };
}

/** `lang` (PR4): el idioma del enlace. Por defecto, el que trae la
 *  instantánea (0223) o español. El PDF (hasta el PR5) pasa «es» a propósito. */
export function toPublicCatalog(snap: InternalSnapshot, op: CatalogOperation = "any", lang: CatalogLanguage = snapshotLang(snap.lang)): PublicCatalog {
  // Defensa en profundidad: la instantánea ya excluye vendidas y archivadas.
  const items = (snap.items ?? [])
    .filter((it) => it && it.status !== "sold" && it.status !== "archived")
    .map((it) => toPublicItem(it, op, lang, snap.fin === true));
  const contact = snap.contact ?? null;
  const meta = catalogMeta(snap, lang);
  return {
    lang,
    title: meta.title,
    intro: meta.intro,
    edition: editionLabel(new Date(snap.created_at), lang),
    preparedBy: typeof contact?.name === "string" && contact.name.trim() ? contact.name.trim() : null,
    phone: formatContactPhone(contact?.phone),
    phoneHref: contactPhoneHref(contact?.phone),
    role: isContactRole(contact?.role) ? contact.role : "asesor",
    coverPhoto: coverPhotoOf(snap, items),
    items,
  };
}

/** Recorre un valor JSON y devuelve las rutas de las claves prohibidas que
 *  encuentre (para los tests y como guarda en desarrollo). */
export function findForbiddenKeys(value: unknown, forbidden: readonly string[], path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findForbiddenKeys(v, forbidden, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (forbidden.includes(k)) hits.push(`${path}.${k}`);
      hits.push(...findForbiddenKeys(v, forbidden, `${path}.${k}`));
    }
  }
  return hits;
}
