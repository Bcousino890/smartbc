"use client";

import {
  Check, Globe2, Plus, MapPin, Trash2, Loader2, PhoneCall,
  LayoutGrid, List as ListIcon, UserPlus, X, Filter, Settings,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { cn } from "@/lib/utils";
import { pipelineColor } from "@/lib/captaciones/pipeline-colors";
import { CreateCaptacionModal } from "./create-captacion-modal";
import type { Captacion, CaptacionStage } from "./actions";

type AssignableUser = { id: string; full_name: string | null; role: string };
type PipelineWithStages = { id: string; name: string; is_default: boolean; stages: CaptacionStage[] };

type CaptacionesClientProps = {
  captaciones: Captacion[];
  userRole: string;
  assignableUsers: AssignableUser[];
  canAssign: boolean;
  canDelete: boolean;
  pipelines: PipelineWithStages[];
  canConfigurePipelines: boolean;
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
  pipelines,
  canConfigurePipelines,
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

  // Pipeline seleccionado para el tablero (puede haber más de uno)
  const defaultPipeline = pipelines.find((p) => p.is_default) || pipelines[0] || null;
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(defaultPipeline?.id ?? null);
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) || null;

  // Drag & drop del pipeline
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  // Modales que reemplazan a window.prompt (que queda bloqueado en iframes
  // con sandbox, como el panel de preview embebido)
  const [pendingAssign, setPendingAssign] = useState<Captacion | null>(null);
  const [pendingNotes, setPendingNotes] = useState<{ captacion: Captacion; stage: CaptacionStage } | null>(null);
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [savingPipeline, setSavingPipeline] = useState(false);

  const isCaptadora = userRole === "captadora";

  const handleCreated = () => {
    window.location.reload();
  };

  function stagesOf(pipelineId: string | null): CaptacionStage[] {
    return pipelines.find((p) => p.id === pipelineId)?.stages || [];
  }

  function stageMeta(c: Captacion): CaptacionStage | null {
    return stagesOf(c.pipeline_id).find((s) => s.id === c.stage_id) || null;
  }

  // A qué etapas se puede arrastrar una tarjeta: cualquier otra etapa de su
  // mismo pipeline, excepto "converted" (solo vía conversión) y "draft"
  // (nada vuelve al punto de entrada). "assign" solo si el usuario puede
  // asignar.
  function getValidDropTargets(c: Captacion): CaptacionStage[] {
    const current = stageMeta(c);
    if (!current || current.stage_type === "rejected" || current.stage_type === "converted") return [];
    return stagesOf(c.pipeline_id).filter((s) => {
      if (s.id === current.id) return false;
      if (s.stage_type === "converted" || s.stage_type === "draft") return false;
      if (s.stage_type === "assign" && !canAssign) return false;
      return true;
    });
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

  function applyUpdatedCaptacion(updated: any) {
    setCaptaciones((prev) =>
      prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
    );
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
      applyUpdatedCaptacion(data.captacion);
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

  async function moveStage(captacionId: string, stageId: string, notes?: string) {
    setError("");
    setMovingId(captacionId);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacionId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_stage_id: stageId, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Error al mover la captación");
        return;
      }
      applyUpdatedCaptacion(data.captacion);
    } catch {
      setError("Error de conexión");
    } finally {
      setMovingId(null);
    }
  }

  // Mueve la tarjeta soltada a la etapa de destino. "assign" abre un modal
  // para elegir a quién; las etapas que piden notas abren un modal de notas.
  function handleDropOnStage(c: Captacion, targetStage: CaptacionStage) {
    setDragOverStageId(null);
    const valid = getValidDropTargets(c);
    if (!valid.some((s) => s.id === targetStage.id)) return;

    if (targetStage.stage_type === "assign") {
      setPendingAssign(c);
      return;
    }
    if (targetStage.requires_notes) {
      setPendingNotes({ captacion: c, stage: targetStage });
      return;
    }
    moveStage(c.id, targetStage.id);
  }

  async function handleCreatePipeline() {
    if (!newPipelineName.trim()) return;
    setSavingPipeline(true);
    setError("");
    try {
      const res = await fetch("/api/admin/cl/captaciones/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPipelineName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Error al crear el pipeline");
        return;
      }
      // Recargar para traer el pipeline nuevo (server component)
      window.location.href = `/cl/admin/captaciones?pipeline=${data.id}`;
    } catch {
      setError("Error de conexión");
    } finally {
      setSavingPipeline(false);
      setCreatingPipeline(false);
      setNewPipelineName("");
    }
  }

  const draggedCaptacion = captaciones.find((c) => c.id === draggedId) || null;

  const filteredCaptaciones = captaciones
    .filter((c) =>
      Array.from(activeDataFilters).every((key) => DATA_FILTERS.find((f) => f.key === key)!.test(c))
    )
    .filter((c) => !selectedPipeline || c.pipeline_id === selectedPipeline.id);

  function CardActions({ c }: { c: Captacion }) {
    const stage = stageMeta(c);
    if (!canAssign && !canDelete) return null;
    const showAssign = canAssign && !c.assigned_to && stage?.stage_type !== "converted" && stage?.stage_type !== "rejected";
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

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

      {/* Selector de pipeline: puede haber más de uno */}
      {view === "pipeline" && (
        <section className="mb-4 flex flex-wrap items-center gap-2">
          {pipelines.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPipelineId(p.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                selectedPipelineId === p.id
                  ? "border-gold bg-gold/15 text-ink"
                  : "border-ink/10 bg-white text-ink/60 hover:border-ink/20"
              )}
            >
              {p.name}
              {p.is_default && <span className="ml-1 text-ink/35">· default</span>}
            </button>
          ))}
          {canConfigurePipelines && !creatingPipeline && (
            <button
              onClick={() => setCreatingPipeline(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-ink/20 px-3 py-1.5 text-xs font-medium text-ink/50 hover:border-ink/40 hover:text-ink"
            >
              <Plus size={12} />
              Nuevo pipeline
            </button>
          )}
          {creatingPipeline && (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePipeline()}
                placeholder="Nombre del pipeline"
                className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs focus:border-gold/50 focus:outline-none"
              />
              <button
                onClick={handleCreatePipeline}
                disabled={!newPipelineName.trim() || savingPipeline}
                className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-cream-50 disabled:opacity-50"
              >
                {savingPipeline ? <Loader2 size={12} className="animate-spin" /> : "Crear"}
              </button>
              <button
                onClick={() => { setCreatingPipeline(false); setNewPipelineName(""); }}
                className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/50"
              >
                Cancelar
              </button>
            </div>
          )}
          {canConfigurePipelines && selectedPipeline && (
            <Link
              href={`/cl/admin/captaciones/pipelines`}
              className="ml-auto flex items-center gap-1 text-xs text-ink/40 hover:text-ink/70"
              title="Configurar etapas de los pipelines"
            >
              <Settings size={12} />
              Configurar pipelines
            </Link>
          )}
        </section>
      )}

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
          title={`Mover a "${pendingNotes.stage.label}"`}
          placeholder="Escribe una nota para esta etapa..."
          saving={movingId === pendingNotes.captacion.id}
          onCancel={() => setPendingNotes(null)}
          onConfirm={(notes) => {
            moveStage(pendingNotes.captacion.id, pendingNotes.stage.id, notes);
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

      {!selectedPipeline ? (
        <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
          <Globe2 size={32} className="mx-auto mb-3 text-ink/25" />
          <p className="text-sm text-ink/50">Sin pipelines configurados todavía.</p>
        </div>
      ) : filteredCaptaciones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 py-12 text-center">
          <Globe2 size={32} className="mx-auto mb-3 text-ink/25" />
          <p className="text-sm text-ink/50">
            {activeDataFilters.size > 0
              ? "Ninguna captación coincide con los filtros"
              : isCaptadora
                ? "Sin captaciones asignadas"
                : "Sin captaciones en este pipeline"}
          </p>
        </div>
      ) : view === "pipeline" ? (
        /* ── Pipeline: una columna por etapa configurada. Arrastra una
            tarjeta a otra columna para moverla de etapa. ── */
        <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-4">
          {selectedPipeline.stages.map((stage) => {
            const items = filteredCaptaciones.filter((c) => c.stage_id === stage.id);
            const color = pipelineColor(stage.color_key);
            const isValidDropTarget =
              draggedCaptacion != null &&
              getValidDropTargets(draggedCaptacion).some((s) => s.id === stage.id);
            const isDragOver = dragOverStageId === stage.id && isValidDropTarget;
            return (
              <div key={stage.id} className="w-60 flex-shrink-0">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("h-2 w-2 rounded-full", color.dot)} />
                  <h3 className="text-xs font-semibold text-ink/70">{stage.label}</h3>
                  <span className="rounded-full bg-ink/8 px-1.5 py-0.5 text-[10px] font-medium text-ink/50">
                    {items.length}
                  </span>
                </div>
                <div
                  onDragOver={(e) => {
                    if (!isValidDropTarget) return;
                    e.preventDefault();
                    if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                  }}
                  onDragLeave={() =>
                    setDragOverStageId((prev) => (prev === stage.id ? null : prev))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedCaptacion) handleDropOnStage(draggedCaptacion, stage);
                  }}
                  className={cn(
                    "space-y-2 rounded-xl bg-ink/3 p-2 min-h-[80px] transition",
                    isDragOver && "bg-gold/10 ring-2 ring-gold/50",
                    draggedCaptacion &&
                      draggedCaptacion.stage_id !== stage.id &&
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
                      const canDrag = getValidDropTargets(c).length > 0 && movingId !== c.id;
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
                            setDragOverStageId(null);
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
                          {c.assigned_to && stage.stage_type !== "draft" && (
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
          {filteredCaptaciones.map((c) => {
            const stage = stageMeta(c);
            const color = stage ? pipelineColor(stage.color_key) : null;
            return (
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
                      color?.badge || "bg-gray-100 text-gray-700"
                    )}
                  >
                    {stage?.label || "Sin etapa"}
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
            );
          })}
        </div>
      )}

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}

// Modal para elegir a quién asignar al soltar una tarjeta en una etapa de
// tipo "assign" (reemplaza al selector nativo del navegador, que no puede
// mostrar una lista con roles).
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

        {captacion.assigned_to && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta captación ya está asignada. Reasignarla puede reiniciar su etapa a la de asignación.
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

// Modal de notas para mover una tarjeta a una etapa que pide nota
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
