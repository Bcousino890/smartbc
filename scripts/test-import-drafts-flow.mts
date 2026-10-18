// SOLO PRUEBAS LOCALES (BCP-01 P5). El flujo de importación con borrador de
// punta a punta contra las funciones SQL REALES de 0214, en el Postgres
// temporal (scripts/sql/run-local.sh), con el adaptador de psql en lugar de
// Supabase y un servidor local de fotos. Sin red real ni credenciales.
//   BCP_PG_DIR=<scratchpad>/pg-bcp01 sh scripts/sql/test-import-drafts-flow.sh
import assert from "node:assert/strict";
import { createServer } from "node:http";
import sharp from "sharp";
import { __setSafeFetchTestHooks } from "../lib/net/safe-fetch.ts";
import * as drafts from "../lib/imports/drafts.ts";
import { DRAFT_BUCKET } from "../lib/imports/photos.ts";
import { runSql, storage, __failStorage } from "./shims/supabase-on-psql.mts";

const FAB = "00000000-0000-0000-0000-0000000000f1";
const OTHER = "00000000-0000-0000-0000-0000000000a2";
const LEVEL = "b5000000-0000-0000-0000-0000000000a2";
const NOFEED = "b5000000-0000-0000-0000-0000000000a3";
let n = 0;
const ok = (c: boolean, name: string, detail = "") => {
  if (!c) console.error(`❌ ${name} ${detail}`);
  assert.ok(c, name);
  n++;
  console.log(`  ✅ ${name}`);
};
const q1 = async (sql: string) => {
  const r = await runSql(`SELECT coalesce(json_agg(x), '[]') FROM (${sql}) x`);
  if (r.error) throw new Error(r.error.message);
  return JSON.parse(r.data)[0];
};
const isFail = (r: any): r is { ok: false; error: string } => r && r.ok === false;

// ── Servidor local de fotos ─────────────────────────────────────────────────
const jpg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 180, g: 120, b: 60 } } }).jpeg({ quality: 80 }).toBuffer();
let brokenUntilFixed = true;
const server = createServer((req, res) => {
  if (req.url === "/fotos/1.jpg" || req.url === "/fotos/2.jpg") return res.writeHead(200, { "content-type": "image/jpeg" }).end(jpg);
  if (req.url === "/fotos/3.jpg") return brokenUntilFixed ? res.writeHead(404).end() : res.writeHead(200).end(jpg);
  if (req.url === "/fotos/4.jpg") return res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const PORT = (server.address() as { port: number }).port;
__setSafeFetchTestHooks({ allowHttp: true, allowLoopback: true });

const html = `<!doctype html><html><head>
<meta property="og:title" content="Piso exterior en Recoletos, 2 dormitorios">
<meta property="og:description" content="Piso exterior de 85 m² con 2 dormitorios y 1 baño en Recoletos. Alquiler 3.000 €/mes. Llamar al 600 111 222.">
<script type="application/ld+json">{"@type":"Offer","price":"3000","priceCurrency":"EUR"}</script>
</head><body><h1>Piso exterior en Recoletos</h1>
<img src="http://127.0.0.1:${PORT}/fotos/1.jpg"><img src="http://127.0.0.1:${PORT}/fotos/2.jpg"><img src="http://127.0.0.1:${PORT}/fotos/3.jpg">
<img src="http://127.0.0.1:${PORT}/fotos/4.jpg"></body></html>`;
const URL1 = "https://www.portal-sintetico.test/anuncio/777/";

console.log("\n· Crear desde un enlace (el servidor extrae; la clave de petición evita dobles)");
const d1 = await drafts.createLinkDraft({ actor: FAB, country: "es", url: URL1, html, requestKey: "flow-link-0001", catalogId: null });
assert.ok(!isFail(d1), JSON.stringify(d1));
ok(d1.state === "review" && d1.source_kind === "link" && d1.property_id === null, "borrador en revisión, sin ficha");
ok(d1.fields.title!.includes("Recoletos") && d1.fields.price === 3000, "campos sacados del anuncio por el servidor", JSON.stringify({ f: d1.fields, w: d1.extracted?.preview?.warnings }));
ok(d1.photos.length === 4 && d1.photos.every((p) => p.kind === "remote"), "fotos del anuncio (URL sacadas en el servidor)", JSON.stringify(d1.photos));
const again = await drafts.createLinkDraft({ actor: FAB, country: "es", url: URL1, html, requestKey: "flow-link-0001" });
ok(!isFail(again) && again.id === d1.id, "misma clave de petición → el mismo borrador");
ok((await q1(`SELECT count(*)::int AS c FROM property_import_drafts`)).c === 1, "un solo borrador en la base");
ok((await q1(`SELECT count(*)::int AS c FROM properties WHERE title LIKE 'Piso exterior%'`)).c === 0, "el borrador NO es una ficha");
ok((await drafts.getDraft(OTHER, d1.id)) === null, "otro usuario no ve el borrador");

console.log("\n· Editar con versión, agencia y catálogo");
let r: any = await drafts.updateDraft({ actor: FAB, id: d1.id, expectedVersion: 99, fields: d1.fields });
ok(isFail(r) && r.error === "draft_changed", "versión vieja → draft_changed");
r = await drafts.updateDraft({ actor: FAB, id: d1.id, expectedVersion: d1.version, agencyId: NOFEED });
ok(isFail(r) && r.error === "agency_not_allowed", "agencia sin feed (ni portales externos) → no se puede elegir");
r = await drafts.updateDraft({ actor: FAB, id: d1.id, expectedVersion: d1.version, photoOrder: ["r-0", "inventada"] });
ok(isFail(r) && r.error === "invalid_photos", "el navegador no puede añadir fotos que no salieron del servidor");
const cat = (await q1(`SELECT id FROM catalogs WHERE title = 'Catálogo del dueño'`)).id as string;
const catAuto = (await q1(`SELECT id FROM catalogs WHERE title = 'Automático antiguo'`)).id as string;
r = await drafts.updateDraft({ actor: FAB, id: d1.id, expectedVersion: d1.version, catalogId: catAuto });
ok(!isFail(r) && r.catalog_id === null, "un catálogo automático antiguo no se acepta (se ignora)");
r = await drafts.updateDraft({ actor: FAB, id: d1.id, expectedVersion: r.version, catalogId: cat, photoOrder: ["r-1", "r-0", "r-2", "r-3"] });
ok(!isFail(r) && r.catalog_id === cat && r.photos[0].id === "r-1" && r.photos[0].cover, "catálogo del dueño y orden de fotos (la primera es portada)", JSON.stringify(isFail(r) ? r : { c: r.catalog_id, p: r.photos.map((x: any) => x.id) }));
r = await drafts.updateDraft({ actor: FAB, id: d1.id, expectedVersion: r.version, fields: { ...r.fields, operation: "rent", zone: "Salamanca", subzone: "Recoletos" } });
ok(!isFail(r) && r.fields.operation === "rent" && r.version > d1.version, "la persona corrige la operación y la zona");
let cur = r;

console.log("\n· Duplicados: nunca se sobrescribe sin elegirlo");
const dup: any = await drafts.findDraftDuplicates(FAB, d1.id);
ok(!isFail(dup) && dup.matches.some((m: any) => m.propertyId === "c5000000-0000-0000-0000-000000000001" && m.level === "cierto" && m.canUpdate), "la ficha con el mismo enlace sale como «cierto»");

console.log("\n· Confirmar: doble clic y dos pestañas → una sola ficha");
const [c1, c2] = await Promise.all([
  drafts.confirmDraft({ actor: FAB, id: d1.id, expectedVersion: cur.version, choice: { kind: "new" } }),
  drafts.confirmDraft({ actor: FAB, id: d1.id, expectedVersion: cur.version, choice: { kind: "new" } }),
]);
ok(!isFail(c1) && !isFail(c2) && (c1 as any).propertyId === (c2 as any).propertyId, "las dos peticiones devuelven la misma ficha");
const pid = (c1 as any).propertyId as string;
const prop = await q1(`SELECT status::text, published_web, new_listing_alerts_suppressed AS sup, country, agency_id, external_id, source_url FROM properties WHERE id = '${pid}'`);
ok(prop.status === "available" && prop.published_web === false && prop.sup === true && prop.country === "es", "ficha disponible, SIN publicar y SIN alertas (forzado en el servidor)");
ok((await q1(`SELECT count(*)::int AS c FROM properties WHERE source_url = '${URL1}'`)).c === 2, "solo una ficha nueva (más la que ya existía)");
const after = await drafts.getDraft(FAB, d1.id);
ok(after!.state === "created" && after!.steps.photos.status === "pending" && after!.steps.catalog.status === "pending" && after!.steps.client_link.status === "skipped", "pasos pendientes: fotos y catálogo");

console.log("\n· Fotos: por tandas, con un fallo, sin duplicar y con reintento");
let ph: any = await drafts.runPhotoStep(FAB, d1.id);
ok(!isFail(ph) && ph.status === "failed" && ph.done === 2 && ph.failed === 2, "2 guardadas; la 404 y la que redirige a 169.254.169.254 fallan", JSON.stringify(ph));
ok((await q1(`SELECT count(*)::int AS c FROM property_photos WHERE property_id = '${pid}'`)).c === 2, "dos filas de foto");
ok(![...(storage.get("properties-photos")?.keys() ?? [])].some((k) => k.includes("169.254")), "la redirección a una IP interna no guardó nada");
ok((await drafts.getDraft(FAB, d1.id))!.property_id === pid, "la ficha se conserva aunque fallen fotos");
brokenUntilFixed = false;
ph = await drafts.runPhotoStep(FAB, d1.id, );
ph = await drafts.retryPhotoStep(FAB, d1.id);
ok(!isFail(ph) && ph.done === 3 && ph.failed === 1, "reintento: la 3 ya se guarda; la de la IP interna sigue bloqueada", JSON.stringify(ph));
ok((await q1(`SELECT count(*)::int AS c FROM property_photos WHERE property_id = '${pid}'`)).c === 3, "tres filas, sin duplicados tras reintentar");
ok((await q1(`SELECT cover_photo_url FROM properties WHERE id = '${pid}'`)).cover_photo_url.endsWith(`imports/${d1.id}/0.webp`), "portada = la primera elegida");

console.log("\n· Catálogo: solo el dueño, una vez");
let cs: any = await drafts.runCatalogStep(FAB, d1.id);
ok(!isFail(cs) && cs.status === "ok", "añadida al catálogo del dueño");
cs = await drafts.runCatalogStep(FAB, d1.id);
ok(!isFail(cs) && cs.status === "ok" && (await q1(`SELECT count(*)::int AS c FROM catalog_items WHERE catalog_id = '${cat}'`)).c === 1, "repetir no la añade dos veces");

const mine = await drafts.listOwnedExplicitCatalogs(FAB);
ok(mine.some((c) => c.id === cat), "el dueño ve su catálogo fijo para elegirlo en la revisión (P6)");
ok((await drafts.listOwnedExplicitCatalogs(OTHER)).length === 0, "otro miembro del staff no ve ningún catálogo (P6)");
ok((await drafts.propertySlugOf(pid)) === (await q1(`SELECT slug FROM properties WHERE id = '${pid}'`)).slug, "slug de la ficha creada para los enlaces finales (P6)");

console.log("\n· Usar la existente / actualizarla");
const d2 = await drafts.createLinkDraft({ actor: FAB, country: "es", url: URL1, html, requestKey: "flow-link-0002" });
assert.ok(!isFail(d2));
const before = await q1(`SELECT updated_at, title FROM properties WHERE id = 'c5000000-0000-0000-0000-000000000001'`);
r = await drafts.confirmDraft({ actor: FAB, id: d2.id, expectedVersion: d2.version, choice: { kind: "update", propertyId: "c5000000-0000-0000-0000-000000000001", expectedUpdatedAt: "2020-01-01T00:00:00Z", fields: ["price"] } });
ok(isFail(r) && r.error === "property_changed", "actualizar con una comparación vieja → property_changed");
r = await drafts.confirmDraft({ actor: FAB, id: d2.id, expectedVersion: d2.version, choice: { kind: "existing", propertyId: "c5000000-0000-0000-0000-000000000001" } });
ok(!isFail(r) && r.choice === "existing" && r.propertyId === "c5000000-0000-0000-0000-000000000001", "usar la existente");
const after2 = await q1(`SELECT updated_at, title FROM properties WHERE id = 'c5000000-0000-0000-0000-000000000001'`);
ok(after2.updated_at === before.updated_at && after2.title === before.title, "usar la existente no la toca");
ok((await drafts.getDraft(FAB, d2.id))!.steps.photos.status === "skipped", "sin fotos que añadir");

console.log("\n· Agencia colaboradora: referencia con espacio de nombres");
const d3 = await drafts.createLinkDraft({ actor: FAB, country: "es", url: URL1, html, requestKey: "flow-link-0003" });
assert.ok(!isFail(d3));
r = await drafts.updateDraft({ actor: FAB, id: d3.id, expectedVersion: d3.version, agencyId: LEVEL, notifyClients: true, fields: { ...d3.fields, operation: "rent", zone: "Salamanca" } });
r = await drafts.confirmDraft({ actor: FAB, id: d3.id, expectedVersion: r.version, choice: { kind: "new" } });
const p3 = await q1(`SELECT external_id, new_listing_alerts_suppressed AS sup FROM properties WHERE id = '${r.propertyId}'`);
ok(p3.external_id.startsWith("link:generic:") && p3.sup === false, "colaboradora: link:<portal>:<ref>; «Avisar por correo» → alertas encendidas");

console.log("\n· PDF: fotos al bucket privado, validadas, y luego a la ficha");
const sha = "a".repeat(64);
const d4 = await drafts.createPdfDraft({
  actor: FAB, country: "es", requestKey: "flow-pdf-0001", sourceName: "dossier.pdf", sourceHash: sha, part: 2,
  fields: { title: "Ático con terraza", operation: "sale", price: 950000, zone: "Chamberí", bedrooms: 3, floor: "ático" },
  evidence: { price: { status: "seguro", page: 1, snippet: "950.000 €" }, zone: { status: "dudoso", page: 2, snippet: "Chamberí/Almagro" }, bogus: { status: "x" } },
});
assert.ok(!isFail(d4), JSON.stringify(d4));
ok(d4.extracted.evidence.price.page === 1 && !("bogus" in d4.extracted.evidence), "prueba por campo guardada (y lo desconocido fuera)");
let up: any = await drafts.addUploadedPhoto(FAB, d4.id, Buffer.from("no soy una imagen"), 1);
ok(isFail(up) && up.error === "not_an_image", "texto disfrazado → rechazado por la firma");
const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).png().toBuffer();
up = await drafts.addUploadedPhoto(FAB, d4.id, tiny, 1);
ok(isFail(up) && up.error === "image_too_small", "demasiado pequeña → rechazada");
up = await drafts.addUploadedPhoto(FAB, d4.id, jpg, 1);
ok(!isFail(up) && up.photo.kind === "upload", "JPEG válido → guardado");
const up2: any = await drafts.addUploadedPhoto(FAB, d4.id, jpg, 3);
ok(!isFail(up2) && up2.photo.id === up.photo.id, "la misma foto otra vez no se duplica");
ok(storage.get(DRAFT_BUCKET)!.has(up.photo.path) && up.photo.path.startsWith(`drafts/${d4.id}/`), "en el bucket PRIVADO del borrador");
ok(isFail(await drafts.addUploadedPhoto(OTHER, d4.id, jpg, 1)), "otro usuario no puede subir a mi borrador");
const fresh4 = (await drafts.getDraft(FAB, d4.id))!;
r = await drafts.confirmDraft({ actor: FAB, id: d4.id, expectedVersion: fresh4.version, choice: { kind: "new" } });
ok(!isFail(r) && r.created, "confirmado");
const p4 = await q1(`SELECT external_id, features, source_url FROM properties WHERE id = '${r.propertyId}'`);
ok(p4.external_id === `pdf:${sha.slice(0, 16)}:2` && p4.features.includes("Ático") && p4.source_url === null, "referencia pdf:<hash>:<n>, planta como característica, sin URL");
__failStorage(1);
ph = await drafts.runPhotoStep(FAB, d4.id);
ok(!isFail(ph) && ph.status === "failed", "storage caído → el paso falla, la ficha queda");
ph = await drafts.retryPhotoStep(FAB, d4.id);
ok(!isFail(ph) && ph.status === "ok" && storage.get("properties-photos")!.has(`imports/${d4.id}/0.webp`), "reintento → la foto pasa al bucket público");

console.log("\n· Faltan datos, descartar y caducidad");
const d5 = await drafts.createPdfDraft({ actor: FAB, country: "es", requestKey: "flow-pdf-0002", sourceName: "x.pdf", sourceHash: "b".repeat(64), part: 1, fields: { title: "", operation: "" }, evidence: {} });
assert.ok(!isFail(d5));
r = await drafts.confirmDraft({ actor: FAB, id: d5.id, expectedVersion: d5.version, choice: { kind: "new" } });
ok(isFail(r) && r.error === "missing_fields" && (r as any).missing.length === 4, "faltan título, operación, precio y zona: no se crea nada");
await drafts.addUploadedPhoto(FAB, d5.id, jpg, 1);
const d5b = (await drafts.getDraft(FAB, d5.id))!;
const path5 = (d5b.photos[0] as any).path;
r = await drafts.discardDraft(FAB, d5.id);
ok(!isFail(r) && !storage.get(DRAFT_BUCKET)!.has(path5) && (await drafts.getDraft(FAB, d5.id))!.state === "discarded", "descartar borra sus fotos privadas");
const d6 = await drafts.createPdfDraft({ actor: FAB, country: "es", requestKey: "flow-pdf-0003", sourceName: "y.pdf", sourceHash: "c".repeat(64), part: 1, fields: {}, evidence: {} });
assert.ok(!isFail(d6));
await drafts.addUploadedPhoto(FAB, d6.id, await sharp(jpg).rotate(90).jpeg().toBuffer(), 1);
const path6 = ((await drafts.getDraft(FAB, d6.id))!.photos[0] as any).path;
await runSql(`RESET ROLE; UPDATE property_import_drafts SET expires_at = now() - interval '1 day' WHERE id = '${d6.id}'`);
const list = await drafts.listDrafts(FAB);
ok(!list.some((d) => d.id === d6.id) && !storage.get(DRAFT_BUCKET)!.has(path6), "caducado (30 días): se borra con sus fotos al listar");
ok(list.some((d) => d.id === d1.id), "los confirmados no caducan");

server.close();
console.log(`\n✅ ${n} comprobaciones del flujo de importación`);
