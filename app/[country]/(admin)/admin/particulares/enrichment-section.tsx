"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import {
  ENRICH_FIELD_LABEL,
  ruleLabel,
  type EnrichmentsPayload,
} from "@/lib/particulares/enrich-types";
import { formatPhone } from "./_ficha/format";
import { resolveParticularEnrichmentCandidate, undoParticularEnrichment } from "./actions";

/**
 * Bloque pequeño de la ficha (migración 0187): datos que el sistema ha ENCONTRADO EN LA DESCRIPCIÓN del
 * anuncio (teléfono, dirección exacta, responsable). Lo añadido con confianza alta se enseña con su evidencia y
 * un «Deshacer»; lo dudoso sale como «Sugerido» para aceptarlo o descartarlo. Si no hay nada, no pinta nada.
 */
export function EnrichmentSection({ rowId, onChanged }: { rowId: string; onChanged?: () => void }) {
  const [data, setData] = useState<EnrichmentsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    fetch(`/api/admin/particulares/enrichments?id=${encodeURIComponent(rowId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<EnrichmentsPayload>) : null))
      .then((d) => setData(d && Array.isArray(d.applied) ? d : null))
      .catch(() => setData(null));
  }, [rowId]);

  useEffect(() => {
    setData(null);
    setError(null);
    load();
  }, [load]);

  if (!data || (data.applied.length === 0 && data.candidates.length === 0)) return null;

  const show = (field: string, value: string) => (field === "phone" || field === "phone2" ? formatPhone(value) : value);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else {
        load();
        onChanged?.();
      }
    });
  };

  return (
    <section aria-label="Datos de la descripción" className="rounded-xl border border-ink/10 bg-white p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Sparkles className="h-3.5 w-3.5 text-ink/50" aria-hidden />
        Dato añadido desde la descripción
      </h3>
      {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      <ul className="space-y-2">
        {data.applied.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-ink">
                <span className="text-ink/55">{ENRICH_FIELD_LABEL[a.campo]}:</span>{" "}
                <span className="font-semibold">{show(a.campo, a.value)}</span>
                <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink/60">
                  {a.origen === "manual" ? "aceptado a mano" : "automático"} · {ruleLabel(a.regla)}
                </span>
              </p>
              {a.evidencia && <p className="mt-0.5 text-xs italic text-ink/55">«{a.evidencia}»</p>}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => undoParticularEnrichment(a.id))}
              className="rounded-md border border-ink/15 px-2 py-1 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-60"
            >
              Deshacer
            </button>
          </li>
        ))}
        {data.candidates.map((c) => (
          <li key={c.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-ink">
                <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Sugerido</span>
                <span className="text-ink/55">{ENRICH_FIELD_LABEL[c.field]}:</span>{" "}
                <span className="font-semibold">{show(c.field, c.value)}</span>
              </p>
              {c.evidence && <p className="mt-0.5 text-xs italic text-ink/55">«{c.evidence}»</p>}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => resolveParticularEnrichmentCandidate(rowId, c.key, "aceptar"))}
                className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
              >
                Aceptar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => resolveParticularEnrichmentCandidate(rowId, c.key, "descartar"))}
                className="rounded-md border border-ink/15 px-2 py-1 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-60"
              >
                Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
