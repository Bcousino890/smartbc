// PROPERTY PRELUDE · generación en lote (piloto y rollout).
//
// GUARDRAIL: sin --confirm se ejecuta como dry-run (no escribe nada).
// Uso (VPS): node scripts/preludes.bundle.cjs [pilot|all] [opciones]
//
//   pilot          → 5 COMPLETE + 5 PARTIAL + 5 SPARSE + 5 FACTS-LED
//   sweep          → NO llama a la IA: revalida los preludes APROBADOS contra
//                    el contrato actual y baja a 'rejected' los que ya no lo
//                    cumplen (un texto de una versión vieja del contrato no
//                    puede quedarse en público por inercia)
//   all            → todas las versiones candidatas
//   --slugs=a,b,c  → exactamente esas propiedades (piloto dirigido)
//   --refresh      → reprocesa también las que YA tienen prelude (v1 → v2)
//   --approve      → aprueba las que pasan el contrato (rollout validado)
//   --confirm      → sin esto no escribe nada
//
// El prelude se compone SOLO desde claims seguros (collectPreludeEvidence) y
// se valida con el contrato completo (cuerpo + titular). Si el modelo
// incumple, se reintenta con feedback; si vuelve a incumplir, esa propiedad
// queda SIN prelude. Nunca se guarda nada que no pase el contrato.

import { createAdminClient } from "../lib/db/admin";
import {
  collectPreludeEvidence,
  MIN_EVIDENCE_CLAIMS,
  validatePrelude,
  validatePreludeHeadline,
} from "../lib/services/story/prelude";
import { composePrelude } from "../lib/services/story/prelude-compose";
import { NARRATIVE_CHAPTERS } from "../lib/services/story/gate";

async function main() {
  const ARG = process.argv[2];
  const MODE = ARG === "all" ? "all" : ARG === "sweep" ? "sweep" : "pilot";
  const CONFIRM = process.argv.includes("--confirm");
  const APPROVE = process.argv.includes("--approve");
  const REFRESH = process.argv.includes("--refresh");
  const SLUGS = (process.argv.find((a) => a.startsWith("--slugs="))?.slice(8) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!CONFIRM) console.log("[preludes] sin --confirm → DRY-RUN (no escribe)");

  const db = createAdminClient() as any;

  // Versiones candidatas: aprobadas (story pública) y borradores con
  // narrativa (facts-led con capítulos visibles).
  const versions: any[] = [];
  for (const status of ["approved", "generated"]) {
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("property_story_versions")
        .select("id, property_id, status, notes, prelude_status")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(from, from + 999);
      if (!data?.length) break;
      versions.push(...data);
      if (data.length < 1000) break;
    }
  }
  // Una versión por propiedad: la aprobada manda; si no, el último borrador.
  const byProp = new Map<string, any>();
  for (const v of versions) {
    const prev = byProp.get(v.property_id);
    if (!prev || (prev.status !== "approved" && v.status === "approved")) byProp.set(v.property_id, v);
  }

  const props = new Map<string, any>();
  const ids = [...byProp.keys()];
  for (let i = 0; i < ids.length; i += 120) {
    const { data } = await db
      .from("properties")
      .select("id, bc_reference, slug, operation, operations, status, archived_at")
      .in("id", ids.slice(i, i + 120));
    for (const p of data ?? []) props.set(p.id, p);
  }

  type Cand = { v: any; p: any; state: string };
  const candidates: Cand[] = [];
  for (const [pid, v] of byProp) {
    const p = props.get(pid);
    if (!p || p.archived_at || p.status === "archived") continue;
    if (SLUGS.length > 0 && !SLUGS.includes(p.slug)) continue;
    // Sin --refresh se respeta lo que ya existe (en cualquier estado): así el
    // rollout es reanudable y no pisa revisiones humanas.
    if (v.prelude_status && !REFRESH) continue;
    let state: string;
    if (v.status === "approved") {
      state = /SPARSE/i.test(v.notes ?? "") ? "sparse" : "partial-or-complete";
    } else {
      state = "facts_led";
    }
    candidates.push({ v, p, state });
  }

  // Para separar complete de partial hace falta mirar bloques en conflicto.
  for (const c of candidates.filter((x) => x.state === "partial-or-complete")) {
    const { count } = await db
      .from("property_story_blocks")
      .select("id", { count: "exact", head: true })
      .eq("version_id", c.v.id)
      .eq("status", "conflict");
    c.state = (count ?? 0) > 0 ? "partial" : "complete";
  }

  // ── SWEEP ── revalidación sin IA de lo que hay publicado.
  if (MODE === "sweep") {
    let checked = 0;
    let demoted = 0;
    for (const [pid, v] of byProp) {
      const p = props.get(pid);
      if (!p || p.archived_at || p.status === "archived") continue;
      if (v.prelude_status !== "approved") continue;
      const { data: full } = await db
        .from("property_story_versions")
        .select("prelude, prelude_headline")
        .eq("id", v.id)
        .maybeSingle();
      const { data: claims } = await db
        .from("property_story_claims")
        .select("id, fact, source_text, category, conflict, is_duplicate")
        .eq("version_id", v.id);
      const evidence = collectPreludeEvidence(claims ?? []);
      const ops: string[] = Array.isArray(p.operations) ? p.operations : [];
      const ctx = {
        operation: (p.operation === "rent" ? "rent" : "sale") as "rent" | "sale",
        dualOperation: ops.includes("sale") && ops.includes("rent"),
      };
      checked++;
      const bodyV = validatePrelude(full?.prelude ?? "", ctx, evidence.texts);
      const headV = full?.prelude_headline
        ? validatePreludeHeadline(full.prelude_headline, ctx, evidence.texts)
        : { ok: false, failures: ["sin titular (contrato v2)"] };
      if (bodyV.ok && headV.ok) continue;
      demoted++;
      console.log(`  ↓ ${p.bc_reference} ${[...headV.failures.map((f) => `TITULAR: ${f}`), ...bodyV.failures].join(" · ")}`);
      if (CONFIRM) {
        await db.from("property_story_versions").update({ prelude_status: "rejected" }).eq("id", v.id);
      }
    }
    console.log(`\n[preludes] sweep: revisados=${checked} · retirados=${demoted}`);
    process.exit(0);
  }

  let pool: Cand[];
  if (SLUGS.length > 0 || MODE === "all") {
    pool = candidates;
  } else {
    pool = [];
    for (const st of ["complete", "partial", "sparse", "facts_led"]) {
      pool.push(...candidates.filter((c) => c.state === st).slice(0, 5));
    }
  }
  console.log(`[preludes] modo=${MODE} refresh=${REFRESH} candidatas=${candidates.length} a procesar=${pool.length}`);

  const stats = { ok: 0, insufficient: 0, contractFail: 0 };
  for (const { v, p, state } of pool) {
    const { data: claims } = await db
      .from("property_story_claims")
      .select("id, fact, source_text, category, conflict, is_duplicate")
      .eq("version_id", v.id);
    // El prelude solo tiene sentido si hay narrativa que abrir: sin capítulos
    // narrativos en la versión, no hay "libro" que empezar.
    const { data: blocks } = await db
      .from("property_story_blocks")
      .select("chapter, status")
      .eq("version_id", v.id);
    const hasNarrative = (blocks ?? []).some(
      (b: any) => NARRATIVE_CHAPTERS.includes(b.chapter) && b.status !== "rejected" && b.status !== "conflict",
    );
    const evidence = collectPreludeEvidence(claims ?? []);
    if (!hasNarrative || evidence.claimIds.length < MIN_EVIDENCE_CLAIMS) {
      stats.insufficient++;
      console.log(`  – ${p.bc_reference} [${state}] evidencia insuficiente (${evidence.claimIds.length} claims, narrativa=${hasNarrative})`);
      continue;
    }

    const ops: string[] = Array.isArray(p.operations) ? p.operations : [];
    const ctx = {
      operation: (p.operation === "rent" ? "rent" : "sale") as "rent" | "sale",
      dualOperation: ops.includes("sale") && ops.includes("rent"),
    };

    const result = await composePrelude(ctx, evidence);
    if (!result.ok) {
      stats.contractFail++;
      console.log(`  ✗ ${p.bc_reference} [${state}] ${result.failures.join(" · ")}`);
      continue;
    }
    if (CONFIRM) {
      await db
        .from("property_story_versions")
        .update({
          prelude: result.body,
          prelude_headline: result.headline,
          prelude_status: APPROVE ? "approved" : "generated",
          prelude_evidence: { claimIds: evidence.claimIds },
          prelude_generated_at: new Date().toISOString(),
        })
        .eq("id", v.id);
    }
    stats.ok++;
    console.log(`  ✓ ${p.bc_reference} [${state}] ${result.words}p/${result.paragraphs}¶ · ${result.headline}`);
  }
  console.log(`\n[preludes] ok=${stats.ok} · insuficiente=${stats.insufficient} · contrato=${stats.contractFail}`);
  process.exit(0);
}

void main();
