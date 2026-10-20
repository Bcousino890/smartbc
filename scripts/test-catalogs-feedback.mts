/**
 * Tests de las opiniones de clientes sobre un catálogo (0218, expediente
 * 2026-10-20-bcp-01-compacto-y-opiniones, DC10–DC18). Sin base de datos ni
 * red: la capa pura, la ruta pública real contra el almacén SINTÉTICO (modo
 * fixtures, las mismas reglas que 0218) y comprobaciones de fuente.
 * Las reglas de la base de datos se prueban aparte en
 * scripts/sql/test-catalog-feedback.sql (Postgres temporal).
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-feedback.mts
 */
import { readFileSync } from "node:fs";
import {
  FEEDBACK_COMMENT_MAX,
  clientLinkFromRow,
  clientLinkState,
  feedbackDirty,
  feedbackErrorOf,
  feedbackHttpStatus,
  normalizeClientQuery,
  normalizeComment,
  parseFeedbackInput,
  parsePersonalFeedback,
} from "../lib/catalogs/feedback-rules.ts";

let failures = 0;
let passes = 0;
function ok(cond: unknown, msg: string) {
  if (cond) {
    passes++;
  } else {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}
function eq<T>(a: T, b: T, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} · esperado ${JSON.stringify(b)}, llegó ${JSON.stringify(a)}`);
}

console.log("· DC12/DC13 · validación de la opinión (capa pura)");
{
  const good = parseFeedbackInput({ key: "abcDEF123_-x", rating: 4, comment: "  Muy luminoso  " });
  eq(good, { ok: true, input: { key: "abcDEF123_-x", rating: 4, comment: "Muy luminoso" } }, "opinión válida, comentario recortado");
  const extra = parseFeedbackInput({ key: "abcDEF123_-x", rating: 5, clientId: "otro", client: "Pepe", catalogId: "x" });
  eq(extra, { ok: true, input: { key: "abcDEF123_-x", rating: 5, comment: null } }, "campos de identidad del navegador se ignoran");
  for (const r of [0, 6, 3.5, "4", null, undefined, NaN]) {
    eq(parseFeedbackInput({ key: "abcDEF123_-x", rating: r }), { ok: false, error: "invalid_rating" }, `valoración no válida (${String(r)})`);
  }
  eq(parseFeedbackInput(null), { ok: false, error: "invalid_body" }, "sin cuerpo");
  eq(parseFeedbackInput({ key: "a b", rating: 3 }), { ok: false, error: "invalid_body" }, "clave con espacios");
  eq(parseFeedbackInput({ key: "abcDEF123_-x", rating: 3, comment: 5 }), { ok: false, error: "invalid_body" }, "comentario que no es texto");
  eq(parseFeedbackInput({ key: "abcDEF123_-x", rating: 3, comment: "a".repeat(FEEDBACK_COMMENT_MAX) }).ok, true, "1.000 caracteres: vale");
  eq(parseFeedbackInput({ key: "abcDEF123_-x", rating: 3, comment: "a".repeat(FEEDBACK_COMMENT_MAX + 1) }), { ok: false, error: "comment_too_long" }, "1.001 caracteres: no");
  eq(parseFeedbackInput({ key: "abcDEF123_-x", rating: 3, comment: "😀".repeat(FEEDBACK_COMMENT_MAX) }).ok, true, "1.000 emojis cuentan como 1.000");
  eq(normalizeComment("   \n  "), null, "comentario en blanco = sin comentario");
  eq(normalizeComment("a\r\nb"), "a\nb", "saltos de línea normalizados");
}

console.log("· errores de 0218 → códigos y estados HTTP");
{
  eq(feedbackErrorOf("link_invalid"), "link_invalid", "link_invalid");
  eq(feedbackErrorOf('ERROR:  not_in_catalog'), "not_in_catalog", "not_in_catalog dentro del mensaje");
  eq(feedbackErrorOf("connection refused"), null, "otro error: desconocido (la ruta da 503)");
  eq([feedbackHttpStatus("link_invalid"), feedbackHttpStatus("not_in_catalog"), feedbackHttpStatus("invalid_rating"), feedbackHttpStatus("comment_too_long")], [410, 404, 400, 400], "estados");
}

console.log("· lectura personal, cambios y asignaciones");
{
  const v = parsePersonalFeedback({ personal: true, items: { abcDEF123_x: { rating: 4, comment: "x", updated_at: "2026-10-20T10:00:00Z" }, "bad key": { rating: 3 }, abcDEF123_y: { rating: 9 } } });
  eq(v, { personal: true, items: { abcDEF123_x: { rating: 4, comment: "x", updatedAt: "2026-10-20T10:00:00Z" } } }, "solo claves y valoraciones válidas");
  eq(parsePersonalFeedback({ personal: false, items: { abcDEF123_x: { rating: 4 } } }), { personal: false, items: {} }, "no personal: nada");
  const saved = { rating: 4, comment: "Luz", updatedAt: "" };
  eq([feedbackDirty(null, null, ""), feedbackDirty(null, 3, ""), feedbackDirty(saved, 4, " Luz "), feedbackDirty(saved, 4, "Luz y patio"), feedbackDirty(saved, 5, "Luz")], [false, true, false, true, true], "¿hay algo que guardar?");
  const now = Date.parse("2026-10-20T12:00:00Z");
  eq([clientLinkState({ revokedAt: null, expiresAt: "2026-10-21T00:00:00Z" }, now), clientLinkState({ revokedAt: null, expiresAt: "2026-10-19T00:00:00Z" }, now), clientLinkState({ revokedAt: "2026-10-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" }, now)], ["active", "expired", "revoked"], "estados de una asignación");
  const row = clientLinkFromRow({ id: "1", client_id: "c", client_name: "Ana", token: "t", expires_at: "2026-10-21T00:00:00Z", revoked_at: null, created_at: "x", feedback_count: 2, last_feedback_at: null }, now);
  eq([row.state, row.feedbackCount, row.clientName], ["active", 2, "Ana"], "fila de catalog_client_links_list");
  eq([normalizeClientQuery("a"), normalizeClientQuery("  Ana   P%rieto, (x) "), normalizeClientQuery(42)], [null, "Ana P rieto x", null], "búsqueda de clientes sin comodines de PostgREST");
}

console.log("· la ruta pública (su lógica real) contra el almacén sintético (mismas reglas que 0218)");
{
  process.env.NODE_ENV = "development";
  process.env.CATALOG_FIXTURES = "1";
  const store = await import("../lib/catalogs/fixture-store.ts");
  const route = await import("../lib/catalogs/feedback-route.ts");
  const { getPublicCatalogState } = await import("../lib/catalogs/public-data.ts");
  await store.fixtureMutate({ op: "reset" });
  const { FIXTURE_TOKENS, FIXTURE_PERSONAL_TOKENS, FIXTURE_CLIENTS } = store;
  const ana = FIXTURE_PERSONAL_TOKENS.anaMain;
  const luis = FIXTURE_PERSONAL_TOKENS.luisMain;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (token: string, method: "GET" | "POST", body?: unknown): Promise<{ status: number; body: any }> =>
    method === "GET" ? route.feedbackGet(token) : route.feedbackPost(token, typeof body === "string" ? body : JSON.stringify(body));

  const pubMain = await getPublicCatalogState(FIXTURE_TOKENS.main);
  const pubAna = await getPublicCatalogState(ana);
  ok(pubMain && pubAna && pubAna.fingerprint === pubMain.fingerprint, "enlace personal: mismo catálogo y misma huella pública que el general");
  const keys = pubMain!.catalog.items.map((i) => i.key);
  const pubText = JSON.stringify(pubAna);
  ok(!FIXTURE_CLIENTS.some((c) => pubText.includes(c.name) || pubText.includes(c.id)), "la instantánea pública no lleva nombre ni id de cliente");

  eq((await call(FIXTURE_TOKENS.main, "GET")).body, { personal: false, items: {} }, "enlace general: no es personal");
  eq(await call(FIXTURE_TOKENS.main, "POST", { key: keys[0], rating: 5 }), { status: 410, body: { error: "link_invalid" } }, "enlace general: no puede opinar (no atribuye a nadie)");
  eq((await call(ana, "POST", { key: keys[0], rating: 0 })).status, 400, "valoración 0: 400");
  eq((await call(ana, "POST", "{no es json")).status, 400, "cuerpo roto: 400");
  eq(await call(ana, "POST", { key: "claveQueNoEsta01", rating: 4 }), { status: 404, body: { error: "not_in_catalog" } }, "vivienda que no está: 404");

  const a1 = await call(ana, "POST", { key: keys[0], rating: 5, comment: "Me encanta", clientId: FIXTURE_CLIENTS[1].id });
  eq([a1.status, a1.body.ok, a1.body.status], [200, true, "saved"], "Ana guarda (el clientId del navegador se ignora)");
  const l1 = await call(luis, "POST", { key: keys[0], rating: 2 });
  eq([l1.status, l1.body.status], [200, "saved"], "Luis opina de la MISMA vivienda por separado");
  eq((await call(ana, "GET")).body.items[keys[0]].rating, 5, "Ana lee su 5");
  eq((await call(luis, "GET")).body.items[keys[0]].rating, 2, "Luis lee su 2");
  ok(!JSON.stringify((await call(ana, "GET")).body).includes("Luis"), "la lectura de Ana no expone a Luis");

  const noticesBefore = store.fixtureNotices().length;
  const retry = await call(ana, "POST", { key: keys[0], rating: 5, comment: " Me encanta " });
  eq([retry.status, retry.body.status], [200, "unchanged"], "reintento igual: sin cambios");
  eq(store.fixtureNotices().length, noticesBefore, "reintento igual: ningún aviso nuevo");
  await call(ana, "POST", { key: keys[0], rating: 4, comment: "Algo pequeño" });
  const anaNotices = store.fixtureNotices().filter((n) => n.clientId === FIXTURE_CLIENTS[0].id);
  eq([anaNotices.length, anaNotices[0].rating, anaNotices[0].to], [1, 4, "asesor"], "edición con aviso sin leer: se actualiza el mismo aviso (para su asesora)");
  eq(store.fixtureNotices().find((n) => n.clientId === FIXTURE_CLIENTS[1].id)?.to, "dueño", "cliente sin asesor: aviso al dueño");
  ok(store.fixtureNotices().every((n) => n.link.startsWith("/dev-fixtures/cliente-opiniones")), "los avisos enlazan a la ficha (interno), nunca a un canal externo");

  // Reordenar no mueve opiniones.
  await store.fixtureMutate({ op: "reorder", token: FIXTURE_TOKENS.main });
  eq((await call(ana, "GET")).body.items[keys[0]].rating, 4, "tras reordenar, la opinión sigue en su vivienda");
  // Vivienda retirada: histórico conservado, no editable.
  await call(ana, "POST", { key: keys[1], rating: 1 });
  await store.fixtureMutate({ op: "remove", token: FIXTURE_TOKENS.main, key: keys[1] });
  ok(!((await call(ana, "GET")).body.items[keys[1]]), "vivienda retirada: ya no sale en el lector");
  eq((await call(ana, "POST", { key: keys[1], rating: 5 })).status, 404, "vivienda retirada: no se puede editar");
  const rec = await store.fixtureClientRecord(FIXTURE_CLIENTS[0].id);
  eq(rec.feedback.map((f) => f.inCatalog).sort(), [false, true], "la ficha conserva las dos opiniones y marca la retirada");

  // Caducado y revocado: se revalida en cada escritura.
  await store.fixtureClientLinks({ op: "expire", token: luis });
  eq((await call(luis, "POST", { key: keys[0], rating: 3 })).status, 410, "enlace caducado: 410");
  ok((await getPublicCatalogState(luis)) === null, "enlace caducado: el lector no abre");
  const links = (await store.fixtureClientLinks({ op: "list", catalogId: "f0000000-0000-0000-0000-000000000001" })) as Array<{ id: string; token: string }>;
  const anaLink = links.find((l) => l.token === ana)!;
  await store.fixtureClientLinks({ op: "revoke", linkId: anaLink.id });
  eq((await call(ana, "POST", { key: keys[0], rating: 3 })).status, 410, "enlace revocado: 410");
  eq((await call(ana, "GET")).body, { personal: false, items: {} }, "enlace revocado: no lee");
  eq((await store.fixtureClientRecord(FIXTURE_CLIENTS[0].id)).feedback.length, 2, "revocar conserva las opiniones");
  // Una asignación nueva para Ana ve y edita sus opiniones anteriores.
  const fresh = (await store.fixtureClientLinks({ op: "create", catalogId: "f0000000-0000-0000-0000-000000000001", clientId: FIXTURE_CLIENTS[0].id, days: 30 })) as { token: string };
  eq((await call(fresh.token, "GET")).body.items[keys[0]].rating, 4, "enlace nuevo del mismo cliente: ve su opinión");
  let dup = "";
  try {
    await store.fixtureClientLinks({ op: "create", catalogId: "f0000000-0000-0000-0000-000000000001", clientId: FIXTURE_CLIENTS[0].id, days: 30 });
  } catch (e) {
    dup = (e as Error).message;
  }
  eq(dup, "link_exists", "una sola asignación vigente por cliente y catálogo");
  await store.fixtureMutate({ op: "reset" });
}

console.log("· comprobaciones de fuente (DC13, DC17, DC18)");
{
  const box = readFileSync("components/catalogs/reader/feedback-box.tsx", "utf8");
  ok(/JSON\.stringify\(\{ key: itemKey, rating, comment \}\)/.test(box), "el lector solo manda clave, estrellas y comentario");
  ok(!/clientId|client_id/.test(box), "el lector no conoce al cliente");
  const sql = readFileSync("supabase/migrations/0218_catalog_client_feedback.sql", "utf8");
  ok(!/send_email|whatsapp|zinto|ses/i.test(sql.replace(/--.*$/gm, "")), "0218 no envía nada fuera del CRM");
  ok(/neq\("type", "catalog_feedback"\)/.test(readFileSync("app/[country]/(admin)/layout.tsx", "utf8")), "el contador de Captaciones no cuenta los avisos de opiniones");
  const contract = readFileSync("lib/catalogs/public-contract.ts", "utf8");
  ok(!/rating|feedback|opini/i.test(contract), "el contrato público no lleva opiniones");
  const pdf = readFileSync("lib/pdf/catalog/document.ts", "utf8");
  ok(!/feedback|opini/i.test(pdf), "el PDF no lleva opiniones");
  const reader = readFileSync("components/catalogs/reader/catalog-reader.tsx", "utf8");
  ok(/personal \? \(\s*<FeedbackBox/.test(reader), "«Tu opinión» solo con enlace personal");
}

console.log(`\ntest-catalogs-feedback: ${passes} comprobaciones, ${failures} fallos`);
if (failures) process.exit(1);
