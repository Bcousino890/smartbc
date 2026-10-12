import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { nominatimLookup } from "@/lib/geo/nominatim-queue";
import {
  ENRICH_RULES_VERSION,
  allPhoneKeys,
  applyGeoVerdict,
  candidateKey,
  findPhoneMentions,
  planEnrichment,
  spreadFromRows,
  verifyWithGeocode,
  type EnrichRow,
  type PhoneSpreadEntry,
  type Proposal,
  type SpreadRow,
} from "./enrich-from-description";

/**
 * Job de enriquecimiento de `particulares` desde la descripción (migración 0187).
 *
 * Dos fases por pasada:
 *  1. ÍNDICE — lee las descripciones nuevas o cambiadas (de TODOS los anuncios, también agencias e inactivos)
 *     y guarda en `particulares_enrichment_state` los teléfonos que contienen. Sirve para saber si un número
 *     aparece en anuncios de varias direcciones o de agencias. Hasta que el índice esté (casi) al día NO se
 *     aplica nada: con un índice incompleto un número de agencia parecería de un particular.
 *  2. EVALUAR — anuncios activos de particular cuya descripción cambió (o con otra versión de reglas):
 *     `planEnrichment` (módulo puro), confirmación de la dirección con Nominatim y, solo para la confianza
 *     `alta`, escritura con `particulares_enrichment_apply` (que comprueba en la BD que no pisa nada
 *     verificado y deja la auditoría). `media`/`baja` quedan como candidatos en el estado.
 *
 * `dryRun` no escribe NADA (ni índice, ni estado, ni datos) y por defecto tampoco llama a Nominatim.
 * Un solo recálculo a la vez por proceso (PM2 de un solo proceso).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const CHUNK = 300;
/** Anuncios sin indexar que se toleran (los que el crawler acaba de insertar) antes de aplicar nada. */
const INDEX_SLACK = 300;

export type EnrichRunOptions = {
  dryRun?: boolean;
  /** Anuncios evaluados por pasada (por defecto 150). */
  limit?: number;
  /** Descripciones indexadas por pasada (por defecto 4000). */
  indexLimit?: number;
  /** Peticiones a Nominatim por pasada (≤1/s; por defecto 12 en real, 0 en dry). */
  maxGeocode?: number;
  /** Solo para pruebas: cliente con las mismas RPC (scripts/dry-run-particulares-enrich.mts). */
  db?: unknown;
};

export type EnrichRunSummary = {
  ok: boolean;
  dryRun: boolean;
  ms: number;
  index: { pendingBefore: number; indexed: number; pendingAfter: number };
  evaluated: number;
  deferredForGeocode: number;
  applied: Record<string, number>;
  wouldApply: Record<string, number>;
  failedApply: Record<string, number>;
  candidates: Record<string, number>;
  dropped: number;
  geocoded: number;
  /** Solo en dry: las primeras propuestas con su evidencia, para revisarlas a ojo. */
  sample?: Array<{ id: string; field: string; value: string; confidence: string; rule: string; decision: string; evidence: string }>;
  note?: string;
  error?: string;
};

type QueueRow = EnrichRow & { desc_md5: string; dismissed: string[] | null };

const bump = (m: Record<string, number>, k: string, n = 1) => {
  m[k] = (m[k] ?? 0) + n;
};

let running: Promise<EnrichRunSummary> | null = null;

export function runParticularesEnrich(opts: EnrichRunOptions = {}): Promise<EnrichRunSummary> {
  if (running) return running;
  running = doRun(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doRun(opts: EnrichRunOptions): Promise<EnrichRunSummary> {
  const started = Date.now();
  const dryRun = !!opts.dryRun;
  const limit = Math.min(Math.max(opts.limit ?? 150, 1), 5000);
  const indexLimit = Math.min(Math.max(opts.indexLimit ?? 4000, 0), 20000);
  const geoBudget = opts.maxGeocode ?? (dryRun ? 0 : 12);
  const summary: EnrichRunSummary = {
    ok: true,
    dryRun,
    ms: 0,
    index: { pendingBefore: 0, indexed: 0, pendingAfter: 0 },
    evaluated: 0,
    deferredForGeocode: 0,
    applied: {},
    wouldApply: {},
    failedApply: {},
    candidates: {},
    dropped: 0,
    geocoded: 0,
    ...(dryRun ? { sample: [] } : {}),
  };
  const db = (opts.db ?? createAdminClient()) as Db;
  try {
    // ── 1) índice ────────────────────────────────────────────────────────────
    const pending = await db.rpc("particulares_enrich_index_pending");
    if (pending.error) throw new Error(`index_pending: ${pending.error.message}`);
    summary.index.pendingBefore = Number(pending.data ?? 0);
    let indexed = 0;
    if (summary.index.pendingBefore > 0 && indexLimit > 0) {
      const q = await db.rpc("particulares_enrich_index_queue", { p_limit: indexLimit });
      if (q.error) throw new Error(`index_queue: ${q.error.message}`);
      const rows = (q.data ?? []) as Array<{ id: string; description: string; desc_md5: string }>;
      const payload = rows.map((r) => ({ id: r.id, desc_md5: r.desc_md5, phones: allPhoneKeys(r.description) }));
      if (!dryRun) {
        for (let i = 0; i < payload.length; i += CHUNK) {
          const w = await db.rpc("particulares_enrich_state_index", { p: payload.slice(i, i + CHUNK) });
          if (w.error) throw new Error(`state_index: ${w.error.message}`);
        }
      }
      indexed = payload.length;
    }
    summary.index.indexed = indexed;
    summary.index.pendingAfter = dryRun ? summary.index.pendingBefore : Math.max(0, summary.index.pendingBefore - indexed);
    if (summary.index.pendingAfter > INDEX_SLACK) {
      summary.note = `Indexando descripciones (${summary.index.pendingAfter} pendientes): aún no se evalúa ningún anuncio.`;
      summary.ms = Date.now() - started;
      return summary;
    }

    // ── 2) evaluar ───────────────────────────────────────────────────────────
    const qr = await db.rpc("particulares_enrich_queue", { p_limit: limit, p_rules: ENRICH_RULES_VERSION });
    if (qr.error) throw new Error(`enrich_queue: ${qr.error.message}`);
    const rows = (qr.data ?? []) as QueueRow[];
    if (!rows.length) {
      summary.ms = Date.now() - started;
      return summary;
    }

    // Reparto de cada número que aparezca en alguna de las descripciones evaluadas.
    const keys = new Set<string>();
    for (const r of rows) for (const m of findPhoneMentions(r.description ?? "")) if (!m.bad) keys.add(m.key);
    const spreadMap = new Map<string, PhoneSpreadEntry>();
    const keyList = [...keys];
    const byKey = new Map<string, SpreadRow[]>();
    for (let i = 0; i < keyList.length; i += 40) {
      const part = keyList.slice(i, i + 40);
      const res = await db.rpc("particulares_enrich_phone_rows", { p_keys: part });
      if (res.error) throw new Error(`phone_rows: ${res.error.message}`);
      for (const k of part) byKey.set(k, []);
      for (const x of (res.data ?? []) as Array<SpreadRow & { key: string }>) byKey.get(x.key)?.push(x);
    }
    for (const [k, list] of byKey) spreadMap.set(k, spreadFromRows(list));
    const spread = (k: string) => spreadMap.get(k);

    const saves: Array<Record<string, unknown>> = [];
    let geoLeft = geoBudget;
    for (const row of rows) {
      const dismissed = new Set(row.dismissed ?? []);
      const plan = planEnrichment(row, { spread });
      const props = plan.proposals.filter((p) => !dismissed.has(candidateKey(p)));

      // Confirmación con Nominatim (≤1 petición/s; cada anuncio necesita como mucho 2).
      // (con un pin 'exact' y la calle ya fiable no hace falta preguntar: las coordenadas no se tocan)
      const geoProps = props.filter(
        (p) => p.field === "address" && p.geo && p.decision !== "drop" && !(p.geo.trusted && row.location_precision === "exact"),
      );
      if (geoProps.length && geoBudget > 0 && geoLeft < geoProps.length) {
        summary.deferredForGeocode++; // se queda en la cola para la siguiente pasada, sin tocar nada
        continue;
      }
      summary.evaluated++;
      const coordsFor = new Map<Proposal, { lat: number; lng: number }>();
      if (geoProps.length && geoBudget > 0) {
        for (const p of geoProps) {
          geoLeft--;
          summary.geocoded++;
          const hit = await nominatimLookup((p.geo as NonNullable<Proposal["geo"]>).query);
          const verdict = verifyWithGeocode(row, p.geo as NonNullable<Proposal["geo"]>, hit);
          const { proposal, saveCoords } = applyGeoVerdict(p, verdict);
          props[props.indexOf(p)] = proposal;
          if (saveCoords && hit && proposal.decision === "apply") coordsFor.set(proposal, { lat: hit.lat, lng: hit.lng });
        }
      }

      const candidates: Array<Record<string, unknown>> = [];
      for (const p of props) {
        if (p.decision === "drop") {
          summary.dropped++;
          continue;
        }
        if (summary.sample && summary.sample.length < 60) {
          summary.sample.push({ id: row.id, field: p.field, value: p.value, confidence: p.confidence, rule: p.rule, decision: p.decision, evidence: p.evidence });
        }
        if (p.decision === "candidate") {
          bump(summary.candidates, `${p.field}:${p.confidence}`);
          if (candidates.length < 8) {
            candidates.push({
              key: candidateKey(p),
              field: p.field,
              value: p.value,
              confidence: p.confidence,
              rule: p.rule,
              evidence: p.evidence,
              reason: p.reason ?? null,
              expected_before: p.field === "address" ? (p.expectedBefore ?? null) : undefined,
              status: "pendiente",
            });
          }
          continue;
        }
        // decision === "apply"
        const tag = `${p.field}:${p.rule}`;
        if (dryRun) {
          bump(summary.wouldApply, tag);
          continue;
        }
        const res = await applyOne(db, row.id, p);
        if (res.ok) {
          bump(summary.applied, tag);
          const c = coordsFor.get(p);
          if (c) {
            const loc = await db.rpc("particulares_enrichment_apply", {
              p_id: row.id,
              p_field: "location",
              p_after: { latitude: c.lat, longitude: c.lng },
              p_rule: "location.nominatim_confirma_portal",
              p_conf: "alta",
              p_evidence: p.evidence,
              p_origin: "auto",
              p_by: null,
              p_expected: { latitude: row.latitude, longitude: row.longitude },
            });
            if (loc.data?.ok) bump(summary.applied, "location:location.nominatim_confirma_portal");
            else bump(summary.failedApply, `location:${loc.data?.reason ?? loc.error?.message ?? "error"}`);
          }
        } else {
          bump(summary.failedApply, `${p.field}:${res.reason}`);
        }
      }
      saves.push({ id: row.id, desc_md5: row.desc_md5, rules_version: ENRICH_RULES_VERSION, candidates });
    }

    if (!dryRun) {
      for (let i = 0; i < saves.length; i += CHUNK) {
        const w = await db.rpc("particulares_enrich_state_save", { p: saves.slice(i, i + CHUNK) });
        if (w.error) throw new Error(`state_save: ${w.error.message}`);
      }
    }
    summary.ms = Date.now() - started;
    return summary;
  } catch (err) {
    const error = err instanceof Error ? err.message : "enrich_failed";
    console.error("[particulares-enrich]", error);
    return { ...summary, ok: false, ms: Date.now() - started, error };
  }
}

async function applyOne(db: Db, id: string, p: Proposal): Promise<{ ok: boolean; reason?: string }> {
  const after: Record<string, string> =
    p.field === "phone" ? { phone: p.value } : p.field === "phone2" ? { phone2: p.value } : p.field === "address" ? { address: p.value } : { owner_name: p.value };
  const res = await db.rpc("particulares_enrichment_apply", {
    p_id: id,
    p_field: p.field,
    p_after: after,
    p_rule: p.rule,
    p_conf: p.confidence === "alta" ? "alta" : "media",
    p_evidence: p.evidence,
    p_origin: "auto",
    p_by: null,
    p_expected: p.field === "address" ? { address: p.expectedBefore ?? null } : null,
  });
  if (res.error) return { ok: false, reason: res.error.message };
  return res.data?.ok ? { ok: true } : { ok: false, reason: res.data?.reason ?? "desconocido" };
}

