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
//    siempre con notified_at nulo y se «reclaman» Y avisan en una sola transacción SQL
//    (`claim_and_notify_encargo_matches`, migración 0245): o se marca y se crea el aviso, o ninguna de
//    las dos cosas. Solo quien reclama una fila la avisa, así dos pasadas solapadas nunca duplican, y
//    un fallo o reinicio entre medias deja las filas pendientes (nunca «avisadas» sin aviso).
//  · notified_at solo se pone si hay ≥ 1 destinatario; las pendientes (nulas) se reintentan al
//    principio de cada pasada, agrupadas por encargo en el mismo aviso. Solo se reintentan filas con
//    first_seen_at de hace más de 10 min (PENDING_MIN_AGE_MS): así una pasada del cron no «roba» filas
//    a un pase inicial que está entre su insert y su reclamo.
// ============================================================================

export const CURSOR_KEY = "encargo_matching_cursor";
export const LAG_MS = 15 * 60_000;
const CHUNK = 100;
const INSERT_CHUNK = 500;
const PAGE = 1000;
export const PENDING_MIN_AGE_MS = 10 * 60_000;
const NOTIFY_RPC = "claim_and_notify_encargo_matches";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = Record<string, unknown>;
type Pending = { reasons: string[]; id: string; encargoId: string; source: "property" | "particular"; sourceId: string; canonicalId: string; score: number };
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
  /**
   * Antigüedad de la marca al empezar la pasada (minutos, respecto a «ahora − 15 min»). Normal: ~el
   * intervalo del cron. Si crece, alguna pasada está fallando y la marca no avanza (ver los logs).
   */
  cursorAgeMinutes?: number;
};

/** A partir de esta antigüedad de la marca se deja un console.error en cada pasada. */
export const STALE_CURSOR_MS = 3 * 24 * 60 * 60_000;

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
    // Solo una página VACÍA es el final: PostgREST puede devolver menos de lo pedido (db-max-rows).
    if (!rows.length) break;
    encargos.push(...rows.map(encargoFromRow));
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
          score: Math.round(m.score), reasons: m.reasons, notified_at: notifiedAt,
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

/** Pendientes (notified_at nulo) de los encargos dados con `first_seen_at` anterior a `olderThanIso`. */
async function loadPending(db: Db, encargoIds: string[], olderThanIso: string): Promise<Map<string, Pending[]>> {
  const byEncargo = new Map<string, Pending[]>();
  for (const ids of chunks(encargoIds, CHUNK)) {
    let after: string | null = null;
    for (;;) {
      let q = db
        .from("encargo_matches").select("id, encargo_id, source, source_id, canonical_id, score, reasons")
        .is("notified_at", null).lt("first_seen_at", olderThanIso).in("encargo_id", ids).order("id").limit(PAGE);
      if (after) q = q.gt("id", after);
      const { data, error } = await q;
      if (error) fail("encargo_matches (pendientes)", error);
      const rows = (data ?? []) as Row[];
      if (!rows.length) break; // solo una página vacía es el final (ver loadActiveTargets)
      for (const r of rows) {
        const p: Pending = {
          id: String(r.id), encargoId: String(r.encargo_id), source: r.source as Pending["source"],
          sourceId: String(r.source_id), canonicalId: String(r.canonical_id), score: Number(r.score ?? 0),
          reasons: Array.isArray(r.reasons) ? (r.reasons as unknown[]).map(String) : [],
        };
        const list = byEncargo.get(p.encargoId);
        if (list) list.push(p);
        else byEncargo.set(p.encargoId, [p]);
      }
      after = String(rows[rows.length - 1].id);
    }
  }
  return byEncargo;
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
    out.set(p.id, { item, score: p.score, reasons: p.reasons, warnings: [] });
  }
  return out;
}

// ── Aviso ───────────────────────────────────────────────────────────────────

type Outcome = { inserted: number; retried: number; notices: number; claimed: number; noRecipients: boolean };

/**
 * Registra lo encontrado y avisa. `pending`: filas pendientes del encargo a reintentar en el mismo
 * aviso. Con `dry` no escribe nada. El aviso se construye ANTES (solo lecturas) y se entrega con
 * una única llamada atómica; si falla, las filas siguen pendientes y se reintentan.
 */
async function storeAndNotify(
  db: Db, t: Target, kind: "initial" | "new", found: ItemMatch[], pending: Pending[], recipients: string[], dry: boolean,
): Promise<Outcome> {
  const seen = await loadSeen(db, t.encargo.id, found);
  const { toInsert } = planEncargoRun({ found, alreadySeen: seen, kind });
  const has = recipients.length > 0;
  const anything = toInsert.length + pending.length > 0;
  if (dry) {
    return { inserted: toInsert.length, retried: has ? pending.length : 0, notices: has && anything ? 1 : 0, claimed: 0, noRecipients: !has && anything };
  }
  const newRows = await insertMatches(db, t.encargo.id, toInsert, null);
  if (!has) return { inserted: newRows.length, retried: 0, notices: 0, claimed: 0, noRecipients: newRows.length + pending.length > 0 };
  if (newRows.length + pending.length === 0) return { inserted: 0, retried: 0, notices: 0, claimed: 0, noRecipients: false };

  const items = pending.length ? await itemsForPending(db, pending) : new Map<string, ItemMatch>();
  const ids = [...pending.map((p) => p.id), ...newRows.map((r) => r.id)];
  const matches = [...pending.map((p) => items.get(p.id)!), ...newRows.map((r) => r.match)];
  const notice = buildNotice({
    kind, client: { id: t.encargo.clientId, name: t.clientName }, encargo: { id: t.encargo.id, label: t.encargo.label }, matches,
  });
  const { data, error } = await db.rpc(NOTIFY_RPC, {
    p_match_ids: ids, p_recipients: recipients, p_title: notice.title, p_body: notice.body, p_link: notice.link, p_data: notice.data,
  });
  if (error) fail("avisar (rpc)", error);
  const claimed = Number(data ?? 0);
  return {
    inserted: newRows.length, retried: Math.min(pending.length, claimed), notices: claimed > 0 ? 1 : 0, claimed, noRecipients: false,
  };
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

  report.cursorAgeMinutes = Math.max(0, Math.round((untilMs - cursorMs) / 60_000));
  if (untilMs - cursorMs > STALE_CURSOR_MS) {
    // Se sigue procesando la ventana entera (no se salta nada), pero que se vea: algún encargo falla
    // en cada pasada y bloquea la marca de todos.
    console.error(
      `[encargos] la marca del cron lleva ${report.cursorAgeMinutes} min sin avanzar (desde ${new Date(cursorMs).toISOString()}): revisa los fallos de las pasadas`,
    );
  }

  const targets = await loadActiveTargets(db);
  const pending = await loadPending(
    db, targets.filter((t) => eligible(t.encargo)).map((t) => t.encargo.id), new Date(untilMs + LAG_MS - PENDING_MIN_AGE_MS).toISOString(),
  );
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
  return { inserted: o.inserted, notified: o.claimed };
}

// ── Precarga «como visto» (migración de los encargos existentes) ────────────

export type SeedReport = { encargos: number; skipped_brief: number; evaluated: number; inserted: number; cursor_set: boolean };

/**
 * Registra el stock actual de cada encargo activo como ya visto (notified_at = now()), sin avisos.
 * Idempotente. Si todavía no existe la marca del cron, la fija en (inicio del seed − 15 min) —solo
 * sin `dryRun`, y nunca pisa una existente—: así la primera pasada del cron evalúa lo creado entre
 * el seed y su arranque en vez de limitarse a inicializar la marca.
 */
export async function seedEncargoBaseline(opts: { dryRun?: boolean } = {}): Promise<SeedReport> {
  const db = createAdminClient() as Db;
  const startMs = Date.now();
  const rep: SeedReport = { encargos: 0, skipped_brief: 0, evaluated: 0, inserted: 0, cursor_set: false };
  for (const t of await loadActiveTargets(db)) {
    if (!eligible(t.encargo)) { rep.skipped_brief++; continue; }
    rep.encargos++;
    const found = await matchStockForEncargo(t.encargo);
    rep.evaluated += found.length;
    const { toInsert } = planEncargoRun({ found, alreadySeen: await loadSeen(db, t.encargo.id, found), kind: "initial" });
    if (opts.dryRun) rep.inserted += toInsert.length;
    else rep.inserted += (await insertMatches(db, t.encargo.id, toInsert, new Date().toISOString())).length;
  }
  if ((await readCursor(db)) === null) {
    if (!opts.dryRun) await writeCursor(db, startMs - LAG_MS);
    rep.cursor_set = true;
  }
  return rep;
}
