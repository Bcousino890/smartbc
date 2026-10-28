// SOLO PRUEBAS LOCALES (Idealista API → CRM, T10). El código REAL de
// lib/services/idealista/crm-sync/sync.ts contra las funciones REALES de 0233
// en el Postgres TEMPORAL (scripts/shims/supabase-on-psql.mts: 127.0.0.1:54329,
// base bcp_test). Almacenamiento en memoria SIN sobrescritura y descargas
// falsas (no hay red). Lo lanza scripts/sql/test-idealista-crm-flow.sh.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "./shims/supabase-on-psql.mts";
import { buildContentSnapshot, buildMediaManifest } from "../lib/services/idealista/crm-sync/core.ts";
import { applyLatest, beginOperation, finishOperation, recordStep, stageMedia, type CrmSyncDeps } from "../lib/services/idealista/crm-sync/sync.ts";
import { baseListing } from "./idealista-publish-scenarios.mts";

let n = 0;
let fails = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  n++;
  if (cond) console.log(`  ✓ ${msg}`);
  else { fails++; console.log(`  ✗ ${msg}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

const db = createAdminClient() as any;
const objects = new Map<string, Uint8Array>();
const downloads: string[] = [];
const contentFor = (url: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(url)]);
const deps: CrmSyncDeps = {
  rpc: (fn, args) => db.rpc(fn, args),
  async download(url) { downloads.push(url); return contentFor(url); },
  async upload(path, bytes) {
    if (objects.has(path)) return { ok: false, exists: true, error: "The resource already exists" };
    objects.set(path, bytes);
    return { ok: true };
  },
  publicUrl: (p) => `https://storage.test/properties-photos/${p}`,
  async remove(paths) { for (const p of paths) objects.delete(p); },
  now: () => Date.now(),
};

async function q(sql: string): Promise<any[]> {
  const { runSql } = await import("./shims/supabase-on-psql.mts");
  const r = await runSql(`SELECT coalesce(json_agg(t), '[]') FROM (${sql}) t`);
  if (r.error) throw new Error(r.error.message);
  return JSON.parse(r.data);
}

const listingRow = await q(`SELECT id FROM idealista_listings WHERE reference_code = 'BC-F001'`);
const LISTING = listingRow[0].id as string;
const ORIGIN = "https://portal.test";

async function op(kind: any, listing: Record<string, unknown>, state: string, apiId: number, imagesOk: boolean | null = true) {
  const ref = await beginOperation({
    listingId: LISTING, environment: "production", kind, apiPropertyIdBefore: apiId, referenceCode: "BC-F001",
    content: buildContentSnapshot(listing), manifest: buildMediaManifest(listing, ORIGIN),
  }, deps);
  await finishOperation(ref, { outcome: "confirmed", httpStatus: 200, state, apiPropertyId: apiId }, deps);
  if (imagesOk !== null) await recordStep(ref, "idealista_images", imagesOk, null, deps);
  return ref;
}

console.log("· Alta: ficha de referencia con su multimedia copiada");
const L1 = baseListing({ photo_ids: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"], plan_ids: ["https://cdn.test/p.jpg"], video_ids: ["https://cdn.test/v.mp4"] });
const op1 = await op("create", L1, "active", 7001);
const r1 = await applyLatest(LISTING, "production", {}, deps);
ok(r1.ok && r1.status === "synced" && r1.origin === "generated", "sincronizada como ficha generada", r1);
const P = r1.propertyId!;
const photos1 = await q(`SELECT sync_path, position, is_cover, url FROM property_photos WHERE property_id = '${P}' ORDER BY position`);
ok(photos1.length === 2 && photos1[0].is_cover && photos1[0].sync_path.includes("/idealista-ref/photo/"), "dos fotos copiadas, la primera de portada");
ok(photos1.every((p: any) => objects.has(p.sync_path)), "cada fila apunta a un objeto copiado (no al de la ficha de Idealista)");
ok(downloads.length === 3, "tres descargas (dos fotos y un plano)", downloads.length);
const media1 = await q(`SELECT type, position, source, storage_path FROM property_media WHERE property_id = '${P}' ORDER BY type, position`);
ok(media1.some((m: any) => m.type === "plan" && m.position === 0) && media1.some((m: any) => m.type === "video" && m.storage_path.startsWith("idealista-ref:")),
   "plano copiado con orden; vídeo referenciado con marcador", media1);
const prop1 = (await q(`SELECT reference_only, published_web, new_listing_alerts_suppressed, cover_photo_url, slug, bc_reference FROM properties WHERE id = '${P}'`))[0];
ok(prop1.reference_only && !prop1.published_web && prop1.new_listing_alerts_suppressed && prop1.cover_photo_url === photos1[0].url, "ficha de referencia, fuera de la web y con la portada");

console.log("· Actualización: reordena, quita, añade; no vuelve a descargar lo que ya tiene");
downloads.length = 0;
const L2 = { ...L1, photo_ids: ["https://cdn.test/c.jpg", "https://cdn.test/a.jpg"] };
await op("update", L2, "active", 7001);
const r2 = await applyLatest(LISTING, "production", {}, deps);
const photos2 = await q(`SELECT sync_path FROM property_photos WHERE property_id = '${P}' ORDER BY position`);
ok(r2.ok && photos2.length === 2 && photos2[1].sync_path === photos1[0].sync_path, "nuevo orden: c, a (a reutilizada)");
ok(downloads.length === 1 && downloads[0].endsWith("/c.jpg"), "solo se descarga la nueva", downloads);
ok(objects.has(photos1[1].sync_path), "la foto quitada sigue en el almacenamiento hasta el plazo de limpieza");

console.log("· Un proceso atrasado no pisa ni borra lo de uno más nuevo");
const before = new Map(objects);
const stale = await stageMedia({ propertyId: P, seq: op1.seq, manifest: { photos: ["https://cdn.test/old-worker.jpg"], plans: [], videos: [] }, budgetMs: 10_000 }, deps);
ok(stale.ok && ![...before.keys()].includes(stale.media.photos![0].path), "el atrasado sube a SU ruta versionada, nueva");
ok([...before].every(([k, v]) => objects.get(k) === v), "ningún objeto existente se ha sobrescrito");
const collected = await db.rpc("idealista_crm_media_collect", { p_property: P, p_grace: "0 seconds" });
const inUse = (await q(`SELECT sync_path FROM property_photos WHERE property_id = '${P}' AND sync_path IS NOT NULL
                        UNION SELECT sync_path FROM property_media WHERE property_id = '${P}' AND sync_path IS NOT NULL`)).map((r: any) => r.sync_path);
ok(!(collected.data as string[]).some((p) => inUse.includes(p)), "la limpieza nunca recoge objetos en uso", { collected: collected.data, inUse });
ok((collected.data as string[]).includes(photos1[1].sync_path), "recoge la foto quitada (sin uso, ya superada)");
ok(!inUse.includes(stale.media!.photos![0].path), "lo subido por el atrasado no lo usa ninguna fila");

console.log("· Fotos no confirmadas por Idealista: se conserva el reflejo");
const L3 = { ...L2, photo_ids: ["https://cdn.test/z.jpg"] };
await op("update", L3, "active", 7001, false);
const r3 = await applyLatest(LISTING, "production", {}, deps);
const photos3 = await q(`SELECT sync_path FROM property_photos WHERE property_id = '${P}' ORDER BY position`);
ok(r3.ok && JSON.stringify(photos3) === JSON.stringify(photos2), "sin cambios en la multimedia", { photos3, photos2 });

console.log("· Baja y reactivación: misma ficha, mismo SmartLink");
const path1 = (await q(`SELECT smartlink_path FROM idealista_crm_sync WHERE listing_id = '${LISTING}'`))[0].smartlink_path;
await op("deactivate", L3, "inactive", 7001, null);
const r4 = await applyLatest(LISTING, "production", {}, deps);
ok(r4.ok && (await q(`SELECT status FROM properties WHERE id = '${P}'`))[0].status === "archived", "baja confirmada → archivada");
await op("reactivate", L3, "active", 7001, null);
const r5 = await applyLatest(LISTING, "production", {}, deps);
const path2 = (await q(`SELECT smartlink_path FROM idealista_crm_sync WHERE listing_id = '${LISTING}'`))[0].smartlink_path;
ok(r5.ok && r5.propertyId === P && path1 === path2 && path1 === `/compartir/${prop1.bc_reference.replace("-", "").toLowerCase()}-${prop1.slug}`,
   "reactivada: la misma ficha y el mismo SmartLink", { path1, path2 });

console.log("· Interruptor apagado");
const { runSql } = await import("./shims/supabase-on-psql.mts");
await runSql(`RESET ROLE; UPDATE app_settings SET value = '{"enabled": false}' WHERE key = 'idealista_crm_sync'`);
await op("update", L3, "active", 7001);
const r6 = await applyLatest(LISTING, "production", {}, deps);
ok(r6.status === "disabled" && r6.ok, "apagado: no se aplica, se informa como apagado");

console.log(fails ? `\n❌ ${fails} de ${n} comprobaciones fallan` : `\n✅ ${n}/${n} comprobaciones correctas`);
if (fails) process.exit(1);
