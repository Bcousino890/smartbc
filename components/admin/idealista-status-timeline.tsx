"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

type StatusHistoryEntry = {
  id: string;
  old_state: string | null;
  new_state: string;
  changed_at: string;
  reason: string | null;
};

const STATE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Borrador", color: "text-amber-700", bg: "bg-amber-100" },
  published: { label: "Publicado", color: "text-emerald-700", bg: "bg-emerald-100" },
  failed: { label: "Error", color: "text-red-700", bg: "bg-red-100" },
  archived: { label: "Archivado", color: "text-slate-600", bg: "bg-slate-100" },
  active: { label: "Activo", color: "text-blue-700", bg: "bg-blue-100" },
};

function getStateLabel(state: string | null) {
  if (!state) return { label: "—", color: "text-ink/50", bg: "bg-ink/5" };
  return STATE_LABELS[state] || { label: state, color: "text-ink/60", bg: "bg-ink/10" };
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return {
    date: date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
}

function getReasonLabel(reason: string | null) {
  const reasons: Record<string, string> = {
    state_change: "Cambio de estado",
    archived: "Bajada de Idealista",
    restored: "Restaurada",
  };
  return reasons[reason || ""] || reason || "Cambio manual";
}

export function IdealistaStatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!history || history.length === 0) {
    return (
      <div className="text-xs text-ink/40">
        Sin historial de cambios
      </div>
    );
  }

  // Ordenar por fecha descendente (más reciente primero para display)
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  const displayHistory = isExpanded ? sortedHistory : sortedHistory.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="space-y-3">
        {displayHistory.map((entry, idx) => {
          const { date, time } = formatDate(entry.changed_at);
          const oldStateInfo = getStateLabel(entry.old_state);
          const newStateInfo = getStateLabel(entry.new_state);
          const reasonLabel = getReasonLabel(entry.reason);

          return (
            <div key={entry.id} className="flex gap-3">
              {/* Timeline dot */}
              <div className="relative flex flex-col items-center">
                <div className="h-2.5 w-2.5 rounded-full border-2 border-gold/60 bg-white" />
                {idx < displayHistory.length - 1 && (
                  <div className="absolute top-2.5 h-6 w-0.5 bg-gold/20" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="text-ink/70">{date}</span>
                  <span className="text-ink/50">{time}</span>
                  <span className="text-ink/40">—</span>
                  <span className="text-ink/60">{reasonLabel}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${oldStateInfo.bg} ${oldStateInfo.color}`}>
                    {oldStateInfo.label}
                  </span>
                  <svg className="h-3 w-3 flex-shrink-0 text-ink/30" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${newStateInfo.bg} ${newStateInfo.color}`}>
                    {newStateInfo.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sortedHistory.length > 3 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs font-medium text-gold/70 hover:text-gold transition"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={14} />
              Ver menos
            </>
          ) : (
            <>
              <ChevronDown size={14} />
              Ver todo ({sortedHistory.length - 3} más)
            </>
          )}
        </button>
      )}
    </div>
  );
}
