import "server-only";
import type { IdealistaRunInput } from "./schema";

/**
 * Runs y shards reportados por el scraper externo.
 *
 * El upsert va por `external_run_id`: el scraper manda el mismo id al abrir el
 * run (`status: "running"`) y al cerrarlo (`status: "completed"`), y aquí se
 * actualiza la misma fila. Sin esa clave, cada informe de progreso crearía un
 * run nuevo y el panel mostraría cientos de ejecuciones fantasma.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Traduce el `run_id` externo que viene en un listing al UUID interno del run.
 *
 * Devuelve null si ese run todavía no se ha reportado: correlacionar es un
 * extra, y perder un anuncio porque su run llegó después sería absurdo.
 */
export async function resolveRunId(db: Db, externalRunId: string | null): Promise<string | null> {
  if (!externalRunId) return null;
  const { data } = await db
    .from("idealista_scraper_runs")
    .select("id")
    .eq("external_run_id", externalRunId)
    .maybeSingle();
  return data?.id ?? null;
}

export type RunUpsertResult = {
  external_run_id: string;
  action: "created" | "updated";
  internal_id: string;
  shards: { created: number; updated: number };
};

export async function upsertIdealistaRun(
  db: Db,
  input: IdealistaRunInput,
  opts: { apiClientId: string | null; dryRun?: boolean },
): Promise<RunUpsertResult> {
  const now = new Date().toISOString();

  const { data: existing } = await db
    .from("idealista_scraper_runs")
    .select("id, started_at")
    .eq("external_run_id", input.external_run_id)
    .maybeSingle();

  if (opts.dryRun) {
    return {
      external_run_id: input.external_run_id,
      action: existing ? "updated" : "created",
      internal_id: existing?.id ?? "(dry-run)",
      shards: { created: 0, updated: (input.shards ?? []).length },
    };
  }

  const row: Record<string, unknown> = {
    external_run_id: input.external_run_id,
    run_type: input.run_type,
    api_client_id: opts.apiClientId,
  };

  // Ausente ≠ null, igual que en los listings: un informe de progreso que solo
  // trae contadores no debe borrar el worker_id que se mandó al abrir el run.
  const optional = [
    "status", "worker_id", "started_at", "finished_at",
    "listings_seen", "listings_sent", "new_listings", "updated_listings",
    "unchanged_listings", "missing_listings", "errors_count", "requests_used",
    "pages_scraped", "shards_total", "shards_success", "shards_failed",
    "reported_results", "unique_listing_ids_found", "coverage_percentage",
    "error_summary", "metadata",
  ] as const;
  for (const field of optional) {
    if (field in input) row[field] = (input as Record<string, unknown>)[field];
  }

  // started_at solo en el alta: un informe posterior no debe reescribir el
  // momento en que arrancó el run.
  if (!existing && !input.started_at) row.started_at = now;
  if (existing) delete row.started_at;

  // Un run que se cierra sin fecha se cierra ahora: sin finished_at no se puede
  // calcular la duración, y "completado en algún momento" no sirve de nada.
  const closing = input.status && ["completed", "partial", "failed", "stopped"].includes(input.status);
  if (closing && !input.finished_at) row.finished_at = now;

  const { data: saved, error } = await db
    .from("idealista_scraper_runs")
    .upsert(row, { onConflict: "external_run_id" })
    .select("id")
    .single();
  if (error) throw new Error(`upsert run: ${error.message}`);

  const shards = await upsertShards(db, input.shards ?? []);

  return {
    external_run_id: input.external_run_id,
    action: existing ? "updated" : "created",
    internal_id: saved.id as string,
    shards,
  };
}

/**
 * Shards del run.
 *
 * El troceado de las búsquedas lo decide el scraper (Idealista corta la
 * paginación a ~60 páginas, así que hay que partir por zona/precio hasta que
 * cada trozo quepa). Aquí solo se registra lo que él reporta, para poder ver
 * qué cobertura se alcanzó y qué trozos fallaron.
 */
async function upsertShards(
  db: Db,
  shards: NonNullable<IdealistaRunInput["shards"]>,
): Promise<{ created: number; updated: number }> {
  if (!shards || shards.length === 0) return { created: 0, updated: 0 };

  const externalIds = shards.map((s) => s.external_shard_id);
  const { data: current } = await db
    .from("idealista_market_shards")
    .select("id, external_shard_id")
    .in("external_shard_id", externalIds);
  const knownIds = new Map<string, string>(
    (current ?? []).map((s: { id: string; external_shard_id: string }) => [s.external_shard_id, s.id]),
  );

  const rows = shards.map((s) => {
    const { parent_external_shard_id: _parent, ...rest } = s;
    return rest;
  });

  const { error } = await db
    .from("idealista_market_shards")
    .upsert(rows, { onConflict: "external_shard_id" });
  if (error) throw new Error(`upsert shards: ${error.message}`);

  // El padre se enlaza en una segunda pasada: en un mismo lote puede venir el
  // hijo antes que el padre, y así no depende del orden del array.
  const withParent = shards.filter((s) => s.parent_external_shard_id);
  if (withParent.length > 0) {
    const parentExternalIds = [
      ...new Set(withParent.map((s) => s.parent_external_shard_id as string)),
    ];
    const { data: parents } = await db
      .from("idealista_market_shards")
      .select("id, external_shard_id")
      .in("external_shard_id", parentExternalIds);
    const parentIdByExternal = new Map<string, string>(
      (parents ?? []).map((p: { id: string; external_shard_id: string }) => [
        p.external_shard_id,
        p.id,
      ]),
    );
    for (const s of withParent) {
      const parentId = parentIdByExternal.get(s.parent_external_shard_id as string);
      if (parentId) {
        await db
          .from("idealista_market_shards")
          .update({ parent_shard_id: parentId })
          .eq("external_shard_id", s.external_shard_id);
      }
    }
  }

  const created = shards.filter((s) => !knownIds.has(s.external_shard_id)).length;
  return { created, updated: shards.length - created };
}
