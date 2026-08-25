"use client";

import { Loader2, Sparkles, RefreshCw, AlertTriangle, ArrowRight, Users, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";

type SuggestionAction = "publicar" | "bajar_precio" | "despublicar";

type SuggestionTarget = {
  listingId: string;
  label: string;
  typeLabel: string;
  operation: string | null;
  priceLabel: string;
  zone: string | null;
  leadsTotal: number;
  daysSinceLastLead: number | null;
};

type Suggestion = {
  action: SuggestionAction;
  reason: string;
  target: SuggestionTarget;
  replacement: SuggestionTarget | null;
};

type SuggestionsData = {
  summary: string;
  suggestions: Suggestion[];
  generatedAt: string;
};

const ACTION_BADGE: Record<SuggestionAction, string> = {
  bajar_precio: "border-amber-200 bg-amber-50 text-amber-700",
  despublicar: "border-red-200 bg-red-50 text-red-700",
  publicar: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const ACTION_LABEL: Record<SuggestionAction, string> = {
  bajar_precio: "Bajar precio",
  despublicar: "Despublicar",
  publicar: "Publicar",
};

function opLabel(operation: string | null): string {
  return operation === "sale" ? "Venta" : operation === "rent" ? "Alquiler" : "";
}

// Los leads/días solo tienen sentido para una ficha que ha estado publicada
// (bajar_precio / despublicar). Para "publicar" el target es una ficha en
// cartera que nunca ha estado viva — mostrar "nunca recibió un lead" ahí
// leería como un fallo cuando en realidad es simplemente que no está
// publicada todavía.
function TargetFacts({ t, showLeadStats }: { t: SuggestionTarget; showLeadStats: boolean }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/55">
      <span>{[opLabel(t.operation), t.priceLabel, t.zone].filter(Boolean).join(" · ")}</span>
      {showLeadStats && (
        <>
          <span className="flex items-center gap-1 font-medium text-ink/70">
            <Users size={11} />
            {t.leadsTotal} lead{t.leadsTotal === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1 font-medium text-ink/70">
            <Clock size={11} />
            {t.daysSinceLastLead != null ? `último hace ${t.daysSinceLastLead} día${t.daysSinceLastLead === 1 ? "" : "s"}` : "nunca recibió un lead"}
          </span>
        </>
      )}
    </div>
  );
}

interface IdealistaAiSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Cierra el modal y abre la ficha indicada en el editor. */
  onNavigate: (listingId: string) => void;
}

export function IdealistaAiSuggestionsModal({ isOpen, onClose, onNavigate }: IdealistaAiSuggestionsModalProps) {
  const [data, setData] = useState<SuggestionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fetchSuggestions() {
    setLoading(true);
    setError(null);
    fetch("/api/admin/idealista/ai-suggestions", { method: "POST" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Error al generar sugerencias");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al generar sugerencias"))
      .finally(() => setLoading(false));
  }

  // Solo la primera vez que se abre: pedir sugerencias nuevas en cada
  // reapertura sería gastar la IA para volver a mostrar lo mismo si nada
  // cambió — para eso está el botón "Regenerar".
  useEffect(() => {
    if (isOpen && !data && !loading && !error) fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <Modal open={isOpen} onClose={onClose} title="Sugerencias de IA" subtitle="Basado en las fichas publicadas y los leads recientes" size="xl">
      {loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-ink/40">
          <Loader2 size={22} className="animate-spin" />
          <p className="text-xs">Analizando fichas y leads...</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-4">
          {data.summary && (
            <p className="rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-ink/80">
              {data.summary}
            </p>
          )}

          {data.suggestions.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink/45">
              Sin sugerencias por ahora — no hay señales claras en los datos disponibles.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.suggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-ink/10 bg-white/70 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[s.action]}`}>
                          {ACTION_LABEL[s.action] ?? s.action}
                        </span>
                        <span className="rounded-full bg-blue-100/60 px-2 py-0.5 text-xs font-medium text-blue-700 font-mono">
                          {s.target.label}
                        </span>
                      </div>
                      <TargetFacts t={s.target} showLeadStats={s.action !== "publicar"} />
                    </div>
                    <button
                      onClick={() => onNavigate(s.target.listingId)}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-cream-50 transition hover:bg-ink/80"
                      title={`Abrir la ficha ${s.target.label}`}
                    >
                      Abrir ficha
                      <ArrowRight size={12} />
                    </button>
                  </div>

                  {s.reason && <p className="mt-2 text-sm text-ink/75">{s.reason}</p>}

                  {s.replacement && (
                    <button
                      onClick={() => onNavigate(s.replacement!.listingId)}
                      className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-ink/10 bg-ink/[0.02] px-3 py-2 text-left transition hover:bg-ink/5"
                    >
                      <span className="min-w-0 text-xs text-ink/55">
                        <span className="font-mono font-medium text-ink/70">{s.replacement.label}</span>
                        {" — "}
                        {[opLabel(s.replacement.operation), s.replacement.priceLabel, s.replacement.zone].filter(Boolean).join(" · ")}
                      </span>
                      <ArrowRight size={12} className="shrink-0 text-ink/40" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-ink/10 pt-3">
            <p className="text-xs text-ink/35">
              Generado {new Date(data.generatedAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
            <button
              onClick={fetchSuggestions}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-ink/5 disabled:opacity-50"
            >
              <RefreshCw size={12} />
              Regenerar
            </button>
          </div>
        </div>
      )}

      {!loading && !error && !data && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Sparkles size={22} className="text-gold" />
          <button
            onClick={fetchSuggestions}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80"
          >
            Generar sugerencias
          </button>
        </div>
      )}
    </Modal>
  );
}
