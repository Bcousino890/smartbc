"use client";

import {
  Check, Globe2, Plus, MapPin, Trash2, Loader2, PhoneCall,
  LayoutGrid, List as ListIcon, UserPlus, X, Filter,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { cn } from "@/lib/utils";
import { CreateCaptacionModal } from "./create-captacion-modal";
import type { Captacion } from "./actions";

type AssignableUser = { id: string; full_name: string | null; role: string };

type CaptacionesClientProps = {
  captaciones: Captacion[];
  userRole: string;
  assignableUsers: AssignableUser[];
  canAssign: boolean;
  canDelete: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  advisor: "Asesor",
  agent_junior: "Agente Junior",
  agent_senior: "Agente Senior",
  agent_admin: "Agente Admin",
  captadora: "Captadora",
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

// Transiciones de estado permitidas al arrastrar una tarjeta a otra columna
// (subconjunto de lo que acepta el backend en status/route.ts). "assigned" se
// maneja aparte: cualquier captación no terminal se puede (re)asignar
// arrastrándola a esa columna, pidiendo a quién en un modal. "Convertida"
// nunca es destino de arrastre: requiere el flujo de conversión de la ficha.
const DRAG_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["rejected"],
  assigned: ["preliminary_data", "field_visit", "rejected"],
  preliminary_data: ["contacting", "field_visit", "revision", "rejected"],
  contacting: ["field_visit", "revision", "confirmed", "rejected"],
  field_visit: ["contacting", "preliminary_data", "confirmed", "rejected"],
  revision: ["preliminary_data", "contacting"],
  confirmed: ["rejected"],
  converted_to_property: [],
  rejected: [],
};

const TERMINAL_STATUSES = new Set(["converted_to_property", "rejected"]);

// Filtros de calidad de datos: "¿cuántas captaciones no tienen X?". Se
// calculan sobre has_phone/has_name/has_address/has_rol (attachDataQualityFlags
// en actions.ts, que combina los campos heredados con captacion_contacts).
type DataFilterKey = "no_address" | "has_rol" | "no_phone" | "has_name";
const DATA_FILTERS: Array<{ key: DataFilterKey; label: string; test: (c: Captacion) => boolean }> = [
  { key: "no_address", label: "Sin dirección", test: (c) => !c.has_address },
  { key: "has_rol", label: "Con Rol SII", test: (c) => Boolean(c.has_rol) },
  { key: "no_phone", label: "Sin teléfono", test: (c) => !c.has_phone },
  { key: "has_name", label: "Con nombre", test: (c) => Boolean(c.has_name) },
];

function formatPrice(c: Captacion) {
  if (!c.price) return null;
  if (c.currency === "uf") return `UF ${c.price.toLocaleString("es-CL")}`;
  return `$${(c.price / 1_000_000).toFixed(0)}M`;
}

export function CaptacionesClient({
  captaciones: initialCaptaciones,
  userRole,
  assignableUsers,
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
  const [activeDataFilters, setActiveDataFilters] = useState<Set<DataFilterKey>>(new Set());

  // Drag & drop del pipeline
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  // Modales que reemplazan a window.prompt (que queda bloqueado en iframes
  // con sandbox, como el panel de preview embebido)
  const [pendingAssign, setPendingAssign] = useState<Captacion | null>(null);
  const [pendingNotes, setPendingNotes] = useState<{ captacion: Captacion; targetStatus: string } | null>(null);

  const isCaptadora = userRole === "captadora";

  const handleCreated = () => {
    window.location.reload();
  };

  // A qué columnas se puede arrastrar una tarjeta con este estado actual.
  function getValidDropTargets(status: string): Set<string> {
    const targets = new Set(DRAG_ALLOWED_TRANSITIONS[status] || []);
    if (canAssign && !TERMINAL_STATUSES.has(status)) targets.add("assigned");
    return targets;
  }

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

  // Asignación rápida al ejecutivo/captadora (selector de la tarjeta o modal
  // de arrastre), para que le llegue la notificación y pueda llamar ya.
  async function assignTo(captacionId: string, userId: string) {
    setError("");
    setAssigningId(captacionId);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacionId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captadora_id: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Error al asignar");
        return;
      }
      setCaptaciones((prev) =>
        prev.map((x) =>
          x.id === captacionId ? { ...x, status: "assigned" as const, assigned_to: userId } : x
        )
      );
    } catch {
      setError("Error de conexión");
    } finally {
      setAssigningId(null);
    }
  }

  async function handleQuickAssign(c: Captacion) {
    const userId = assignSelection[c.id];
    if (userId) assignTo(c.id, userId);
  }

  async function moveStatus(captacionId: string, targetStatus: string, notes?: string) {
    setError("");
    setMovingId(captacionId);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacionId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_status: targetStatus, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Error al mover la captación");
        return;
      }
      setCaptaciones((prev) =>
        prev.map((x) =>
          x.id === captacionId ? { ...x, status: targetStatus as Captacion["status"] } : x
        )
      );
    } catch {
      setError("Error de conexión");
    } finally {
      setMovingId(null);
    }
  }

  // Mueve la tarjeta soltada a la columna de destino. "Asignada" abre un
  // modal para elegir a quién; Revisión/Visita Presencial piden el
  // motivo/instrucciones en un modal antes de confirmar.
  function handleDropOnStatus(targetStatus: string) {
    const dragged = captaciones.find((c) => c.id === draggedId);
    setDragOverStatus(null);
    if (!dragged || dragged.status === targetStatus) return;

    const allowed = getValidDropTargets(dragged.status);
    if (!allowed.has(targetStatus)) return;

    if (targetStatus === "assigned") {
      setPendingAssign(dragged);
      return;
    }
    if (targetStatus === "revision" || targetStatus === "field_visit") {
      setPendingNotes({ captacion: dragged, targetStatus });
      return;
    }
    moveStatus(dragged.id, targetStatus);
  }

  const draggedCaptacion = captaciones.find((c) => c.id === draggedId) || null;

  const filteredCaptaciones = captaciones.filter((c) =>
    Array.from(activeDataFilters).every((key) => DATA_FILTERS.find((f) => f.key === key)!.test(c))
  );

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
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || "Sin nombre"}
                  {ROLE_LABEL[u.role] ? ` · ${ROLE_LABEL[u.role]}` : ""}
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

      {pendingAssign && (
        <AssignModal
          captacion={pendingAssign}
          assignableUsers={assignableUsers}
          assigning={assigningId === pendingAssign.id}
          onCancel={() => setPendingAssign(null)}
          onConfirm={(userId) => {
            assignTo(pendingAssign.id, userId);
            setPendingAssign(null);
          }}
        />
      )}

      {pendingNotes && (
        <NotesModal
          title={
            pendingNotes.targetStatus === "field_visit"
              ? "Visita presencial — instrucciones"
              : "Motivo de la revisión"
          }
          placeholder={
            pendingNotes.targetStatus === "field_visit"
              ? "Ir a la dirección, preguntar por el dueño al conserje, dejar carta si no hay nadie..."
              : "Ej: El teléfono no corresponde al dueño..."
          }
          saving={movingId === pendingNotes.captacion.id}
          onCancel={() => setPendingNotes(null)}
          onConfirm={(notes) => {
            moveStatus(pendingNotes.captacion.id, pendingNotes.targetStatus, notes);
            setPendingNotes(null);
          }}
        />
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filtros de calidad de datos: cuántas captaciones faltan dirección,
          teléfono, etc. Los conteos son sobre el total; al activarlos se
          filtra lo que se ve abajo (se pueden combinar varios a la vez). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] font-medium text-ink/40">
          <Filter size={11} />
          Filtros:
        </span>
        {DATA_FILTERS.map((f) => {
          const count = captaciones.filter(f.test).length;
          const isActive = activeDataFilters.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() =>
                setActiveDataFilters((prev) => {
                  const next = new Set(prev);
                  if (next.has(f.key)) next.delete(f.key);
                  else next.add(f.key);
                  return next;
                })
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                isActive
                  ? "border-gold bg-gold/15 text-ink"
                  : "border-ink/10 bg-white text-ink/60 hover:border-ink/20"
              )}
            >
              {f.label} <span className="text-ink/40">({count})</span>
            </button>
          );
        })}
        {activeDataFilters.size > 0 && (
          <button
            onClick={() => setActiveDataFilters(new Set())}
            className="text-[11px] text-ink/40 underline hover:text-ink/60"
          >
            Limpiar
          </button>
        )}
      </div>

      {filteredCaptaciones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
          <Globe2 size={32} className="mx-auto mb-3 text-ink/25" />
          <p className="text-sm text-ink/50">
            {activeDataFilters.size > 0
              ? "Ninguna captación coincide con los filtros"
              : isCaptadora
                ? "Sin captaciones asignadas"
                : "Sin captaciones creadas aún"}
          </p>
        </div>
      ) : view === "pipeline" ? (
        /* ── Pipeline: una columna por estado del workflow. Arrastra una
            tarjeta a otra columna para cambiar su estado. ── */
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-4">
          {PIPELINE_STATUSES.map((status) => {
            const items = filteredCaptaciones.filter((c) => c.status === status);
            const isValidDropTarget =
              draggedCaptacion != null && getValidDropTargets(draggedCaptacion.status).has(status);
            // Columnas terminales vacías no aportan y se ocultan, EXCEPTO si
            // son un destino válido de la tarjeta que se está arrastrando
            // (si no, no habría dónde soltarla).
            if (
              items.length === 0 &&
              ["converted_to_property", "rejected", "revision", "field_visit"].includes(status) &&
              !isValidDropTarget
            ) {
              return null;
            }
            const config = STATUS_CONFIG[status];
            const isDragOver = dragOverStatus === status && isValidDropTarget;
            return (
              <div key={status} className="w-60 flex-shrink-0">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("h-2 w-2 rounded-full", config.dot)} />
                  <h3 className="text-xs font-semibold text-ink/70">{config.label}</h3>
                  <span className="rounded-full bg-ink/8 px-1.5 py-0.5 text-[10px] font-medium text-ink/50">
                    {items.length}
                  </span>
                </div>
                <div
                  onDragOver={(e) => {
                    if (!isValidDropTarget) return;
                    e.preventDefault();
                    if (dragOverStatus !== status) setDragOverStatus(status);
                  }}
                  onDragLeave={() =>
                    setDragOverStatus((prev) => (prev === status ? null : prev))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnStatus(status);
                  }}
                  className={cn(
                    "space-y-2 rounded-xl bg-ink/3 p-2 min-h-[80px] transition",
                    isDragOver && "bg-gold/10 ring-2 ring-gold/50",
                    draggedCaptacion &&
                      draggedCaptacion.status !== status &&
                      !isValidDropTarget &&
                      "opacity-40"
                  )}
                >
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-ink/30">
                      {isDragOver ? "Suelta aquí" : "Vacío"}
                    </p>
                  ) : (
                    items.map((c) => {
                      const canDrag = !TERMINAL_STATUSES.has(c.status) && movingId !== c.id;
                      return (
                        <div
                          key={c.id}
                          draggable={canDrag}
                          onDragStart={(e) => {
                            setDraggedId(c.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setDragOverStatus(null);
                          }}
                          onClick={() => {
                            if (draggedId) return;
                            router.push(`/cl/admin/captaciones/${c.id}`);
                          }}
                          className={cn(
                            "rounded-lg border border-gold/15 bg-white p-2.5 transition hover:border-gold/40 hover:shadow-sm",
                            canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                            draggedId === c.id && "opacity-40",
                            movingId === c.id && "opacity-60"
                          )}
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
                              {assignableUsers.find((u) => u.id === c.assigned_to)?.full_name ||
                                "Asignada"}
                            </p>
                          )}
                          <CardActions c={c} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Lista ── */
        <div className="space-y-3">
          {filteredCaptaciones.map((c) => (
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

// Modal para elegir a quién asignar al soltar una tarjeta en "Asignada"
// (reemplaza al selector nativo del navegador, que no puede mostrar una
// lista con roles).
function AssignModal({
  captacion,
  assignableUsers,
  assigning,
  onCancel,
  onConfirm,
}: {
  captacion: Captacion;
  assignableUsers: AssignableUser[];
  assigning: boolean;
  onCancel: () => void;
  onConfirm: (userId: string) => void;
}) {
  const [userId, setUserId] = useState(captacion.assigned_to || "");
  const isReassign = captacion.status !== "draft" && captacion.status !== "assigned";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Asignar a</h3>
            <p className="mt-0.5 text-xs text-ink/50 line-clamp-1">{captacion.title || "Sin título"}</p>
          </div>
          <button onClick={onCancel} className="rounded p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
            <X size={16} />
          </button>
        </div>

        {isReassign && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta captación está en &quot;{STATUS_CONFIG[captacion.status]?.label}&quot;. Reasignar la
            devuelve al estado &quot;Asignada&quot;.
          </p>
        )}

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="mb-4 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
        >
          <option value="">Selecciona usuario...</option>
          {assignableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || "Sin nombre"}
              {ROLE_LABEL[u.role] ? ` · ${ROLE_LABEL[u.role]}` : ""}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            onClick={() => userId && onConfirm(userId)}
            disabled={!userId || assigning}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {assigning && <Loader2 size={14} className="animate-spin" />}
            Asignar
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de notas para mover una tarjeta a Revisión o Visita Presencial
// (reemplaza a window.prompt, que queda bloqueado si la app corre embebida
// en un iframe con sandbox).
function NotesModal({
  title,
  placeholder,
  saving,
  onCancel,
  onConfirm,
}: {
  title: string;
  placeholder: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onCancel} className="rounded p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <textarea
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="mb-4 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
        />

        <div className="flex gap-2">
          <button
            onClick={() => notes.trim() && onConfirm(notes.trim())}
            disabled={!notes.trim() || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Confirmar
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
