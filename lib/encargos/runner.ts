import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { briefSuggestMissing } from "@/lib/clients/brief";
import { encargoFromRow, type Encargo } from "./model";
import { buildNotice } from "./notice";
import { matchKey, planEncargoRun } from "./plan";
import { resolveRecipients } from "./recipients";
import { matchNewForEncargo, matchStockForEncargo, type ItemMatch, type SourceItem } from "./sources";

// ============================================================================
// Detección de encargos (solo España): pasada periódica del cron, pase inicial al crear/editar/
// reactivar un encargo y precarga «como visto» (seed). Reglas:
//  · Ventana (sinceIso, untilIso], con untilIso = ahora − 15 min calculado UNA vez por pasada y una
//    marca global en `app_settings` (`encargo_matching_cursor`) que solo avanza si la pasada acabó
//    sin fallos. Por encargo: sinceIso = max(baseline_at, marca); si sinceIso >= untilIso, se salta.
//  · Sin marca previa (primera ejecución): se inicializa sin evaluar ni avisar.
//  · Dedupe: `encargo_matches` con UNIQUE (encargo_id, source, canonical_id). Las filas se insertan
//    siempre con notified_at nulo y se «reclaman» con un UPDATE … WHERE notified_at IS NULL
//    RETURNING: solo quien reclama una fila la avisa, así dos pasadas solapadas nunca duplican.
//  · notified_at solo se pone si hay ≥ 1 destinatario; las pendientes (nulas) se reintentan al
//    principio de cada pasada, agrupadas por encargo en el mismo aviso.
// ============================================================================

export const CURSOR_KEY = "encargo_matching_cursor";
export const LAG_MS = 15 * 60_000;
const CHUNK = 100;
const INSERT_CHUNK = 500;
const PAGE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = Record<string, unknown>;
type Pending = { id: string; encargoId: string; source: "property" | "particular"; sourceId: string; canonicalId: string; score: number };
type Target = { encargo: Encargo; clientName: string };

export type MatchingReport = {
  ok: boolean;
  /** true en la primera ejecución: solo se creó la marca, no se evaluó ni avisó nada. */
  initialised?: boolean;
  encargos: number;
  inserted: number;
  notices: number;
  pending_retried: number;
  skipped: Record<string, number>;
};

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function eligible(e: Encargo): boolean {
  return e.status === "active" && briefSuggestMissing(e.brief).length === 0;
}

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`encargos/runner ${where}: ${error?.message ?? "sin datos"}`);
}

// ── Lectura de encargos y clientes (solo España) ────────────────────────────

async function clientNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const ch of chunks([...new Set(ids)], CHUNK)) {
    const { data, error } = await db.from("profiles").select("id, full_name, email, country").in("id", ch);
    if (error) fail("profiles", error);
    for (const p of (data ?? []) as Row[]) {
      if (p.country === "es") out.set(String(p.id), String(p.full_name || p.email || "Cliente"));
    }
  }
  return out;
}

/** Encargos activos de clientes de España (los de Chile no se evalúan nunca). */
async function loadActiveTargets(db: Db): Promise<Target[]> {
  const encargos: Encargo[] = [];
  let after: string | null = null;
  for (;;) {
    let q = db.from("client_preferences").select("*").eq("status", "active").order("id").limit(PAGE);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) fail("client_preferences", error);
    const rows = (data ?? []) as Row[];
    encargos.push(...rows.map(encargoFromRow));
    if (rows.length < PAGE) break;
    after = String(rows[rows.length - 1].id);
  }
  const names = await clientNames(db, encargos.map((e) => e.clientId));
  return encargos.filter((e) => names.has(e.clientId)).map((e) => ({ encargo: e, clientName: names.get(e.clientId)! }));
}

async function loadTarget(db: Db, encargoId: string): Promise<Target | null> {
  const { data, error } = await db.from("client_preferences").select("*").eq("id", encargoId).maybeSingle();
  if (error) fail("client_preferences", error);
  if (!data) return null;
  const encargo = encargoFromRow(data as Row);
  const names = await clientNames(db, [encargo.clientId]);
  const clientName = names.get(encargo.clientId);
  return clientName ? { encargo, clientName } : null;
}

// ── encargo_matches ─────────────────────────────────────────────────────────

/** Claves `"{source}:{canonicalId}"` de lo que ya está registrado para el encargo (consulta por trozos). */
async function loadSeen(db: Db, encargoId: string, found: ItemMatch[]): Promise<Set<string>> {
  const seen = new Set<string>();
  for (const source of ["property", "particular"] as const) {
    const ids = [...new Set(found.filter((f) => f.item.source === source).map((f) => f.item.canonicalId))];
    for (const ch of chunks(ids, CHUNK)) {
      const { data, error } = await db
        .from("encargo_matches").select("source, canonical_id")
        .eq("encargo_id", encargoId).eq("source", source).in("canonical_id", ch);
      if (error) fail("encargo_matches (vistos)", error);
      for (const r of (data ?? []) as Row[]) seen.add(`${r.source}:${r.canonical_id}`);
    }
  }
  return seen;
}

/** `insert … on conflict do nothing returning`: devuelve SOLO las filas realmente insertadas. */
async function insertMatches(
  db: Db, encargoId: string, toInsert: ItemMatch[], notifiedAt: string | null,
): Promise<Array<{ id: string; match: ItemMatch }>> {
  const out: Array<{ id: string; match: ItemMatch }> = [];
  for (const ch of chunks(toInsert, INSERT_CHUNK)) {
    const byKey = new Map(ch.map((m) => [matchKey(m), m]));
    const { data, error } = await db
      .from("encargo_matches")
      .upsert(
        ch.map((m) => ({
          encargo_id: encargoId, source: m.item.source, source_id: m.item.id, canonical_id: m.item.canonicalId,
          score: Math.round(m.score), notified_at: notifiedAt,
        })),
        { onConflict: "encargo_id,source,canonical_id", ignoreDuplicates: true },
      )
      .select("id, source, canonical_id");
    if (error) fail("encargo_matches (insertar)", error);
    for (const r of (data ?? []) as Row[]) {
      const m = byKey.get(`${r.source}:${r.canonical_id}`);
      if (m) out.push({ id: String(r.id), match: m });
    }
  }
  return out;
}

async function loadPending(db: Db): Promise<Map<string, Pending[]>> {
  const byEncargo = new Map<string, Pending[]>();
  let after: string | null = null;
  for (;;) {
    let q = db.from("encargo_matches").select("id, encargo_id, source, source_id, canonical_id, score").is("notified_at", null).order("id").limit(PAGE);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) fail("encargo_matches (pendientes)", error);
    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      const p: Pending = {
        id: String(r.id), encargoId: String(r.encargo_id), source: r.source as Pending["source"],
        sourceId: String(r.source_id), canonicalId: String(r.canonical_id), score: Number(r.score ?? 0),
      };
      byEncargo.set(p.encargoId, [...(byEncargo.get(p.encargoId) ?? []), p]);
    }
    if (rows.length < PAGE) break;
    after = String(rows[rows.length - 1].id);
  }
  return byEncargo;
}

/** Marca como avisadas las filas que SIGUEN pendientes y devuelve cuáles ha reclamado esta llamada. */
async function claim(db: Db, ids: string[], stamp: string): Promise<Set<string>> {
  const claimed = new Set<string>();
  for (const ch of chunks(ids, CHUNK)) {
    const { data, error } = await db.from("encargo_matches").update({ notified_at: stamp }).in("id", ch).is("notified_at", null).select("id");
    if (error) fail("encargo_matches (reclamar)", error);
    for (const r of (data ?? []) as Row[]) claimed.add(String(r.id));
  }
  return claimed;
}

async function release(db: Db, ids: string[]): Promise<void> {
  for (const ch of chunks(ids, CHUNK)) {
    const { error } = await db.from("encargo_matches").update({ notified_at: null }).in("id", ch);
    if (error) console.error("[encargos] no se pudo devolver a pendiente", error.message);
  }
}

/** Reconstruye `ItemMatch` de filas pendientes leyendo el título/zona/precio de la fuente. */
async function itemsForPending(db: Db, rows: Pending[]): Promise<Map<string, ItemMatch>> {
  const info = new Map<string, Row>();
  for (const [source, table, cols] of [
    ["property", "properties", "id, title, zone, price, created_at"],
    ["particular", "particulares", "id, title, address, zone, price, created_at"],
  ] as const) {
    for (const ch of chunks(rows.filter((r) => r.source === source).map((r) => r.sourceId), CHUNK)) {
      const { data, error } = await db.from(table).select(cols).in("id", ch);
      if (error) fail(`${table} (pendientes)`, error);
      for (const r of (data ?? []) as Row[]) info.set(`${source}:${r.id}`, r);
    }
  }
  const out = new Map<string, ItemMatch>();
  for (const p of rows) {
    const r = info.get(`${p.source}:${p.sourceId}`);
    const title = (typeof r?.title === "string" && r.title.trim()) || [r?.address, r?.zone].filter(Boolean).join(", ") || "Anuncio";
    const item: SourceItem = {
      source: p.source, id: p.sourceId, canonicalId: p.canonicalId, title,
      zone: (r?.zone as string | null | undefined) ?? null, price: Number(r?.price ?? 0), createdAt: r?.created_at ? new Date(String(r.created_at)).toISOString() : "",
    };
    out.set(p.id, { item, score: p.score, reasons: [], warnings: [] });
  }
  return out;
}

// ── Aviso ───────────────────────────────────────────────────────────────────

/** Un aviso agrupado (una fila de `crm_notifications` por destinatario). Nunca con lista vacía. */
async function sendNotice(
  db: Db, t: Target, kind: "initial" | "new", matches: ItemMatch[], recipients: string[],
): Promise<void> {
  if (matches.length === 0 || recipients.length === 0) return;
  const notice = buildNotice({
    kind, client: { id: t.encargo.clientId, name: t.clientName }, encargo: { id: t.encargo.id, label: t.encargo.label }, matches,
  });
  const { error } = await db.from("crm_notifications").insert(
    recipients.map((user_id) => ({ user_id, type: notice.type, title: notice.title, body: notice.body, link: notice.link, data: notice.data })),
  );
  if (error) fail("crm_notifications", error);
}

type Outcome = { inserted: number; retried: number; notices: number; noRecipients: boolean };

/**
 * Registra lo encontrado y avisa. `pending`: filas pendientes del encargo a reintentar en el mismo
 * aviso. Con `dry` no escribe nada.
 */
async function storeAndNotify(
  db: Db, t: Target, kind: "initial" | "new", found: ItemMatch[], pending: Pending[], recipients: string[], dry: boolean,
): Promise<Outcome> {
  const seen = await loadSeen(db, t.encargo.id, found);
  const { toInsert } = planEncargoRun({ found, alreadySeen: seen, kind });
  const has = recipients.length > 0;
  const anything = toInsert.length + pending.length > 0;
  if (dry) {
    return { inserted: toInsert.length, retried: has ? pending.length : 0, notices: has && anything ? 1 : 0, noRecipients: !has && anything };
  }
  const stamp = new Date().toISOString();
  const newRows = await insertMatches(db, t.encargo.id, toInsert, null);
  if (!has) return { inserted: newRows.length, retried: 0, notices: 0, noRecipients: newRows.length + pending.length > 0 };

  const claimed = await claim(db, [...pending.map((p) => p.id), ...newRows.map((r) => r.id)], stamp);
  if (claimed.size === 0) return { inserted: newRows.length, retried: 0, notices: 0, noRecipients: false };
  try {
    const claimedPending = pending.filter((p) => claimed.has(p.id));
    const items = claimedPending.length ? await itemsForPending(db, claimedPending) : new Map<string, ItemMatch>();
    const matches = [
      ...claimedPending.map((p) => items.get(p.id)!),
      ...newRows.filter((r) => claimed.has(r.id)).map((r) => r.match),
    ];
    await sendNotice(db, t, kind, matches, recipients);
    return { inserted: newRows.length, retried: claimedPending.length, notices: 1, noRecipients: false };
  } catch (e) {
    await release(db, [...claimed]); // sin aviso no hay «avisado»: se reintenta en la pasada siguiente
    throw e;
  }
}

// ── Marca (cursor) ──────────────────────────────────────────────────────────

async function readCursor(db: Db): Promise<number | null> {
  const { data, error } = await db.from("app_settings").select("value").eq("key", CURSOR_KEY).maybeSingle();
  if (error) fail("app_settings (leer marca)", error);
  const ms = Date.parse(String(data?.value?.untilIso ?? ""));
  return Number.isNaN(ms) ? null : ms;
}

async function writeCursor(db: Db, untilMs: number): Promise<void> {
  const value = { untilIso: new Date(untilMs).toISOString() };
  const upd = await db.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", CURSOR_KEY).select("key");
  if (upd.error) fail("app_settings (marca)", upd.error);
  if ((upd.data ?? []).length) return;
  const ins = await db.from("app_settings").insert({ key: CURSOR_KEY, value });
  // Carrera con otra pasada que la creó a la vez: se reintenta como actualización.
  if (ins.error) {
    const again = await db.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", CURSOR_KEY).select("key");
    if (again.error) fail("app_settings (marca)", again.error);
  }
}

// ── Pasada periódica ────────────────────────────────────────────────────────

export async function runEncargoMatching(opts: { now?: Date; dryRun?: boolean } = {}): Promise<MatchingReport> {
  const db = createAdminClient() as Db;
  const dry = opts.dryRun === true;
  const untilMs = (opts.now ?? new Date()).getTime() - LAG_MS;
  const untilIso = new Date(untilMs).toISOString();
  const report: MatchingReport = {
    ok: true, encargos: 0, inserted: 0, notices: 0, pending_retried: 0,
    skipped: { brief_insuficiente: 0, sin_destinatarios: 0, ventana_vacia: 0 },
  };

  const cursorMs = await readCursor(db);
  if (cursorMs === null) {
    if (!dry) await writeCursor(db, untilMs);
    return { ...report, initialised: true };
  }

  const targets = await loadActiveTargets(db);
  const pending = await loadPending(db);
  const recipientsByClient = new Map<string, string[]>();
  const recipientsOf = async (clientId: string) => {
    if (!recipientsByClient.has(clientId)) recipientsByClient.set(clientId, await resolveRecipients(clientId));
    return recipientsByClient.get(clientId)!;
  };

  for (const t of targets) {
    if (!eligible(t.encargo)) {
      report.skipped.brief_insuficiente++;
      continue;
    }
    report.encargos++;
    try {
      const baselineMs = Date.parse(t.encargo.baselineAt);
      const sinceMs = Math.max(Number.isNaN(baselineMs) ? 0 : baselineMs, cursorMs);
      const windowEmpty = sinceMs >= untilMs;
      if (windowEmpty) report.skipped.ventana_vacia++;
      const mine = pending.get(t.encargo.id) ?? [];
      if (windowEmpty && mine.length === 0) continue;

      // Lectura (sin escribir) antes de tocar nada: si falla, no queda nada a medias.
      const found = windowEmpty
        ? []
        : await matchNewForEncargo(t.encargo, { sinceIso: new Date(sinceMs).toISOString(), untilIso });
      const o = await storeAndNotify(db, t, "new", found, mine, await recipientsOf(t.encargo.clientId), dry);
      report.inserted += o.inserted;
      report.notices += o.notices;
      report.pending_retried += o.retried;
      if (o.noRecipients) report.skipped.sin_destinatarios++;
    } catch (e) {
      report.ok = false;
      report.skipped.error = (report.skipped.error ?? 0) + 1;
      console.error(`[encargos] pasada: fallo en el encargo ${t.encargo.id}`, e);
    }
  }

  if (report.ok && !dry) await writeCursor(db, untilMs);
  return report;
}

// ── Pase inicial ────────────────────────────────────────────────────────────

/**
 * Evalúa TODO el stock actual para un encargo activo de España con brief suficiente, registra lo que
 * encaja y manda UN aviso agrupado (`initial`) por lo realmente insertado, si hay destinatarios.
 * `notified` = elementos incluidos en ese aviso (0 si no hay destinatarios).
 */
export async function runEncargoInitialPass(encargoId: string): Promise<{ inserted: number; notified: number }> {
  const db = createAdminClient() as Db;
  const t = await loadTarget(db, encargoId);
  if (!t || !eligible(t.encargo)) return { inserted: 0, notified: 0 };
  const found = await matchStockForEncargo(t.encargo);
  const recipients = await resolveRecipients(t.encargo.clientId);
  const o = await storeAndNotify(db, t, "initial", found, [], recipients, false);
  return { inserted: o.inserted, notified: o.notices ? o.inserted : 0 };
}

// ── Precarga «como visto» (migración de los encargos existentes) ────────────

export type SeedReport = { encargos: number; skipped_brief: number; evaluated: number; inserted: number };

/** Registra el stock actual de cada encargo activo como ya visto (notified_at = now()), sin avisos. Idempotente. */
export async function seedEncargoBaseline(opts: { dryRun?: boolean } = {}): Promise<SeedReport> {
  const db = createAdminClient() as Db;
  const rep: SeedReport = { encargos: 0, skipped_brief: 0, evaluated: 0, inserted: 0 };
  for (const t of await loadActiveTargets(db)) {
    if (!eligible(t.encargo)) { rep.skipped_brief++; continue; }
    rep.encargos++;
    const found = await matchStockForEncargo(t.encargo);
    rep.evaluated += found.length;
    const { toInsert } = planEncargoRun({ found, alreadySeen: await loadSeen(db, t.encargo.id, found), kind: "initial" });
    if (opts.dryRun) rep.inserted += toInsert.length;
    else rep.inserted += (await insertMatches(db, t.encargo.id, toInsert, new Date().toISOString())).length;
  }
  return rep;
}
