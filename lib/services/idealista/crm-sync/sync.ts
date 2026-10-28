// Sincronización Idealista API → CRM: registro de operaciones y aplicación.
// Expediente: docs/changes/2026-10-28-idealista-api-crm-sync/.
//
// I1: este módulo NUNCA llama a Idealista. No importa partner-api/client ni
// partner-api/endpoints (lo vigila scripts/test-idealista-crm-sync.mts). Toda
// la decisión (qué ficha, si es obsoleto, si es incierto) la toma la base, en
// las funciones de 0233; aquí solo se prepara el contenido y la multimedia.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  buildReferenceProperty,
  manifestHasImages,
  MEDIA_BUDGET_IN_PUBLISH_MS,
  MEDIA_CONCURRENCY,
  MEDIA_MAX_BYTES,
  mediaPath,
  referenceSlug,
  sniffImage,
  videoMarker,
  type ContentSnapshot,
  type CrmEnvironment,
  type MediaManifest,
  type OperationKind,
  type OperationOutcome,
  type OperationStep,
} from "./core";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Dependencias (las reales por defecto; las pruebas pasan otras) ──────────
export interface CrmSyncDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: any; error: { message: string } | null }>;
  /** Bytes de una URL de origen. Las del bucket propio se leen sin red. */
  download(url: string, opts: { maxBytes: number; timeoutMs: number }): Promise<Uint8Array>;
  /** Sube sin sobrescribir. `exists` si ya había un objeto en esa ruta. */
  upload(path: string, bytes: Uint8Array, mime: string): Promise<{ ok: true } | { ok: false; exists: boolean; error: string }>;
  publicUrl(path: string): string;
  remove(paths: string[]): Promise<void>;
  now(): number;
}

const BUCKET = "properties-photos";

let realDeps: CrmSyncDeps | null = null;
async function defaultDeps(): Promise<CrmSyncDeps> {
  if (realDeps) return realDeps;
  const { createAdminClient } = await import("@/lib/db/admin");
  const { safeFetch } = await import("@/lib/net/safe-fetch");
  const db = createAdminClient() as any;
  const ownPrefix = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
  realDeps = {
    rpc: (fn, args) => db.rpc(fn, args),
    async download(url, opts) {
      if (ownPrefix.length > 40 && url.startsWith(ownPrefix)) {
        const path = decodeURIComponent(url.slice(ownPrefix.length).split("?")[0]);
        const { data, error } = await db.storage.from(BUCKET).download(path);
        if (error || !data) throw new Error(`storage: ${error?.message ?? "sin datos"}`);
        const buf = new Uint8Array(await data.arrayBuffer());
        if (buf.byteLength > opts.maxBytes) throw new Error("too_large");
        return buf;
      }
      const res = await safeFetch(url, { maxBytes: opts.maxBytes, timeoutMs: opts.timeoutMs });
      if (!res.ok) throw new Error(`http_${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async upload(path, bytes, mime) {
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (!error) return { ok: true };
      const msg = String(error.message ?? error);
      return { ok: false, exists: /exist|duplicate|409/i.test(msg) || (error as any).statusCode === "409", error: msg };
    },
    publicUrl: (path) => db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string,
    async remove(paths) {
      if (paths.length) await db.storage.from(BUCKET).remove(paths);
    },
    now: () => Date.now(),
  };
  return realDeps;
}

async function deps(d?: CrmSyncDeps): Promise<CrmSyncDeps> {
  return d ?? defaultDeps();
}

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

// ── Registro de operaciones ─────────────────────────────────────────────────
export interface OperationRef {
  opId: string;
  seq: number;
  environment: CrmEnvironment;
  listingId: string;
}

/**
 * Registra la operación ANTES de llamar a Idealista (D18). Lanza si no puede:
 * quien llama no debe enviar la petición en ese caso.
 */
export async function beginOperation(
  input: {
    listingId: string;
    environment: CrmEnvironment;
    kind: OperationKind;
    apiPropertyIdBefore: number | null;
    referenceCode: string | null;
    content: ContentSnapshot | null;
    manifest: MediaManifest | null;
    actorId?: string | null;
  },
  d?: CrmSyncDeps,
): Promise<OperationRef> {
  const x = await deps(d);
  const opId = randomUUID();
  const { data, error } = await x.rpc("idealista_op_begin", {
    p_op_id: opId,
    p_listing: input.listingId,
    p_environment: input.environment,
    p_kind: input.kind,
    p_api_property_id_before: input.apiPropertyIdBefore,
    p_reference_code: input.referenceCode,
    p_content: input.content,
    p_manifest: input.manifest,
    p_actor: input.actorId ?? null,
  });
  if (error || data === null || data === undefined) {
    throw new Error(`No se pudo registrar la operación: ${error?.message ?? "sin respuesta"}`);
  }
  return { opId, seq: Number(data), environment: input.environment, listingId: input.listingId };
}

/** Guarda la confirmación principal. Nunca lanza: devuelve si se pudo guardar. */
export async function finishOperation(
  op: OperationRef,
  result: { outcome: OperationOutcome; httpStatus: number | null; state: string | null; apiPropertyId: number | null; detail?: string | null },
  d?: CrmSyncDeps,
): Promise<boolean> {
  try {
    const x = await deps(d);
    const { error } = await x.rpc("idealista_op_finish", {
      p_op_id: op.opId,
      p_outcome: result.outcome,
      p_http_status: result.httpStatus,
      p_state: result.state,
      p_api_property_id: result.apiPropertyId,
      p_detail: result.detail ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Paso posterior (fotos, escritura local, sincronización…). Nunca lanza. */
export async function recordStep(op: OperationRef, step: OperationStep, ok: boolean, detail?: string | null, d?: CrmSyncDeps): Promise<boolean> {
  try {
    const x = await deps(d);
    const { error } = await x.rpc("idealista_op_step", { p_op_id: op.opId, p_step: step, p_ok: ok, p_detail: detail ?? null });
    return !error;
  } catch {
    return false;
  }
}

/** ¿Se puede dar un alta? Si no se puede saber, no (conservador). */
export async function createAllowed(listingId: string, environment: CrmEnvironment, d?: CrmSyncDeps): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const x = await deps(d);
    const { data, error } = await x.rpc("idealista_create_guard", { p_listing: listingId, p_environment: environment });
    if (error || !data) return { allowed: false, reason: "guard_unavailable" };
    return { allowed: data.allowed === true, reason: data.reason ?? undefined };
  } catch {
    return { allowed: false, reason: "guard_unavailable" };
  }
}

// ── Aplicación ──────────────────────────────────────────────────────────────
export interface CrmSyncResult {
  ok: boolean;
  status: string;
  reason?: string;
  errorCode?: string;
  propertyId?: string;
  origin?: string;
  smartlinkPath?: string;
  message: string;
}

const MESSAGES: Record<string, string> = {
  synced: "Ficha del CRM sincronizada.",
  disabled: "La sincronización con el CRM está apagada: la operación queda registrada.",
  sandbox: "Operación de sandbox: no se toca el CRM.",
  needs_review: "La ficha del CRM necesita revisión.",
  uncertain: "Estado incierto en Idealista: hay que comprobarlo antes de tocar el CRM.",
  uncertain_create: "Alta incierta: usa «Reconciliar» para recuperar el anuncio. No vuelvas a publicar.",
  stale: "Había un evento más reciente: no se aplica uno antiguo.",
  failed: "No se pudo sincronizar la ficha del CRM.",
  pending: "Sincronización pendiente.",
};

function toResult(r: any): CrmSyncResult {
  const status = String(r?.status ?? "failed");
  const ok = status === "synced" || status === "disabled" || status === "sandbox";
  const code = r?.error_code ? String(r.error_code) : undefined;
  return {
    ok,
    status,
    reason: r?.reason ?? r?.note ?? undefined,
    errorCode: code,
    propertyId: r?.property_id ?? undefined,
    origin: r?.origin ?? undefined,
    smartlinkPath: r?.smartlink_path ?? undefined,
    message: code === "tag_missing"
      ? "Falta la etiqueta «RESERVADO» de este país: no se ha creado nada. Créala y reintenta."
      : (MESSAGES[status] ?? status) + (code && code !== "tag_missing" ? ` (${code})` : ""),
  };
}

interface StagedMedia {
  mode: "replace" | "keep";
  photos?: Array<{ path: string; url: string }>;
  plans?: Array<{ path: string; url: string; file_name: string }>;
  videos?: Array<{ url: string; marker: string; file_name: string }>;
}

/**
 * Copia fotos y planos a rutas versionadas e inmutables (§7). Reutiliza lo ya
 * descargado para esta propiedad. Límites: MEDIA_MAX_BYTES por archivo,
 * MEDIA_CONCURRENCY descargas a la vez y un presupuesto total de tiempo.
 */
export async function stageMedia(
  input: { propertyId: string; seq: number; manifest: MediaManifest; budgetMs: number },
  d?: CrmSyncDeps,
): Promise<{ ok: true; media: StagedMedia } | { ok: false; code: string; detail: string }> {
  const x = await deps(d);
  const deadline = x.now() + input.budgetMs;
  const items = [
    ...input.manifest.photos.map((url, i) => ({ kind: "photo" as const, url, i })),
    ...input.manifest.plans.map((url, i) => ({ kind: "plan" as const, url, i })),
  ].map((it) => ({ ...it, sourceSha: sha256(it.url) }));

  const looked = await x.rpc("idealista_crm_media_lookup", {
    p_property: input.propertyId,
    p_source_shas: [...new Set(items.map((it) => it.sourceSha))],
  });
  if (looked.error) return { ok: false, code: "media_lookup", detail: looked.error.message };
  const cache: Record<string, { path: string }> = looked.data ?? {};
  const resolved = new Map<string, string>();
  for (const it of items) if (cache[it.sourceSha]) resolved.set(it.sourceSha, cache[it.sourceSha].path);

  const pending = items.filter((it) => !resolved.has(it.sourceSha)).filter(
    (it, idx, all) => all.findIndex((o) => o.sourceSha === it.sourceSha) === idx,
  );
  let failure: { code: string; detail: string } | null = null;
  let cursor = 0;

  async function worker() {
    while (!failure && cursor < pending.length) {
      const it = pending[cursor++];
      const left = deadline - x.now();
      if (left <= 0) {
        failure = { code: "media_timeout", detail: `Sin tiempo para copiar ${pending.length - cursor + 1} archivo(s); reintenta.` };
        return;
      }
      try {
        const bytes = await x.download(it.url, { maxBytes: MEDIA_MAX_BYTES, timeoutMs: Math.min(20_000, left) });
        const sniff = sniffImage(bytes);
        if (!sniff) throw new Error("tipo no admitido (solo JPEG, PNG, WebP o GIF)");
        const contentSha = sha256(bytes);
        const path = mediaPath(input.propertyId, it.kind, contentSha, input.seq, sniff.ext);
        const up = await x.upload(path, bytes, sniff.mime);
        if (!up.ok && !up.exists) throw new Error(`subida: ${up.error}`);
        const staged = await x.rpc("idealista_crm_media_stage", {
          p_property: input.propertyId, p_path: path, p_kind: it.kind, p_sha256: contentSha,
          p_bytes: bytes.byteLength, p_mime: sniff.mime, p_seq: input.seq, p_source_sha: it.sourceSha,
        });
        if (staged.error || staged.data?.ok !== true) throw new Error(`registro: ${staged.error?.message ?? staged.data?.error}`);
        resolved.set(it.sourceSha, path);
      } catch (err) {
        failure = { code: "media_copy", detail: `${it.kind} ${it.i + 1}: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MEDIA_CONCURRENCY, Math.max(1, pending.length)) }, worker));
  if (failure) return { ok: false, ...(failure as { code: string; detail: string }) };

  const photos = items.filter((it) => it.kind === "photo").map((it) => {
    const path = resolved.get(it.sourceSha)!;
    return { path, url: x.publicUrl(path) };
  });
  const plans = items.filter((it) => it.kind === "plan").map((it) => {
    const path = resolved.get(it.sourceSha)!;
    return { path, url: x.publicUrl(path), file_name: `plano-${it.i + 1}.${path.split(".").pop()}` };
  });
  const videos = input.manifest.videos.map((url, i) => ({
    url, marker: videoMarker(input.propertyId, sha256(url)), file_name: `video-${i + 1}`,
  }));
  return { ok: true, media: { mode: "replace", photos, plans, videos } };
}

/**
 * Aplica en el CRM el último evento confirmado de esta ficha (nunca uno más
 * antiguo, nunca uno incierto). Es lo que se llama tras cada operación y lo
 * que reintenta el botón: no llama a Idealista.
 */
export async function applyLatest(
  listingId: string,
  environment: CrmEnvironment,
  opts: { budgetMs?: number; actorId?: string | null } = {},
  d?: CrmSyncDeps,
): Promise<CrmSyncResult> {
  const x = await deps(d);
  for (let attempt = 0; attempt < 2; attempt++) {
    const planned = await x.rpc("idealista_crm_plan", { p_listing: listingId, p_environment: environment });
    if (planned.error || !planned.data) {
      return { ok: false, status: "failed", errorCode: "plan_error", message: `No se pudo preparar la sincronización: ${planned.error?.message ?? "sin respuesta"}` };
    }
    const target = planned.data.target ?? {};
    const cls = planned.data.classification ?? null;
    let newProperty: Record<string, unknown> | null = null;
    let media: StagedMedia | null = null;

    if (planned.data.enabled && target.state === "published" && cls && (cls.kind === "generate_new" || cls.kind === "generated")) {
      const content = target.content as ContentSnapshot | null;
      if (content) {
        const title = content.title ?? "propiedad";
        newProperty = buildReferenceProperty(content, referenceSlug(title, randomBytes(12)), target.api_id ?? null);
      }
      const manifest = target.manifest as MediaManifest | null;
      if (manifest && manifestHasImages(manifest) && target.images_ok !== true) {
        // Idealista no confirmó las fotos de esa operación: se conserva el reflejo anterior.
        media = { mode: "keep" };
      } else if (manifest && cls.property_id) {
        const staged = await stageMedia(
          { propertyId: cls.property_id, seq: Number(target.seq), manifest, budgetMs: opts.budgetMs ?? MEDIA_BUDGET_IN_PUBLISH_MS }, x,
        );
        if (!staged.ok) {
          await x.rpc("idealista_crm_note_failure", {
            p_listing: listingId, p_environment: environment, p_code: staged.code, p_message: staged.detail,
          });
          return { ok: false, status: "failed", errorCode: staged.code, message: `No se pudo copiar la multimedia: ${staged.detail}` };
        }
        media = staged.media;
      }
    }

    const applied = await x.rpc("apply_idealista_crm_sync", {
      p_listing: listingId,
      p_environment: environment,
      p_expected_seq: target.seq ?? null,
      p_new_property: newProperty,
      p_media: media,
      p_actor: opts.actorId ?? null,
    });
    if (applied.error || !applied.data) {
      return { ok: false, status: "failed", errorCode: "apply_error", message: `No se pudo sincronizar: ${applied.error?.message ?? "sin respuesta"}` };
    }
    if (applied.data.status === "moved") continue; // llegó otro evento entre medias: se vuelve a planificar
    const result = toResult(applied.data);
    if (result.status === "synced" && result.origin === "generated" && result.propertyId) {
      await collectMedia(result.propertyId, x);
    }
    return result;
  }
  return { ok: false, status: "pending", message: "Llegaron eventos nuevos mientras se sincronizaba: reintenta." };
}

/** Limpieza segura (§7): solo objetos sin uso, con más de 24 h y ya superados. */
async function collectMedia(propertyId: string, x: CrmSyncDeps): Promise<void> {
  try {
    const { data } = await x.rpc("idealista_crm_media_collect", { p_property: propertyId, p_grace: "24 hours" });
    const paths = (Array.isArray(data) ? data : []).filter((p: unknown): p is string => typeof p === "string" && p.startsWith(`${propertyId}/idealista-ref/`));
    if (paths.length) await x.remove(paths);
  } catch {
    // Lo que no se borre ahora queda marcado y no se vuelve a usar; no rompe nada.
  }
}

// ── Acciones del panel (sin Idealista) ──────────────────────────────────────
export async function resolveReview(
  listingId: string,
  environment: CrmEnvironment,
  choice: "use_existing" | "generate",
  propertyId: string | null,
  actorId: string,
  d?: CrmSyncDeps,
): Promise<{ ok: boolean; error?: string }> {
  const x = await deps(d);
  const { data, error } = await x.rpc("idealista_crm_resolve_review", {
    p_listing: listingId, p_environment: environment, p_choice: choice, p_property: propertyId, p_actor: actorId,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "sin respuesta" };
  return { ok: data.ok === true, error: data.error ?? undefined };
}

/** Copia a la ficha el id de un alta ya confirmada (local; nunca llama a Idealista). */
export async function recoverApiPropertyId(
  listingId: string,
  environment: CrmEnvironment,
  d?: CrmSyncDeps,
): Promise<{ ok: boolean; apiPropertyId?: number; error?: string }> {
  const x = await deps(d);
  const { data, error } = await x.rpc("idealista_recover_api_property_id", { p_listing: listingId, p_environment: environment });
  if (error || !data) return { ok: false, error: error?.message ?? "sin respuesta" };
  return { ok: data.ok === true, apiPropertyId: data.api_property_id ?? undefined, error: data.error ?? undefined };
}
