// PROPERTY PRELUDE · generación en lote (piloto y rollout).
//
// GUARDRAIL: sin --confirm se ejecuta como dry-run (no escribe nada).
// Uso (VPS): node scripts/preludes.bundle.cjs [pilot|all] [--confirm] [--approve]
//
//   pilot     → 5 COMPLETE + 5 PARTIAL + 5 SPARSE + 5 FACTS-LED, status 'generated'
//   all       → todas las versiones candidatas sin prelude
//   --approve → además aprueba los que pasan el contrato (rollout tras piloto)
//
// El prelude se compone SOLO desde claims seguros (collectPreludeEvidence) y
// se valida con el contrato completo. Si el modelo incumple, un reintento con
// feedback; si vuelve a incumplir, esa propiedad queda SIN prelude. Nunca se
// guarda nada que no pase el contrato.

import { createAdminClient } from "../lib/db/admin";
import {
  collectPreludeEvidence,
  MIN_EVIDENCE_CLAIMS,
  preludeSystemPrompt,
  preludeUserPrompt,
  validatePrelude,
} from "../lib/services/story/prelude";
import { aiComplete } from "../lib/services/ai/chat";
import { NARRATIVE_CHAPTERS } from "../lib/services/story/gate";

async function main() {
  const MODE = process.argv[2] === "all" ? "all" : "pilot";
  const CONFIRM = process.argv.includes("--confirm");
  const APPROVE = process.argv.includes("--approve");
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

  const { data: propsData } = { data: [] as any[] };
  const props = new Map<string, any>();
  const ids = [...byProp.keys()];
  for (let i = 0; i < ids.length; i += 120) {
    const { data } = await db
      .from("properties")
      .select("id, bc_reference, operation, operations, status, archived_at")
      .in("id", ids.slice(i, i + 120));
    for (const p of data ?? []) props.set(p.id, p);
  }

  type Cand = { v: any; p: any; state: string };
  const candidates: Cand[] = [];
  for (const [pid, v] of byProp) {
    const p = props.get(pid);
    if (!p || p.archived_at || p.status === "archived") continue;
    if (v.prelude_status) continue; // ya tiene prelude (en cualquier estado)
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

  let pool: Cand[];
  if (MODE === "pilot") {
    pool = [];
    for (const st of ["complete", "partial", "sparse", "facts_led"]) {
      pool.push(...candidates.filter((c) => c.state === st).slice(0, 5));
    }
  } else {
    pool = candidates;
  }
  console.log(`[preludes] modo=${MODE} candidatas=${candidates.length} a procesar=${pool.length}`);

  const stats = { ok: 0, insufficient: 0, contractFail: 0, aiFail: 0 };
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

    let saved = false;
    let feedback = "";
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      let raw: string;
      try {
        raw = await aiComplete({
          system: preludeSystemPrompt(ctx),
          userText: preludeUserPrompt(evidence) + feedback,
          maxTokens: 400,
        });
      } catch (e: any) {
        stats.aiFail++;
        console.log(`  ✗ ${p.bc_reference} [${state}] IA: ${e?.message?.slice(0, 60)}`);
        break;
      }
      const text = raw.trim().replace(/^["“]|["”]$/g, "");
      const verdict = validatePrelude(text, ctx, evidence.texts);
      if (!verdict.ok) {
        feedback = `\n\nEL INTENTO ANTERIOR INCUMPLIÓ: ${verdict.failures.join("; ")}. Corrígelo.`;
        if (attempt === 2) {
          stats.contractFail++;
          console.log(`  ✗ ${p.bc_reference} [${state}] contrato: ${verdict.failures.join(" · ")}`);
        }
        continue;
      }
      if (CONFIRM) {
        await db.from("property_story_versions").update({
          prelude: text,
          prelude_status: APPROVE ? "approved" : "generated",
          prelude_evidence: { claimIds: evidence.claimIds },
          prelude_generated_at: new Date().toISOString(),
        }).eq("id", v.id);
      }
      stats.ok++;
      saved = true;
      console.log(`  ✓ ${p.bc_reference} [${state}] ${verdict.words}p/${verdict.sentences}f · ${text.slice(0, 100)}…`);
    }
  }
  console.log(`\n[preludes] ok=${stats.ok} · insuficiente=${stats.insufficient} · contrato=${stats.contractFail} · ia=${stats.aiFail}`);
  process.exit(0);
}

void main();
