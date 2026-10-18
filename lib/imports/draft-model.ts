// ============================================================================
// Modelo del borrador de importación (BCP-01 P5, I-10 a I-16). Puro: lo usan
// el servidor, el navegador y las pruebas. Nada aquí habla con la base.
//
//   enlace o PDF → borrador privado (fields + photos + evidence)
//     → confirmación humana → ficha (import_draft_create_property, 0214)
//     → pasos: fotos · catálogo · enlace del cliente
// ============================================================================

export type DraftSourceKind = "link" | "pdf";
export type DraftState = "review" | "created" | "done" | "discarded";
export type DuplicateChoice = "new" | "existing" | "update";
export type FieldStatus = "seguro" | "dudoso" | "falta";

/** Lo que la persona revisa y corrige antes de confirmar. */
export interface DraftFields {
  title: string;
  description: string;
  operation: "sale" | "rent" | "";
  stay: "long" | "short" | "";
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  zone: string;
  subzone: string;
  address: string;
  features: string[];
  /** Planta tal como la escribe la persona («3», «bajo», «ático»). Se guarda en features. */
  floor: string;
}

/** De dónde sale cada dato (PDF): página y fragmento, y si es seguro o dudoso. */
export interface FieldEvidence {
  status: FieldStatus;
  page?: number;
  snippet?: string;
  /** Otro valor posible (p.ej. el segundo precio de una dual). */
  alternatives?: string[];
}

export type DraftPhoto =
  | { id: string; kind: "remote"; index: number; url: string; selected: boolean; cover?: boolean }
  | { id: string; kind: "upload"; sha: string; path: string; w?: number; h?: number; page?: number; selected: boolean; cover?: boolean };

export const FIELD_LIMITS = {
  title: 200,
  description: 20_000,
  zone: 120,
  subzone: 120,
  address: 300,
  features: 80,
  featureLen: 160,
  rooms: 50,
  area: 100_000,
  price: 1_000_000_000,
} as const;

export const EMPTY_FIELDS: DraftFields = {
  title: "",
  description: "",
  operation: "",
  stay: "",
  price: null,
  bedrooms: null,
  bathrooms: null,
  squareMeters: null,
  zone: "",
  subzone: "",
  address: "",
  features: [],
  floor: "",
};

const intOrNull = (v: unknown, lo: number, hi: number): number | null | "bad" => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : "bad";
};
const str = (v: unknown, max: number): string | "bad" => {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") return "bad";
  const t = v.replace(/\u0000/g, "").trim();
  return t.length <= max ? t : "bad";
};

/** Valida lo que manda el navegador. Los campos vacíos valen (se marcan «Falta»). */
export function normalizeFields(input: unknown): { ok: true; fields: DraftFields } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_fields" };
  const o = input as Record<string, unknown>;
  const title = str(o.title, FIELD_LIMITS.title);
  const description = str(o.description, FIELD_LIMITS.description);
  const zone = str(o.zone, FIELD_LIMITS.zone);
  const subzone = str(o.subzone, FIELD_LIMITS.subzone);
  const address = str(o.address, FIELD_LIMITS.address);
  const floor = str(o.floor, 20);
  if ([title, description, zone, subzone, address, floor].includes("bad")) return { ok: false, error: "invalid_fields" };
  const operation = (o.operation ?? "") as string;
  if (!["", "sale", "rent"].includes(operation)) return { ok: false, error: "invalid_fields" };
  const stay = (o.stay ?? "") as string;
  if (!["", "long", "short"].includes(stay)) return { ok: false, error: "invalid_fields" };
  const price = intOrNull(o.price, 0, FIELD_LIMITS.price);
  const bedrooms = intOrNull(o.bedrooms, 0, FIELD_LIMITS.rooms);
  const bathrooms = intOrNull(o.bathrooms, 0, FIELD_LIMITS.rooms);
  const squareMeters = intOrNull(o.squareMeters, 0, FIELD_LIMITS.area);
  if ([price, bedrooms, bathrooms, squareMeters].includes("bad")) return { ok: false, error: "invalid_fields" };
  const rawFeatures = o.features ?? [];
  if (!Array.isArray(rawFeatures) || rawFeatures.length > FIELD_LIMITS.features) return { ok: false, error: "invalid_fields" };
  const features: string[] = [];
  for (const f of rawFeatures) {
    const t = str(f, FIELD_LIMITS.featureLen);
    if (t === "bad") return { ok: false, error: "invalid_fields" };
    if (t && !features.includes(t)) features.push(t);
  }
  return {
    ok: true,
    fields: {
      title: title as string,
      description: description as string,
      operation: operation as DraftFields["operation"],
      stay: (operation === "sale" ? "" : stay) as DraftFields["stay"],
      price: price as number | null,
      bedrooms: bedrooms as number | null,
      bathrooms: bathrooms as number | null,
      squareMeters: squareMeters as number | null,
      zone: zone as string,
      subzone: subzone as string,
      address: address as string,
      features,
      floor: floor as string,
    },
  };
}

/** Lo que falta para poder confirmar (en el orden en que se enseña). */
export function missingForConfirm(f: DraftFields): string[] {
  const out: string[] = [];
  if (!f.title.trim()) out.push("Título");
  if (!f.operation) out.push("Operación (venta o alquiler)");
  if (!f.price || f.price <= 0) out.push("Precio");
  if (!f.zone.trim()) out.push("Zona");
  return out;
}

/** Slug estable a partir del título y del id del borrador (un reintento da el mismo). */
export function draftSlug(title: string, draftId: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const suffix = draftId.replace(/[^0-9a-f]/gi, "").slice(0, 6).toLowerCase();
  return `${base || "propiedad"}-${suffix}`;
}

/** Referencia externa (external_id). Con «portales-externos» se mantiene la del
 *  portal (compatibilidad con lo ya importado y su deduplicación); con una
 *  agencia colaboradora va con espacio de nombres para no chocar con su feed
 *  (I-14). Un PDF: pdf:<hash 16>:<n.º de vivienda>. */
export function externalReference(args: {
  kind: DraftSourceKind;
  agencySlug: string;
  portal?: string | null;
  portalRef?: string | null;
  pdfHash?: string | null;
  part?: number | null;
}): string {
  if (args.kind === "pdf") return `pdf:${(args.pdfHash ?? "").slice(0, 16)}:${args.part ?? 1}`;
  const ref = (args.portalRef ?? "").trim();
  if (args.agencySlug === PORTALES_EXTERNOS) return ref;
  return `link:${args.portal ?? "web"}:${ref}`;
}

export const PORTALES_EXTERNOS = "portales-externos";

/** Planta escrita a mano → la característica que lee resolveFloor. */
export function floorFeature(floor: string): string | null {
  const t = floor.trim().toLowerCase();
  if (!t) return null;
  if (/^(atico|ático)$/.test(t)) return "Ático";
  if (/^(bajo|planta baja)$/.test(t)) return "Bajo";
  const n = t.match(/^(-?\d{1,2})(?:ª|º|a|o)?$/);
  return n ? `Planta ${n[1]}ª` : null;
}

/** La fila que recibe import_draft_create_property (columnas permitidas). */
export function propertyRow(args: {
  fields: DraftFields;
  draftId: string;
  externalId: string;
  sourceUrl: string | null;
  location?: { latitude: number; longitude: number; precision: string | null } | null;
}): Record<string, unknown> {
  const f = args.fields;
  const features = [...f.features];
  const ff = floorFeature(f.floor);
  if (ff && !features.some((x) => x.toLowerCase() === ff.toLowerCase())) features.unshift(ff);
  return {
    title: f.title.trim(),
    description: f.description.trim() || null,
    operation: f.operation,
    stay: f.operation === "rent" ? f.stay || null : null,
    price: f.price,
    bedrooms: f.bedrooms ?? 0,
    bathrooms: f.bathrooms ?? 0,
    square_meters: f.squareMeters,
    zone: f.zone.trim(),
    subzone: f.subzone.trim() || null,
    address: f.address.trim() || null,
    features,
    external_id: args.externalId,
    slug: draftSlug(f.title, args.draftId),
    source_url: args.sourceUrl,
    latitude: args.location?.latitude ?? null,
    longitude: args.location?.longitude ?? null,
    location_precision: args.location ? args.location.precision : null,
  };
}

/** Reordenar o quitar fotos SOLO con ids que ya están en el borrador: el
 *  navegador nunca añade URLs (I-11). `order` = ids seleccionados en orden;
 *  la primera es la portada. */
export function applyPhotoSelection(photos: DraftPhoto[], order: string[]): { ok: true; photos: DraftPhoto[] } | { ok: false; error: string } {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const seen = new Set<string>();
  for (const id of order) {
    if (!byId.has(id) || seen.has(id)) return { ok: false, error: "invalid_photos" };
    seen.add(id);
  }
  const chosen = order.map((id, i) => ({ ...byId.get(id)!, selected: true, cover: i === 0 }));
  const rest = photos.filter((p) => !seen.has(p.id)).map((p) => ({ ...p, selected: false, cover: false }));
  return { ok: true, photos: [...chosen, ...rest] as DraftPhoto[] };
}

/** Fotos de un borrador por enlace, a partir de lo que sacó el SERVIDOR. */
export function remotePhotosFromPreview(urls: string[]): DraftPhoto[] {
  return urls.slice(0, 60).map((url, index) => ({ id: `r-${index}`, kind: "remote" as const, index, url, selected: true, cover: index === 0 }));
}

export function selectedPhotos(photos: DraftPhoto[]): DraftPhoto[] {
  return photos.filter((p) => p.selected);
}

/** Qué pasa al confirmar (I-15): se enseña en la revisión, antes de crear. */
export function activationEffects(args: { notifyClients: boolean; collaborator: string | null; catalogTitle: string | null }): string[] {
  const out = [
    "Se crea la ficha como disponible, SIN publicar en la web pública.",
    "Ya disponible, puede aparecer en el portal del cliente con sesión y en las sugerencias del panel, y se comparte por /compartir y «Generar enlace».",
    args.notifyClients
      ? "Se avisará por correo a los clientes con alertas de propiedades nuevas que encajen (en el próximo envío)."
      : "No se avisará por correo a los clientes con alertas (puedes marcarlo si quieres que se avise).",
  ];
  if (args.collaborator) out.push(`Agencia colaboradora: ${args.collaborator}. Se verá como «Web de ${args.collaborator}» y no se le cambian las fotos automáticamente por las de su web.`);
  if (args.catalogTitle) out.push(`Se añadirá al catálogo «${args.catalogTitle}».`);
  return out;
}
