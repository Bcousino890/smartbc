import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { safeFetchAsFetch } from "@/lib/net/safe-fetch";
import { extractFromUrl } from "@/lib/sync/import-by-link/index";
import { insertImportedVideos } from "@/lib/sync/import-by-link/insert";
import type { ImportPreview } from "@/lib/sync/import-by-link/types";
import { downloadAndWatermark } from "@/lib/sync/watermark";
import {
  applyPhotoSelection,
  type DraftFields,
  type DraftPhoto,
  type DraftSourceKind,
  type DraftState,
  type DuplicateChoice,
  EMPTY_FIELDS,
  externalReference,
  type FieldEvidence,
  missingForConfirm,
  normalizeFields,
  PORTALES_EXTERNOS,
  propertyRow,
  remotePhotosFromPreview,
  selectedPhotos,
} from "./draft-model";
import { classifyDuplicates, type DuplicateCandidate, type DuplicateMatch, normalizeSourceUrl } from "./duplicates-core";
import { DRAFT_BUCKET, draftPhotoPath, importPhotoPath, processDraftPhoto, PUBLIC_BUCKET } from "./photos";

// ============================================================================
// Borradores de importación (BCP-01 P5). Servidor. Toda lectura y escritura
// filtra por created_by = actor (el borrador es privado de quien lo crea) y
// las transiciones delicadas van por las funciones de 0214, que bloquean el
// borrador: crear la ficha dos veces es imposible.
// Lo llaman las acciones de importar/draft-actions.ts, que comprueban antes
// properties.create. El catálogo, además, exige ser dueño de la HOME (aquí).
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export const DRAFT_TTL_DAYS = 30;
export const PHOTO_BATCH = 6;

export interface DraftRow {
  id: string;
  created_by: string;
  country: string;
  source_kind: DraftSourceKind;
  source_url: string | null;
  source_name: string | null;
  source_hash: string | null;
  source_part: number | null;
  request_key: string;
  extracted: Record<string, any>;
  fields: Partial<DraftFields>;
  photos: DraftPhoto[];
  agency_id: string | null;
  notify_clients: boolean;
  catalog_id: string | null;
  portal_link_id: string | null;
  state: DraftState;
  duplicate_choice: DuplicateChoice | null;
  property_id: string | null;
  steps: Record<string, { status: string; [k: string]: unknown }>;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface AgencyChoice {
  id: string;
  slug: string;
  name: string;
  collaborator: boolean;
}

export type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });
const errCode = (e: { message?: string } | null | undefined) => (e?.message ?? "").trim() || "db_error";

// ── Agencias permitidas (I-14) ──────────────────────────────────────────────

/** «Portales externos» y las colaboradoras (con feed). Nada más. */
export async function allowedAgencies(): Promise<AgencyChoice[]> {
  const [{ data: agencies }, { data: feeds }] = await Promise.all([
    db().from("agencies").select("id, slug, name"),
    db().from("agency_feeds").select("agency_id"),
  ]);
  const withFeed = new Set(((feeds ?? []) as { agency_id: string }[]).map((f) => f.agency_id));
  return ((agencies ?? []) as { id: string; slug: string; name: string }[])
    .filter((a) => a.slug === PORTALES_EXTERNOS || withFeed.has(a.id))
    .map((a) => ({ id: a.id, slug: a.slug, name: a.name, collaborator: withFeed.has(a.id) }))
    .sort((a, b) => (a.slug === PORTALES_EXTERNOS ? -1 : b.slug === PORTALES_EXTERNOS ? 1 : a.name.localeCompare(b.name, "es")));
}

// ── Catálogo opcional: solo del dueño de la HOME, explícito y activo ───────

/** ¿Está en home_owners? (misma regla que isHomeOwner de lib/catalogs/owner.ts,
 *  sin arrastrar aquí next/navigation). Ante cualquier error, false. */
async function isHomeOwner(actor: string): Promise<boolean> {
  try {
    const { data, error } = await db().from("home_owners").select("profile_id").eq("profile_id", actor).maybeSingle();
    return !error && Boolean(data && data.profile_id === actor);
  } catch {
    return false;
  }
}

/** El catálogo, si `actor` es su dueño y es una selección explícita activa; si no, null (el parámetro se ignora). */
export async function ownedExplicitCatalog(actor: string, catalogId: string | null | undefined): Promise<{ id: string; title: string } | null> {
  if (!catalogId || !/^[0-9a-f-]{36}$/i.test(catalogId)) return null;
  if (!(await isHomeOwner(actor))) return null;
  const { data } = await db().from("catalogs").select("id, title, owner_id, mode, status").eq("id", catalogId).maybeSingle();
  if (!data || data.owner_id !== actor || data.mode !== "manual" || data.status !== "active") return null;
  return { id: data.id, title: data.title };
}

/** Selecciones explícitas activas del dueño de la HOME (para elegir dónde añadir). */
export async function listOwnedExplicitCatalogs(actor: string): Promise<{ id: string; title: string }[]> {
  if (!(await isHomeOwner(actor))) return [];
  const { data } = await db().from("catalogs").select("id, title").eq("owner_id", actor).eq("mode", "manual").eq("status", "active").order("updated_at", { ascending: false }).limit(200);
  return (data ?? []) as { id: string; title: string }[];
}

export async function propertySlugOf(propertyId: string): Promise<string | null> {
  const { data } = await db().from("properties").select("slug").eq("id", propertyId).maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export async function getDraft(actor: string, id: string): Promise<DraftRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from("property_import_drafts").select("*").eq("id", id).eq("created_by", actor).maybeSingle();
  return (data as DraftRow) ?? null;
}

/** Borradores del actor (más recientes primero). Limpia de paso los caducados en revisión. */
export async function listDrafts(actor: string): Promise<DraftRow[]> {
  await purgeExpired(actor);
  const { data } = await db()
    .from("property_import_drafts")
    .select("*")
    .eq("created_by", actor)
    .neq("state", "discarded")
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data ?? []) as DraftRow[];
}

/** Caducidad perezosa (I-10): borradores en revisión o descartados con más de
 *  30 días se borran, con sus fotos privadas (por la API de Storage). */
export async function purgeExpired(actor: string): Promise<number> {
  const { data } = await db()
    .from("property_import_drafts")
    .select("id, photos")
    .eq("created_by", actor)
    .in("state", ["review", "discarded"])
    .lt("expires_at", new Date().toISOString());
  const rows = (data ?? []) as Pick<DraftRow, "id" | "photos">[];
  for (const r of rows) await removeDraftFiles(r);
  if (rows.length) await db().from("property_import_drafts").delete().in("id", rows.map((r) => r.id)).eq("created_by", actor);
  return rows.length;
}

async function removeDraftFiles(d: Pick<DraftRow, "photos">) {
  const paths = (d.photos ?? []).flatMap((p) => (p.kind === "upload" ? [p.path] : []));
  if (paths.length) await db().storage.from(DRAFT_BUCKET).remove(paths);
}

// ── Crear ───────────────────────────────────────────────────────────────────

const REQUEST_KEY = /^[A-Za-z0-9_-]{8,80}$/;

async function insertDraft(actor: string, row: Record<string, unknown>): Promise<DraftRow | Fail> {
  const { data, error } = await db().from("property_import_drafts").insert({ created_by: actor, ...row }).select("*").maybeSingle();
  if (!error && data) return data as DraftRow;
  // Misma clave de petición: es un reintento → el borrador ya creado.
  if (error?.code === "23505") {
    const { data: prev } = await db().from("property_import_drafts").select("*").eq("created_by", actor).eq("request_key", row.request_key).maybeSingle();
    if (prev) return prev as DraftRow;
  }
  return fail(errCode(error));
}

/** Borrador desde un enlace: la extracción la hace el SERVIDOR (las URL de las
 *  fotos salen de aquí, nunca del navegador). */
export async function createLinkDraft(args: {
  actor: string;
  country: "es" | "cl";
  url: string;
  html?: string;
  requestKey: string;
  catalogId?: string | null;
  portalLinkId?: string | null;
}): Promise<DraftRow | Fail> {
  if (!REQUEST_KEY.test(args.requestKey)) return fail("invalid_request");
  const prev = await db().from("property_import_drafts").select("*").eq("created_by", args.actor).eq("request_key", args.requestKey).maybeSingle();
  if (prev.data) return prev.data as DraftRow;
  const url = args.url.trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2048) return fail("unsupported_url");
  const res = await extractFromUrl(url, args.html !== undefined ? { html: args.html } : undefined);
  if (!res.ok) return fail(res.error.kind);
  const p = res.preview;
  const agencies = await allowedAgencies();
  const def = agencies.find((a) => a.slug === PORTALES_EXTERNOS) ?? null;
  const catalog = await ownedExplicitCatalog(args.actor, args.catalogId);
  return insertDraft(args.actor, {
    country: args.country,
    source_kind: "link",
    source_url: p.sourceUrl,
    request_key: args.requestKey,
    extracted: { preview: { ...p, photos: undefined }, photoCount: p.photos.length },
    fields: fieldsFromPreview(p),
    photos: remotePhotosFromPreview(p.photos.map((x) => x.url)),
    agency_id: def?.id ?? null,
    catalog_id: catalog?.id ?? null,
    portal_link_id: args.portalLinkId && /^[0-9a-f-]{36}$/i.test(args.portalLinkId) ? args.portalLinkId : null,
  });
}

export function fieldsFromPreview(p: ImportPreview): DraftFields {
  return {
    ...EMPTY_FIELDS,
    title: (p.title ?? "").slice(0, 200),
    description: (p.description ?? "").slice(0, 20_000),
    operation: p.operation === "sale" || p.operation === "rent" ? p.operation : "",
    stay: p.operation === "rent" && (p.stay === "long" || p.stay === "short") ? p.stay : "",
    price: p.price && p.price > 0 ? Math.round(p.price) : null,
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    squareMeters: p.squareMeters ?? null,
    zone: (p.zone ?? "").slice(0, 120),
    address: (p.address ?? "").slice(0, 300),
    features: (p.features ?? []).slice(0, 80).map((f) => f.slice(0, 160)),
  };
}

/** Borrador de una vivienda de un PDF. Lo extraído viene del navegador (PDF.js
 *  y OCR, sin servidor): se valida como lo que es, datos que la persona revisa. */
export async function createPdfDraft(args: {
  actor: string;
  country: "es" | "cl";
  requestKey: string;
  sourceName: string;
  sourceHash: string;
  part: number;
  fields: unknown;
  evidence: unknown;
  catalogId?: string | null;
}): Promise<DraftRow | Fail> {
  if (!REQUEST_KEY.test(args.requestKey)) return fail("invalid_request");
  if (!/^[0-9a-f]{64}$/.test(args.sourceHash) || !Number.isInteger(args.part) || args.part < 1 || args.part > 200) return fail("invalid_source");
  const f = normalizeFields(args.fields);
  if (!f.ok) return f;
  const evidence = normalizeEvidence(args.evidence);
  const agencies = await allowedAgencies();
  const def = agencies.find((a) => a.slug === PORTALES_EXTERNOS) ?? null;
  const catalog = await ownedExplicitCatalog(args.actor, args.catalogId);
  return insertDraft(args.actor, {
    country: args.country,
    source_kind: "pdf",
    source_name: args.sourceName.slice(0, 300),
    source_hash: args.sourceHash,
    source_part: args.part,
    request_key: args.requestKey,
    extracted: { evidence },
    fields: f.fields,
    photos: [],
    agency_id: def?.id ?? null,
    catalog_id: catalog?.id ?? null,
  });
}

const EVIDENCE_KEYS = new Set(["title", "description", "operation", "stay", "price", "bedrooms", "bathrooms", "squareMeters", "zone", "subzone", "address", "features", "floor", "reference"]);
export function normalizeEvidence(input: unknown): Record<string, FieldEvidence> {
  const out: Record<string, FieldEvidence> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, any>)) {
    if (!EVIDENCE_KEYS.has(k) || !v || typeof v !== "object") continue;
    const status = ["seguro", "dudoso", "falta"].includes(v.status) ? v.status : "dudoso";
    out[k] = {
      status,
      ...(Number.isInteger(v.page) && v.page > 0 && v.page < 10_000 ? { page: v.page } : {}),
      ...(typeof v.snippet === "string" ? { snippet: v.snippet.slice(0, 300) } : {}),
      ...(Array.isArray(v.alternatives) ? { alternatives: v.alternatives.filter((a: unknown) => typeof a === "string").slice(0, 5).map((a: string) => a.slice(0, 120)) } : {}),
    };
  }
  return out;
}

// ── Editar (solo en revisión, con versión) ──────────────────────────────────

export async function updateDraft(args: {
  actor: string;
  id: string;
  expectedVersion: number;
  fields?: unknown;
  photoOrder?: string[];
  agencyId?: string;
  notifyClients?: boolean;
  catalogId?: string | null;
}): Promise<DraftRow | Fail> {
  const d = await getDraft(args.actor, args.id);
  if (!d) return fail("draft_not_found");
  if (d.state !== "review") return fail("draft_not_reviewable");
  if (d.version !== args.expectedVersion) return fail("draft_changed");
  const patch: Record<string, unknown> = {};
  if (args.fields !== undefined) {
    const f = normalizeFields(args.fields);
    if (!f.ok) return f;
    patch.fields = f.fields;
  }
  if (args.photoOrder !== undefined) {
    const sel = applyPhotoSelection(d.photos, args.photoOrder);
    if (!sel.ok) return sel;
    patch.photos = sel.photos;
  }
  if (args.agencyId !== undefined) {
    const ok = (await allowedAgencies()).some((a) => a.id === args.agencyId);
    if (!ok) return fail("agency_not_allowed");
    patch.agency_id = args.agencyId;
  }
  if (args.notifyClients !== undefined) patch.notify_clients = args.notifyClients === true;
  if (args.catalogId !== undefined) patch.catalog_id = (await ownedExplicitCatalog(args.actor, args.catalogId))?.id ?? null;
  if (Object.keys(patch).length === 0) return d;
  const { data, error } = await db()
    .from("property_import_drafts")
    .update({ ...patch, version: d.version + 1, updated_at: new Date().toISOString() })
    .eq("id", d.id)
    .eq("created_by", args.actor)
    .eq("version", d.version)
    .eq("state", "review")
    .select("*")
    .maybeSingle();
  if (error) return fail(errCode(error));
  if (!data) return fail("draft_changed");
  return data as DraftRow;
}

export async function discardDraft(actor: string, id: string): Promise<{ ok: true } | Fail> {
  const d = await getDraft(actor, id);
  if (!d) return fail("draft_not_found");
  if (d.state !== "review") return fail("draft_not_reviewable");
  await removeDraftFiles(d);
  const { error } = await db().from("property_import_drafts").update({ state: "discarded", photos: [], updated_at: new Date().toISOString() }).eq("id", id).eq("created_by", actor).eq("state", "review");
  return error ? fail(errCode(error)) : { ok: true };
}

// ── Fotos subidas (PDF) ─────────────────────────────────────────────────────

/** Valida, recodifica y guarda en el bucket PRIVADO; la añade al borrador. */
export async function addUploadedPhoto(actor: string, id: string, buf: Buffer, page: number | null): Promise<{ ok: true; photo: DraftPhoto } | Fail> {
  const d = await getDraft(actor, id);
  if (!d) return fail("draft_not_found");
  if (d.state !== "review") return fail("draft_not_reviewable");
  if (d.source_kind !== "pdf") return fail("not_a_pdf_draft");
  const p = await processDraftPhoto(buf);
  if (!p.ok) return p;
  const path = draftPhotoPath(d.id, p.photo.sha);
  const up = await db().storage.from(DRAFT_BUCKET).upload(path, p.photo.data, { contentType: "image/webp", upsert: true });
  if (up.error) return fail("storage_failed");
  const { data, error } = await db().rpc("import_draft_add_photo", {
    p_actor: actor,
    p_draft: d.id,
    p_photo: { sha: p.photo.sha, path, w: p.photo.width, h: p.photo.height, ...(page ? { page } : {}) },
  });
  if (error) return fail(errCode(error));
  return { ok: true, photo: data as DraftPhoto };
}

/** Bytes de una foto SUBIDA de un borrador propio (bucket privado), para verla en la revisión. */
export async function readDraftPhoto(actor: string, id: string, photoId: string): Promise<{ ok: true; data: Buffer } | Fail> {
  const d = await getDraft(actor, id);
  if (!d) return fail("draft_not_found");
  const p = d.photos.find((x) => x.id === photoId);
  if (!p || p.kind !== "upload") return fail("invalid_photo");
  const dl = await db().storage.from(DRAFT_BUCKET).download(p.path);
  if (dl.error || !dl.data) return fail("draft_photo_missing");
  return { ok: true, data: Buffer.from(await (dl.data as Blob).arrayBuffer()) };
}

// ── Duplicados ──────────────────────────────────────────────────────────────

const CAND_COLS = "id, slug, title, bc_reference, external_id, agency_id, source_url, zone, subzone, address, operation, operations, price, rent_price, bedrooms, square_meters, description, status, archived_at, updated_at";

export async function findDraftDuplicates(actor: string, id: string): Promise<{ ok: true; matches: DuplicateMatch[]; externalId: string } | Fail> {
  const d = await getDraft(actor, id);
  if (!d) return fail("draft_not_found");
  const f = normalizeFields(d.fields);
  if (!f.ok) return f;
  const ctx = await draftContext(d);
  const seen = new Map<string, DuplicateCandidate>();
  const add = (rows: unknown) => {
    for (const r of (rows ?? []) as DuplicateCandidate[]) seen.set(r.id, r);
  };
  const base = () => db().from("properties").select(CAND_COLS).eq("country", d.country);
  // (a) misma referencia (en cualquier agencia: también lo enseña) · (b) misma URL.
  if (ctx.externalId) add((await base().eq("external_id", ctx.externalId).limit(5)).data);
  if (d.source_url) {
    const norm = normalizeSourceUrl(d.source_url);
    const host = norm?.split("/")[0];
    if (host) add((await base().ilike("source_url", `%${host}%`).limit(200)).data?.filter((r: DuplicateCandidate) => normalizeSourceUrl(r.source_url) === norm));
  }
  // (c) referencias BC citadas.
  const bcs = [...new Set(`${f.fields.title} ${f.fields.description}`.match(/\bBC[\s-]?\d{3,6}\b/gi) ?? [])].map((r) => r.toUpperCase().replace(/[\s-]/g, "").replace(/^BC/, "BC-")).slice(0, 10);
  if (bcs.length) add((await base().in("bc_reference", bcs)).data);
  // (d) parecido: misma operación y dormitorios, m² y precio cercanos.
  const ff = f.fields;
  if (ff.operation && (ff.squareMeters || ff.price)) {
    let q = base().is("archived_at", null).limit(60);
    if (ff.bedrooms !== null) q = q.eq("bedrooms", ff.bedrooms);
    if (ff.squareMeters) q = q.gte("square_meters", Math.floor(ff.squareMeters * 0.9)).lte("square_meters", Math.ceil(ff.squareMeters * 1.1));
    else if (ff.price) q = q.gte("price", Math.floor(ff.price * 0.85)).lte("price", Math.ceil(ff.price * 1.15));
    add((await q).data);
  }
  const matches = classifyDuplicates({
    fields: ff,
    agencyId: d.agency_id,
    externalId: ctx.externalId,
    sourceUrl: d.source_url,
    candidates: [...seen.values()],
  });
  return { ok: true, matches, externalId: ctx.externalId };
}

async function draftContext(d: DraftRow): Promise<{ externalId: string; agency: AgencyChoice | null }> {
  const agency = (await allowedAgencies()).find((a) => a.id === d.agency_id) ?? null;
  const preview = d.extracted?.preview as Partial<ImportPreview> | undefined;
  const externalId = externalReference({
    kind: d.source_kind,
    agencySlug: agency?.slug ?? PORTALES_EXTERNOS,
    portal: preview?.portal ?? null,
    portalRef: preview?.externalReference ?? null,
    pdfHash: d.source_hash,
    part: d.source_part,
  });
  return { externalId, agency };
}

// ── Confirmar ───────────────────────────────────────────────────────────────

export type ConfirmChoice =
  | { kind: "new" }
  | { kind: "existing"; propertyId: string }
  | { kind: "update"; propertyId: string; expectedUpdatedAt: string; fields: string[] };

const UPDATE_FIELD_MAP: Record<string, (f: DraftFields) => unknown> = {
  title: (f) => f.title,
  description: (f) => f.description,
  price: (f) => f.price,
  bedrooms: (f) => f.bedrooms,
  bathrooms: (f) => f.bathrooms,
  square_meters: (f) => f.squareMeters,
  zone: (f) => f.zone,
  subzone: (f) => f.subzone,
  address: (f) => f.address,
  features: (f) => f.features,
  stay: (f) => (f.operation === "rent" ? f.stay : ""),
};

export async function confirmDraft(args: { actor: string; id: string; expectedVersion: number; choice: ConfirmChoice }): Promise<
  { ok: true; propertyId: string; slug: string; created: boolean; choice: DuplicateChoice; draft: DraftRow } | (Fail & { missing?: string[] })
> {
  const d = await getDraft(args.actor, args.id);
  if (!d) return fail("draft_not_found");
  const f = normalizeFields(d.fields);
  if (!f.ok) return f;
  const ctx = await draftContext(d);
  let rpc: { data: any; error: any };
  if (args.choice.kind === "new") {
    const missing = missingForConfirm(f.fields);
    if (missing.length && !d.property_id) return { ok: false, error: "missing_fields", missing };
    if (!ctx.agency && !d.property_id) return fail("agency_not_allowed");
    const preview = d.extracted?.preview as Partial<ImportPreview> | undefined;
    const row = propertyRow({
      fields: f.fields,
      draftId: d.id,
      externalId: ctx.externalId,
      sourceUrl: d.source_kind === "link" ? d.source_url : null,
      location: preview?.latitude != null && preview?.longitude != null ? { latitude: preview.latitude, longitude: preview.longitude, precision: preview.locationPrecision ?? null } : null,
    });
    rpc = await db().rpc("import_draft_create_property", { p_actor: args.actor, p_draft: d.id, p_expected_version: args.expectedVersion, p_row: row });
  } else if (args.choice.kind === "existing") {
    rpc = await db().rpc("import_draft_use_existing", { p_actor: args.actor, p_draft: d.id, p_expected_version: args.expectedVersion, p_property: args.choice.propertyId });
  } else {
    const fields: Record<string, unknown> = {};
    for (const k of args.choice.fields) {
      const get = UPDATE_FIELD_MAP[k];
      if (!get) return fail("invalid_fields");
      fields[k] = get(f.fields);
    }
    if (!Object.keys(fields).length) return fail("invalid_fields");
    rpc = await db().rpc("import_draft_update_existing", {
      p_actor: args.actor,
      p_draft: d.id,
      p_expected_version: args.expectedVersion,
      p_property: args.choice.propertyId,
      p_expected_updated_at: args.choice.expectedUpdatedAt,
      p_fields: fields,
    });
  }
  if (rpc.error) return fail(errCode(rpc.error));
  const r = rpc.data as { property_id: string; slug: string; created: boolean; choice: DuplicateChoice };
  // Pasos pendientes (I-12): fotos solo si se creó ficha nueva; catálogo y enlace del cliente si venían.
  const fresh = (await getDraft(args.actor, d.id))!;
  if (Object.keys(fresh.steps ?? {}).length === 0) {
    const photos = fresh.duplicate_choice === "new" ? selectedPhotos(fresh.photos).length : 0;
    await setStep(args.actor, d.id, "photos", photos ? { status: "pending", done: 0, total: photos } : { status: "skipped" });
    await setStep(args.actor, d.id, "catalog", fresh.catalog_id ? { status: "pending" } : { status: "skipped" });
    await setStep(args.actor, d.id, "client_link", fresh.portal_link_id ? { status: "pending" } : { status: "skipped" });
    if (r.created && d.source_kind === "link") {
      const videos = ((d.extracted?.preview as Partial<ImportPreview> | undefined)?.videos ?? []) as string[];
      if (videos.length) await insertImportedVideos(db(), r.property_id, videos).catch(() => {});
    }
  }
  return { ok: true, propertyId: r.property_id, slug: r.slug, created: r.created, choice: r.choice, draft: (await getDraft(args.actor, d.id))! };
}

async function setStep(actor: string, id: string, step: "photos" | "catalog" | "client_link", value: Record<string, unknown>) {
  const { error } = await db().rpc("import_draft_set_step", { p_actor: actor, p_draft: id, p_step: step, p_value: value });
  if (error) throw new Error(errCode(error));
}

// ── Paso: fotos (por tandas, idempotente, reintentable) ─────────────────────

export async function runPhotoStep(actor: string, id: string): Promise<{ ok: true; status: string; done: number; total: number; failed: number } | Fail> {
  const d = await getDraft(actor, id);
  if (!d || !d.property_id) return fail("draft_not_found");
  if (d.duplicate_choice !== "new") return fail("draft_without_new_property");
  const photos = selectedPhotos(d.photos);
  const prev = (d.steps?.photos ?? {}) as { doneIds?: string[]; failedIds?: string[] };
  const doneIds = new Set(prev.doneIds ?? []);
  const todo = photos.map((p, position) => ({ p, position })).filter(({ p }) => !doneIds.has(p.id)).slice(0, PHOTO_BATCH);
  const ctx = await draftContext(d);
  const failed = new Set<string>();
  for (const { p, position } of todo) {
    const r = await storePhoto(d, p, position, ctx.agency?.slug ?? PORTALES_EXTERNOS, ctx.externalId);
    if (!r.ok) {
      failed.add(p.id);
      continue;
    }
    const at = await db().rpc("import_draft_attach_photo", { p_actor: actor, p_draft: d.id, p_url: r.url, p_position: position, p_is_cover: position === 0 });
    if (at.error) failed.add(p.id);
    else doneIds.add(p.id);
  }
  // Las que fallaron en tandas anteriores y no se han vuelto a intentar siguen contando como fallidas.
  for (const fid of prev.failedIds ?? []) if (!doneIds.has(fid) && !todo.some((t) => t.p.id === fid)) failed.add(fid);
  const remaining = photos.filter((p) => !doneIds.has(p.id) && !failed.has(p.id)).length;
  const status = remaining > 0 ? "running" : failed.size > 0 ? "failed" : "ok";
  await setStep(actor, d.id, "photos", {
    status,
    done: doneIds.size,
    total: photos.length,
    doneIds: [...doneIds],
    failedIds: [...failed],
    ...(failed.size ? { error: `${failed.size} foto(s) no se pudieron guardar` } : {}),
  });
  return { ok: true, status, done: doneIds.size, total: photos.length, failed: failed.size };
}

/** Reintentar las fallidas: se olvidan los fallos y se vuelve a pasar. */
export async function retryPhotoStep(actor: string, id: string) {
  const d = await getDraft(actor, id);
  if (!d) return fail("draft_not_found");
  const prev = (d.steps?.photos ?? {}) as Record<string, unknown>;
  await setStep(actor, id, "photos", { ...prev, status: "running", failedIds: [] });
  return runPhotoStep(actor, id);
}

async function storePhoto(d: DraftRow, p: DraftPhoto, position: number, agencySlug: string, externalId: string): Promise<{ ok: true; url: string } | Fail> {
  const storagePath = importPhotoPath(d.id, position);
  if (p.kind === "remote") {
    // Misma descarga y tratamiento que la importación por enlace, pero por la
    // guarda de salida (safeFetch) y a una ruta fija del borrador.
    const r = await downloadAndWatermark({ sourceUrl: p.url, agencySlug, externalId, position, storagePath }, { fetchImpl: safeFetchAsFetch });
    return r.ok ? { ok: true, url: r.photo.url } : fail(r.error);
  }
  const dl = await db().storage.from(DRAFT_BUCKET).download(p.path);
  if (dl.error || !dl.data) return fail("draft_photo_missing");
  const buf = Buffer.from(await (dl.data as Blob).arrayBuffer());
  const up = await db().storage.from(PUBLIC_BUCKET).upload(storagePath, buf, { contentType: "image/webp", upsert: true });
  if (up.error) return fail("storage_failed");
  return { ok: true, url: db().storage.from(PUBLIC_BUCKET).getPublicUrl(storagePath).data.publicUrl as string };
}

// ── Paso: catálogo ──────────────────────────────────────────────────────────

export async function runCatalogStep(actor: string, id: string): Promise<{ ok: true; status: string; error?: string } | Fail> {
  const d = await getDraft(actor, id);
  if (!d || !d.property_id) return fail("draft_not_found");
  if (!d.catalog_id) return { ok: true, status: "skipped" };
  // Se vuelve a comprobar al ejecutar (I-16): dueño de la HOME y su catálogo explícito.
  const cat = await ownedExplicitCatalog(actor, d.catalog_id);
  if (!cat) {
    await setStep(actor, id, "catalog", { status: "failed", error: "catalog_unavailable" });
    return { ok: true, status: "failed", error: "catalog_unavailable" };
  }
  const { error } = await db().rpc("catalog_add_property", { p_actor: actor, p_catalog: cat.id, p_property: d.property_id });
  const code = error ? errCode(error) : null;
  if (!code || code === "already_in_catalog") {
    await setStep(actor, id, "catalog", { status: "ok", catalogId: cat.id });
    return { ok: true, status: "ok" };
  }
  await setStep(actor, id, "catalog", { status: "failed", error: code });
  return { ok: true, status: "failed", error: code };
}

// ── Paso: enlace del cliente (precedente linkId/clienteId) ──────────────────

export async function runClientLinkStep(
  actor: string,
  id: string,
  link: (linkId: string, propertyId: string) => Promise<{ ok: boolean; error?: string }>,
): Promise<{ ok: true; status: string; error?: string } | Fail> {
  const d = await getDraft(actor, id);
  if (!d || !d.property_id) return fail("draft_not_found");
  if (!d.portal_link_id) return { ok: true, status: "skipped" };
  const r = await link(d.portal_link_id, d.property_id);
  await setStep(actor, id, "client_link", r.ok ? { status: "ok" } : { status: "failed", error: r.error ?? "link_failed" });
  return { ok: true, status: r.ok ? "ok" : "failed", ...(r.ok ? {} : { error: r.error }) };
}
