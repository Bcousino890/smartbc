/**
 * Estados de pin y embudo del mapa de captaciones.
 * Módulo PURO: sin acceso a base de datos ni a Next (se prueba con node directamente).
 */

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  price: number;
  operation: "rent" | "sale";
  bedrooms: number | null;
  squareMeters: number | null;
  title: string;
  address: string | null;
  zone: string | null;
  coverUrl: string | null;
  portal: string | null;
  sourceUrl: string | null;
  isNew: boolean;
  isAgency: boolean;
  priceDropPct: number | null;
};

export type PinTier = "match" | "partial" | "nomatch" | "out";

/** Clasifica un pin: fuera de zona, o por puntuación (sin cliente = parcial). */
export function classifyPin(args: {
  inZone: boolean;
  score: number | null;
}): PinTier {
  if (!args.inZone) return "out";
  if (args.score === null) return "partial";
  if (args.score >= 80) return "match";
  if (args.score >= 60) return "partial";
  return "nomatch";
}

export type Funnel = {
  inZone: number;
  priceOk: number;
  matches: number;
  newIn24h: number;
  avgPrice: number | null;
  withoutLocation: number;
};

/** Embudo de la zona: en zona → precio ok → encajan, más novedades y precio medio de alquiler. */
export function computeFunnel(
  pins: MapPin[],
  inZoneIds: Set<string>,
  scores: Map<string, number>,
  opts: {
    maxPrice: number | null;
    operation: "rent" | "sale" | null;
    withoutLocation: number;
  },
): Funnel {
  let inZone = 0;
  let priceOk = 0;
  let matches = 0;
  let newIn24h = 0;
  let rentSum = 0;
  let rentCount = 0;
  for (const p of pins) {
    if (!inZoneIds.has(p.id)) continue;
    inZone++;
    const opOk = opts.operation === null || p.operation === opts.operation;
    if (opts.maxPrice === null || (opOk && p.price <= opts.maxPrice)) priceOk++;
    if ((scores.get(p.id) ?? -1) >= 80) matches++;
    if (p.isNew) newIn24h++;
    if (p.operation === "rent") {
      rentSum += p.price;
      rentCount++;
    }
  }
  return {
    inZone,
    priceOk,
    matches,
    newIn24h,
    avgPrice: rentCount ? Math.round(rentSum / rentCount) : null,
    withoutLocation: opts.withoutLocation,
  };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Convierte una fila de `particulares` en pin. Devuelve null si faltan
 * coordenadas finitas o un precio finito > 0 (un NaN envenenaría el precio
 * medio del embudo). Nunca copia teléfono, propietario ni descripción.
 */
export function rowToMapPin(row: Record<string, unknown>): MapPin | null {
  const lat = num(row.latitude);
  const lng = num(row.longitude);
  const price = num(row.price);
  if (lat === null || lng === null || price === null || price <= 0) return null;
  if (typeof row.id !== "string" && typeof row.id !== "number") return null;

  const address = str(row.address);
  const zone = str(row.zone);
  const title = str(row.title) ?? ([address, zone].filter(Boolean).join(", ") || "Anuncio");
  const detected = typeof row.detected_at === "string" ? Date.parse(row.detected_at) : NaN;
  const isNew = Number.isFinite(detected) && Date.now() - detected < 24 * 3600 * 1000;

  return {
    id: String(row.id),
    lat,
    lng,
    price,
    operation: row.operation === "sale" ? "sale" : "rent",
    bedrooms: num(row.bedrooms),
    squareMeters: num(row.square_meters),
    title,
    address,
    zone,
    coverUrl: str(row.cover_url),
    portal: str(row.portal),
    sourceUrl: str(row.source_url),
    isNew,
    isAgency: row.advertiser_type === "professional",
    priceDropPct: num(row.price_drop_pct),
  };
}

/** Aplica el tope de pines y marca si había más (pura; se prueba con node). */
export function capPins(pins: MapPin[], max: number): { pins: MapPin[]; truncated: boolean } {
  if (pins.length <= max) return { pins, truncated: false };
  return { pins: pins.slice(0, max), truncated: true };
}
