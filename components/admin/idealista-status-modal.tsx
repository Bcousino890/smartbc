"use client";

import { X, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { IdealistaStatusTimeline } from "./idealista-status-timeline";

type StatusHistoryEntry = {
  id: string;
  old_state: string | null;
  new_state: string;
  changed_at: string;
  reason: string | null;
};

interface IdealistaStatusModalProps {
  listingId: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
}

export function IdealistaStatusModal({
  listingId,
  title,
  isOpen,
  onClose,
}: IdealistaStatusModalProps) {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch(`/api/admin/idealista/status-history?listingId=${listingId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setHistory(data.data || []);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, listingId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 max-w-2xl w-full rounded-2xl border border-gold/15 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gold/10 px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-ink/50">Historial de estados</p>
            <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg border border-ink/10 bg-white p-2 text-ink/40 hover:bg-ink/5 hover:text-ink transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink/50">
              <Loader2 size={16} className="animate-spin" />
              Cargando historial...
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              Error al cargar: {error}
            </div>
          ) : (
            <IdealistaStatusTimeline history={history} />
          )}
        </div>
      </div>
    </div>
  );
}
