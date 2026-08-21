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
};

export type QueueCounters = Record<QueueBucket | "total", number>;

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
  const { data: versions } = await db
    .from("property_story_versions")
    .select("id, property_id, created_at, reviewed_at, status")
    .eq("status", "generated")
    .order("created_at", { ascending: true });
  if (!versions?.length) {
    return { rows: [], counters: emptyCounters() };
  }

  const propertyIds = [...new Set(versions.map((v: any) => v.property_id))];
  const approved = new Set<string>(
    (
      await db
        .from("property_story_versions")
        .select("property_id")
        .eq("status", "approved")
        .in("property_id", propertyIds)
    ).data?.map((r: any) => r.property_id) ?? [],
  );

  const pending = versions.filter((v: any) => !approved.has(v.property_id));
  const pendingIds = pending.map((v: any) => v.property_id);
  const versionIds = pending.map((v: any) => v.id);

  // Carga en bloque (evita N+1 sobre ~500 propiedades).
  const [propsRes, blocksRes, claimsRes, photosRes, hoodsRes] = await Promise.all([
    db.from("properties")
      .select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, operation")
      .in("id", pendingIds),
    db.from("property_story_blocks").select("id, version_id, chapter, copy, status, claim_ids").in("version_id", versionIds).order("position"),
    db.from("property_story_claims").select("id, version_id, source_text, fact, category").in("version_id", versionIds),
    db.from("property_photos").select("property_id, position, ai_class, ai_confidence, class_override").in("property_id", pendingIds),
    db.from("neighborhoods").select("zone_key, display_name").eq("active", true),
  ]);

  const byProp = new Map<string, any>((propsRes.data ?? []).map((p: any) => [p.id, p]));
  const blocksByVersion = groupBy(blocksRes.data ?? [], (b: any) => b.version_id);
  const claimsByVersion = groupBy(claimsRes.data ?? [], (c: any) => c.version_id);
  const photosByProp = groupBy(photosRes.data ?? [], (p: any) => p.property_id);
  const hoodByKey = new Map<string, string>((hoodsRes.data ?? []).map((h: any) => [h.zone_key, h.display_name]));

  const rows: QueueRow[] = [];
  for (const v of pending) {
    const property = byProp.get(v.property_id);
    if (!property) continue;
    const blocks = blocksByVersion.get(v.id) ?? [];
    const claims = claimsByVersion.get(v.id) ?? [];
    const photos = (photosByProp.get(v.property_id) ?? []).sort((a: any, b: any) => a.position - b.position);
    const hoodKey = norm(property.subzone) || norm(property.zone);

    const result = evaluateGate({
      property,
      blocks,
      claims,
      photos,
      neighborhoodDisplayName: hoodByKey.get(hoodKey) ?? null,
    });
    if (result.pass) continue; // publicable: no es backlog

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
    .select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, operation, bedrooms, bathrooms, square_meters")
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

  const hoodKey = norm(property.subzone) || norm(property.zone);
  const { data: hood } = await db.from("neighborhoods").select("display_name").eq("zone_key", hoodKey).maybeSingle();

  const gate = evaluateGate({
    property,
    blocks: blocksRes.data ?? [],
    claims: claimsRes.data ?? [],
    photos: photosRes.data ?? [],
    neighborhoodDisplayName: hood?.display_name ?? null,
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
