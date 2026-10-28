// Idealista API → CRM (T10): suite OFFLINE de la CI. Sin red ni base: los
// endpoints de Idealista, la configuración y lib/db/admin son fakes
// (scripts/shims/test-loader-idealista-publish.mjs); mapper y client, reales.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/shims/test-loader-idealista-publish.mjs scripts/test-idealista-crm-sync.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { IdealistaApiError } from "../lib/services/idealista/partner-api/client.ts";
import * as publish from "../lib/services/idealista/partner-api/publish.ts";
import {
  buildContentSnapshot, buildMediaManifest, buildReferenceProperty, classifyFailure, mediaPath, referenceSlug,
  smartlinkPath, sniffImage, MEDIA_CONCURRENCY,
} from "../lib/services/idealista/crm-sync/core.ts";
import { applyLatest, stageMedia, type CrmSyncDeps } from "../lib/services/idealista/crm-sync/sync.ts";
import { propertyRowToClientProperty } from "../lib/db/adapters.ts";
import { sortMediaByPosition } from "../lib/db/media-order.ts";
import { SCENARIOS, baseListing, defaultRpc, runScenario } from "./idealista-publish-scenarios.mts";

let n = 0;
let fails = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  n++;
  if (cond) console.log(`  ✓ ${msg}`);
  else { fails++; console.log(`  ✗ ${msg}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}
const g = globalThis as any;
const read = (p: string) => readFileSync(p, "utf8");

// ── 1. Piezas puras ─────────────────────────────────────────────────────────
console.log("· Clasificación de fallos");
ok(classifyFailure(new IdealistaApiError("x", 400, "")).outcome === "rejected", "400 → rejected (Idealista no cambió nada)");
ok(classifyFailure(new IdealistaApiError("x", 429, "")).outcome === "rejected", "429 (también el freno local) → rejected");
ok(classifyFailure(new IdealistaApiError("x", 0, "")).outcome === "unknown", "estado 0 (red/tiempo) → unknown");
ok(classifyFailure(new IdealistaApiError("x", 503, "")).outcome === "unknown", "5xx → unknown");
ok(classifyFailure(new TypeError("fetch failed")).outcome === "unknown", "error sin estado → unknown");

console.log("· Contenido de la ficha de referencia");
{
  const L = baseListing({ owner_name: "SENTINEL_OWNER", contact_id: "SENTINEL_CONTACT", address_door: "SENTINEL_DOOR", address_block: "SENTINEL_BLOCK" });
  const snap = buildContentSnapshot(L);
  const street = buildReferenceProperty(snap, "s", 9001);
  ok(street.address === "Calle de Prueba, Madrid" && street.latitude === null, "visibilidad «street»: calle sin número y sin coordenadas");
  const full = buildReferenceProperty(buildContentSnapshot({ ...L, address_visibility: "exact" }), "s", 9001);
  ok(full.address === "Calle de Prueba 12, Madrid" && full.latitude === 40.433, "visibilidad completa: calle, número y coordenadas");
  const hidden = buildReferenceProperty(buildContentSnapshot({ ...L, address_visibility: "hidden" }), "s", 9001);
  ok(hidden.address === null && hidden.latitude === null && hidden.zone === "Madrid", "visibilidad «hidden»: solo la zona");
  const all = JSON.stringify([snap, street, full, hidden]);
  ok(!/SENTINEL_/.test(all), "nunca propietario, contacto, puerta ni bloque");
  ok(street.features.includes("Ascensor") && street.features.includes("Terraza"), "características desde los booleanos");
  ok(/no indica una reserva/.test(street.internal_notes) && /BC-7001/.test(street.internal_notes), "procedencia y aviso de RESERVADO en internal_notes");
  const slug = referenceSlug("Piso luminoso en Chamberí", new Uint8Array(12).map((_, i) => i * 7));
  ok(/^piso-luminoso-en-chamberi-[a-z0-9]{12}$/.test(slug), "slug: título + 12 caracteres aleatorios", slug);
  ok(smartlinkPath("piso-x", "BC-0871") === "/compartir/bc0871-piso-x", "SmartLink con el formato de shareSlug()");
}

console.log("· Manifiesto (mismo filtro y tope que buildImageList)");
{
  const m = buildMediaManifest(baseListing({ photo_ids: ["https://a/1.jpg", "/rel.jpg", "https://a/2.jpg"], video_ids: ["/v.mp4", "x"] }), "https://portal.test");
  ok(JSON.stringify(m.photos) === JSON.stringify(["https://a/1.jpg", "https://a/2.jpg"]), "solo URLs absolutas, en orden");
  ok(JSON.stringify(m.videos) === JSON.stringify(["https://portal.test/v.mp4", "https://portal.test/x"]),
     "vídeos con el mismo toAbsoluteUrl que publish.ts (las relativas se completan con el origen)", m.videos);
  const big = buildMediaManifest(baseListing({ photo_ids: Array.from({ length: 199 }, (_, i) => `https://a/${i}.jpg`), plan_ids: ["https://a/p1.jpg", "https://a/p2.jpg"] }), "https://p");
  ok(big.photos.length === 199 && big.plans.length === 1, "tope de 200 imágenes entre fotos y planos");
  ok(buildMediaManifest(baseListing(), "").photos.length === 0, "sin origen público no se manda ninguna imagen");
  ok(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0]))?.ext === "jpg" && sniffImage(new TextEncoder().encode("<html>")) === null, "tipo por los primeros bytes");
  ok(mediaPath("p1", "photo", "abc", 12, "jpg") === "p1/idealista-ref/photo/abc-12.jpg", "ruta versionada: contenido + operación");
}

// ── 2. I2: las llamadas a Idealista son EXACTAMENTE las de la base ───────────
console.log("· Llamadas a Idealista idénticas a la versión base (9356300a)");
const baseline = JSON.parse(read("scripts/fixtures/idealista-publish-calls-base.json"));
for (const s of SCENARIOS) {
  const r = await runScenario(publish, s);
  ok(JSON.stringify(r.calls) === JSON.stringify(baseline[s.name].calls), `${s.name}: mismas llamadas y mismos cuerpos`,
     { now: r.calls.map((c) => c.name), base: baseline[s.name].calls.map((c: any) => c.name) });
  ok(r.outcome.ok === baseline[s.name].ok, `${s.name}: mismo resultado de Idealista (ok=${baseline[s.name].ok})`);
}

// ── 3. Registro antes de llamar (D18) y resultado principal ─────────────────
console.log("· Registro previo y resultado");
{
  const r = await runScenario(publish, SCENARIOS[0]);
  const iBegin = r.events.indexOf("rpc:idealista_op_begin");
  const iCall = r.events.indexOf("idealista:createProperty");
  const iFinish = r.events.indexOf("rpc:idealista_op_finish");
  const iWrite = r.events.findIndex((e, i) => i > iCall && e === "db:update:idealista_listings");
  ok(iBegin >= 0 && iBegin < iCall, "la operación se registra ANTES de llamar a Idealista");
  ok(iFinish > iCall && iFinish < iWrite, "el resultado se guarda antes de escribir la ficha (api_last_sync_at)");
  const fin = r.rpcCalls.find((c) => c.fn === "idealista_op_finish")!;
  ok(fin.args.p_outcome === "confirmed" && fin.args.p_api_property_id === 9001, "confirmed con el propertyId devuelto");
  const steps = r.rpcCalls.filter((c) => c.fn === "idealista_op_step").map((c) => `${c.args.p_step}:${c.args.p_ok}`);
  ok(steps.includes("idealista_images:true") && steps.includes("idealista_videos:true") && steps.includes("listing_write:true"),
     "pasos posteriores registrados aparte", steps);
  ok(r.rpcCalls.some((c) => c.fn === "apply_idealista_crm_sync"), "se lanza la sincronización tras la confirmación");
  const beginArgs = r.rpcCalls.find((c) => c.fn === "idealista_op_begin")!.args;
  ok(beginArgs.p_manifest.photos.length === 2 && beginArgs.p_manifest.plans.length === 1 && beginArgs.p_content.title === "Piso luminoso en Chamberí",
     "el registro guarda lo que se va a mandar (contenido y manifiesto)");
}
{
  const rpc = defaultRpc();
  const r = await runScenario(publish, SCENARIOS[0], { rpc: async (fn: string) => (fn === "idealista_op_begin" ? { data: null, error: { message: "base caída" } } : rpc(fn)) });
  ok(r.calls.length === 0 && r.outcome.ok === false && /NO se ha enviado nada/.test(r.outcome.errors.join(" ")), "sin registro previo NO se llama a Idealista");
}
{
  const rpc = defaultRpc();
  const r = await runScenario(publish, SCENARIOS[0], { rpc: async (fn: string) => (fn === "idealista_create_guard" ? { data: { allowed: false, reason: "uncertain_create" }, error: null } : rpc(fn)) });
  ok(r.calls.length === 0 && /Reconciliar/.test(r.outcome.errors.join(" ")), "alta incierta: no se repite el alta");
}
{
  const s = { ...SCENARIOS[0], respond: (nm: string) => (nm === "createProperty" ? new IdealistaApiError("timeout", 0, "") : {}) };
  const r = await runScenario(publish, s);
  const fin = r.rpcCalls.find((c) => c.fn === "idealista_op_finish")!;
  ok(fin.args.p_outcome === "unknown" && r.outcome.ok === false && /No se sabe/.test(r.outcome.warnings.join(" ")), "red/tiempo agotado → unknown y aviso de no repetir a ciegas");
  const r400 = await runScenario(publish, SCENARIOS[2]);
  ok(r400.rpcCalls.find((c) => c.fn === "idealista_op_finish")!.args.p_outcome === "rejected", "400 → rejected");
}

// ── 4. Idealista sí, local no (D6, AC10, AC13) ──────────────────────────────
console.log("· Fallos locales tras una confirmación");
{
  const r = await runScenario(publish, SCENARIOS[0], { failWrites: ["update:idealista_listings"] });
  ok(r.outcome.ok === true, "alta confirmada + ficha sin guardar → ok:true (Idealista sí lo hizo)");
  ok(r.outcome.local?.some((l: any) => l.step === "listing_write" && !l.ok && /Recuperar id/.test(l.message)), "aviso local con «Recuperar id», sin repetir el alta");
  ok(r.calls.filter((c) => c.name === "createProperty").length === 1, "una sola alta en Idealista");
}
{
  const r = await runScenario(publish, SCENARIOS[3], { failWrites: ["update:idealista_listings"] });
  ok(r.outcome.ok === true && r.outcome.local?.some((l: any) => l.step === "listing_write" && !l.ok), "baja confirmada + ficha sin guardar → fallo LOCAL, no de Idealista");
  ok(r.rpcCalls.find((c) => c.fn === "idealista_op_finish")!.args.p_outcome === "confirmed", "…y la baja queda confirmada en el registro");
  ok(r.rpcCalls.some((c) => c.fn === "apply_idealista_crm_sync"), "…y la sincronización sigue");
}
{
  const r = await runScenario(publish, SCENARIOS[4]);
  ok((r.db.idealista_api_log ?? []).some((l: any) => l.operation === "property.reactivate" && l.ok), "reactivate deja su logCall");
  const crmFail = await runScenario(publish, SCENARIOS[0], {
    rpc: (() => { const d = defaultRpc(); return async (fn: string) => (fn === "apply_idealista_crm_sync" ? { data: { status: "failed", error_code: "tag_missing" }, error: null } : d(fn)); })(),
  });
  ok(crmFail.outcome.ok === true && crmFail.outcome.crmSync?.ok === false && /RESERVADO/.test(crmFail.outcome.crmSync?.message ?? ""),
     "fallo del CRM (sin etiqueta) → Idealista ok, CRM con su aviso");
}

// ── 5. El reintento no llama a Idealista ────────────────────────────────────
console.log("· Reintento solo local");
{
  g.__idealista = { calls: [], events: [], respond: () => ({}) };
  const rpcLog: string[] = [];
  const deps: CrmSyncDeps = {
    rpc: async (fn) => { rpcLog.push(fn); return fn === "idealista_crm_plan" ? { data: { target: { state: "none" }, enabled: true }, error: null } : { data: { status: "synced" }, error: null }; },
    download: async () => { throw new Error("no"); }, upload: async () => ({ ok: true }), publicUrl: (p) => p, remove: async () => {}, now: () => Date.now(),
  };
  const r = await applyLatest("00000000-0000-4000-8000-000000000001", "production", {}, deps);
  ok(g.__idealista.calls.length === 0 && r.ok, "applyLatest: cero llamadas a Idealista");
  ok(rpcLog.join(",") === "idealista_crm_plan,apply_idealista_crm_sync", "solo planifica y aplica en la base", rpcLog);
}

// ── 6. Multimedia: límites y versiones (corrección 3) ───────────────────────
console.log("· Copia de multimedia");
{
  const JPG = (tag: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, tag]);
  let inFlight = 0; let maxInFlight = 0;
  const uploads: string[] = [];
  const mk = (over: Partial<CrmSyncDeps> = {}): CrmSyncDeps => ({
    rpc: async (fn) => (fn === "idealista_crm_media_lookup" ? { data: {}, error: null } : { data: { ok: true }, error: null }),
    download: async (url) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return JPG(url.length); },
    upload: async (p) => { uploads.push(p); return { ok: true }; },
    publicUrl: (p) => `https://s.test/${p}`, remove: async () => {}, now: () => Date.now(), ...over,
  });
  const manifest = { photos: Array.from({ length: 10 }, (_, i) => `https://a/${i}.jpg`), plans: ["https://a/p.jpg"], videos: ["https://v/1.mp4"] };
  const r = await stageMedia({ propertyId: "P", seq: 7, manifest, budgetMs: 10_000 }, mk());
  ok(r.ok && r.media.photos!.length === 10 && r.media.plans!.length === 1 && r.media.videos!.length === 1, "fotos, planos y vídeos en el manifiesto");
  ok(maxInFlight <= MEDIA_CONCURRENCY, `como mucho ${MEDIA_CONCURRENCY} descargas a la vez (máx. ${maxInFlight})`);
  ok(uploads.every((p) => /^P\/idealista-ref\/(photo|plan)\/[0-9a-f]{64}-7\.jpg$/.test(p)), "rutas versionadas bajo {propertyId}/idealista-ref/");
  ok(r.ok && r.media.videos![0].marker.startsWith("idealista-ref:P:") && !uploads.some((p) => p.includes("mp4")), "vídeos referenciados, nunca copiados (D23)");
  const cached = await stageMedia({ propertyId: "P", seq: 8, manifest: { photos: ["https://a/0.jpg"], plans: [], videos: [] }, budgetMs: 10_000 },
    mk({ rpc: async (fn) => (fn === "idealista_crm_media_lookup" ? { data: { [String((await import("node:crypto")).createHash("sha256").update("https://a/0.jpg").digest("hex"))]: { path: "P/idealista-ref/photo/old-3.jpg" } }, error: null } : { data: { ok: true }, error: null }), download: async () => { throw new Error("no debería descargar"); } }));
  ok(cached.ok && cached.media.photos![0].path === "P/idealista-ref/photo/old-3.jpg", "un origen ya copiado no se vuelve a descargar");
  const html = await stageMedia({ propertyId: "P", seq: 9, manifest: { photos: ["https://a/x"], plans: [], videos: [] }, budgetMs: 10_000 },
    mk({ download: async () => new TextEncoder().encode("<html>") }));
  ok(!html.ok && html.code === "media_copy", "un archivo que no es imagen → fallo, nada a medias");
  let t = 0;
  const slow = await stageMedia({ propertyId: "P", seq: 9, manifest: { photos: ["https://a/1", "https://a/2"], plans: [], videos: [] }, budgetMs: 100 },
    mk({ now: () => (t += 1000) }));
  ok(!slow.ok && slow.code === "media_timeout", "presupuesto de tiempo agotado → media_timeout");
  const exists = await stageMedia({ propertyId: "P", seq: 9, manifest: { photos: ["https://a/1"], plans: [], videos: [] }, budgetMs: 10_000 },
    mk({ upload: async () => ({ ok: false, exists: true, error: "The resource already exists" }) }));
  ok(exists.ok, "si el objeto ya existe (mismo contenido y versión) no se sobrescribe y vale");
  const broken = await stageMedia({ propertyId: "P", seq: 9, manifest: { photos: ["https://a/1"], plans: [], videos: [] }, budgetMs: 10_000 },
    mk({ upload: async () => ({ ok: false, exists: false, error: "storage caído" }) }));
  ok(!broken.ok && broken.code === "media_copy", "fallo de subida → media_copy");
  const keep = await (async () => {
    const calls: any[] = [];
    await applyLatest("L", "production", {}, {
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        if (fn === "idealista_crm_plan") return { data: { enabled: true, target: { state: "published", seq: 5, images_ok: false, content: buildContentSnapshot(baseListing()), manifest: { photos: ["https://a/1"], plans: [], videos: [] } }, classification: { kind: "generated", property_id: "P" } }, error: null };
        return { data: { status: "synced" }, error: null };
      },
      download: async () => { throw new Error("no debería descargar"); }, upload: async () => ({ ok: true }), publicUrl: (p) => p, remove: async () => {}, now: () => Date.now(),
    });
    return calls.find((c) => c.fn === "apply_idealista_crm_sync")?.args.p_media;
  })();
  ok(keep?.mode === "keep", "si Idealista no confirmó las fotos, se conserva el reflejo anterior");
}

// ── 7. SmartLink: solo campos públicos (I8) ─────────────────────────────────
console.log("· Proyección pública de una ficha de referencia");
{
  const row: any = {
    id: "p1", slug: "piso-x", title: "Piso", description: "Texto público", status: "available", operation: "rent", price: 2400,
    bedrooms: 2, bathrooms: 1, square_meters: 80, zone: "Madrid", features: ["Ascensor"], reference_only: true,
    internal_notes: "SENTINEL_INTERNAL_NOTES", owner_name: "SENTINEL_OWNER", owner_phone: "SENTINEL_PHONE", owner_email: "SENTINEL_EMAIL",
    external_id: "idealista-api-SENTINEL_EXT", agencies: { name: "SENTINEL_AGENCY", slug: "bc-idealista-referencias" },
    property_photos: [{ url: "https://s.test/1.jpg", is_cover: true, position: 0 }], bc_reference: "BC-0001",
  };
  const out = JSON.stringify(propertyRowToClientProperty(row));
  ok(!/SENTINEL_/.test(out), "sin notas internas, propietario, contacto, external_id ni agencia técnica", out.match(/SENTINEL_\w+/g));
  ok(/Texto público/.test(out) && /s\.test\/1\.jpg|\/p\//.test(out), "con contenido y fotos");
  ok(JSON.stringify(sortMediaByPosition([{ position: null, k: "a" }, { position: 1, k: "b" }, { position: 0, k: "c" }]).map((r: any) => r.k)) === '["c","b","a"]',
     "planos y vídeos: gestionados primero en su orden");
}

// ── 8. Pruebas de fuente ────────────────────────────────────────────────────
console.log("· Fuentes");
{
  const forbidden = /partner-api\/(client|endpoints)["']|from ["']\.\.?\/(client|endpoints)["']/;
  for (const f of ["lib/services/idealista/crm-sync/core.ts", "lib/services/idealista/crm-sync/sync.ts", "lib/services/idealista/crm-sync/panel.ts", "app/api/admin/idealista/crm-sync/route.ts"]) {
    ok(!forbidden.test(read(f)), `${f}: no importa el cliente ni los endpoints de Idealista (I1)`);
  }
  for (const f of ["app/api/admin/idealista/archive-listing/route.ts", "app/api/admin/idealista/delete-listing/route.ts", "app/api/admin/idealista/restore-listing/route.ts", "app/api/admin/idealista/update-state/route.ts"]) {
    ok(!/crm-sync|apply_idealista_crm_sync/.test(read(f)), `${f}: archivar/borrar en el panel no toca el CRM (D7)`);
  }
  for (const [f, re] of [
    ["lib/db/queries/suggested-properties.ts", /\.not\("reference_only", "is", true\)[\s\S]*getPropertyForOffer[\s\S]*\.not\("reference_only", "is", true\)/],
    ["app/s/[token]/actions.ts", /\.not\("reference_only", "is", true\)/],
    ["app/s/[token]/actions.ts", /prop\.reference_only === true/],
    ["app/[country]/(admin)/admin/idealista/page.tsx", /\.not\("reference_only", "is", true\)/],
  ] as Array<[string, RegExp]>) {
    ok(re.test(read(f)), `${f}: filtra las fichas de referencia`);
  }
  const pub = read("lib/services/idealista/partner-api/publish.ts");
  ok(/beginOperation\([\s\S]*?\}\);\s*\} catch[\s\S]*?NOT_REGISTERED[\s\S]*?createProperty\(/.test(pub), "publish.ts: registra antes de la primera llamada");
}

console.log(fails ? `\n❌ ${fails} de ${n} comprobaciones fallan` : `\n✅ ${n}/${n} comprobaciones correctas`);
if (fails) process.exit(1);
