import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { apiErrors } from "@/lib/api/errors";
import type { ApiClientRow } from "@/lib/api/types";
import {
  adminUrl,
  upsertCaptacionFromApi,
  type CaptacionUpsertInput,
  type CaptacionUpsertResult,
} from "@/lib/captaciones/write/upsert-captacion";
import { getStagesForPipeline } from "@/lib/captaciones/pipeline";
import { CaptacionInputSchema } from "./schema";
import type { CaptacionInput, CaptacionPatchInput } from "./schema";

/**
 * Servicio de captaciones de la API v1: adapta el contrato público al motor de
 * upsert compartido y resuelve las lecturas (listado, ficha completa y baja).
 */

// El contrato zod y el input del motor son estructuralmente el mismo objeto;
// esta función existe para que el punto de traducción sea explícito y para
// inyectar el external_id en los PATCH (que lo llevan en la URL).
export function toUpsertInput(
  payload: CaptacionInput | CaptacionPatchInput,
  externalId?: string
): CaptacionUpsertInput {
  const external_id = externalId ?? (payload as CaptacionInput).external_id;
  if (!external_id) {
    throw apiErrors.validation("Falta external_id");
  }
  return { ...payload, external_id } as CaptacionUpsertInput;
}

export async function upsertCaptacion(
  client: ApiClientRow,
  payload: CaptacionInput,
  opts: { dryRun?: boolean } = {}
): Promise<CaptacionUpsertResult> {
  return upsertCaptacionFromApi(client, toUpsertInput(payload), opts);
}

export type BatchItemResult =
  | ({ index: number; ok: true } & CaptacionUpsertResult)
  | {
      index: number;
      ok: false;
      external_id: string | null;
      error: {
        code: string;
        message: string;
        details?: { field?: string; message: string }[];
      };
    };

/** `external_id` del elemento crudo, para poder identificarlo aunque no valide. */
function rawExternalId(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const value = (item as Record<string, unknown>).external_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Procesa un lote. Ningún elemento puede tumbar al resto — ni por un error de
 * negocio ni por uno de validación.
 *
 * Los elementos llegan SIN validar (ver CaptacionBatchEnvelopeSchema) y se
 * validan aquí uno a uno. Es lo que permite que un lote de 100 con una ficha
 * mal formada suba las otras 99 en vez de perderlas todas, y que el integrador
 * sepa exactamente cuál corregir por su índice y su external_id.
 */
export async function upsertCaptacionBatch(
  client: ApiClientRow,
  items: unknown[],
  opts: { dryRun?: boolean; defaultOptions?: CaptacionInput["options"] } = {}
): Promise<{ results: BatchItemResult[]; summary: BatchSummary }> {
  const results: BatchItemResult[] = [];
  const summary: BatchSummary = {
    total: items.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };

  for (let index = 0; index < items.length; index++) {
    const raw = items[index];

    // 1 · Validación del elemento, aislada del resto del lote.
    const parsed = CaptacionInputSchema.safeParse(raw);
    if (!parsed.success) {
      summary.failed += 1;
      results.push({
        index,
        ok: false,
        external_id: rawExternalId(raw),
        error: {
          code: "validation_error",
          message: "El elemento no cumple el contrato",
          details: parsed.error.issues.slice(0, 20).map((issue) => ({
            field: issue.path.map((p) => String(p)).join(".") || undefined,
            message: issue.message,
          })),
        },
      });
      continue;
    }

    // Las opciones del lote sirven de valor por defecto para el elemento.
    const item: CaptacionInput = opts.defaultOptions
      ? { ...parsed.data, options: parsed.data.options ?? opts.defaultOptions }
      : parsed.data;

    // 2 · Procesado, también aislado.
    try {
      const result = await upsertCaptacionFromApi(client, toUpsertInput(item), {
        dryRun: opts.dryRun,
      });
      results.push({ index, ok: true, ...result });
      if (result.action === "created") summary.created += 1;
      else if (result.action === "updated") summary.updated += 1;
      else summary.unchanged += 1;
    } catch (err) {
      summary.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code ?? "internal_error";
      console.error(`[api captaciones batch #${index}]`, err);
      results.push({
        index,
        ok: false,
        external_id: item.external_id,
        error: { code, message },
      });
    }
  }

  return { results, summary };
}

export type BatchSummary = {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
};

// ─── Lecturas ───────────────────────────────────────────────────────────────

const FICHA_COLUMNS = `
  id, country, external_id, external_source, external_synced_at, origin, status,
  rejected_by, pipeline_id, stage_id, assigned_to, created_at, updated_at, completed_at,
  converted_to_property_id, source_url, source_site, title, description,
  operation, price, currency, bedrooms, bathrooms, square_meters,
  useful_square_meters, property_type, features, cover_photo_url, broker_name,
  external_reference, portal_publication_number, published_ago, region, commune,
  zone, subzone, address_scraped, address_real, address_verified, latitude,
  longitude, rol_propiedad, owner_name, owner_phone, owner_contact,
  owner_confirmed, notes, revision_notes, next_action_at, next_action_note,
  last_contact_attempt_at, scrape_status, scraped_at, updated_by_user_at
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function findByExternalId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  client: ApiClientRow,
  externalId: string
): Promise<Row | null> {
  const { data } = await db
    .from("captaciones")
    .select(FICHA_COLUMNS)
    .eq("api_client_id", client.id)
    .eq("external_id", externalId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Marca el origen de cada contacto y oculta el id interno del cliente API.
 *
 * `source: "panel"` es el dato que más le sirve a una integración: significa que
 * lo añadió o corrigió una persona del equipo tras hablar con el propietario, y
 * suele ser mejor dato que el de origen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withContactSource(rows: any[]): Record<string, unknown>[] {
  return (rows ?? []).map(({ api_client_id, ...rest }) => ({
    ...rest,
    source: api_client_id ? "api" : "panel",
  }));
}

/** Ficha completa: exactamente lo que muestran las seis pestañas del panel. */
export async function getCaptacionDetail(
  client: ApiClientRow,
  externalId: string
): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const captacion = await findByExternalId(db, client, externalId);
  if (!captacion) {
    throw apiErrors.notFound(`No existe ninguna captación con external_id "${externalId}"`);
  }

  const [contacts, photos, listings, attempts, stage] = await Promise.all([
    db
      .from("captacion_contacts")
      .select("id, external_id, contact_type, contact_name, phone, email, has_whatsapp, relationship, rut, photo_url, extra_phones, api_client_id, created_at, updated_at")
      .eq("captacion_id", captacion.id)
      .order("created_at", { ascending: true })
      .then((r: Row) => r.data ?? []),
    db
      .from("captacion_photos")
      .select("id, external_id, url, source_url, position, created_at")
      .eq("captacion_id", captacion.id)
      .order("position", { ascending: true })
      .then((r: Row) => r.data ?? []),
    db
      .from("captacion_listings")
      .select("*")
      .eq("captacion_id", captacion.id)
      .order("created_at", { ascending: true })
      .then((r: Row) => r.data ?? []),
    db
      .from("captacion_logs")
      .select("id, external_id, attempt_type, result, owner_phone, owner_name, owner_contact, address_real, notes, photo_url, created_at")
      .eq("captacion_id", captacion.id)
      .order("created_at", { ascending: false })
      .then((r: Row) => r.data ?? []),
    resolveStageInfo(db, captacion.pipeline_id, captacion.stage_id),
  ]);

  // Historial de precios de cada aviso.
  const listingIds = listings.map((l: Row) => l.id);
  let prices: Row[] = [];
  if (listingIds.length > 0) {
    const { data } = await db
      .from("captacion_listing_prices")
      .select("id, listing_id, price, currency, source, scraped_at")
      .in("listing_id", listingIds)
      .order("scraped_at", { ascending: false });
    prices = data ?? [];
  }

  const listingsWithPrices = listings.map((listing: Row) => ({
    ...listing,
    price_history: prices.filter((p) => p.listing_id === listing.id),
  }));

  return {
    ...captacion,
    admin_url: adminUrl(captacion.country, captacion.id),
    stage,
    contacts: withContactSource(contacts),
    photos,
    listings: listingsWithPrices,
    attempts,
  };
}

async function resolveStageInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  pipelineId: string | null,
  stageId: string | null
): Promise<{ key: string; label: string; stage_type: string } | null> {
  if (!pipelineId || !stageId) return null;
  try {
    const stages = await getStagesForPipeline(pipelineId);
    const stage = stages.find((s) => s.id === stageId);
    return stage ? { key: stage.key, label: stage.label, stage_type: stage.stage_type } : null;
  } catch {
    return null;
  }
}

export type ListParams = {
  limit: number;
  cursor: string | null;
  updatedSince: string | null;
  stage: string | null;
  /**
   * `panel` devuelve solo lo que ha tocado una PERSONA desde el panel, y ordena
   * por esa marca. Es lo que permite a una integración sondear el trabajo del
   * equipo sin recibir el eco de sus propios envíos: `updated_at` avanza también
   * con los push de la propia integración, `updated_by_user_at` no.
   */
  changedBy: "panel" | null;
};

export type ListResult = {
  items: Row[];
  next_cursor: string | null;
  has_more: boolean;
};

/**
 * Listado paginado por cursor sobre (updated_at, id). El cursor es opaco para
 * el proveedor: se codifica en base64url y solo lo interpreta este módulo.
 */
export async function listCaptaciones(
  client: ApiClientRow,
  params: ListParams
): Promise<ListResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Con changed_by=panel se filtra y pagina por la marca de cambio humano.
  const sortColumn = params.changedBy === "panel" ? "updated_by_user_at" : "updated_at";

  let query = db
    .from("captaciones")
    .select(FICHA_COLUMNS)
    .eq("api_client_id", client.id)
    .order(sortColumn, { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit + 1);

  if (params.changedBy === "panel") {
    // NULL = nadie la ha tocado a mano desde que existe la marca.
    query = query.not("updated_by_user_at", "is", null);
  }

  if (params.updatedSince) {
    query = query.gte(sortColumn, params.updatedSince);
  }

  const cursor = decodeCursor(params.cursor);
  if (cursor) {
    // Estrictamente anteriores al cursor en el orden (columna desc, id desc).
    query = query.or(
      `${sortColumn}.lt.${cursor.updatedAt},and(${sortColumn}.eq.${cursor.updatedAt},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  let items: Row[] = data ?? [];

  if (params.stage) {
    const wanted = params.stage.toLowerCase();
    const stageIds = await stageIdsByKey(db, client.country, wanted);
    items = items.filter((row) => row.stage_id && stageIds.has(row.stage_id));
  }

  const hasMore = items.length > params.limit;
  const page = hasMore ? items.slice(0, params.limit) : items;
  const last = page[page.length - 1];

  return {
    items: page.map((row) => ({ ...row, admin_url: adminUrl(row.country, row.id) })),
    next_cursor:
      hasMore && last ? encodeCursor(last[sortColumn] as string, last.id) : null,
    has_more: hasMore,
  };
}

async function stageIdsByKey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  country: string,
  key: string
): Promise<Set<string>> {
  const { data: pipelines } = await db
    .from("captacion_pipelines")
    .select("id")
    .eq("country", country);
  const ids = (pipelines ?? []).map((p: Row) => p.id);
  if (ids.length === 0) return new Set();

  const { data: stages } = await db
    .from("captacion_pipeline_stages")
    .select("id, key")
    .in("pipeline_id", ids);

  return new Set(
    (stages ?? [])
      .filter((s: Row) => String(s.key).toLowerCase() === key)
      .map((s: Row) => s.id as string)
  );
}

function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(`${updatedAt}|${id}`, "utf-8").toString("base64url");
}

function decodeCursor(cursor: string | null): { updatedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    const [updatedAt, id] = decoded.split("|");
    if (!updatedAt || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

/**
 * Baja lógica: la captación pasa a la etapa terminal de rechazo. Nunca se
 * borra físicamente — el histórico de captación es información de negocio.
 */
export async function archiveCaptacion(
  client: ApiClientRow,
  externalId: string,
  reason: string | null,
  opts: { dryRun?: boolean } = {}
): Promise<{ id: string; external_id: string; action: "archived" | "unchanged" }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const captacion = await findByExternalId(db, client, externalId);
  if (!captacion) {
    throw apiErrors.notFound(`No existe ninguna captación con external_id "${externalId}"`);
  }

  let rejectedStageId: string | null = null;
  if (captacion.pipeline_id) {
    const stages = await getStagesForPipeline(captacion.pipeline_id).catch(() => []);
    rejectedStageId = stages.find((s) => s.stage_type === "rejected")?.id ?? null;
  }

  if (captacion.status === "rejected" && (!rejectedStageId || captacion.stage_id === rejectedStageId)) {
    return { id: captacion.id, external_id: externalId, action: "unchanged" };
  }

  if (opts.dryRun) {
    return { id: captacion.id, external_id: externalId, action: "archived" };
  }

  const patch: Record<string, unknown> = {
    status: "rejected",
    rejected_by: "api",
    external_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (rejectedStageId) patch.stage_id = rejectedStageId;
  if (reason) patch.revision_notes = reason;

  const { error } = await db.from("captaciones").update(patch).eq("id", captacion.id);
  if (error) throw error;

  return { id: captacion.id, external_id: externalId, action: "archived" };
}

/** Resuelve el id interno a partir del external_id (para sub-recursos). */
export async function requireCaptacionId(
  client: ApiClientRow,
  externalId: string
): Promise<{
  id: string;
  country: string;
  pipeline_id: string | null;
  stage_id: string | null;
  status: string | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("captaciones")
    .select("id, country, pipeline_id, stage_id, status")
    .eq("api_client_id", client.id)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!data) {
    throw apiErrors.notFound(`No existe ninguna captación con external_id "${externalId}"`);
  }
  return data;
}
