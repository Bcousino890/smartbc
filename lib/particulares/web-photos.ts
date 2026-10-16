import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { downloadAndWatermark } from "@/lib/sync/watermark";
import { buildAgencyWebSources, normalizeAgencyUrl } from "./agency-web";
import { loadAgencyWebCache } from "./agency-web-runner";
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
};

type PropRow = { id: string; slug: string; external_id: string | null; bc_reference: string | null; agencies: { slug: string | null } | Array<{ slug: string | null }> | null };

async function loadProperty(db: Db, slug: string): Promise<PropRow | null> {
  const { data } = await db.from("properties").select("id, slug, external_id, bc_reference, agencies(slug)").eq("slug", slug).maybeSingle();
  return (data as PropRow | null) ?? null;
}

/** La web de agencia leída y verificada de esta propiedad (Mobilia, con fotos), o null con el motivo. */
async function resolveWeb(db: Db, prop: PropRow): Promise<{ web: AgencyWebSource; particularId: string } | { reason: string }> {
  const ids = new Set<string>();
  const m = await db.from("particulares_agency_matches").select("particular_id").eq("property_id", prop.id).neq("status", "descartado");
  for (const r of m.data ?? []) ids.add(r.particular_id as string);
  const ext = (prop.external_id ?? "").match(/(\d{6,})\s*$/)?.[1];
  if (ext) {
    const p = await db.from("particulares").select("id").eq("portal", "idealista").eq("external_id", ext).limit(5);
    for (const r of p.data ?? []) ids.add(r.id as string);
  }
  if (ids.size === 0) return { reason: "No hay un anuncio de portal enlazado a esta propiedad." };
  const rows = await db
    .from("particulares")
    .select("id, advertiser_type, owner_name, price, square_meters, bedrooms, bathrooms, reference, agency_url:scraper_extra->>agency_url, agency_reference:scraper_extra->>agency_reference")
    .in("id", [...ids]);
  const members = (rows.data ?? []) as Array<Record<string, unknown> & { id: string; agency_url: string | null }>;
  const withUrl = members.filter((r) => normalizeAgencyUrl(r.agency_url)?.isListing);
  if (withUrl.length === 0) return { reason: "El anuncio no enlaza ninguna web de la agencia." };
  const cache = await loadAgencyWebCache(db, withUrl.map((r) => r.agency_url));
  if (!cache) return { reason: "La caché de webs de agencia no está disponible." };
  let why = "La web de la agencia aún no se ha leído.";
  for (const mem of withUrl) {
    const [w] = buildAgencyWebSources([mem as never], cache);
    if (!w) continue;
    if (!w.read) {
      why = w.blocked ? "La web de la agencia no permite leerla (robots.txt)." : why;
      continue;
    }
    if (w.cms !== "mobilia") {
      why = "Solo se pueden usar las fotos de webs Mobilia (en otras no hay forma segura de saber que no llevan marca).";
      continue;
    }
    if (w.verdict.state !== "verificada") {
      why = "La ficha de la web no está verificada como este inmueble.";
      continue;
    }
    if (w.photos.length === 0) {
      why = "La ficha de la web no tiene fotos.";
      continue;
    }
    return { web: w, particularId: mem.id };
  }
  return { reason: why };
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
  if ("reason" in r) return { available: false, reason: r.reason, photos: [], current, backup };
  return {
    available: true,
    particular_id: r.particularId,
    agency_name: r.web.agency_name,
    domain: r.web.domain,
    web_url: r.web.canonical_url ?? r.web.url,
    photos: r.web.photos.map((p) => p.url),
    current,
    backup,
  };
}

type NewPhoto = { url: string; width?: number; height?: number };

/** Copia las filas actuales a la tabla de copias y deja `rows` como galería (la primera = portada). */
async function swapPhotos(db: Db, propertyId: string, rows: NewPhoto[] | Array<{ url: string; alt: string | null; is_cover: boolean }>, userId: string | null, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
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
  await db.from("properties").update({ cover_photo_url: toInsert[0]?.url ?? null }).eq("id", propertyId);
  return { ok: true };
}

/** Descarga las originales sin marca, las sube como las demás fotos y reemplaza la galería (con copia recuperable). */
export async function applyWebPhotos(slug: string, userId: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const db = createAdminClient() as Db;
  const prop = await loadProperty(db, slug);
  if (!prop) return { ok: false, error: "Propiedad no encontrada" };
  const r = await resolveWeb(db, prop);
  if ("reason" in r) return { ok: false, error: r.reason };
  const agency = Array.isArray(prop.agencies) ? prop.agencies[0] : prop.agencies;
  const batchKey = `web-${Date.now()}`;
  const urls = r.web.photos.map((p) => p.url);
  const out: Array<NewPhoto | null> = new Array(urls.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      // `downloadAndWatermark` ya fuerza `-original.jpg` en Mobilia; ruta NUEVA (no pisa los ficheros viejos).
      const res = await downloadAndWatermark({ sourceUrl: urls[i], agencySlug: agency?.slug || "portales-externos", externalId: batchKey, position: i });
      if (res.ok) out[i] = { url: res.photo.url, width: res.photo.width, height: res.photo.height };
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const done = out.filter((o): o is NewPhoto => !!o);
  if (done.length !== urls.length) {
    // Todo o nada: si falla alguna no se toca la galería (y se limpian los ficheros subidos).
    const paths = done.map((d) => d.url.split("/properties-photos/")[1]).filter(Boolean) as string[];
    if (paths.length) await db.storage.from("properties-photos").remove(paths);
    return { ok: false, error: `No se pudieron descargar ${urls.length - done.length} de ${urls.length} fotos; no se ha cambiado nada.` };
  }
  const sw = await swapPhotos(db, prop.id, done, userId, "replace_from_agency_web");
  return sw.ok ? { ok: true, count: done.length } : sw;
}

/** Devuelve la galería anterior (el último lote de copia sin restaurar); la actual pasa también a copia. */
export async function restoreWebPhotos(slug: string, userId: string | null): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const db = createAdminClient() as Db;
  const prop = await loadProperty(db, slug);
  if (!prop) return { ok: false, error: "Propiedad no encontrada" };
  const bk = await db.from("property_photos_backup").select("batch_id, url, alt, position, is_cover, backed_up_at").eq("property_id", prop.id).is("restored_at", null).order("backed_up_at", { ascending: false }).limit(500);
  if (bk.error || !bk.data?.length) return { ok: false, error: "No hay copia de fotos anteriores." };
  const batch = bk.data[0].batch_id as string;
  const rows = (bk.data as Array<{ batch_id: string; url: string; alt: string | null; position: number; is_cover: boolean }>).filter((r) => r.batch_id === batch).sort((a, b) => a.position - b.position);
  const sw = await swapPhotos(db, prop.id, rows.map((r) => ({ url: r.url, alt: r.alt, is_cover: r.is_cover })), userId, "before_restore");
  if (!sw.ok) return sw;
  await db.from("property_photos_backup").update({ restored_at: new Date().toISOString() }).eq("batch_id", batch);
  return { ok: true, count: rows.length };
}
