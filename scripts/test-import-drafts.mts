// Importación con borrador (BCP-01 P5): modelo, duplicados, guarda de salida
// (SSRF), firma de imágenes y filtro de alertas del cron. Sin red ni base.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-import-drafts.mts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import sharp from "sharp";
import {
  activationEffects, applyPhotoSelection, draftSlug, EMPTY_FIELDS, externalReference, floorFeature, missingForConfirm,
  normalizeFields, propertyRow, remotePhotosFromPreview, type DraftPhoto,
} from "../lib/imports/draft-model.ts";
import { bcReferencesIn, classifyDuplicates, normalizeSourceUrl, streetKey, type DuplicateCandidate } from "../lib/imports/duplicates-core.ts";
import { importErrorMessage, IMPORT_GENERIC_ERROR } from "../lib/imports/errors.ts";
import { processDraftPhoto, sniffImage } from "../lib/imports/photos.ts";
import { __setSafeFetchTestHooks, isBlockedAddress, safeFetch } from "../lib/net/safe-fetch.ts";
import { resolveFloor } from "../lib/floor.ts";

let n = 0;
const ok = (c: boolean, name: string) => { assert.ok(c, name); n++; };
const rejects = async (p: Promise<unknown>, code: string, name: string) => {
  try { await p; } catch (e) { ok((e as { code?: string }).code === code, `${name} (${(e as { code?: string }).code})`); return; }
  ok(false, `${name}: no falló`);
};

// ── Modelo ──────────────────────────────────────────────────────────────────
const F = (o: Record<string, unknown>) => { const r = normalizeFields({ ...EMPTY_FIELDS, ...o }); assert.ok(r.ok, JSON.stringify(o)); return r.fields; };
ok(!normalizeFields({ title: "x".repeat(201) }).ok && !normalizeFields({ price: -1 }).ok && !normalizeFields({ operation: "alquiler" }).ok, "campos: límites y valores");
ok(F({ operation: "sale", stay: "long" }).stay === "", "en venta no hay estancia");
ok(F({ features: ["Ascensor", "Ascensor", " Terraza "] }).features.join() === "Ascensor,Terraza", "características sin repetir ni espacios");
ok(missingForConfirm(F({})).length === 4 && missingForConfirm(F({ title: "a", operation: "rent", price: 1, zone: "z" })).length === 0, "lo que falta para confirmar");
const slug = draftSlug("Ático en Chamberí — 3 hab.", "8f0e3a2b-1111-4222-8333-444455556666");
ok(slug === "atico-en-chamberi-3-hab-8f0e3a" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug), "slug estable y válido (mismo borrador → mismo slug)");
ok(draftSlug("!!!", "abcdef00-0000-0000-0000-000000000000") === "propiedad-abcdef", "slug sin título útil");
ok(externalReference({ kind: "link", agencySlug: "portales-externos", portal: "idealista", portalRef: "111" }) === "111", "portales externos: la referencia del portal (compatibilidad)");
ok(externalReference({ kind: "link", agencySlug: "level", portal: "idealista", portalRef: "111" }) === "link:idealista:111", "colaboradora: con espacio de nombres");
ok(externalReference({ kind: "pdf", agencySlug: "level", pdfHash: "f".repeat(64), part: 3 }) === `pdf:${"f".repeat(16)}:3`, "PDF: hash y n.º de vivienda");
ok(floorFeature("3") === "Planta 3ª" && floorFeature("ático") === "Ático" && floorFeature("bajo") === "Bajo" && floorFeature("x") === null, "planta escrita → característica");
ok(resolveFloor(null, [floorFeature("4")!]) === 4 && resolveFloor(null, [floorFeature("ático")!]) === 99, "esa característica la entiende resolveFloor");
const row = propertyRow({ fields: F({ title: "T", operation: "sale", stay: "long", price: 5, zone: "Z", floor: "2" }), draftId: "abcdef00-0000-0000-0000-000000000000", externalId: "e", sourceUrl: null });
ok(row.stay === null && (row.features as string[])[0] === "Planta 2ª", "fila: venta sin estancia y planta como característica");
ok(!("status" in row) && !("published_web" in row) && !("country" in row) && !("new_listing_alerts_suppressed" in row), "fila: ni estado, ni publicación, ni país, ni alertas (los fija el servidor)");
const photos = remotePhotosFromPreview(Array.from({ length: 70 }, (_, i) => `https://img/${i}.jpg`));
ok(photos.length === 60 && photos[0].cover === true, "como mucho 60 fotos; la primera es portada");
const sel = applyPhotoSelection(photos.slice(0, 3) as DraftPhoto[], ["r-2", "r-0"]);
ok(sel.ok && sel.photos[0].id === "r-2" && sel.photos[0].cover && sel.photos[1].selected && !sel.photos[2].selected && !sel.photos[2].cover, "seleccionar y ordenar por id; la primera es portada; el resto queda fuera");
ok(!applyPhotoSelection(photos.slice(0, 3) as DraftPhoto[], ["r-0", "r-0"]).ok && !applyPhotoSelection(photos.slice(0, 3) as DraftPhoto[], ["x"]).ok, "ids repetidos o inventados: no");
const eff = activationEffects({ notifyClients: false, collaborator: "Level", catalogTitle: "Alquileres" });
ok(eff.some((e) => e.includes("SIN publicar")) && eff.some((e) => e.includes("portal del cliente")) && eff.some((e) => e.includes("No se avisará")) && eff.some((e) => e.includes("Web de Level")) && eff.some((e) => e.includes("Alquileres")), "efectos de activar, explicados");

// ── Duplicados ──────────────────────────────────────────────────────────────
ok(normalizeSourceUrl("https://www.idealista.com/inmueble/123/?utm=1#x") === "idealista.com/inmueble/123", "URL comparable");
ok(bcReferencesIn("Ver BC-1766 y bc 1767", "ref BC1768").join() === "BC-1766,BC-1767,BC-1768", "referencias BC citadas");
ok(streetKey("Calle de Serrano, 12, 3ºB") === "serrano" && streetKey("C/ Velázquez 4") === "velazquez", "calle sin número ni prefijo");
const cand = (o: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  id: "p", slug: "s", title: "t", bc_reference: null, external_id: null, agency_id: null, source_url: null, zone: "Otra", subzone: null,
  address: null, operation: "sale", operations: ["sale"], price: 1, rent_price: null, bedrooms: 9, square_meters: 999, description: null,
  status: "available", archived_at: null, updated_at: "2026-10-01", ...o,
});
const base = { fields: F({ title: "Piso", operation: "rent", price: 3000, bedrooms: 2, squareMeters: 80, zone: "Salamanca", address: "Calle Serrano 12", description: "x" }), agencyId: "A", externalId: "E", sourceUrl: "https://portal/a/1" };
const m = classifyDuplicates({ ...base, candidates: [
  cand({ id: "k", external_id: "E", agency_id: "A" }),
  cand({ id: "u", source_url: "https://www.portal/a/1/" }),
  cand({ id: "d", operation: "rent", price: 3100, bedrooms: 2, square_meters: 82, zone: "Salamanca", address: "Serrano, 30" }),
  cand({ id: "x" }),
  cand({ id: "b", bc_reference: "BC-9001" }),
] });
const by = (id: string) => m.find((x) => x.propertyId === id);
ok(by("k")?.level === "clave" && by("k")!.blocksNew && by("k")!.canUpdate, "misma agencia y referencia: «clave», no se puede crear otra");
ok(by("u")?.level === "cierto" && by("u")!.canUpdate && !by("u")!.blocksNew, "mismo enlace: «cierto», se puede actualizar");
ok(by("d")?.level === "probable" && !by("d")!.canUpdate, "parecido por datos (zona, dorm., m², precio y calle): «probable», sin actualizar");
ok(!by("x") && !by("b"), "lo distinto no sale; una BC no citada tampoco");
ok(m[0].level === "clave", "orden: primero lo más seguro");
ok(classifyDuplicates({ ...base, fields: { ...base.fields, description: "Es la ficha BC-9001 de siempre" }, candidates: [cand({ id: "b", bc_reference: "BC-9001" })] })[0]?.level === "cierto", "BC citada en el texto: «cierto»");

// ── Guarda de salida (SSRF) ─────────────────────────────────────────────────
for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "64:ff9b::1"])
  ok(isBlockedAddress(ip), `bloqueada ${ip}`);
for (const ip of ["8.8.8.8", "151.101.1.1", "172.32.0.1", "2a00:1450:4003:80e::200e"]) ok(!isBlockedAddress(ip), `pública ${ip}`);
await rejects(safeFetch("http://example.com/x.jpg"), "scheme_not_allowed", "http no se permite");
await rejects(safeFetch("https://127.0.0.1/x.jpg"), "blocked_address", "IP interna literal");
await rejects(safeFetch("https://[::1]/x.jpg"), "blocked_address", "IPv6 de loopback literal");
await rejects(safeFetch("https://localhost/x.jpg"), "blocked_address", "localhost por nombre");
await rejects(safeFetch("https://user:pw@example.com/x"), "invalid_url", "credenciales en la URL");
await rejects(safeFetch("ftp://example.com/x"), "scheme_not_allowed", "otros esquemas");
// Servidor local (solo con el gancho de pruebas): redirecciones y tamaño.
const big = Buffer.alloc(3 * 1024 * 1024, 1);
const srv = createServer((req, res) => {
  if (req.url === "/ok") return res.writeHead(200).end("hola");
  if (req.url === "/to-meta") return res.writeHead(302, { location: "http://169.254.169.254/" }).end();
  if (req.url === "/to-ok") return res.writeHead(301, { location: "/ok" }).end();
  if (req.url === "/loop") return res.writeHead(302, { location: "/loop" }).end();
  if (req.url === "/big") return res.writeHead(200, { "content-length": String(big.length) }).end(big);
  if (req.url === "/big-chunked") { res.writeHead(200); res.write(big); return res.end(big); }
  res.writeHead(404).end();
});
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
const B = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
await rejects(safeFetch(`${B}/ok`), "scheme_not_allowed", "sin el gancho, ni http ni loopback");
__setSafeFetchTestHooks({ allowHttp: true, allowLoopback: true });
const okr = await safeFetch(`${B}/to-ok`);
ok(okr.ok && Buffer.from(await okr.arrayBuffer()).toString() === "hola", "redirección válida: se sigue y se vuelve a validar");
await rejects(safeFetch(`${B}/to-meta`), "blocked_address", "redirección a 169.254.169.254: bloqueada");
await rejects(safeFetch(`${B}/loop`), "too_many_redirects", "bucle de redirecciones");
await rejects(safeFetch(`${B}/big`, { maxBytes: 1024 * 1024 }), "too_large", "content-length por encima del límite");
await rejects(safeFetch(`${B}/big-chunked`, { maxBytes: 4 * 1024 * 1024 }), "too_large", "sin content-length: se corta al pasar el límite");
const nf = await safeFetch(`${B}/nada`);
ok(!nf.ok && nf.status === 404, "un 404 vuelve como respuesta, no como excepción");
__setSafeFetchTestHooks(undefined);
srv.close();

// ── Firma de imágenes y recodificación ──────────────────────────────────────
const jpg = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#a33" } }).jpeg().toBuffer();
const png = await sharp({ create: { width: 900, height: 600, channels: 4, background: "#3a3" } }).png().toBuffer();
const webp = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#33a" } }).webp().toBuffer();
ok(sniffImage(jpg) === "jpeg" && sniffImage(png) === "png" && sniffImage(webp) === "webp" && sniffImage(Buffer.from("<svg/>")) === null, "tipo por la firma, no por el nombre");
const withExif = await sharp(jpg).withMetadata({ exif: { IFD0: { Copyright: "secreto", Artist: "gps" } } }).jpeg().toBuffer();
const pr = await processDraftPhoto(withExif);
ok(pr.ok && sniffImage(pr.photo.data) === "webp" && (await sharp(pr.photo.data).metadata()).exif === undefined, "se recodifica a WebP y el EXIF desaparece");
ok(pr.ok && /^[0-9a-f]{64}$/.test(pr.photo.sha), "nombre = hash del contenido");
const huge = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#777" } }).png({ compressionLevel: 9 }).toBuffer();
const hr = await processDraftPhoto(huge);
ok(hr.ok && hr.photo.width === 2560, "se reduce a 2560 px");
ok(!(await processDraftPhoto(Buffer.alloc(9 * 1024 * 1024))).ok, "más de 8 MB: no");
const bomb = await sharp({ create: { width: 10000, height: 7000, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer();
const br = await processDraftPhoto(bomb);
ok(!br.ok && br.error === "image_too_large", `bomba de descompresión (${(bomb.length / 1024).toFixed(0)} KB, 70 Mpx): rechazada`);

// ── Cron de alertas: solo él filtra las fichas suprimidas ───────────────────
{
  const calls: string[] = [];
  const builder: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === "then") return (res: (v: unknown) => void) => res({ data: [], error: null });
      return (...args: unknown[]) => { calls.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(",")})`); return builder; };
    },
  });
  const fake = {
    from(t: string) {
      if (t === "client_preferences") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { client_id: "c", operation: "rent", max_price: 3000, zones: ["Salamanca"] }, error: null }) }) }) };
      return builder;
    },
  };
  const { getSuggestedProperties } = await import("../lib/db/queries/suggested-properties.ts");
  await getSuggestedProperties("c", { supabase: fake, createdAfter: "2026-10-01T00:00:00Z", forAlerts: true });
  const cron = calls.join(" ");
  calls.length = 0;
  await getSuggestedProperties("c", { supabase: fake });
  const panel = calls.join(" ");
  calls.length = 0;
  await getSuggestedProperties("c", { supabase: fake, forAlerts: true });
  const firstRun = calls.join(" ");
  ok(cron.includes(`eq("new_listing_alerts_suppressed",false)`), "cron: se saltan las fichas con alertas suprimidas");
  ok(firstRun.includes('eq("new_listing_alerts_suppressed",false)'), "cron, primer envío (sin fecha previa): también");
  ok(!panel.includes("new_listing_alerts_suppressed"), "panel y portal del cliente: sin cambios");
}

ok(importErrorMessage("duplicate_key").includes("Ya hay una ficha") && importErrorMessage("x") === IMPORT_GENERIC_ERROR, "mensajes");
console.log(`✅ ${n} comprobaciones de la importación con borrador`);
