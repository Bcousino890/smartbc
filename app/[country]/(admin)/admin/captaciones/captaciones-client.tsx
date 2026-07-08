"use client";

import {
  Check, Globe2, Plus, MapPin, Trash2, Loader2, PhoneCall,
  LayoutGrid, List as ListIcon, UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { cn } from "@/lib/utils";
import { CreateCaptacionModal } from "./create-captacion-modal";
import type { Captacion } from "./actions";

type Captadora = { id: string; full_name: string | null };

type CaptacionesClientProps = {
  captaciones: Captacion[];
  userRole: string;
  captadoras: Captadora[];
  canAssign: boolean;
  canDelete: boolean;
};

// Columnas del pipeline en orden de flujo. Debe coincidir con los estados
// del backend (migración 0077).
const PIPELINE_STATUSES = [
  "draft",
  "assigned",
  "preliminary_data",
  "contacting",
  "field_visit",
  "revision",
  "confirmed",
  "converted_to_property",
  "rejected",
] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: "Borrador", color: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  assigned: { label: "Asignada", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  preliminary_data: { label: "Datos Preliminares", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  contacting: { label: "Contactando", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  field_visit: { label: "Visita Presencial", color: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  revision: { label: "Revisión", color: "bg-orange-200 text-orange-800", dot: "bg-orange-600" },
  confirmed: { label: "Confirmada", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  converted_to_property: { label: "Convertida", color: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  rejected: { label: "Rechazada", color: "bg-red-100 text-red-700", dot: "bg-red-400" },
};

function formatPrice(c: Captacion) {
  if (!c.price) return null;
  if (c.currency === "uf") return `UF ${c.price.toLocaleString("es-CL")}`;
  return `$${(c.price / 1_000_000).toFixed(0)}M`;
}

export function CaptacionesClient({
  captaciones: initialCaptaciones,
  userRole,
  captadoras,
  canAssign,
  canDelete,
}: CaptacionesClientProps) {
  const router = useRouter();
  const [captaciones, setCaptaciones] = useState(initialCaptaciones);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignSelection, setAssignSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const isCaptadora = userRole === "captadora";

  const handleCreated = () => {
    window.location.reload();
  };

  async function handleDelete(c: Captacion) {
    if (!confirm(`¿Eliminar la captación "${c.title || "Sin título"}"? Se borran fotos, intentos y avisos de corredoras.`)) return;
    setError("");
    setDeletingId(c.id);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al eliminar la captación");
        return;
      }
      setCaptaciones((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      setError("Error de conexión");
    } finally {
      setDeletingId(null);
    }
  }

  // Asignación rápida al ejecutivo/captadora directamente desde la tarjeta,
  // para que le llegue la notificación y pueda llamar de inmediato.
  async function handleQuickAssign(c: Captacion) {
    const captadoraId = assignSelection[c.id];
    if (!captadoraId) return;
    setError("");
    setAssigningId(c.id);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${c.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captadora_id: captadoraId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al asignar");
        return;
      }
      setCaptaciones((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, status: "assigned" as const, assigned_to: captadoraId } : x
        )
      );
    } catch {
      setError("Error de conexión");
    } finally {
      setAssigningId(null);
    }
  }

  function CardActions({ c }: { c: Captacion }) {
    if (!canAssign && !canDelete) return null;
    const showAssign = canAssign && !c.assigned_to &&
      !["converted_to_property", "rejected"].includes(c.status);
    return (
      <div onClick={(e) => e.stopPropagation()} className="mt-2 space-y-1.5">
        {showAssign && (
          <div className="flex items-center gap-1.5">
            <select
              value={assignSelection[c.id] || ""}
              onChange={(e) =>
                setAssignSelection((prev) => ({ ...prev, [c.id]: e.target.value }))
              }
              className="min-w-0 flex-1 rounded-md border border-ink/10 bg-white px-1.5 py-1 text-[11px] focus:border-gold/50 focus:outline-none"
            >
              <option value="">Asignar a...</option>
              {captadoras.map((cap) => (
                <option key={cap.id} value={cap.id}>
                  {cap.full_name || "Sin nombre"}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleQuickAssign(c)}
              disabled={!assignSelection[c.id] || assigningId === c.id}
              title="Asignar ya para que llame"
              className="flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-40"
            >
              {assigningId === c.id ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <PhoneCall size={11} />
              )}
              Asignar
            </button>
          </div>
        )}
        {canDelete && (
          <button
            onClick={() => handleDelete(c)}
            disabled={deletingId === c.id}
            title="Eliminar captación"
            className="flex items-center gap-1 text-[11px] text-ink/40 transition hover:text-red-600 disabled:opacity-40"
          >
            {deletingId === c.id ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Trash2 size={11} />
            )}
            Eliminar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="admin.nav.captaciones"
        subtitleKey="Prospección de propiedades - Agentes crean, captadoras completan info"
      />

      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {!isCaptadora ? (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
          >
            <Plus size={16} />
            Nueva Captación
          </button>
        ) : (
          <div />
        )}

        {/* Toggle pipeline / lista */}
        <div className="flex rounded-lg border border-ink/10 bg-white p-0.5">
          <button
            onClick={() => setView("pipeline")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
              view === "pipeline" ? "bg-ink text-cream-50" : "text-ink/50 hover:text-ink"
            )}
          >
            <LayoutGrid size={13} />
            Pipeline
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
              view === "list" ? "bg-ink text-cream-50" : "text-ink/50 hover:text-ink"
            )}
          >
            <ListIcon size={13} />
            Lista
          </button>
        </div>
      </section>

      <CreateCaptacionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleCreated}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {captaciones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
          <Globe2 size={32} className="mx-auto mb-3 text-ink/25" />
          <p className="text-sm text-ink/50">
            {isCaptadora ? "Sin captaciones asignadas" : "Sin captaciones creadas aún"}
          </p>
        </div>
      ) : view === "pipeline" ? (
        /* ── Pipeline: una columna por estado del workflow ── */
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-4">
          {PIPELINE_STATUSES.map((status) => {
            const items = captaciones.filter((c) => c.status === status);
            // Columnas terminales vacías no aportan: se ocultan
            if (
              items.length === 0 &&
              ["converted_to_property", "rejected", "revision", "field_visit"].includes(status)
            ) {
              return null;
            }
            const config = STATUS_CONFIG[status];
            return (
              <div key={status} className="w-60 flex-shrink-0">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("h-2 w-2 rounded-full", config.dot)} />
                  <h3 className="text-xs font-semibold text-ink/70">{config.label}</h3>
                  <span className="rounded-full bg-ink/8 px-1.5 py-0.5 text-[10px] font-medium text-ink/50">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 rounded-xl bg-ink/3 p-2 min-h-[80px]">
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-ink/30">Vacío</p>
                  ) : (
                    items.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => router.push(`/cl/admin/captaciones/${c.id}`)}
                        className="cursor-pointer rounded-lg border border-gold/15 bg-white p-2.5 transition hover:border-gold/40 hover:shadow-sm"
                      >
                        {c.cover_photo_url && (
                          <img
                            src={c.cover_photo_url}
                            alt=""
                            className="mb-2 h-20 w-full rounded-md object-cover"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                        )}
                        <p className="text-xs font-semibold text-ink line-clamp-2 leading-snug">
                          {c.title || "Sin título"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink/55">
                          {c.operation && (
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-px text-[9px] font-semibold uppercase",
                                c.operation === "arriendo"
                                  ? "bg-sky-100 text-sky-700"
                                  : "bg-amber-100 text-amber-700"
                              )}
                            >
                              {c.operation}
                            </span>
                          )}
                          {c.commune && (
                            <span className="flex items-center gap-0.5">
                              <MapPin size={9} />
                              {c.commune}
                            </span>
                          )}
                          {c.price && <span className="font-semibold text-ink/75">{formatPrice(c)}</span>}
                        </div>
                        {c.owner_confirmed && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                            <Check size={10} />
                            Dueño confirmado
                          </p>
                        )}
                        {c.assigned_to && status !== "draft" && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-ink/40">
                            <UserPlus size={9} />
                            {captadoras.find((cap) => cap.id === c.assigned_to)?.full_name ||
                              "Asignada"}
                          </p>
                        )}
                        <CardActions c={c} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Lista ── */
        <div className="space-y-3">
          {captaciones.map((c) => (
            <div
              key={c.id}
              className="flex gap-4 rounded-xl border border-gold/15 bg-white/70 p-4 transition hover:border-gold/30 hover:bg-white"
            >
              <Link href={`/cl/admin/captaciones/${c.id}`} className="flex flex-1 min-w-0 gap-4">
                {c.cover_photo_url && (
                  <img
                    src={c.cover_photo_url}
                    alt=""
                    className="h-16 w-20 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-ink line-clamp-1">
                    {c.title || "Sin título"}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                    {c.operation && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px text-[9px] font-semibold uppercase",
                          c.operation === "arriendo"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {c.operation}
                      </span>
                    )}
                    {c.commune && (
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />
                        {c.commune}
                      </span>
                    )}
                    {c.bedrooms && <span>{c.bedrooms}d</span>}
                    {c.price && <span>{formatPrice(c)}</span>}
                    {c.scrape_status === "scraped" && (
                      <span className="text-emerald-600 flex items-center gap-0.5">
                        <Check size={10} />
                        Scrapeado
                      </span>
                    )}
                    {c.scrape_status === "failed" && (
                      <span className="text-red-600 text-[10px]">❌ Error scrape</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-ink/40">
                    Hace {new Date(c.created_at).toLocaleDateString("es-CL")}
                  </p>
                </div>
              </Link>

              <div className="flex-shrink-0 text-right">
                <div
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium",
                    STATUS_CONFIG[c.status]?.color || "bg-gray-100 text-gray-700"
                  )}
                >
                  {STATUS_CONFIG[c.status]?.label || c.status}
                </div>
                {c.owner_confirmed && (
                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-emerald-600">
                    <Check size={10} />
                    Dueño confirmado
                  </div>
                )}
                <CardActions c={c} />
              </div>
            </div>
          ))}
        </div>
      )}

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
