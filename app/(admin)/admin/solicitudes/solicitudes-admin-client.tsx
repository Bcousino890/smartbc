"use client";

import { Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/provider";
import type { VisitRequest, VisitRequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { updateVisitStatus } from "./actions";

// ─── Status badge ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  VisitRequestStatus,
  { label: string; cls: string }
> = {
  pending:     { label: "Pendiente",    cls: "border-amber-200 bg-amber-50 text-amber-700" },
  confirmed:   { label: "Confirmada",   cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  completed:   { label: "Completada",   cls: "border-blue-200 bg-blue-50 text-blue-700" },
  cancelled:   { label: "Cancelada",    cls: "border-rose-200 bg-rose-50 text-rose-700" },
  rescheduled: { label: "Reprogramada", cls: "border-purple-200 bg-purple-50 text-purple-700" },
  rejected:    { label: "Rechazada",    cls: "border-rose-200 bg-rose-50 text-rose-700" },
};

function StatusBadge({ status }: { status: VisitRequestStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabKey = "pending" | "confirmed" | "completed" | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending",   label: "Pendientes" },
  { key: "confirmed", label: "Confirmadas" },
  { key: "completed", label: "Completadas" },
  { key: "cancelled", label: "Canceladas" },
];

// ─── Time ago helper ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Hace un momento";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function VisitCard({ visit }: { visit: VisitRequest }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState<VisitRequestStatus | null>(null);

  const displayStatus = optimisticStatus ?? visit.status;

  function handleStatus(status: "confirmed" | "cancelled" | "completed") {
    setOptimisticStatus(status);
    startTransition(async () => {
      const res = await updateVisitStatus(visit.id, status);
      if (!res.ok) {
        setOptimisticStatus(null);
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-gold/15 bg-cream-50/85 p-4 shadow-sm transition-shadow hover:shadow-md",
        isPending && "opacity-70",
      )}
    >
      {/* Cabecera: avatar + nombre + badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-bold text-amber-700">
            {visit.clientInitials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{visit.clientName}</p>
            <p className="truncate text-[12px] text-ink/55">{visit.clientEmail}</p>
          </div>
        </div>
        <StatusBadge status={displayStatus} />
      </div>

      {/* Propiedad */}
      <div className="mt-3 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2 text-[12px] text-ink/70">
        🏠 {visit.propertyTitle}
        {visit.propertyReference && (
          <span className="ml-1 font-mono text-amber-700">{visit.propertyReference}</span>
        )}
      </div>

      {/* Fecha solicitada */}
      <p className="mt-1.5 text-[11px] text-ink/45">{visit.requestedDateLabel}</p>

      {/* Timestamp relativo */}
      <p className="mt-0.5 text-[11px] text-ink/35">{timeAgo(visit.createdAt)}</p>

      {/* Acciones para pendientes */}
      {displayStatus === "pending" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleStatus("confirmed")}
            className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-[12px] font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            ✓ Confirmar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleStatus("cancelled")}
            className="flex-1 rounded-lg border border-rose-200 bg-rose-50 py-1.5 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            ✗ Cancelar
          </button>
        </div>
      )}

      {/* Acción para confirmadas */}
      {displayStatus === "confirmed" && (
        <div className="mt-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleStatus("completed")}
            className="w-full rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-[12px] font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
          >
            ✓ Marcar como completada
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function SolicitudesAdminClient({
  requests,
}: {
  requests: VisitRequest[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("pending");

  const counts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? requests.filter(
          (r) =>
            r.clientName.toLowerCase().includes(q) ||
            r.propertyTitle.toLowerCase().includes(q) ||
            r.propertyReference.toLowerCase().includes(q) ||
            r.clientEmail.toLowerCase().includes(q),
        )
      : requests;

    return {
      pending:   base.filter((r) => r.status === "pending").length,
      confirmed: base.filter((r) => r.status === "confirmed").length,
      completed: base.filter((r) => r.status === "completed").length,
      cancelled: base.filter((r) => r.status === "cancelled" || r.status === "rejected").length,
    };
  }, [requests, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySearch = q
      ? requests.filter(
          (r) =>
            r.clientName.toLowerCase().includes(q) ||
            r.propertyTitle.toLowerCase().includes(q) ||
            r.propertyReference.toLowerCase().includes(q) ||
            r.clientEmail.toLowerCase().includes(q),
        )
      : requests;

    return bySearch.filter((r) => {
      if (activeTab === "cancelled") return r.status === "cancelled" || r.status === "rejected";
      return r.status === activeTab;
    });
  }, [requests, query, activeTab]);

  return (
    <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      {/* Buscador */}
      <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
        <Search size={15} strokeWidth={1.75} className="text-ink/45" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("solicitudes.search.placeholder")}
          className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
        />
      </label>

      {/* Tabs */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
              activeTab === tab.key
                ? "bg-gold text-white"
                : "text-ink/55 hover:text-ink",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                activeTab === tab.key
                  ? "bg-white/25 text-white"
                  : "bg-ink/5 text-ink/50",
              )}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Grid de cards */}
      <div className="mt-5">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-white/40 px-4 py-10 text-center text-sm text-ink/55">
            No hay solicitudes en esta categoría
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
