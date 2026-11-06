import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { briefSuggestMissing } from "@/lib/clients/brief";
import { effectivePrice, evaluateMatch } from "@/lib/clients/brief-match";
import { applyPropertyPrefilter } from "@/lib/db/queries/suggested-properties";
import {
  evaluateParticularRow,
  particularCandidateQuery,
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
/** Filas por página y tope de seguridad por fuente y llamada (no se trunca nunca en silencio). */
export const PAGE_SIZE = 1000;
export const MAX_ROWS_PER_SOURCE = 30000;
export type LoadOptions = { pageSize?: number; maxRows?: number };
// `.in("id", …)` va por la URL: se trocea.
const ID_CHUNK = 100;

/**
 * Recorre una consulta por páginas con clave `id` (keyset: `id > último`, orden por id) hasta
 * agotarla. Si se alcanza `maxRows` con más filas pendientes, avisa con console.warn y para.
 */
async function pageAll(
  label: string,
  encargoId: string,
  opts: LoadOptions | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchPage: (afterId: string | null, size: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPage: (rows: any[]) => void,
): Promise<void> {
  const size = opts?.pageSize ?? PAGE_SIZE;
  const max = opts?.maxRows ?? MAX_ROWS_PER_SOURCE;
  let scanned = 0;
  let after: string | null = null;
  for (;;) {
    const room = max - scanned;
    const { data, error } = await fetchPage(after, Math.min(size, room));
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    scanned += rows.length;
    if (rows.length) onPage(rows);
    if (rows.length < Math.min(size, room)) return; // agotada
    after = String(rows[rows.length - 1].id);
    if (scanned >= max) {
      console.warn(
        `[encargos] matching truncado: encargo ${encargoId}, fuente ${label}: tope de ${max} filas alcanzado con más resultados pendientes`,
      );
      return;
    }
  }
}

/** `timestamp` de Postgres (con o sin zona, o solo fecha) → ISO UTC. Sin zona se entiende UTC (así guarda la BD). */
function toIso(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const t = s.replace(" ", "T");
  const withZone = /^\d{4}-\d{2}-\d{2}$/.test(t)
    ? `${t}T00:00:00Z`
    : /T.*(Z|[+-]\d{2}(:?\d{2})?)$/.test(t)
      ? t
      : `${t}Z`;
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

type Window = { since?: string; until?: string };

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

async function loadProperties(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  encargo: Encargo,
  w: Window,
  lo?: LoadOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const brief = encargo.brief;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = new Map<string, any>();
  const paged = (q: any) => (after: string | null, size: number) => {
    let qq = q();
    if (after) qq = qq.gt("id", after);
    return qq.order("id", { ascending: true }).limit(size);
  };
  const keep = (rs: { id: string }[]) => rs.forEach((r) => rows.set(r.id, r));
  if (!w.since) {
    await pageAll("properties", encargo.id, lo, paged(() => propertyQuery(supabase, brief)), keep);
    return [...rows.values()];
  }
  // «Nuevo» = creada en (since, until], o que pasó a «available» en esa ventana
  // (property_history, escrita por trigger desde la migración 0143: kind='status').
  await pageAll(
    "properties",
    encargo.id,
    lo,
    paged(() => propertyQuery(supabase, brief).gt("created_at", w.since).lte("created_at", w.until)),
    keep,
  );
  const ids = new Set<string>();
  await pageAll(
    "property_history",
    encargo.id,
    lo,
    paged(() =>
      supabase
        .from("property_history")
        .select("id, property_id")
        .eq("kind", "status")
        .eq("new_value", "available")
        .gt("created_at", w.since)
        .lte("created_at", w.until),
    ),
    (hs) => hs.forEach((h: { property_id: string }) => !rows.has(h.property_id) && ids.add(h.property_id)),
  );
  const list = [...ids];
  for (let i = 0; i < list.length; i += ID_CHUNK) {
    const { data, error } = await propertyQuery(supabase, brief).in("id", list.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`properties: ${error.message}`);
    keep(data ?? []);
  }
  return [...rows.values()];
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
  lo?: LoadOptions,
): Promise<ItemMatch[]> {
  // Defensivo: el cargador ya filtra `duplicate_of IS NULL`, así que normalmente cada anuncio es su
  // propio principal; si llegase una copia, se queda una sola entrada por principal (la mejor).
  const best = new Map<string, ItemMatch>();
  await pageAll(
    "particulares",
    encargo.id,
    lo,
    (after, size) => {
      let q = particularCandidateQuery(
        supabase,
        encargo.brief,
        w.since ? { createdAfter: w.since, createdBefore: w.until } : undefined,
      );
      if (after) q = q.gt("id", after);
      return q.order("id", { ascending: true }).limit(size);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rows: any[]) => {
      for (const r of rows) {
        if (r.fraud_status === "confirmed") continue;
        const outcome = evaluateParticularRow(encargo.brief, r);
        if (outcome.excluded) continue;
        const warnings = r.fraud_status ? [...outcome.warnings, SUSPECT_WARNING] : outcome.warnings;
        const m: ItemMatch = { item: toItem("particular", r), score: outcome.score, reasons: outcome.reasons, warnings };
        const prev = best.get(m.item.canonicalId);
        if (!prev || prev.score < m.score) best.set(m.item.canonicalId, m);
      }
    },
  );
  return [...best.values()];
}

async function run(encargo: Encargo, w: Window, lo?: LoadOptions): Promise<ItemMatch[]> {
  // Un encargo pausado/cerrado o sin lo mínimo (zona y presupuesto) no cruza nada.
  if (encargo.status !== "active" || briefSuggestMissing(encargo.brief).length > 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const [props, parts] = await Promise.all([
    loadProperties(supabase, encargo, w, lo).then((rows) => matchProperties(encargo, rows)),
    matchParticulares(supabase, encargo, w, lo),
  ]);
  return [...props, ...parts].sort((a, b) => b.score - a.score);
}

/** Todo el stock actual de las dos fuentes que encaja con el encargo (paginado, nunca truncado en silencio). */
export async function matchStockForEncargo(encargo: Encargo, lo?: LoadOptions): Promise<ItemMatch[]> {
  return run(encargo, {}, lo);
}

/**
 * Lo nuevo en la ventana semiabierta (sinceIso, untilIso]: creado en ella (propiedades: o que pasó a
 * «available» en ella). Un elemento creado exactamente en `untilIso` pertenece a ESTA ventana y no
 * a la siguiente.
 *
 * CONTRATO para el llamador (el cron): calcula `untilIso = ahora − 15 min` UNA vez por pasada (así
 * el enlazador de duplicados `link-twins` ya ha corrido sobre todo lo incluido) y guarda `untilIso`
 * como `sinceIso` de la pasada siguiente. Las ventanas encajan sin huecos ni solapes. Sin copias
 * (`duplicate_of`), sin fraude confirmado, activo y sin baja.
 */
export async function matchNewForEncargo(
  encargo: Encargo,
  window: { sinceIso: string; untilIso: string },
  lo?: LoadOptions,
): Promise<ItemMatch[]> {
  return run(encargo, { since: window.sinceIso, until: window.untilIso }, lo);
}
