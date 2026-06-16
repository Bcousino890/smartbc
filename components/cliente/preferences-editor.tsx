"use client";

import { useState, useTransition } from "react";
import { Edit2, Save, RotateCcw, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { MADRID_ZONES } from "@/lib/mock-properties";
import type { Operation, StayType } from "@/lib/types";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none disabled:bg-ink/5 disabled:text-ink/35";

const selectCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-gold/55 focus:outline-none disabled:bg-ink/5 disabled:text-ink/35";

type PreferencesEditorProps = {
  clientId: string;
  initialPreferences: {
    operation: Operation;
    stayType: StayType;
    preferredZone: string;
    budgetMin: number;
    budgetMax: number;
    universities?: string;
    occupants: number;
    students: number;
    workers: number;
    pets: boolean;
  };
  onSaved?: () => void;
};

export function PreferencesEditor({
  clientId,
  initialPreferences,
  onSaved,
}: PreferencesEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasChanges = JSON.stringify(preferences) !== JSON.stringify(initialPreferences);

  const handleSave = () => {
    setError(null);
    setSuccess(null);

    if (!preferences.preferredZone) {
      setError("Selecciona una zona preferida");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/cliente/preferences`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preferences),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Error al guardar preferencias");
        }

        setSuccess("Preferencias guardadas exitosamente");
        setIsEditing(false);
        onSaved?.();
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    });
  };

  const handleReset = () => {
    setPreferences(initialPreferences);
    setIsEditing(false);
  };

  return (
    <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-ink">Mis preferencias de búsqueda</h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-2 text-sm text-gold hover:text-gold/80 transition"
          >
            <Edit2 size={16} />
            Editar
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Operación
            </label>
            <select
              value={preferences.operation}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  operation: e.target.value as Operation,
                })
              }
              disabled={!isEditing || isPending}
              className={selectCls}
            >
              <option value="alquiler">Alquiler</option>
              <option value="venta">Venta</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Tipo de estancia
            </label>
            <select
              value={preferences.stayType}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  stayType: e.target.value as StayType,
                })
              }
              disabled={!isEditing || isPending}
              className={selectCls}
            >
              <option value="corta">Corta (1-3 meses)</option>
              <option value="larga">Larga (6+ meses)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Zona preferida
            </label>
            <select
              value={preferences.preferredZone}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  preferredZone: e.target.value,
                })
              }
              disabled={!isEditing || isPending}
              className={selectCls}
            >
              <option value="">Seleccionar...</option>
              {MADRID_ZONES.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Ocupantes
            </label>
            <input
              type="number"
              min="1"
              value={preferences.occupants}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  occupants: parseInt(e.target.value),
                })
              }
              disabled={!isEditing || isPending}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Presupuesto mín. (€)
            </label>
            <input
              type="number"
              min="0"
              value={preferences.budgetMin}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  budgetMin: parseInt(e.target.value) || 0,
                })
              }
              disabled={!isEditing || isPending}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Presupuesto máx. (€)
            </label>
            <input
              type="number"
              min="0"
              value={preferences.budgetMax}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  budgetMax: parseInt(e.target.value) || 0,
                })
              }
              disabled={!isEditing || isPending}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Estudiantes
            </label>
            <input
              type="number"
              min="0"
              value={preferences.students}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  students: parseInt(e.target.value) || 0,
                })
              }
              disabled={!isEditing || isPending}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Trabajadores
            </label>
            <input
              type="number"
              min="0"
              value={preferences.workers}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  workers: parseInt(e.target.value) || 0,
                })
              }
              disabled={!isEditing || isPending}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Universidades cercanas (opcional)
            </label>
            <input
              type="text"
              value={preferences.universities || ""}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  universities: e.target.value,
                })
              }
              disabled={!isEditing || isPending}
              placeholder="Ej: UAM, IE, CUNEF"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-2">
              Mascotas
            </label>
            <button
              type="button"
              onClick={() =>
                setPreferences({
                  ...preferences,
                  pets: !preferences.pets,
                })
              }
              disabled={!isEditing || isPending}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-sm transition",
                preferences.pets
                  ? "border-emerald-300 bg-emerald-100 text-emerald-700 font-medium"
                  : "border-ink/15 bg-white text-ink/70 hover:border-ink/25",
              )}
            >
              {preferences.pets ? "Sí" : "No"}
            </button>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="mt-6 flex justify-end gap-3 border-t border-ink/10 pt-4">
          <button
            onClick={handleReset}
            disabled={isPending}
            className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold/90 disabled:opacity-50"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            <Save size={14} />
            Guardar cambios
          </button>
        </div>
      )}
    </div>
  );
}
