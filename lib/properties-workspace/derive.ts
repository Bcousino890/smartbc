// ============================================================================
// PROPERTIES WORKSPACE · derivaciones puras
//
// Health, bloqueos de publicación y atención. Nada de esto se guarda: se
// calcula sobre la fila de `property_workspace_facts` cada vez, y por eso no
// puede desincronizarse de la realidad.
//
// El principio del health es NO FINGIR: la calidad fotográfica no se mide
// porque no hay metadatos por foto (resolución y marca de agua no se
// guardan) — se cuenta lo que sí se sabe. `now` entra por parámetro para que
// las pruebas no dependan del reloj.
// ============================================================================

import { normalizePropertyType } from "./normalize";
import {
  STALE_SYNC_DAYS,
  type HealthDimension,
  type HealthGrade,
  type PropertyAttention,
  type PropertyHealth,
  type PublicationBlocker,
} from "./types";

const DAY = 86_400_000;

/** El retrato mínimo. Campo a campo, para que quede escrito qué se mira. */
export type PropertyFacts = {
  title: string | null;
  description: string | null;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number | null;
  propertyType: string | null;
  propertyTypeOverride: string | null;
  status: string;
  publishedWeb: boolean;
  source: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSyncedAt: string | null;
  photoCount: number;
  hasCover: boolean;
  videoCount: number;
  planCount: number;
  interestSignals: number;
  upcomingStops: number;
};

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / DAY;
}

// ─── Publicación ─────────────────────────────────────────────────────────────

/**
 * Bloqueos V1, y solo estos: estado inválido, sin foto, sin título, sin
 * descripción, sin precio. Ni plano, ni vídeo, ni coordenadas — eso es mejora.
 */
export function derivePublicationBlockers(f: PropertyFacts): PublicationBlocker[] {
  const out: PublicationBlocker[] = [];
  if (f.status !== "available" && f.status !== "reserved") out.push("invalid_status");
  if (f.photoCount === 0 && !f.hasCover) out.push("no_photos");
  if (!f.title?.trim()) out.push("no_title");
  if (!f.description?.trim()) out.push("no_description");
  if (!(f.price > 0)) out.push("no_price");
  return out;
}

// ─── Health ──────────────────────────────────────────────────────────────────

function gradeCore(f: PropertyFacts): HealthGrade {
  const type = normalizePropertyType(f.propertyType, f.propertyTypeOverride);
  const missing = [
    !f.title?.trim(),
    !f.description?.trim(),
    !(f.price > 0),
    // Un estudio con 0 dormitorios está BIEN: es su definición, no un hueco.
    f.bedrooms === 0 && type !== "studio",
    f.bathrooms === 0,
    !(f.squareMeters && f.squareMeters > 0),
    type === "unknown",
  ].filter(Boolean).length;
  if (missing === 0) return "excellent";
  if (missing === 1) return "good";
  return "incomplete";
}

function gradeMedia(f: PropertyFacts): HealthGrade {
  if (f.photoCount >= 10) return "excellent";
  if (f.photoCount >= 5) return "good";
  if (f.photoCount >= 1) return "needs_attention";
  return "incomplete";
}

function gradeLocation(f: PropertyFacts): HealthGrade {
  const hasCoords = f.latitude !== null && f.longitude !== null;
  const hasAddress = Boolean(f.address?.trim());
  if (hasCoords && hasAddress) return "excellent";
  if (hasCoords || hasAddress) return "good";
  // Solo zona: es el 76% del catálogo. Incompleto, no urgente — la migración
  // §16 del sprint pide no pintar la mayoría de rojo.
  return "incomplete";
}

function gradeFreshness(f: PropertyFacts, now: Date): HealthGrade {
  // Una propiedad manual no tiene anuncio de origen que pueda quedarse rancio.
  if (f.source !== "scrape") return "good";
  const d = daysSince(f.lastSyncedAt, now);
  if (d === null) return "unknown";
  if (d <= 7) return "excellent";
  if (d <= STALE_SYNC_DAYS) return "good";
  return "needs_attention";
}

function gradePublication(f: PropertyFacts): HealthGrade {
  const blockers = derivePublicationBlockers(f);
  if (f.publishedWeb && blockers.length > 0) return "needs_attention"; // incoherencia
  if (f.publishedWeb) return "excellent";
  if (blockers.length === 0) return "good"; // lista, sin publicar: decisión, no fallo
  return "incomplete";
}

function gradeDemand(f: PropertyFacts): HealthGrade {
  if (f.interestSignals >= 3 || f.upcomingStops > 0) return "excellent";
  if (f.interestSignals >= 1) return "good";
  // Disponible y sin una sola señal: comercialmente ES un aviso.
  if (f.status === "available") return "needs_attention";
  return "unknown";
}

const GRADE_RANK: Record<HealthGrade, number> = {
  excellent: 4,
  good: 3,
  needs_attention: 2,
  incomplete: 1,
  unknown: 0,
};

/**
 * El global es el PEOR de los cuatro operativos (núcleo, media, frescura,
 * publicación). Ubicación y demanda se enseñan como dimensión pero no tiñen el
 * global: el 76% del catálogo solo tiene zona y eso convertiría el health en
 * un semáforo siempre en rojo — es decir, en ruido.
 */
export function deriveHealth(f: PropertyFacts, now: Date = new Date()): PropertyHealth {
  const dimensions: Record<HealthDimension, HealthGrade> = {
    core: gradeCore(f),
    media: gradeMedia(f),
    location: gradeLocation(f),
    freshness: gradeFreshness(f, now),
    publication: gradePublication(f),
    demand: gradeDemand(f),
  };
  const operative: HealthDimension[] = ["core", "media", "freshness", "publication"];
  let overall: HealthGrade = "excellent";
  for (const d of operative) {
    const g = dimensions[d];
    if (g === "unknown") continue; // no saber no es estar mal
    if (GRADE_RANK[g] < GRADE_RANK[overall]) overall = g;
  }
  return { overall, dimensions };
}

// ─── Atención ────────────────────────────────────────────────────────────────

/**
 * OPERATIVO mete a la propiedad en la cola "Necesitan atención"; MEJORA se
 * enseña al lado. Solo las disponibles reclaman: una archivada no pide nada.
 */
export function deriveAttention(
  f: PropertyFacts,
  now: Date = new Date(),
): PropertyAttention {
  const operational: PropertyAttention["operational"] = [];
  const enhancements: PropertyAttention["enhancements"] = [];

  if (f.status === "available") {
    const d = daysSince(f.lastSyncedAt, now);
    if (f.source === "scrape" && d !== null && d > STALE_SYNC_DAYS) {
      operational.push("stale_sync");
    }
    if (gradeCore(f) === "incomplete") operational.push("missing_core");
    if (f.photoCount === 0) operational.push("no_photos");
    if (f.publishedWeb && derivePublicationBlockers(f).length > 0) {
      operational.push("publication_inconsistency");
    }

    if (f.videoCount === 0) enhancements.push("no_video");
    if (f.planCount === 0) enhancements.push("no_plan");
    if (gradeLocation(f) !== "excellent") enhancements.push("incomplete_location");
  }

  return { operational, enhancements };
}

export function needsAttention(a: PropertyAttention): boolean {
  return a.operational.length > 0;
}
