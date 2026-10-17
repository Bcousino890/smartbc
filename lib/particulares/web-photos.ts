import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { downloadAndWatermark } from "@/lib/sync/watermark";
import { buildAgencyWebSources, normalizeAgencyUrl } from "./agency-web";
import { loadAgencyWebCache, type CachedWeb } from "./agency-web-runner";
import { photosSig, planWebPhotoReplacements, type PhotoPlanInput } from "./web-photos-plan";
import type { AgencyWebSource } from "./links-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * «Reemplazar por fotos sin marca de agua (web de la agencia)».
 *
 * Una propiedad del CRM importada de Idealista lleva la marca de la agencia horneada. La web de la agencia
 * (Mobilia) sirve la MISMA foto sin marca como `…-original.jpg` (comprobado: la variante `.jpg` lleva el
 * rótulo, `-original.jpg` no). Solo se ofrece con Mobilia y una ficha ya leída y VERIFICADA contra el anuncio:
 * en otros CMS no hay forma segura de saber que la imagen está limpia.
 *
 * Las filas antiguas de `property_photos` pasan a `property_photos_backup` (0205); los ficheros del storage no
 * se borran (las nuevas van a otra ruta), así que se puede restaurar.
 */

export type WebPhotosOffer = {
  available: boolean;
  reason?: string;
  particular_id?: string;
  agency_name?: string | null;
  domain?: string;
  web_url?: string;
  photos: string[];
  current: Array<{ url: string; is_cover: boolean }>;
  backup: { batch_id: string; count: number; at: string } | null;
  /** Estado de las fotos de la propiedad: ya limpias (con la huella de la web actual), restauradas a mano o sin tocar. */
  applied: { source: string | null; same: boolean; at: string | null };
};

type PropRow = { id: string; slug: string; external_id: string | null; bc_reference: string | null; photos_source?: string | null; photos_source_sig?: string | null; photos_source_at?: string | null; agencies: { slug: string | null } | Array<{ slug: string | null }> | null };

async function loadProperty(db: Db, slug: string): Promise<PropRow | null> {
  const { data } = await db.from("properties").select("id, slug, external_id, bc_reference, photos_source, photos_source_sig, photos_source_at, agencies(slug)").eq("slug", slug).maybeSingle();
  return (data as PropRow | null) ?? null;
}

type Resolved = { web: AgencyWebSource; particularId: string };

/** Primera web Mobilia leída, VERIFICADA y con fotos entre los anuncios dados; si no, el motivo. */
async function resolveFromParticulars(db: Db, ids: string[], preCache?: Map<string, CachedWeb> | null): Promise<Resolved | { reason: string; code: string }> {
  if (ids.length === 0) return { reason: "No hay un anuncio de portal enlazado a esta propiedad.", code: "sin_anuncio" };
  const rows = await db
    .from("particulares")
    .select("id, advertiser_type, owner_name, price, square_meters, bedrooms, bathrooms, reference, agency_url:scraper_extra->>agency_url, agency_reference:scraper_extra->>agency_reference")
    .in("id", ids);
  const members = (rows.data ?? []) as Array<Record<string, unknown> & { id: string; agency_url: string | null }>;
  const withUrl = members.filter((r) => normalizeAgencyUrl(r.agency_url)?.isListing);
  if (withUrl.length === 0) return { reason: "El anuncio no enlaza ninguna web de la agencia.", code: "anuncio_sin_web" };
  const cache = preCache ?? (await loadAgencyWebCache(db, withUrl.map((r) => r.agency_url)));
  if (!cache) return { reason: "La caché de webs de agencia no está disponible.", code: "cache_no_disponible" };
  let why = "La web de la agencia aún no se ha leído.";
  let code = "web_no_leida";
  for (const mem of withUrl) {
    const [w] = buildAgencyWebSources([mem as never], cache);
    if (!w) continue;
    if (!w.read) {
      if (w.blocked) (why = "La web de la agencia no permite leerla (robots.txt).", code = "web_bloqueada");
      else if (w.note) (why = w.note, code = "web_ilegible");
      continue;
    }
    if (w.cms !== "mobilia") {
      why = "Solo se pueden usar las fotos de webs Mobilia (en otras no hay forma segura de saber que no llevan marca).";
      code = "no_mobilia";
      continue;
    }
    if (w.verdict.state !== "verificada") {
      why = "La ficha de la web no está verificada como este inmueble.";
      code = "no_verificada";
      continue;
    }
    if (w.photos.length === 0) {
      why = "La ficha de la web no tiene fotos.";
      code = "web_sin_fotos";
      continue;
    }
    return { web: w, particularId: mem.id };
  }
  return { reason: why, code };
}

/** La web de agencia leída y verificada de esta propiedad (Mobilia, con fotos), o el motivo. */
async function resolveWeb(db: Db, prop: PropRow): Promise<Resolved | { reason: string; code: string }> {
  const ids = new Set<string>();
  const m = await db.from("particulares_agency_matches").select("particular_id").eq("property_id", prop.id).neq("status", "descartado");
  for (const r of m.data ?? []) ids.add(r.particular_id as string);
  const ext = (prop.external_id ?? "").match(/(\d{6,})\s*$/)?.[1];
  if (ext) {
    const p = await db.from("particulares").select("id").eq("portal", "idealista").eq("external_id", ext).limit(5);
    for (const r of p.data ?? []) ids.add(r.id as string);
  }
  return resolveFromParticulars(db, [...ids]);
}

export async function getWebPhotosOffer(slug: string): Promise<WebPhotosOffer | null> {
  const db = createAdminClient() as Db;
  const prop = await loadProperty(db, slug);
  if (!prop) return null;
  const cur = await db.from("property_photos").select("url, is_cover, position").eq("property_id", prop.id).order("position", { ascending: true });
  const current = ((cur.data ?? []) as Array<{ url: string; is_cover: boolean }>).map((p) => ({ url: p.url, is_cover: p.is_cover }));
  const bk = await db
    .from("property_photos_backup")
    .select("batch_id, backed_up_at")
    .eq("property_id", prop.id)
    .is("restored_at", null)
    .order("backed_up_at", { ascending: false })
    .limit(500);
  let backup: WebPhotosOffer["backup"] = null;
  if (!bk.error && bk.data?.length) {
    const batch = bk.data[0].batch_id as string;
    const rows = (bk.data as Array<{ batch_id: string; backed_up_at: string }>).filter((r) => r.batch_id === batch);
    backup = { batch_id: batch, count: rows.length, at: rows[0].backed_up_at };
  }
  const r = await resolveWeb(db, prop);
  const appliedBase = { source: prop.photos_source ?? null, at: prop.photos_source_at ?? null };
  if ("reason" in r) return { available: false, reason: r.reason, photos: [], current, backup, applied: { ...appliedBase, same: false } };
  const sig = photosSig(r.web.photos.map((p) => p.url));
  return {
    available: true,
    particular_id: r.particularId,
    agency_name: r.web.agency_name,
    domain: r.web.domain,
    web_url: r.web.canonical_url ?? r.web.url,
    photos: r.web.photos.map((p) => p.url),
    current,
    backup,
    applied: { ...appliedBase, same: prop.photos_source === "web_clean" && prop.photos_source_sig === sig },
  };
}

type NewPhoto = { url: string; width?: number; height?: number };

/** Copia las filas actuales a la tabla de copias y deja `rows` como galería (la primera = portada). */
async function swapPhotos(db: Db, propertyId: string, rows: NewPhoto[] | Array<{ url: string; alt: string | null; is_cover: boolean }>, userId: string | null, reason: string, mark: { source: string; sig: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await db.from("property_photos").select("url, alt, position, is_cover, created_at").eq("property_id", propertyId).order("position", { ascending: true });
  if (cur.error) return { ok: false, error: cur.error.message };
  const batch = randomUUID();
  const old = (cur.data ?? []) as Array<{ url: string; alt: string | null; position: number; is_cover: boolean; created_at: string }>;
  if (old.length > 0) {
    const ins = await db.from("property_photos_backup").insert(
      old.map((o) => ({ batch_id: batch, property_id: propertyId, url: o.url, alt: o.alt, position: o.position, is_cover: o.is_cover, original_created_at: o.created_at, reason, backed_up_by: userId })),
    );
    if (ins.error) return { ok: false, error: `copia de seguridad: ${ins.error.message}` };
  }
  const del = await db.from("property_photos").delete().eq("property_id", propertyId);
  if (del.error) return { ok: false, error: del.error.message };
  const toInsert = (rows as Array<NewPhoto & { alt?: string | null }>).map((r, i) => ({
    property_id: propertyId,
    url: r.url,
    alt: r.alt ?? null,
    position: i,
    is_cover: i === 0,
    source_width: r.width ?? null,
    source_height: r.height ?? null,
  }));
  const ins2 = await db.from("property_photos").insert(toInsert);
  if (ins2.error) {
    // Deshacer: devolver las antiguas.
    await db.from("property_photos").insert(old.map((o) => ({ property_id: propertyId, url: o.url, alt: o.alt, position: o.position, is_cover: o.is_cover })));
    await db.from("property_photos_backup").delete().eq("batch_id", batch);
    return { ok: false, error: ins2.error.message };
  }
  await db
    .from("properties")
    .update({ cover_photo_url: toInsert[0]?.url ?? null, photos_source: mark.source, photos_source_sig: mark.sig, photos_source_at: new Date().toISOString(), last_synced_at: new Date().toISOString() })
    .eq("id", propertyId);
  return { ok: true };
}

type Down = { ok: true; photos: NewPhoto[] } | { ok: false; error: string };

/** Descarga TODAS las originales (3 a la vez) a una ruta NUEVA del storage. Todo o nada: si falla una, borra lo subido. */
async function downloadWebPhotos(db: Db, urls: string[], agencySlug: string, batchKey: string): Promise<Down> {
  const out: Array<NewPhoto | null> = new Array(urls.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      // `downloadAndWatermark` ya fuerza `-original.jpg` en Mobilia; ruta NUEVA (no pisa los ficheros viejos).
      const res = await downloadAndWatermark({ sourceUrl: urls[i], agencySlug, externalId: batchKey, position: i });
      if (res.ok) out[i] = { url: res.photo.url, width: res.photo.width, height: res.photo.height };
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const done = out.filter((o): o is NewPhoto => !!o);
  if (done.length !== urls.length) {
    const paths = done.map((d) => d.url.split("/properties-photos/")[1]).filter(Boolean) as string[];
    if (paths.length) await db.storage.from("properties-photos").remove(paths);
    return { ok: false, error: `No se pudieron descargar ${urls.length - done.length} de ${urls.length} fotos; no se ha cambiado nada.` };
  }
  return { ok: true, photos: done };
}

const agencySlugOf = (prop: PropRow): string => {
  const a = Array.isArray(prop.agencies) ? prop.agencies[0] : prop.agencies;
  return a?.slug || "portales-externos";
};

async function applyResolved(db: Db, prop: PropRow, r: Resolved, userId: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const urls = r.web.photos.map((p) => p.url);
  const dl = await downloadWebPhotos(db, urls, agencySlugOf(prop), `web-${Date.now()}`);
  if (!dl.ok) return dl;
  const sw = await swapPhotos(db, prop.id, dl.photos, userId, "replace_from_agency_web", { source: "web_clean", sig: photosSig(urls) });
  return sw.ok ? { ok: true, count: dl.photos.length } : sw;
}

/** «Rehacer» a mano: descarga las originales sin marca y reemplaza la galería (con copia recuperable). */
export async function applyWebPhotos(slug: string, userId: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const db = createAdminClient() as Db;
  const prop = await loadProperty(db, slug);
  if (!prop) return { ok: false, error: "Propiedad no encontrada" };
  const r = await resolveWeb(db, prop);
  if ("reason" in r) return { ok: false, error: r.reason };
  return applyResolved(db, prop, r, userId);
}

/** Devuelve la galería anterior (el último lote de copia sin restaurar); la actual pasa también a copia. El job no vuelve a reemplazar. */
export async function restoreWebPhotos(slug: string, userId: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const db = createAdminClient() as Db;
  const prop = await loadProperty(db, slug);
  if (!prop) return { ok: false, error: "Propiedad no encontrada" };
  const bk = await db.from("property_photos_backup").select("batch_id, url, alt, position, is_cover, backed_up_at").eq("property_id", prop.id).is("restored_at", null).order("backed_up_at", { ascending: false }).limit(500);
  if (bk.error || !bk.data?.length) return { ok: false, error: "No hay copia de fotos anteriores." };
  const batch = bk.data[0].batch_id as string;
  const rows = (bk.data as Array<{ batch_id: string; url: string; alt: string | null; position: number; is_cover: boolean }>).filter((r) => r.batch_id === batch).sort((a, b) => a.position - b.position);
  const sw = await swapPhotos(db, prop.id, rows.map((r) => ({ url: r.url, alt: r.alt, is_cover: r.is_cover })), userId, "before_restore", { source: "restored", sig: null });
  if (!sw.ok) return sw;
  await db.from("property_photos_backup").update({ restored_at: new Date().toISOString() }).eq("batch_id", batch);
  return { ok: true, count: rows.length };
}

// ── Automático (job link-twins) ─────────────────────────────────────────────

export type AutoPhotosSummary = {
  candidates: number;
  /** Propiedades que se reemplazarían (o se reemplazaron). */
  to_replace: number;
  done: number;
  failed: Array<{ slug: string; error: string }>;
  skipped: Record<string, number>;
  /** Desglose de «sin_web_verificada» por motivo (web_no_leida, no_mobilia, no_verificada, web_sin_fotos, web_bloqueada, web_ilegible, anuncio_sin_web…). */
  skipped_detail: Record<string, number>;
  /** Por qué no se hizo nada más (presupuesto, tope por pasada). */
  notes: string[];
  /** En dry-run: qué propiedades (slug) se reemplazarían. */
  sample?: string[];
};

/** Por defecto, propiedades que se reemplazan en cada pasada del cron (las descargas son lentas). */
export const AUTO_PHOTOS_PER_RUN = 3;

/**
 * Reemplaza solas las fotos de las propiedades del CRM importadas de portales cuya web de agencia (Mobilia) está
 * leída, VERIFICADA y enlazada «cierto/confirmado». Todo o nada, con copia en `property_photos_backup`, ficheros
 * viejos intactos, tope por pasada e idempotente (no repite con la misma huella de la web). Nunca lanza.
 */
export async function autoReplaceWebPhotos(db: Db, opts: { limit?: number; dryRun?: boolean; budgetMs?: number } = {}): Promise<AutoPhotosSummary | null> {
  const started = Date.now();
  const limit = opts.limit ?? AUTO_PHOTOS_PER_RUN;
  const out: AutoPhotosSummary = { candidates: 0, to_replace: 0, done: 0, failed: [], skipped: {}, skipped_detail: {}, notes: [] };
  try {
    const mt = await db.from("particulares_agency_matches").select("property_id, particular_id, level, status").neq("status", "descartado").limit(5000);
    if (mt.error) return null; // 0199 sin aplicar
    const matches = ((mt.data ?? []) as Array<{ property_id: string; particular_id: string; level: string; status: string }>).filter((m) => m.level === "cierto" || m.status === "confirmado");
    const byProp = new Map<string, string[]>();
    for (const m of matches) byProp.set(m.property_id, [...(byProp.get(m.property_id) ?? []), m.particular_id]);
    const propIds = [...byProp.keys()];
    out.candidates = propIds.length;
    if (propIds.length === 0) return out;

    const props: PropRow[] = [];
    for (let i = 0; i < propIds.length; i += 50) {
      const r = await db.from("properties").select("id, slug, external_id, bc_reference, photos_source, photos_source_sig, photos_source_at, agency_id, agencies(slug)").in("id", propIds.slice(i, i + 50));
      if (r.error) return null; // 0206 sin aplicar
      props.push(...((r.data ?? []) as PropRow[]));
    }
    const feedRes = await db.from("agency_feeds").select("agency_id");
    const feeds: Set<string> | null = feedRes.error ? null : new Set((feedRes.data ?? []).map((x: { agency_id: string }) => x.agency_id));

    const partIds = [...new Set([...byProp.values()].flat())];
    const urlRows: Array<{ agency_url: string | null }> = [];
    for (let i = 0; i < partIds.length; i += 50) {
      const r = await db.from("particulares").select("agency_url:scraper_extra->>agency_url").in("id", partIds.slice(i, i + 50));
      urlRows.push(...((r.data ?? []) as Array<{ agency_url: string | null }>));
    }
    const cache = await loadAgencyWebCache(db, urlRows.map((x) => x.agency_url));
    if (!cache) return null;

    const resolved = new Map<string, Resolved>();
    const inputs: PhotoPlanInput[] = [];
    for (const prop of props) {
      const agency = Array.isArray(prop.agencies) ? prop.agencies[0] : prop.agencies;
      const slugOf = (agency?.slug ?? "").trim().toLowerCase();
      const collab = feeds ? (feeds as Set<string>).has((prop as unknown as { agency_id: string }).agency_id) : slugOf !== "portales-externos";
      let web: PhotoPlanInput["web"] = null;
      if (!collab && prop.photos_source !== "restored") {
        const r = await resolveFromParticulars(db, byProp.get(prop.id) ?? [], cache);
        if ("reason" in r) out.skipped_detail[r.code] = (out.skipped_detail[r.code] ?? 0) + 1;
        else {
          resolved.set(prop.id, r);
          web = { sig: photosSig(r.web.photos.map((p) => p.url)), n: r.web.photos.length };
        }
      }
      inputs.push({ property_id: prop.id, slug: prop.slug, photos_source: prop.photos_source ?? null, photos_source_sig: prop.photos_source_sig ?? null, collab, web });
    }
    const plan = planWebPhotoReplacements(inputs);
    for (const it of plan) if (it.action === "skip") out.skipped[it.reason] = (out.skipped[it.reason] ?? 0) + 1;
    const todo = plan.filter((it) => it.action === "replace");
    out.to_replace = todo.length;
    if (opts.dryRun) {
      out.sample = todo.slice(0, 50).map((t) => t.slug);
      return out;
    }
    const budget = opts.budgetMs ?? 40_000;
    if (todo.length > limit) out.notes.push(`tope por pasada: ${limit} de ${todo.length}`);
    for (const it of todo.slice(0, limit)) {
      if (Date.now() - started > budget) {
        out.notes.push("presupuesto de tiempo agotado");
        break;
      }
      const prop = props.find((p) => p.id === it.property_id) as PropRow;
      const res = await applyResolved(db, prop, resolved.get(it.property_id) as Resolved, null);
      if (res.ok) out.done++;
      else out.failed.push({ slug: it.slug, error: res.error });
    }
    return out;
  } catch (e) {
    console.warn("[particulares-linking] autoReplaceWebPhotos:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── «Crear propiedad» desde un particular ───────────────────────────────────

/**
 * Fotos limpias para una propiedad que se va a crear desde este anuncio, si su web de agencia (Mobilia) ya está
 * leída y verificada. Sube las fotos a una ruta nueva y devuelve las filas + la huella; null = usar las del portal.
 */
export async function cleanPhotosForParticular(db: Db, particularId: string, agencySlug: string): Promise<{ photos: NewPhoto[]; sig: string } | null> {
  try {
    const r = await resolveFromParticulars(db, [particularId]);
    if ("reason" in r) return null;
    const urls = r.web.photos.map((p) => p.url);
    const dl = await downloadWebPhotos(db, urls, agencySlug, `web-${Date.now()}`);
    return dl.ok ? { photos: dl.photos, sig: photosSig(urls) } : null;
  } catch {
    return null;
  }
}
