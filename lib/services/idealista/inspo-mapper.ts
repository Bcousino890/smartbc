// Mapeadores para "sembrar" una inspo de Idealista automáticamente, sin rellenar
// el formulario a mano. Dos fuentes:
//   - previewToInspo:  desde un link externo (import-by-link → ImportPreview)
//   - propertyToInspo: desde una propiedad ya existente en el sistema
//
// Ambos devuelven un Partial<IdealistaListing> que el formulario carga como
// `initialData`. Lo que no se pueda inferir se deja en su default y el usuario
// lo corrige en la revisión antes de guardar el borrador.

import type { ImportPreview } from "@/lib/sync/import-by-link/types";
import type { IdealistaListing } from "@/app/[country]/(admin)/admin/publicacion/idealista-form";

// ── Utilidades de texto ──────────────────────────────────────────────────────

// Identidad de un anuncio por su URL: origen + path, sin query ni hash (Airbnb
// y otros portales añaden montones de parámetros volátiles). Se usa para
// detectar que ya existe una ficha sembrada desde el mismo anuncio.
export function normalizeSourceUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return (u.origin + u.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ¿Alguna feature contiene alguno de los términos buscados? (case/acento-insensible)
function hasFeature(features: string[], ...needles: string[]): boolean {
  const hay = features.map(normalize);
  return needles.some((n) => {
    const nn = normalize(n);
    return hay.some((h) => h.includes(nn));
  });
}

// Busca una clave en rawAttributes de forma laxa (la clave real puede variar:
// "Año construcción", "Año de construcción"…). Devuelve el valor como string.
function rawAttr(
  raw: Record<string, string | number | null> | undefined,
  ...keyNeedles: string[]
): string | null {
  if (!raw) return null;
  const needles = keyNeedles.map(normalize);
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    const nk = normalize(k);
    if (needles.some((n) => nk.includes(n))) return String(v);
  }
  return null;
}

function firstNumber(s: string | null): number | null {
  if (!s) return null;
  const m = s.replace(/\./g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

// ── Inferencias comunes (a partir de features + título + rawAttributes) ───────

type InferSource = {
  features: string[];
  title?: string | null;
  raw?: Record<string, string | number | null>;
  propertyTypeHint?: string | null;
};

// Booleanos de equipamiento/extras de Idealista a partir de las features en texto.
function inferBooleans(features: string[]): Partial<IdealistaListing> {
  return {
    hasElevator: hasFeature(features, "ascensor"),
    hasTerrace: hasFeature(features, "terraza"),
    hasBalcony: hasFeature(features, "balcon"),
    hasParking: hasFeature(features, "garaje", "parking", "aparcamiento", "plaza de garaje"),
    hasStorage: hasFeature(features, "trastero"),
    hasPool: hasFeature(features, "piscina"),
    hasGarden: hasFeature(features, "jardin"),
    hasWardrobes: hasFeature(features, "armario"),
    hasAC: hasFeature(features, "aire acondicionado", "climatizacion", "a/a", "aire"),
  };
}

// Tipo de inmueble + flags especiales (ático/estudio/dúplex). Idealista usa el
// tipo base "flat"/"house"/… y activa ático/estudio/dúplex como flags aparte.
function inferType(src: InferSource): Partial<IdealistaListing> {
  const hint = normalize(src.propertyTypeHint ?? "");
  const text = normalize(
    [src.title ?? "", ...src.features].join(" "),
  );
  const both = `${hint} ${text}`;

  const isPenthouse = /\batico\b|penthouse/.test(both);
  const isStudio = /\bestudio\b|\bstudio\b|loft/.test(both);
  const isDuplex = /\bduplex\b/.test(both);

  let propertyType = "flat";
  if (/chalet|casa|vivienda unifamiliar|adosad|paread/.test(both)) propertyType = "house";
  else if (/rustic/.test(both)) propertyType = "rustic";
  else if (/local|nave/.test(both)) propertyType = "commercial";
  else if (/garaje|parking/.test(hint)) propertyType = "garage";
  else if (/oficina|office/.test(both)) propertyType = "office";
  else if (/terreno|parcela|solar/.test(both)) propertyType = "land";
  else if (/trastero/.test(hint)) propertyType = "storage";
  else if (/edificio|building/.test(both)) propertyType = "building";
  else if (/habitacion|room/.test(hint)) propertyType = "room";
  else if (/piso|apartament|flat|apartment/.test(hint)) propertyType = "flat";

  return { propertyType, isPenthouse, isStudio, isDuplex };
}

function inferCondition(src: InferSource): IdealistaListing["condition"] {
  const estado = normalize(
    [rawAttr(src.raw, "estado", "conservacion") ?? "", ...src.features, src.title ?? ""].join(" "),
  );
  if (/obra nueva|a estrenar|nuevo|nueva construccion/.test(estado)) return "new";
  if (/para reformar|a reformar|necesita reforma/.test(estado)) return "needs-reform";
  if (/reformar|reforma/.test(estado)) return "to-reform";
  return "good";
}

function inferEquipment(features: string[]): IdealistaListing["equipmentType"] {
  if (hasFeature(features, "amueblado")) return "furnished";
  if (hasFeature(features, "cocina equipada", "cocina amueblada")) return "kitchen-only";
  if (hasFeature(features, "sin amueblar", "vacio")) return "empty";
  return "unknown";
}

function inferHeating(features: string[], raw?: Record<string, string | number | null>): IdealistaListing["heatingType"] {
  const txt = normalize([...features, rawAttr(raw, "calefaccion") ?? ""].join(" "));
  if (/calefaccion central|central/.test(txt)) return "centralized";
  if (/calefaccion individual|calefaccion/.test(txt)) return "individual";
  if (/sin calefaccion/.test(txt)) return "none";
  return "unknown";
}

// Divide una dirección de una sola línea en calle + número (best-effort). El
// usuario lo revisa igualmente. Ej: "Calle Mayor 12, Madrid" → {street:"Calle
// Mayor", number:"12"}.
function splitAddress(address: string | null): { street: string; number: string } {
  if (!address) return { street: "", number: "" };
  const firstPart = address.split(",")[0].trim();
  const m = firstPart.match(/^(.*?)[,\s]+(\d+[a-zA-Z]?)\s*$/);
  if (m) return { street: m[1].trim(), number: m[2].trim() };
  return { street: firstPart, number: "" };
}

// ── Mapeador desde link externo (ImportPreview) ──────────────────────────────

export function previewToInspo(
  preview: ImportPreview,
  photoUrls: string[],
): Partial<IdealistaListing> {
  const features = preview.features ?? [];
  const operation: IdealistaListing["operation"] =
    preview.operation === "sale" ? "sale" : "rent";
  const price = preview.price ?? 0;
  const { street, number } = splitAddress(preview.address);

  return {
    isInspo: true,
    inspoTitle: preview.title ?? "",
    ...inferType({
      features,
      title: preview.title,
      raw: preview.rawAttributes,
      propertyTypeHint: null,
    }),
    // Localización
    addressStreet: street,
    addressNumber: number,
    hasNoNumber: !number,
    addressCity: preview.zone ?? "",
    addressVisibility: "street",
    latitude: preview.latitude ?? 0,
    longitude: preview.longitude ?? 0,
    // Características
    squareMeters: preview.squareMeters ?? 0,
    floor: rawAttr(preview.rawAttributes, "planta") ?? "",
    bedrooms: preview.bedrooms ?? 0,
    bathrooms: preview.bathrooms ?? 0,
    condition: inferCondition({ features, title: preview.title, raw: preview.rawAttributes }),
    // Solo claves que contengan "construccion" (no el bare "año", que colaría
    // "Tamaño" → tamano y metería basura en el año).
    constructionYear: firstNumber(rawAttr(preview.rawAttributes, "ano construccion", "construccion")) ?? 0,
    // Precio (alquiler → totalRentalPrice; venta → price)
    operation,
    price: operation === "sale" ? price : 0,
    totalRentalPrice: operation === "rent" ? price : 0,
    rentalType: preview.stay === "short" ? "temporary" : "residential",
    // Equipamiento / extras
    equipmentType: inferEquipment(features),
    heatingType: inferHeating(features, preview.rawAttributes),
    ...inferBooleans(features),
    // Descripción y enlace de origen
    description: preview.description ?? "",
    externalLink: preview.sourceUrl ?? "",
    // Media ya re-alojada y limpia
    photos: photoUrls,
    // Vídeos extraídos del anuncio (enlace directo, sin re-alojar).
    videos: preview.videos ?? [],
  };
}

// ── Mapeador desde propiedad del sistema ─────────────────────────────────────

export type PropertyForInspo = {
  title: string | null;
  description: string | null;
  operation: string | null;
  stay: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  zone: string | null;
  address: string | null;
  features: string[] | null;
  latitude: number | null;
  longitude: number | null;
  property_type: string | null;
  source_url: string | null;
};

export function propertyToInspo(
  property: PropertyForInspo,
  photoUrls: string[],
): Partial<IdealistaListing> {
  const features = property.features ?? [];
  const operation: IdealistaListing["operation"] =
    property.operation === "sale" ? "sale" : "rent";
  const price = property.price ?? 0;
  const { street, number } = splitAddress(property.address);

  return {
    isInspo: true,
    inspoTitle: property.title ?? "",
    ...inferType({
      features,
      title: property.title,
      propertyTypeHint: property.property_type,
    }),
    addressStreet: street,
    addressNumber: number,
    hasNoNumber: !number,
    addressCity: property.zone ?? "",
    addressVisibility: "street",
    latitude: property.latitude ?? 0,
    longitude: property.longitude ?? 0,
    squareMeters: property.square_meters ?? 0,
    bedrooms: property.bedrooms ?? 0,
    bathrooms: property.bathrooms ?? 0,
    condition: inferCondition({ features, title: property.title }),
    operation,
    price: operation === "sale" ? price : 0,
    totalRentalPrice: operation === "rent" ? price : 0,
    rentalType: property.stay === "short" ? "temporary" : "residential",
    equipmentType: inferEquipment(features),
    heatingType: inferHeating(features),
    ...inferBooleans(features),
    description: property.description ?? "",
    externalLink: property.source_url ?? "",
    photos: photoUrls,
  };
}
