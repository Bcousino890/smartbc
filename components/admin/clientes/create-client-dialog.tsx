"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";
import { createNewClient } from "@/app/(admin)/admin/clientes/actions";
import { useT } from "@/lib/i18n/provider";
import { MADRID_ZONES, MADRID_ZONES_WITH_SUBZONES } from "@/lib/mock-properties";
import type { Operation, StayType, ClientProfileType } from "@/lib/types";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none disabled:bg-ink/5 disabled:text-ink/35";

const selectCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-gold/55 focus:outline-none disabled:bg-ink/5 disabled:text-ink/35";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileType: ClientProfileType;
  sector: string;
  operation: Operation;
  stayType: StayType;
  preferredZones: string[]; // múltiples zonas
  selectedSubzones: Record<string, string[]>; // zona -> [subzonas]
  budgetMin: number;
  budgetMax: number;
  universities: string;
  occupants: number;
  students: number;
  workers: number;
  pets: boolean;
};

const initialState: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  profileType: "worker",
  sector: "Madrid",
  operation: "alquiler",
  stayType: "larga",
  preferredZones: [],
  selectedSubzones: {},
  budgetMin: 500,
  budgetMax: 2000,
  universities: "",
  occupants: 1,
  students: 0,
  workers: 0,
  pets: false,
};

export function CreateClientDialog() {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    setError(null);
    setSuccess(null);

    // Validación
    if (!form.firstName.trim()) {
      setError("Nombre es requerido");
      return;
    }
    if (!form.lastName.trim()) {
      setError("Apellido es requerido");
      return;
    }
    if (!form.email.trim()) {
      setError("Email es requerido");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Email inválido");
      return;
    }
    if (form.preferredZones.length === 0) {
      setError("Selecciona al menos una zona");
      return;
    }
    if (form.budgetMin < 0 || form.budgetMax < 0) {
      setError("Presupuesto debe ser mayor a 0");
      return;
    }

    startTransition(async () => {
      const result = await createNewClient({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        profileType: form.profileType,
        sector: form.sector,
        operation: form.operation,
        stayType: form.stayType,
        preferredZones: form.preferredZones,
        selectedSubzones: form.selectedSubzones,
        budgetMin: form.budgetMin,
        budgetMax: form.budgetMax,
        universities: form.universities || undefined,
        occupants: form.occupants,
        students: form.students,
        workers: form.workers,
        pets: form.pets,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(`Cliente ${form.firstName} ${form.lastName} creado exitosamente`);
      setForm(initialState);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(null);
      }, 1500);
    });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
      >
        <Plus size={16} />
        Nuevo cliente
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-gold/15 bg-cream-50/95 p-8 shadow-2xl">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-ink">Nuevo cliente</h2>
          <p className="mt-1 text-sm text-ink/60">
            Crea un nuevo cliente con sus preferencias de búsqueda
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle size={16} className="mt-0.5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 size={16} className="mt-0.5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700">{success}</p>
          </div>
        )}

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Datos personales */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">
                Nombre *
              </label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                className={inputCls}
                disabled={isPending}
                placeholder="Juan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/70 mb-1">
                Apellido *
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className={inputCls}
                disabled={isPending}
                placeholder="García"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
              disabled={isPending}
              placeholder="juan@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/70 mb-1">
              Teléfono
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputCls}
              disabled={isPending}
              placeholder="+34 600 000 000"
            />
          </div>

          {/* Perfil y Sector */}
          <div className="border-t border-ink/10 pt-4">
            <h3 className="text-sm font-semibold text-ink mb-4">
              Perfil del cliente
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Perfil *
                </label>
                <select
                  value={form.profileType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      profileType: e.target.value as ClientProfileType,
                    })
                  }
                  className={selectCls}
                  disabled={isPending}
                >
                  <option value="student">Estudiante</option>
                  <option value="worker">Trabajador</option>
                  <option value="company">Empresa</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Sector *
                </label>
                <select
                  value={form.sector}
                  onChange={(e) =>
                    setForm({ ...form, sector: e.target.value })
                  }
                  className={selectCls}
                  disabled={isPending}
                >
                  <option value="Madrid">Madrid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Preferencias de búsqueda */}
          <div className="border-t border-ink/10 pt-4">
            <h3 className="text-sm font-semibold text-ink mb-4">
              Preferencias de búsqueda
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Operación *
                </label>
                <select
                  value={form.operation}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      operation: e.target.value as Operation,
                    })
                  }
                  className={selectCls}
                  disabled={isPending}
                >
                  <option value="alquiler">Alquiler</option>
                  <option value="venta">Venta</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Tipo de estancia *
                </label>
                <select
                  value={form.stayType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      stayType: e.target.value as StayType,
                    })
                  }
                  className={selectCls}
                  disabled={isPending}
                >
                  <option value="corta">Corta (1-3 meses)</option>
                  <option value="larga">Larga (6+ meses)</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-ink/70 mb-1">
                Zonas preferidas * (seleccionar una o más)
              </label>
              <div className="space-y-2">
                {MADRID_ZONES.map((zone) => (
                  <label key={zone} className="flex items-center gap-2 p-2 rounded hover:bg-ink/5">
                    <input
                      type="checkbox"
                      checked={form.preferredZones.includes(zone)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({
                            ...form,
                            preferredZones: [...form.preferredZones, zone],
                            selectedSubzones: {
                              ...form.selectedSubzones,
                              [zone]: [],
                            },
                          });
                        } else {
                          const { [zone]: _, ...rest } = form.selectedSubzones;
                          setForm({
                            ...form,
                            preferredZones: form.preferredZones.filter(z => z !== zone),
                            selectedSubzones: rest,
                          });
                        }
                      }}
                      disabled={isPending}
                      className="cursor-pointer"
                    />
                    <span className="text-sm text-ink">{zone}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Subzonas por zona seleccionada */}
            {form.preferredZones.length > 0 && (
              <div className="mt-4 space-y-3 p-3 bg-ink/5 rounded-lg">
                <p className="text-xs font-medium text-ink/70">Subzonas (opcional)</p>
                {form.preferredZones.map((zone) => (
                  <div key={zone}>
                    <p className="text-xs font-semibold text-ink mb-2">{zone}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(MADRID_ZONES_WITH_SUBZONES[zone] ?? []).map((subzone) => (
                        <label key={subzone} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={(form.selectedSubzones[zone] ?? []).includes(subzone)}
                            onChange={(e) => {
                              const current = form.selectedSubzones[zone] ?? [];
                              setForm({
                                ...form,
                                selectedSubzones: {
                                  ...form.selectedSubzones,
                                  [zone]: e.target.checked
                                    ? [...current, subzone]
                                    : current.filter(s => s !== subzone),
                                },
                              });
                            }}
                            disabled={isPending}
                            className="cursor-pointer"
                          />
                          <span className="text-ink/70">{subzone}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Presupuesto mín. (€)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.budgetMin}
                  onChange={(e) =>
                    setForm({ ...form, budgetMin: parseInt(e.target.value) })
                  }
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Presupuesto máx. (€)
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.budgetMax}
                  onChange={(e) =>
                    setForm({ ...form, budgetMax: parseInt(e.target.value) })
                  }
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-ink/70 mb-1">
                Universidades cercanas (opcional)
              </label>
              <input
                type="text"
                value={form.universities}
                onChange={(e) =>
                  setForm({ ...form, universities: e.target.value })
                }
                className={inputCls}
                disabled={isPending}
                placeholder="Ej: UAM, IE, CUNEF"
              />
            </div>

            <div className="grid grid-cols-4 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Ocupantes
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.occupants}
                  onChange={(e) =>
                    setForm({ ...form, occupants: parseInt(e.target.value) })
                  }
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Estudiantes
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.students}
                  onChange={(e) =>
                    setForm({ ...form, students: parseInt(e.target.value) })
                  }
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Trabajadores
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.workers}
                  onChange={(e) =>
                    setForm({ ...form, workers: parseInt(e.target.value) })
                  }
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/70 mb-1">
                  Mascotas
                </label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, pets: !form.pets })}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm transition",
                    form.pets
                      ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                      : "border-ink/15 bg-white text-ink/70 hover:border-ink/25",
                  )}
                  disabled={isPending}
                >
                  {form.pets ? "Sí" : "No"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="mt-6 flex justify-end gap-3 border-t border-ink/10 pt-6">
          <button
            onClick={() => {
              setIsOpen(false);
              setForm(initialState);
              setError(null);
              setSuccess(null);
            }}
            disabled={isPending}
            className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending && <Loader2 size={15} className="animate-spin" />}
            Crear cliente
          </button>
        </div>
      </div>
    </div>
  );
}
