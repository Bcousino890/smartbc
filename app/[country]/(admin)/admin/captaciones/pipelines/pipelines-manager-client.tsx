"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, Loader2, Star, ChevronUp, ChevronDown, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_COLOR_KEYS, pipelineColor } from "@/lib/captaciones/pipeline-colors";
import { STAGE_TYPES, STAGE_TYPE_LABEL, STAGE_TYPE_DESCRIPTION, type StageType } from "@/lib/captaciones/pipeline-stage-types";

type Stage = {
  id: string;
  pipeline_id: string;
  key: string;
  label: string;
  color_key: string;
  position: number;
  stage_type: StageType;
  requires_notes: boolean;
};

type Pipeline = {
  id: string;
  country: string;
  name: string;
  is_default: boolean;
  stages: Stage[];
};

// Administrador de pipelines de Captaciones: crear/renombrar/marcar default/
// eliminar pipelines, y dentro de cada uno agregar, renombrar, recolorear,
// reordenar, tipar y eliminar sus etapas. El nombre/color/orden de cada
// etapa es libre; el stage_type es lo único fijo que el motor entiende
// (ver lib/captaciones/pipeline-stage-types.ts).
export function PipelinesManagerClient({ initialPipelines }: { initialPipelines: Pipeline[] }) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [selectedId, setSelectedId] = useState<string | null>(initialPipelines[0]?.id ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creatingPipeline, setCreatingPipeline] = useState(false);

  const selected = pipelines.find((p) => p.id === selectedId) || null;

  async function api(url: string, options?: RequestInit) {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Error");
    return data;
  }

  async function handleCreatePipeline() {
    if (!newPipelineName.trim()) return;
    setBusy("create-pipeline");
    setError("");
    try {
      const created = await api("/api/admin/cl/captaciones/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: newPipelineName.trim() }),
      });
      setPipelines((prev) => [...prev, created]);
      setSelectedId(created.id);
      setNewPipelineName("");
      setCreatingPipeline(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el pipeline");
    } finally {
      setBusy(null);
    }
  }

  async function handleRenamePipeline(pipeline: Pipeline, name: string) {
    if (!name.trim() || name === pipeline.name) return;
    try {
      const updated = await api(`/api/admin/cl/captaciones/pipelines/${pipeline.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      setPipelines((prev) => prev.map((p) => (p.id === pipeline.id ? { ...p, name: updated.name } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al renombrar");
    }
  }

  async function handleSetDefault(pipeline: Pipeline) {
    setBusy(`default-${pipeline.id}`);
    setError("");
    try {
      await api(`/api/admin/cl/captaciones/pipelines/${pipeline.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_default: true }),
      });
      setPipelines((prev) => prev.map((p) => ({ ...p, is_default: p.id === pipeline.id })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al marcar default");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletePipeline(pipeline: Pipeline) {
    if (!confirm(`¿Eliminar el pipeline "${pipeline.name}"?`)) return;
    setBusy(`delete-pipeline-${pipeline.id}`);
    setError("");
    try {
      await api(`/api/admin/cl/captaciones/pipelines/${pipeline.id}`, { method: "DELETE" });
      setPipelines((prev) => prev.filter((p) => p.id !== pipeline.id));
      if (selectedId === pipeline.id) setSelectedId(pipelines.find((p) => p.id !== pipeline.id)?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar el pipeline");
    } finally {
      setBusy(null);
    }
  }

  function updateStageLocal(pipelineId: string, stage: Stage) {
    setPipelines((prev) =>
      prev.map((p) =>
        p.id !== pipelineId ? p : { ...p, stages: p.stages.map((s) => (s.id === stage.id ? stage : s)) }
      )
    );
  }

  async function handleAddStage() {
    if (!selected || !newStageLabel.trim()) return;
    setBusy("add-stage");
    setError("");
    try {
      const created = await api(`/api/admin/cl/captaciones/pipelines/${selected.id}/stages`, {
        method: "POST",
        body: JSON.stringify({ label: newStageLabel.trim() }),
      });
      setPipelines((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, stages: [...p.stages, created] } : p))
      );
      setNewStageLabel("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear la etapa");
    } finally {
      setBusy(null);
    }
  }

  async function handleStagePatch(stage: Stage, patch: Partial<Stage>) {
    if (!selected) return;
    setError("");
    updateStageLocal(selected.id, { ...stage, ...patch });
    try {
      const updated = await api(
        `/api/admin/cl/captaciones/pipelines/${selected.id}/stages/${stage.id}`,
        { method: "PATCH", body: JSON.stringify(patch) }
      );
      updateStageLocal(selected.id, updated);
    } catch (e) {
      updateStageLocal(selected.id, stage); // revertir
      setError(e instanceof Error ? e.message : "Error al actualizar la etapa");
    }
  }

  async function handleDeleteStage(stage: Stage) {
    if (!selected) return;
    if (!confirm(`¿Eliminar la etapa "${stage.label}"?`)) return;
    setBusy(`delete-stage-${stage.id}`);
    setError("");
    try {
      await api(`/api/admin/cl/captaciones/pipelines/${selected.id}/stages/${stage.id}`, { method: "DELETE" });
      setPipelines((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, stages: p.stages.filter((s) => s.id !== stage.id) } : p))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar la etapa");
    } finally {
      setBusy(null);
    }
  }

  async function handleReorder(fromIndex: number, direction: -1 | 1) {
    if (!selected) return;
    const stages = [...selected.stages].sort((a, b) => a.position - b.position);
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= stages.length) return;
    [stages[fromIndex], stages[toIndex]] = [stages[toIndex], stages[fromIndex]];
    const order = stages.map((s) => s.id);
    setPipelines((prev) =>
      prev.map((p) =>
        p.id !== selected.id ? p : { ...p, stages: stages.map((s, i) => ({ ...s, position: i })) }
      )
    );
    try {
      await api(`/api/admin/cl/captaciones/pipelines/${selected.id}/stages`, {
        method: "PUT",
        body: JSON.stringify({ order }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reordenar");
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
      <Link
        href="/cl/admin/captaciones"
        className="flex items-center gap-2 text-sm font-medium text-gold hover:text-gold-dark mb-6"
      >
        <ArrowLeft size={16} />
        Volver a captaciones
      </Link>

      <h1 className="mb-1 text-xl font-bold text-ink">Configurar pipelines</h1>
      <p className="mb-6 text-sm text-ink/50">
        Crea todos los pipelines que necesites, cada uno con sus propias etapas
        (nombre, color y orden libres). El tipo de cada etapa determina el
        comportamiento del sistema: cuál es la entrada, cuál habilita
        convertir a propiedad, cuáles son terminales, etc.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pipelines */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {pipelines.map((p) => (
          <div key={p.id} className="flex items-center">
            <button
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-l-full border px-3 py-1.5 text-xs font-medium transition",
                selectedId === p.id
                  ? "border-gold bg-gold/15 text-ink"
                  : "border-ink/10 bg-white text-ink/60 hover:border-ink/20"
              )}
            >
              {p.is_default && <Star size={11} className="fill-amber-400 text-amber-400" />}
              {p.name}
            </button>
            {!p.is_default && (
              <button
                onClick={() => handleSetDefault(p)}
                disabled={busy === `default-${p.id}`}
                title="Marcar como default (se usa para captaciones nuevas)"
                className="border-y border-ink/10 bg-white px-2 py-1.5 text-ink/30 hover:text-amber-500"
              >
                <Star size={11} />
              </button>
            )}
            <button
              onClick={() => handleDeletePipeline(p)}
              disabled={busy === `delete-pipeline-${p.id}` || p.is_default}
              title={p.is_default ? "No puedes eliminar el pipeline default" : "Eliminar pipeline"}
              className="rounded-r-full border border-ink/10 bg-white px-2 py-1.5 text-ink/30 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {!creatingPipeline ? (
          <button
            onClick={() => setCreatingPipeline(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-ink/20 px-3 py-1.5 text-xs font-medium text-ink/50 hover:border-ink/40 hover:text-ink"
          >
            <Plus size={12} />
            Nuevo pipeline
          </button>
        ) : (
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
              disabled={!newPipelineName.trim() || busy === "create-pipeline"}
              className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-cream-50 disabled:opacity-50"
            >
              {busy === "create-pipeline" ? <Loader2 size={12} className="animate-spin" /> : "Crear"}
            </button>
            <button
              onClick={() => { setCreatingPipeline(false); setNewPipelineName(""); }}
              className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/50"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <input
              defaultValue={selected.name}
              onBlur={(e) => handleRenamePipeline(selected, e.target.value)}
              className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-ink hover:border-ink/10 focus:border-gold/50 focus:bg-white focus:outline-none"
            />
            <span className="text-xs text-ink/40">{selected.stages.length} etapas</span>
          </div>

          <div className="space-y-2">
            {[...selected.stages]
              .sort((a, b) => a.position - b.position)
              .map((stage, i) => (
                <div key={stage.id} className="rounded-xl border border-ink/10 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        onClick={() => handleReorder(i, -1)}
                        disabled={i === 0}
                        className="text-ink/30 hover:text-ink disabled:opacity-20"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        onClick={() => handleReorder(i, 1)}
                        disabled={i === selected.stages.length - 1}
                        className="text-ink/30 hover:text-ink disabled:opacity-20"
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    <GripVertical size={14} className="text-ink/20" />

                    <span className={cn("h-3 w-3 flex-shrink-0 rounded-full", pipelineColor(stage.color_key).dot)} />

                    <input
                      defaultValue={stage.label}
                      onBlur={(e) => handleStagePatch(stage, { label: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-ink hover:border-ink/10 focus:border-gold/50 focus:bg-white focus:outline-none"
                    />

                    <select
                      value={stage.color_key}
                      onChange={(e) => handleStagePatch(stage, { color_key: e.target.value })}
                      className="rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs"
                    >
                      {PIPELINE_COLOR_KEYS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>

                    <select
                      value={stage.stage_type}
                      onChange={(e) => handleStagePatch(stage, { stage_type: e.target.value as StageType })}
                      title={STAGE_TYPE_DESCRIPTION[stage.stage_type]}
                      className="rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs"
                    >
                      {STAGE_TYPES.map((t) => (
                        <option key={t} value={t}>{STAGE_TYPE_LABEL[t]}</option>
                      ))}
                    </select>

                    <label className="flex items-center gap-1 text-xs text-ink/60" title="Pide una nota al mover una captación a esta etapa">
                      <input
                        type="checkbox"
                        checked={stage.requires_notes}
                        onChange={(e) => handleStagePatch(stage, { requires_notes: e.target.checked })}
                        className="rounded border border-ink/20"
                      />
                      Pide nota
                    </label>

                    <button
                      onClick={() => handleDeleteStage(stage)}
                      disabled={busy === `delete-stage-${stage.id}`}
                      className="ml-auto rounded p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      {busy === `delete-stage-${stage.id}` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 pl-[68px] text-[11px] text-ink/40">
                    {STAGE_TYPE_DESCRIPTION[stage.stage_type]}
                  </p>
                </div>
              ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              value={newStageLabel}
              onChange={(e) => setNewStageLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
              placeholder="Nombre de la nueva etapa"
              className="flex-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
            />
            <button
              onClick={handleAddStage}
              disabled={!newStageLabel.trim() || busy === "add-stage"}
              className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
            >
              {busy === "add-stage" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Agregar etapa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
