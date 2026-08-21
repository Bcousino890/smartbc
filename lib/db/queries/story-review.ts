// SmartLink 2.0 · lecturas de la cola de enriquecimiento.
//
// Todos los contadores y filas se derivan de PRODUCCIÓN evaluando el quality
// gate compartido (lib/services/story/gate.ts) — nada hardcodeado, nada
// cacheado. Una propiedad puede fallar varios gates: se clasifica en su bucket
// prioritario, pero `failures` conserva TODOS para que el filtro correcto la
// encuentre igualmente.

import { createAdminClient } from "@/lib/db/admin";
import {
  evaluateGate,
  QUEUE_BUCKETS,
  type GateFailure,
  type QueueBucket,
} from "@/lib/services/story/gate";
import { loadNeighborhoodIndex, lookupNeighborhood } from "@/lib/db/queries/neighborhoods";

/** Estado visible de la propiedad en el catálogo (SmartLink 2.0). */
export type StoryState = "published_complete" | "published_partial" | "fallback" | "blocked";

export type QueueRow = {
  propertyId: string;
  versionId: string;
  ref: string;
  slug: string;
  title: string;
  zone: string;
  operation: "sale" | "rent";
  available: boolean;
  photoCount: number;
  chapterCount: number;
  narrativeChapters: number;
  failures: GateFailure[];
  bucket: QueueBucket | null;
  buckets: QueueBucket[];
  generatedAt: string;
  reviewedAt: string | null;
  state: StoryState;
  /** Bloques excluidos del publish que siguen esperando revisión humana. */
  pendingBlocks: number;
};

export type QueueCounters = Record<QueueBucket | "total", number>;

/**
 * Evalúa TODAS las stories en borrador de propiedades activas y devuelve las
 * filas de la cola + contadores. Server-only (service role).
 */
export async function getEnrichmentQueue(): Promise<{
  rows: QueueRow[];
  counters: QueueCounters;
}> {
  const db = createAdminClient() as any;

  // Versiones en borrador cuya propiedad no tenga ya una aprobada.
  // Paginado: hay más de 1000 versiones (varias por propiedad tras las
  // regeneraciones de engine), y PostgREST corta en 1000 por defecto.
  const versions: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("property_story_versions")
      .select("id, property_id, created_at, reviewed_at, status")
      .eq("status", "generated")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error || !data?.length) break;
    versions.push(...data);
    if (data.length < 1000) break;
  }
  if (!versions.length) return { rows: [], counters: emptyCounters() };

  // Una sola versión (la más reciente) por propiedad.
  const latestByProperty = new Map<string, any>();
  for (const v of versions) {
    if (!latestByProperty.has(v.property_id)) latestByProperty.set(v.property_id, v);
  }

  const approvedRows = await fetchIn(
    db, "property_story_versions", "property_id", "property_id",
    [...latestByProperty.keys()],
  );
  const approved = new Set<string>(
    approvedRows.filter((r: any) => r.property_id).map((r: any) => r.property_id),
  );
  // fetchIn no filtra por status: se recalcula con una consulta directa.
  const { data: approvedList } = await db
    .from("property_story_versions")
    .select("property_id")
    .eq("status", "approved");
  approved.clear();
  for (const r of approvedList ?? []) approved.add(r.property_id);

  // La cola incluye DOS grupos:
  //  · borradores sin publicar (fallback → trabajo de enriquecimiento);
  //  · publicadas PARCIALES, que siguen teniendo bloques en conflicto
  //    pendientes de revisión aunque el cliente ya vea la story.
  const partials: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("property_story_versions")
      .select("id, property_id, created_at, reviewed_at, status")
      .eq("status", "approved")
      .range(from, from + 999);
    if (error || !data?.length) break;
    partials.push(...data);
    if (data.length < 1000) break;
  }

  const pending = [
    ...[...latestByProperty.values()].filter((v: any) => !approved.has(v.property_id)),
    ...partials,
  ];
  const pendingIds = [...new Set(pending.map((v: any) => v.property_id))];
  const versionIds = pending.map((v: any) => v.id);

  // Carga en bloque, PAGINADA: un `.in()` con 500+ UUIDs supera el límite de
  // longitud de URL de PostgREST y devuelve vacío en silencio. Se trocea.
  const [props, blocks, claims, photos, hoodIndex] = await Promise.all([
    fetchIn(db, "properties", "id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, operation, floor_override", "id", pendingIds),
    fetchIn(db, "property_story_blocks", "id, version_id, chapter, copy, status, claim_ids", "version_id", versionIds),
    fetchIn(db, "property_story_claims", "id, version_id, source_text, fact, category, conflict", "version_id", versionIds),
    fetchIn(db, "property_photos", "property_id, position, ai_class, ai_confidence, class_override", "property_id", pendingIds),
    loadNeighborhoodIndex(db),
  ]);

  const byProp = new Map<string, any>(props.map((p: any) => [p.id, p]));
  const blocksByVersion = groupBy(blocks, (b: any) => b.version_id);
  const claimsByVersion = groupBy(claims, (c: any) => c.version_id);
  const photosByProp = groupBy(photos, (p: any) => p.property_id);

  const rows: QueueRow[] = [];
  for (const v of pending) {
    const property = byProp.get(v.property_id);
    if (!property) continue;
    const blocks = blocksByVersion.get(v.id) ?? [];
    const claims = claimsByVersion.get(v.id) ?? [];
    const photos = (photosByProp.get(v.property_id) ?? []).sort((a: any, b: any) => a.position - b.position);

    const isPublished = v.status === "approved";
    // Bloques que el cliente NO ve y siguen esperando decisión humana.
    const pendingBlocks = blocks.filter(
      (b: any) => b.status === "conflict",
    ).length;

    // Una publicada-parcial sin bloques pendientes ya está resuelta: fuera.
    if (isPublished && pendingBlocks === 0) continue;

    const result = evaluateGate({
      property,
      blocks,
      claims,
      photos,
      neighborhoodDisplayName: lookupNeighborhood(hoodIndex, property.zone, property.subzone),
    });
    if (!isPublished && result.pass) continue; // publicable limpio: no es backlog

    const state: StoryState = isPublished
      ? pendingBlocks > 0
        ? "published_partial"
        : "published_complete"
      : result.failures.some((f) => ["few_chapters", "low_photos", "unavailable"].includes(f.code))
        ? "blocked"
        : "fallback";

    const buckets = [...new Set(
      result.failures
        .map((f) => (Object.keys(QUEUE_BUCKETS) as QueueBucket[]).find((b) => QUEUE_BUCKETS[b].codes.includes(f.code)))
        .filter(Boolean) as QueueBucket[],
    )];

    rows.push({
      propertyId: property.id,
      versionId: v.id,
      ref: property.bc_reference ?? property.slug,
      slug: property.slug,
      title: property.title ?? "",
      zone: property.subzone || property.zone || "—",
      operation: property.operation === "rent" ? "rent" : "sale",
      available: !property.archived_at && property.status !== "archived",
      photoCount: photos.length,
      chapterCount: blocks.filter((b: any) => b.status !== "rejected").length,
      narrativeChapters: result.narrativeChapters,
      failures: result.failures,
      bucket: result.bucket,
      buckets,
      generatedAt: v.created_at,
      reviewedAt: v.reviewed_at ?? null,
      state,
      pendingBlocks,
    });
  }

  const counters = emptyCounters();
  counters.total = rows.length;
  for (const r of rows) for (const b of r.buckets) counters[b]++;

  return { rows, counters };
}

/** Detalle de una propiedad para la pantalla de resolución. */
export async function getStoryReviewDetail(slug: string) {
  const db = createAdminClient() as any;
  const { data: property } = await db
    .from("properties")
    .select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, operation, bedrooms, bathrooms, square_meters, floor_override")
    .eq("slug", slug)
    .maybeSingle();
  if (!property) return null;

  const { data: version } = await db
    .from("property_story_versions")
    .select("id, status, created_at, reviewed_at, notes, model, provider")
    .eq("property_id", property.id)
    .in("status", ["generated", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return { property, version: null, blocks: [], claims: [], photos: [], gate: null };

  const [blocksRes, claimsRes, photosRes] = await Promise.all([
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids, confidence").eq("version_id", version.id).order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category, confidence, is_duplicate, conflict, conflict_reason").eq("version_id", version.id),
    db.from("property_photos").select("url, position, ai_class, ai_confidence, class_override").eq("property_id", property.id).order("position"),
  ]);

  const hoodIndex = await loadNeighborhoodIndex(db);

  const gate = evaluateGate({
    property,
    blocks: blocksRes.data ?? [],
    claims: claimsRes.data ?? [],
    photos: photosRes.data ?? [],
    neighborhoodDisplayName: lookupNeighborhood(hoodIndex, property.zone, property.subzone),
  });

  return {
    property,
    version,
    blocks: blocksRes.data ?? [],
    claims: claimsRes.data ?? [],
    photos: photosRes.data ?? [],
    gate,
  };
}

/**
 * `.in()` troceado + paginado. Dos límites de PostgREST que muerden a esta
 * escala: la longitud de la URL (≈500 UUIDs) y el tope de 1000 filas por
 * respuesta. Sin esto la cola devolvía 0 en silencio.
 */
async function fetchIn(
  db: any,
  table: string,
  columns: string,
  column: string,
  values: string[],
): Promise<any[]> {
  const CHUNK = 120;
  const PAGE = 1000;
  const out: any[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .in(column, slice)
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      out.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return out;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

function emptyCounters(): QueueCounters {
  return { total: 0, short: 0, conflict: 0, chapters: 0, photos: 0, other: 0 };
}
