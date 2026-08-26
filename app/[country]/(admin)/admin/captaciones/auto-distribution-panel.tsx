"use client";

import { useMemo, useState } from "react";
import { Loader2, Users, Check, ChevronDown, Sparkles, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type AssignableUser = { id: string; full_name: string | null; role: string };
type AutoDistributionConfig = { enabled: boolean; user_ids: string[] };

const ROLE_LABEL: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  advisor: "Asesor",
  agent_junior: "Agente Junior",
  agent_senior: "Agente Senior",
  agent_admin: "Agente Admin",
  captadora: "Captadora",
};

// Panel solo-admin: muestra cuántas captaciones activas tiene asignadas cada
// usuario y deja elegir el pool entre el que se reparten automáticamente las
// captaciones nuevas (a la de menos carga). "Activas" = sin contar las
// convertidas ni las rechazadas.
export function AutoDistributionPanel({
  assignableUsers,
  assignedCounts,
  initialConfig,
}: {
  assignableUsers: AssignableUser[];
  assignedCounts: Record<string, number>;
  initialConfig: AutoDistributionConfig;
}) {
  const [open, setOpen] = useState(false);
  // `baseline` = última config guardada; contra ella se calcula si hay cambios
  // sin guardar (`dirty`). Se actualiza al guardar con lo que devuelve el server.
  const [baseline, setBaseline] = useState<AutoDistributionConfig>(initialConfig);
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialConfig.user_ids));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState("");

  const dirty = useMemo(() => {
    if (enabled !== baseline.enabled) return true;
    const init = new Set(baseline.user_ids);
    if (init.size !== selected.size) return true;
    for (const id of selected) if (!init.has(id)) return true;
    return false;
  }, [enabled, selected, baseline]);

  const maxCount = Math.max(
    1,
    ...assignableUsers.map((u) => assignedCounts[u.id] || 0)
  );
  const totalActive = assignableUsers.reduce(
    (sum, u) => sum + (assignedCounts[u.id] || 0),
    0
  );

  // A quién le tocaría la próxima captación: el del pool con menos carga
  // (mismo criterio que el servidor). Solo para mostrar una vista previa.
  const nextAssignee = useMemo(() => {
    let best: AssignableUser | null = null;
    let bestCount = Number.POSITIVE_INFINITY;
    for (const u of assignableUsers) {
      if (!selected.has(u.id)) continue;
      const c = assignedCounts[u.id] || 0;
      if (c < bestCount) {
        bestCount = c;
        best = u;
      }
    }
    return best;
  }, [assignableUsers, selected, assignedCounts]);

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setJustSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    setJustSaved(false);
    try {
      const res = await fetch("/api/admin/cl/captaciones/auto-distribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, user_ids: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      // Reflejar la config saneada por el servidor (puede haber descartado ids).
      const saved: AutoDistributionConfig = data.config || { enabled, user_ids: Array.from(selected) };
      setBaseline(saved);
      setEnabled(saved.enabled);
      setSelected(new Set(saved.user_ids));
      setJustSaved(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-gold/25 bg-gradient-to-br from-gold/5 to-transparent">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold-dark">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            Reparto automático de captaciones
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                enabled
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-ink/8 text-ink/50"
              )}
            >
              {enabled ? "Activo" : "Apagado"}
            </span>
          </h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/50">
            <ShieldCheck size={11} />
            Solo visible para administradores · {assignableUsers.length} usuarios · {totalActive} captaciones activas
          </p>
        </div>
        <ChevronDown
          size={18}
          className={cn("flex-shrink-0 text-ink/40 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-gold/15 px-4 pb-4 pt-3">
          {/* Interruptor de activación */}
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-ink/10 bg-white px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">
                Repartir las captaciones nuevas automáticamente
              </span>
              <span className="mt-0.5 block text-xs text-ink/50">
                Cada captación nueva se asigna sola al usuario marcado con menos captaciones
                activas, para equilibrar la carga.
              </span>
            </span>
            <span
              onClick={(e) => {
                e.preventDefault();
                setEnabled((v) => !v);
                setJustSaved(false);
              }}
              className={cn(
                "relative h-6 w-11 flex-shrink-0 rounded-full transition",
                enabled ? "bg-emerald-500" : "bg-ink/20"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                  enabled ? "left-[22px]" : "left-0.5"
                )}
              />
            </span>
          </label>

          {enabled && selected.size === 0 && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Marca al menos un usuario abajo para que el reparto tenga a quién asignar.
            </p>
          )}

          {enabled && nextAssignee && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink/55">
              <Sparkles size={11} className="text-gold-dark" />
              La próxima captación se asignaría a{" "}
              <span className="font-medium text-ink">
                {nextAssignee.full_name || "Sin nombre"}
              </span>
            </p>
          )}

          {/* Lista de usuarios con su carga y el check del pool */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between px-1 crm-label-sm text-ink/40">
              <span className="flex items-center gap-1">
                <Users size={11} />
                Usuario
              </span>
              <span>Captaciones activas · En reparto</span>
            </div>
            {assignableUsers.length === 0 ? (
              <p className="py-3 text-center text-xs text-ink/40">
                No hay usuarios asignables.
              </p>
            ) : (
              assignableUsers.map((u) => {
                const count = assignedCounts[u.id] || 0;
                const inPool = selected.has(u.id);
                return (
                  <div
                    key={u.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 transition",
                      inPool
                        ? "border-gold/40 bg-white"
                        : "border-ink/8 bg-white/60"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {u.full_name || "Sin nombre"}
                        {ROLE_LABEL[u.role] && (
                          <span className="ml-1.5 text-xs font-normal text-ink/40">
                            {ROLE_LABEL[u.role]}
                          </span>
                        )}
                      </p>
                      {/* Barra proporcional de carga */}
                      <div className="mt-1 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-ink/8">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            inPool ? "bg-gold" : "bg-ink/25"
                          )}
                          style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <span className="w-6 flex-shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                      {count}
                    </span>

                    <button
                      onClick={() => toggleUser(u.id)}
                      title={inPool ? "Quitar del reparto" : "Añadir al reparto"}
                      className={cn(
                        "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition",
                        inPool
                          ? "border-gold bg-gold text-white"
                          : "border-ink/20 bg-white text-transparent hover:border-ink/40"
                      )}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-40"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
            {justSaved && !dirty && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check size={13} />
                Guardado
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
