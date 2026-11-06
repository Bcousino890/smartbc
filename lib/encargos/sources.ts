import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { briefSuggestMissing } from "@/lib/clients/brief";
import { effectivePrice, evaluateMatch } from "@/lib/clients/brief-match";
import { applyPropertyPrefilter } from "@/lib/db/queries/suggested-properties";
import {
  evaluateParticularRow,
  loadParticularCandidates,
  particularFeatureList,
} from "@/lib/db/queries/suggested-particulares";
import type { Encargo, EncargoSource } from "./model";

// ============================================================================
// Fuentes del matching por encargo (solo España). Dos fuentes:
//  · `property`   — propiedades del CRM (tabla `properties`).
//  · `particular` — anuncios de portales (tabla `particulares`), que es también lo que
//                   enseña /es/admin/captaciones. La tabla `captaciones` es de Chile y no entra.
// Se reutilizan los motores existentes SIN tocar la puntuación: `evaluateMatch` (propiedades) y
// `evaluateParticularRow` (particulares). Ambos leen el TEXTO: título, descripción y
// características (regex sobre texto sin tildes).
// ============================================================================

export { particularFeatureList };

export type SourceItem = {
  source: EncargoSource;
  id: string;
  /** Id del anuncio principal: `duplicate_of ?? id` en particulares, `id` en propiedades. */
  canonicalId: string;
  title: string;
  zone: string | null;
  price: number;
  /** ISO 8601 en UTC. */
  createdAt: string;
};

export type ItemMatch = { item: SourceItem; score: number; reasons: string[]; warnings: string[] };

const SUSPECT_WARNING = "Anuncio marcado como sospechoso de fraude: verificar antes de contactar";
const CANDIDATE_LIMIT = 1000;
// `.in("id", …)` va por la URL: se trocea.
const ID_CHUNK = 100;

/** `timestamp` de Postgres (con o sin zona) → ISO UTC. Sin zona se entiende UTC (así guarda la BD). */
function toIso(v: unknown): string {
  const s = String(v ?? "");
  if (!s) return "";
  const withZone = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toItem(source: EncargoSource, r: any, price?: number): SourceItem {
  const id = String(r.id);
  const title =
    (typeof r.title === "string" && r.title.trim()) ||
    [r.address, r.zone].filter(Boolean).join(", ") ||
    "Anuncio";
  return {
    source,
    id,
    canonicalId: source === "particular" && r.duplicate_of ? String(r.duplicate_of) : id,
    title,
    zone: r.zone ?? null,
    price: price ?? Number(r.price ?? 0),
    createdAt: toIso(r.created_at),
  };
}

/** Filas de una fuente → `SourceItem` (resuelve `duplicate_of` al anuncio principal). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sourceItemsFromRows(source: EncargoSource, rows: any[]): SourceItem[] {
  return rows.map((r) => toItem(source, r));
}

const PROPERTY_COLUMNS =
  "id, title, description, zone, subzone, latitude, longitude, bedrooms, bathrooms, square_meters, " +
  "price, rent_price, operation, operations, stay, property_type, features, features_manual, " +
  "floor_override, available_from, created_at, property_photos(id)";

type Window = { since?: string; cutoff?: string };

/** Propiedades candidatas: solo publicadas/disponibles, de España, con el prefiltro del encargo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function propertyQuery(supabase: any, brief: Encargo["brief"]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (supabase.from("properties").select(PROPERTY_COLUMNS) as any)
    .eq("status", "available")
    .is("archived_at", null)
    // Fichas de referencia de Idealista: nunca se sugieren.
    .not("reference_only", "is", true)
    .eq("country", "es");
  return applyPropertyPrefilter(q, brief);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProperties(supabase: any, brief: Encargo["brief"], w: Window): Promise<any[]> {
  if (!w.since) {
    const { data, error } = await propertyQuery(supabase, brief)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (error) throw new Error(`properties: ${error.message}`);
    return data ?? [];
  }
  // «Nuevo» = creada después de `since`, o que pasó a «available» después de `since`
  // (property_history, escrita por trigger desde la migración 0143: kind='status').
  const byCreation = propertyQuery(supabase, brief).gt("created_at", w.since).lte("created_at", w.cutoff);
  const hist = await supabase
    .from("property_history")
    .select("property_id")
    .eq("kind", "status")
    .eq("new_value", "available")
    .gt("created_at", w.since)
    .lte("created_at", w.cutoff)
    .limit(CANDIDATE_LIMIT);
  if (hist.error) throw new Error(`property_history: ${hist.error.message}`);
  const created = await byCreation.order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  if (created.error) throw new Error(`properties: ${created.error.message}`);
  const rows = new Map<string, unknown>((created.data ?? []).map((r: { id: string }) => [r.id, r]));
  const ids = [...new Set<string>((hist.data ?? []).map((h: { property_id: string }) => h.property_id))].filter((id) => !rows.has(id));
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await propertyQuery(supabase, brief).in("id", ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`properties: ${error.message}`);
    for (const r of data ?? []) rows.set(r.id, r);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...rows.values()] as any[];
}

function matchProperties(encargo: Encargo, rows: Record<string, unknown>[]): ItemMatch[] {
  const brief = encargo.brief;
  const out: ItemMatch[] = [];
  for (const r of rows) {
    const photos = Array.isArray(r.property_photos) ? r.property_photos.length : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = r as any;
    const outcome = evaluateMatch(brief, { ...prop, photoCount: photos });
    if (outcome.excluded) continue;
    const price = effectivePrice(prop, brief.operation) ?? Number(prop.price);
    out.push({ item: toItem("property", prop, price), score: outcome.score, reasons: outcome.reasons, warnings: outcome.warnings });
  }
  return out;
}

async function matchParticulares(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  encargo: Encargo,
  w: Window,
): Promise<ItemMatch[]> {
  const { data, error } = await loadParticularCandidates(
    supabase,
    encargo.brief,
    w.since ? { createdAfter: w.since, createdBefore: w.cutoff } : undefined,
  );
  if (error) throw new Error(`particulares: ${error.message}`);
  // Una sola entrada por anuncio principal (la mejor puntuada).
  const best = new Map<string, ItemMatch>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    if (r.fraud_status === "confirmed") continue;
    const outcome = evaluateParticularRow(encargo.brief, r);
    if (outcome.excluded) continue;
    const warnings = r.fraud_status ? [...outcome.warnings, SUSPECT_WARNING] : outcome.warnings;
    const m: ItemMatch = { item: toItem("particular", r), score: outcome.score, reasons: outcome.reasons, warnings };
    const prev = best.get(m.item.canonicalId);
    if (!prev || prev.score < m.score) best.set(m.item.canonicalId, m);
  }
  return [...best.values()];
}

async function run(encargo: Encargo, w: Window): Promise<ItemMatch[]> {
  // Un encargo pausado/cerrado o sin lo mínimo (zona y presupuesto) no cruza nada.
  if (encargo.status !== "active" || briefSuggestMissing(encargo.brief).length > 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const [props, parts] = await Promise.all([
    loadProperties(supabase, encargo.brief, w).then((rows) => matchProperties(encargo, rows)),
    matchParticulares(supabase, encargo, w),
  ]);
  return [...props, ...parts].sort((a, b) => b.score - a.score);
}

/** Todo el stock actual de las dos fuentes que encaja con el encargo. */
export async function matchStockForEncargo(encargo: Encargo): Promise<ItemMatch[]> {
  return run(encargo, {});
}

/**
 * Lo creado después de `sinceIso` (propiedades: o que pasó a «available» después) y con al menos
 * `notYoungerThanMin` minutos de vida, para que el enlazador de duplicados (`link-twins`) ya haya
 * corrido. Sin copias (`duplicate_of`), sin fraude confirmado, activo y sin baja.
 */
export async function matchNewForEncargo(
  encargo: Encargo,
  sinceIso: string,
  notYoungerThanMin: number,
): Promise<ItemMatch[]> {
  const cutoff = new Date(Date.now() - Math.max(0, notYoungerThanMin) * 60_000).toISOString();
  return run(encargo, { since: sinceIso, cutoff });
}
