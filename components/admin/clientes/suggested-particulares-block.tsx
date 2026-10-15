"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, TrendingDown } from "lucide-react";
import type { SuggestedParticular } from "@/lib/db/queries/suggested-particulares";

type State =
  | { kind: "loading" }
  | { kind: "ready"; suggestions: SuggestedParticular[]; excluded: Array<{ label: string; count: number }> }
  | { kind: "hidden" };

const PORTAL: Record<string, string> = { idealista: "Idealista", fotocasa: "Fotocasa", pisos: "pisos.com", habitaclia: "Habitaclia" };
const eur = (n: number, rent: boolean) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n) + (rent ? " €/mes" : " €");

/**
 * Anuncios de portales (particulares y agencias scrapeados) que encajan con el
 * encargo. Complementa a "Propiedades sugeridas" (catálogo propio). Si el rol
 * no puede ver particulares la API responde 403 y el bloque no se pinta.
 */
export function SuggestedParticularesBlock({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/clientes/${clientId}/suggested-particulares`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || json.reason === "no_preferences") return setState({ kind: "hidden" });
        setState({ kind: "ready", suggestions: json.suggestions ?? [], excluded: json.excluded ?? [] });
      } catch {
        if (!cancelled) setState({ kind: "hidden" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (state.kind === "hidden") return null;
  const total = state.kind === "ready" ? state.excluded.reduce((n, e) => n + e.count, 0) : 0;

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <h2 className="crm-label-sm text-ink/50">Anuncios de portales que encajan</h2>
        {state.kind === "ready" && state.suggestions.length > 0 && (
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold-dark">
            {state.suggestions.length}
          </span>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="mt-4 flex h-16 items-center justify-center text-ink/45">
          <Loader2 size={15} className="mr-2 animate-spin" />
          <span className="text-xs">Buscando en portales…</span>
        </div>
      )}

      {state.kind === "ready" && state.suggestions.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-xs text-ink/55">
          Ningún anuncio de portal encaja ahora con el encargo de <strong>{clientName}</strong>.
        </p>
      )}

      {state.kind === "ready" && total > 0 && (
        <p className="mt-2 text-xs text-ink/50">
          {total === 1 ? "1 descartado" : `${total} descartados`} por el encargo:{" "}
          {state.excluded.slice(0, 4).map((e) => `${e.label.toLowerCase()} (${e.count})`).join(" · ")}
        </p>
      )}

      {state.kind === "ready" && state.suggestions.length > 0 && (
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
          {state.suggestions.map((p) => (
            <article key={p.id} className="flex gap-3 rounded-xl border border-ink/10 bg-white/70 p-3">
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverUrl} alt="" className="h-20 w-24 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="h-20 w-24 shrink-0 rounded-lg bg-ink/5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold-dark">
                    {p.matchScore}%
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink/60">
                  {eur(p.price, p.operation === "rent")}
                  {p.bedrooms ? ` · ${p.bedrooms} dorm.` : ""}
                  {p.squareMeters ? ` · ${p.squareMeters} m²` : ""}
                  {p.zone ? ` · ${p.zone}` : ""}
                  {p.portal ? ` · ${PORTAL[p.portal] ?? p.portal}` : ""}
                </p>
                {p.priceDropPct ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
                    <TrendingDown size={12} /> Bajó {Math.round(p.priceDropPct)} %
                  </p>
                ) : null}
                {p.matchReasons.length > 0 && (
                  <p className="mt-1 text-xs text-ink/55">{p.matchReasons.slice(0, 4).join(" · ")}</p>
                )}
                {p.matchWarnings.length > 0 && (
                  <p className="mt-0.5 text-xs text-amber-700">{p.matchWarnings.slice(0, 2).join(" · ")}</p>
                )}
                {p.sourceUrl && (
                  <a
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gold-dark hover:underline"
                  >
                    Ver anuncio <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
