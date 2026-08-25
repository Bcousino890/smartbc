"use client";

import { Loader2, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";

type Suggestion = {
  priority: "alta" | "media" | "baja";
  text: string;
  reference_code?: string | null;
};

type SuggestionsData = {
  summary: string;
  suggestions: Suggestion[];
  generatedAt: string;
};

const PRIORITY_BADGE: Record<Suggestion["priority"], string> = {
  alta: "border-red-200 bg-red-50 text-red-700",
  media: "border-amber-200 bg-amber-50 text-amber-700",
  baja: "border-slate-200 bg-slate-100 text-slate-600",
};

const PRIORITY_LABEL: Record<Suggestion["priority"], string> = {
  alta: "Prioridad alta",
  media: "Prioridad media",
  baja: "Prioridad baja",
};

interface IdealistaAiSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IdealistaAiSuggestionsModal({ isOpen, onClose }: IdealistaAiSuggestionsModalProps) {
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
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[s.priority]}`}>
                      {PRIORITY_LABEL[s.priority] ?? s.priority}
                    </span>
                    {s.reference_code && (
                      <span className="rounded-full bg-blue-100/60 px-2 py-0.5 text-xs font-medium text-blue-700 font-mono">
                        {s.reference_code}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink/80">{s.text}</p>
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
