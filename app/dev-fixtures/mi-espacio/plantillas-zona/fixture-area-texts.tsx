"use client";

import { useRef } from "react";
import { AreaTextsPage, type AreaTextsActions, type AreaTextsData } from "@/components/admin/catalogs/area-texts-page";
import { areaTextBlockers, areaTextErrorMessage, seedPlan, type AreaTextEntry, type NeighborhoodRow } from "@/lib/catalogs/area-texts";

// SOLO DESARROLLO LOCAL: plantillas de zona en memoria con las mismas reglas
// que 0222 (un borrador y una aprobada por zona; aprobar lo que se vio; la
// siembra solo crea borradores en zonas sin versiones). «IA» FALSA: nunca se
// llama a ningún proveedor.

const NEIGHBORHOODS: NeighborhoodRow[] = [
  { zone_key: "almagro", display_name: "Almagro", district: "Chamberí", intro: "Almagro, en Chamberí, reúne palacetes y fincas clásicas en calles arboladas junto al Paseo de la Castellana, bien conectado por las líneas 5, 7 y 10 de metro." },
  { zone_key: "goya", display_name: "Goya", district: "Salamanca", intro: "El barrio de Goya ocupa el sur del distrito de Salamanca. La calle de Goya lo atraviesa y concentra su comercio." },
  { zone_key: "recoletos", display_name: "Recoletos", intro: "Recoletos es la cara más señorial del barrio de Salamanca, a un paso del Retiro." },
  { zone_key: "pozuelo", display_name: "Pozuelo de Alarcón", intro: "Pozuelo de Alarcón es el municipio residencial de referencia al oeste de Madrid." },
];

type Row = { id: string; seq: number; body: string; status: "draft" | "approved" | "retired"; origin: "neighborhoods" | "manual" | "ai_draft"; key: string | null };

export function FixtureAreaTexts() {
  const st = useRef(new Map<string, Row[]>([["madrid/salamanca", [{ id: "fx-sal-1", seq: 1, body: "El distrito de Salamanca es el ensanche del siglo XIX: manzanas regulares, portales señoriales y comercio de calidad.", status: "approved", origin: "manual", key: null }]]]));
  let n = 0;
  const data = (): AreaTextsData => {
    const entries: AreaTextEntry[] = [];
    for (const [areaId, rows] of st.current) {
      const pick = (s: Row["status"]) => {
        const r = rows.find((x) => x.status === s);
        return r ? { id: r.id, seq: r.seq, body: r.body, origin: r.origin, sourceKey: r.key, updatedAt: null, approvedAt: null } : null;
      };
      if (pick("draft") || pick("approved")) entries.push({ areaId, draft: pick("draft"), approved: pick("approved") });
    }
    return { entries, seed: seedPlan(NEIGHBORHOODS, new Set(st.current.keys())) };
  };
  const rows = (a: string) => st.current.get(a) ?? [];
  const actions: AreaTextsActions = {
    reload: async () => ({ ok: true as const, ...data() }),
    saveDraft: async ({ areaId, body, origin }) => {
      const b = body.trim();
      if (!b) return { ok: false as const, error: areaTextErrorMessage("area_text_empty")! };
      const bl = areaTextBlockers(b)[0];
      if (bl) return { ok: false as const, error: areaTextErrorMessage(bl)! };
      const list = rows(areaId);
      const d = list.find((x) => x.status === "draft");
      if (d) Object.assign(d, { body: b, origin: origin ?? "manual", id: `${d.id}+` });
      else list.push({ id: `fx-${areaId}-${++n}`, seq: Math.max(0, ...list.map((x) => x.seq)) + 1, body: b, status: "draft", origin: origin ?? "manual", key: null });
      st.current.set(areaId, list);
      return { ok: true as const, seq: (d ?? list[list.length - 1]).seq };
    },
    approve: async ({ areaId, body }) => {
      const list = rows(areaId);
      const d = list.find((x) => x.status === "draft");
      if (!d) return { ok: false as const, error: areaTextErrorMessage("area_text_not_found")! };
      if (d.body !== body.trim()) return { ok: false as const, error: areaTextErrorMessage("draft_changed")! };
      for (const x of list) if (x.status === "approved") x.status = "retired";
      d.status = "approved";
      return { ok: true as const, seq: d.seq };
    },
    retire: async ({ areaId }) => {
      const a = rows(areaId).find((x) => x.status === "approved");
      if (a) a.status = "retired";
      return { ok: true as const, changed: !!a };
    },
    discard: async ({ areaId }) => {
      const list = rows(areaId);
      const i = list.findIndex((x) => x.status === "draft");
      if (i >= 0) list.splice(i, 1);
      return { ok: true as const, changed: i >= 0 };
    },
    seed: async () => {
      const plan = data().seed;
      for (const it of plan.items) st.current.set(it.area, [{ id: `fx-seed-${it.key}`, seq: 1, body: it.body, status: "draft", origin: "neighborhoods", key: it.key }]);
      return { ok: true as const, created: plan.items.length, skipped: 0 };
    },
    aiDraft: async ({ areaId }) => {
      await new Promise((r) => setTimeout(r, 400));
      (globalThis as { __fxAiCalls?: number }).__fxAiCalls = ((globalThis as { __fxAiCalls?: number }).__fxAiCalls ?? 0) + 1;
      return { ok: true as const, body: `Texto de prueba (IA falsa) para ${areaId}: una zona residencial de trama ordenada y vida de barrio.` };
    },
  };
  return <AreaTextsPage initial={data()} actions={actions} />;
}
