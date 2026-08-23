"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

export type StateOption = "draft" | "published" | "unpublished" | "failed";

export const STATE_LABELS: Record<StateOption, { label: string; color: string; bg: string }> = {
  draft: { label: "Borrador", color: "text-amber-700", bg: "bg-amber-100" },
  published: { label: "Publicado", color: "text-emerald-700", bg: "bg-emerald-100" },
  unpublished: { label: "Despublicado", color: "text-slate-700", bg: "bg-slate-200" },
  failed: { label: "Error", color: "text-red-700", bg: "bg-red-100" },
};

interface IdealistaStateSelectorProps {
  listingId: string;
  currentState: string | null;
  onStateChange: (newState: string) => void;
}

export function IdealistaStateSelector({
  listingId,
  currentState,
  onStateChange,
}: IdealistaStateSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (newState: StateOption) => {
    if (newState === currentState) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/idealista/update-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, newState }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.error || "Error al cambiar estado");
        return;
      }

      const { newState: updatedState } = await res.json();
      onStateChange(updatedState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  };

  const currentStateInfo = currentState
    ? STATE_LABELS[currentState as StateOption] || { label: currentState, color: "text-ink/60", bg: "bg-ink/10" }
    : { label: "—", color: "text-ink/50", bg: "bg-ink/5" };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${currentStateInfo.bg} ${currentStateInfo.color}`}>
          {currentStateInfo.label}
        </span>
        {isLoading && <Loader2 size={12} className="animate-spin text-ink/50" />}
      </div>

      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      <select
        value={currentState || ""}
        onChange={(e) => handleChange(e.target.value as StateOption)}
        disabled={isLoading}
        className="text-xs rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-ink/70 focus:border-gold/55 focus:outline-none disabled:opacity-50"
      >
        <option value="">Seleccionar estado...</option>
        <option value="draft">Borrador</option>
        <option value="published">Publicado</option>
        <option value="unpublished">Despublicado</option>
        <option value="failed">Error</option>
      </select>
    </div>
  );
}
